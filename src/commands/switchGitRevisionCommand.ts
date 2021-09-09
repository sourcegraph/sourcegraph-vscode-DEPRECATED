import { FilesTreeDataProvider } from '../file-system/FilesTreeDataProvider'
import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import { SourcegraphUri } from '../file-system/SourcegraphUri'
import { GitReference, gitReferencesQuery } from '../queries/gitReferencesQuery'
import { openSourcegraphUriCommand } from './openSourcegraphUriCommand'
import { SourcegraphQuickPick } from './SourcegraphQuickPick'

export async function switchGitRevisionCommand(
    tree: FilesTreeDataProvider,
    uriString: string | undefined
): Promise<void> {
    const activeTextDocument = uriString ? SourcegraphUri.parse(uriString) : tree.activeTextDocument()
    if (!activeTextDocument || !activeTextDocument.path) {
        return
    }
    const activeTextDocumentPath = activeTextDocument.path
    const uri = await pickGitReference(
        tree.fs,
        activeTextDocument.repositoryName,
        reference => `sourcegraph://${activeTextDocument.host}${reference.url}/-/blob/${activeTextDocumentPath}`
    )
    await openSourcegraphUriCommand(tree.fs, uri)
}

export async function pickGitReference(
    fs: SourcegraphFileSystemProvider,
    repositoryName: string,
    constructUri: (reference: GitReference) => string
): Promise<SourcegraphUri> {
    const metadata = await fs.repositoryMetadata(repositoryName)
    const quick = new SourcegraphQuickPick(fs)
    quick.pick.title = 'Search for a git branch, git tag or a git commit'
    quick.onDidChangeValue(async query => {
        quick.pick.busy = true
        const references = await gitReferencesQuery(
            { query: query.text, repositoryId: metadata?.id || '' },
            query.token
        )
        quick.pick.busy = false
        quick.pick.items = references.map(reference => ({
            label: gitReferenceTag(reference) + reference.displayName,
            uri: constructUri(reference),
            alwaysShow: true,
        }))
    })
    return quick.showQuickPickAndGetUserInput()
}
function gitReferenceTag(reference: GitReference): string {
    switch (reference.type) {
        case 'GIT_TAG':
            return '$(tag)'
        case 'GIT_BRANCH':
            return '$(git-branch)'
        case 'GIT_COMMIT':
            return '$(git-commit)'
        default:
            return ''
    }
}
