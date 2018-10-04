import vscode from 'vscode'
import { repoInfo } from './git'
import { gql, mutateGraphQL, queryGraphQL } from './graphql'
import { log } from './log'

export function activateComments(context: vscode.ExtensionContext): void {
    if (!vscode.workspace.getConfiguration('sourcegraph').get<string>('discussionsPreviewEnabled')) {
        return
    }
    log.appendLine('Discussions preview is enabled')
    const commentProvider = new CommentProvider()
    context.subscriptions.push(vscode.workspace.registerDocumentCommentProvider(commentProvider))
}

class CommentProvider implements vscode.DocumentCommentProvider {
    public async provideDocumentComments(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CommentInfo> {
        let threads: vscode.CommentThread[] = []
        try {
            threads = await provideDocumentComments(document)
        } catch (e) {
            log.appendLine(`provideDocumentComments ${e}`)
        }

        const lastLine = document.lineCount - 1
        const commentingRanges = [new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).range.end.character)]

        return { threads, commentingRanges }
    }

    public async createNewCommentThread(
        document: vscode.TextDocument,
        range: vscode.Range,
        text: string,
        token: vscode.CancellationToken
    ): Promise<vscode.CommentThread> {
        return await createNewCommentThread(document, range, text)
    }

    public async replyToCommentThread(
        document: vscode.TextDocument,
        range: vscode.Range,
        commentThread: vscode.CommentThread,
        text: string,
        token: vscode.CancellationToken
    ): Promise<vscode.CommentThread> {
        return await replyToCommentThread(document, range, commentThread, text)
    }

    private didChangeCommentThreads = new vscode.EventEmitter<vscode.CommentThreadChangedEvent>()

    public onDidChangeCommentThreads = this.didChangeCommentThreads.event
}

async function provideDocumentComments(document: vscode.TextDocument): Promise<vscode.CommentThread[]> {
    log.appendLine(`provideDocumentComments ${document.uri}`)
    const [remoteUrl, branch, targetRepositoryPath] = await repoInfo(document.fileName)
    if (remoteUrl === '') {
        throw new Error('Git repository has no remote url configured')
    }
    const targetRepositoryID = await getRepositoryId(remoteUrl)
    const data = await queryGraphQL(
        gql`
            query DiscussionThreads($targetRepositoryID: ID!, $targetRepositoryPath: String!, $branch: String!) {
                discussionThreads(
                    targetRepositoryID: $targetRepositoryID
                    targetRepositoryPath: $targetRepositoryPath
                ) {
                    totalCount
                    pageInfo {
                        hasNextPage
                    }
                    nodes {
                        ...DiscussionThreadFields
                    }
                }
            }
            ${discussionThreadFieldsFragment}
        `,
        {
            targetRepositoryID,
            targetRepositoryPath,
            branch,
        }
    )

    if (!data.discussionThreads || !data.discussionThreads.nodes) {
        throw new Error(`Invalid GraphQL response for DiscussionThreads`)
    }

    const threads: vscode.CommentThread[] = []
    for (const thread of data.discussionThreads.nodes) {
        // TODO: this assumes there is no diff between the document state and the revision
        const sel = thread.target.relativeSelection
        if (sel) {
            const range = new vscode.Range(sel.startLine, sel.startCharacter, sel.endLine, sel.endCharacter)
            threads.push(discussionToCommentThread(document, range, thread))
        }
    }

    return threads
}

async function createNewCommentThread(
    document: vscode.TextDocument,
    range: vscode.Range,
    text: string
): Promise<vscode.CommentThread> {
    log.appendLine(`createNewCommentThread ${document.uri} ${range}`)
    const [remoteUrl, branch, path] = await repoInfo(document.fileName)
    if (remoteUrl === '') {
        throw new Error('Git repository has no remote url configured')
    }

    const repository = await getRepositoryId(remoteUrl)
    const selection = getSelection(document, range)
    const targetRepo: SourcegraphGQL.IDiscussionThreadTargetRepoInput = {
        repository,
        path,
        branch,
        selection,
    }
    const input: SourcegraphGQL.IDiscussionThreadCreateInput = {
        title: text,
        contents: text,
        targetRepo,
    }

    const data = await mutateGraphQL(
        gql`
            mutation CreateThread($input: DiscussionThreadCreateInput!, $branch: String!) {
                discussions {
                    createThread(input: $input) {
                        ...DiscussionThreadFields
                    }
                }
            }
            ${discussionThreadFieldsFragment}
        `,
        { input, branch }
    )

    if (!data.discussions || !data.discussions.createThread) {
        throw new Error(`Invalid GraphQL response for CreateThread`)
    }

    return discussionToCommentThread(document, range, data.discussions.createThread)
}

async function replyToCommentThread(
    document: vscode.TextDocument,
    range: vscode.Range,
    thread: vscode.CommentThread,
    text: string
): Promise<vscode.CommentThread> {
    const [, branch] = await repoInfo(document.fileName)
    const data = await mutateGraphQL(
        gql`
            mutation AddCommentToThread($threadID: ID!, $contents: String!, $branch: String!) {
                discussions {
                    addCommentToThread(threadID: $threadID, contents: $contents) {
                        ...DiscussionThreadFields
                    }
                }
            }
            ${discussionThreadFieldsFragment}
        `,
        { threadID: thread.threadId, contents: text, branch }
    )

    if (!data.discussions || !data.discussions.addCommentToThread) {
        throw new Error(`Invalid GraphQL response for AddCommentToThread`)
    }

    return discussionToCommentThread(document, range, data.discussions.addCommentToThread)
}
function discussionToCommentThread(
    document: vscode.TextDocument,
    range: vscode.Range,
    thread: SourcegraphGQL.IDiscussionThread
): vscode.CommentThread {
    const comments: vscode.Comment[] = []
    for (const comment of thread.comments.nodes) {
        comments.push({
            commentId: comment.id,
            body: new vscode.MarkdownString(comment.contents),
            userName: comment.author.displayName || comment.author.username, // only username?
            gravatar: comment.author.avatarURL || '',
        })
    }
    return {
        threadId: thread.id,
        resource: document.uri,
        range,
        comments,
    }
}

async function getRepositoryId(remoteUrl: string): Promise<string> {
    const name = parseRepository(remoteUrl)
    if (!name) {
        // TODO: fallback to Sourcegraph.com in the event that we are configured to a private instance?
        throw new Error(`Repository does not exist on the configured Sourcegraph instance`)
    }
    const data = await queryGraphQL(
        gql`
            query GetRepositoryId($name: String) {
                repository(name: $name) {
                    id
                }
            }
        `,
        { name }
    )
    if (!data.repository || !data.repository.id) {
        throw new Error(`Invalid GraphQL response for GetRepositoryId`)
    }
    return data.repository.id
}

function parseRepository(remoteUrl: string): string {
    const schemeIndex = remoteUrl.indexOf('://')
    if (schemeIndex >= 0) {
        return remoteUrl.slice(schemeIndex + 3)
    }
    const parts = remoteUrl.match(/.*@([^:]+):(.+)/)
    if (parts) {
        return parts[1] + '/' + parts[2]
    }
    throw new Error(`Unknown git remote url format: ${remoteUrl}`)
}

function getSelection(
    document: vscode.TextDocument,
    range: vscode.Range
): SourcegraphGQL.IDiscussionThreadTargetRepoSelectionInput {
    const beforeRange = new vscode.Range(range.start.line - 3, 0, range.start.line - 1, 0)
    const linesBefore = getLines(document, beforeRange)

    const lines = getLines(document, range)

    const afterRange = new vscode.Range(range.end.line + 1, 0, range.end.line + 3, 0)
    const linesAfter = getLines(document, afterRange)

    return {
        startLine: range.start.line,
        startCharacter: range.start.character,
        endLine: range.end.line,
        endCharacter: range.end.character,
        linesBefore,
        lines,
        linesAfter,
    }
}

function getLines(document: vscode.TextDocument, range: vscode.Range): string[] {
    const lines: string[] = []
    for (let i = range.start.line; i <= range.end.line; i++) {
        if (i >= 0 && i < document.lineCount) {
            lines.push(document.lineAt(i).text)
        }
    }
    return lines
}

const discussionThreadFieldsFragment = gql`
    fragment DiscussionThreadFields on DiscussionThread {
        id
        author {
            ...UserFields
        }
        comments {
            totalCount
            nodes {
                id
                author {
                    ...UserFields
                }
                contents
            }
        }
        title
        target {
            __typename
            ... on DiscussionThreadTargetRepo {
                repository {
                    name
                }
                path
                relativePath(rev: $branch)
                branch {
                    displayName
                }
                revision {
                    displayName
                }
                selection {
                    startLine
                    startCharacter
                    endLine
                    endCharacter
                    linesBefore
                    lines
                    linesAfter
                }
                relativeSelection(rev: $branch) {
                    startLine
                    startCharacter
                    endLine
                    endCharacter
                }
            }
        }
        inlineURL
        createdAt
        updatedAt
        archivedAt
    }

    fragment UserFields on User {
        displayName
        username
        avatarURL
    }
`
