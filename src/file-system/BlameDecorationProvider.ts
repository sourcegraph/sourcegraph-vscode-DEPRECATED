import { formatDistance, parseISO } from 'date-fns'
import * as vscode from 'vscode'
import { GoToCommitParameters } from '../commands/goToCommitCommand'
import { log } from '../log'
import { GitBlame, gitBlameQuery } from '../queries/gitBlameQuery'
import { emptyCancelationToken } from './emptyCancelationToken'
import { SourcegraphFileSystemProvider } from './SourcegraphFileSystemProvider'
import { SourcegraphUri } from './SourcegraphUri'

export class BlameDecorationProvider {
    constructor(public readonly fs: SourcegraphFileSystemProvider) {}

    private gitBlameCache = new Map<string, GitBlame[]>()
    private cancelToken = new vscode.CancellationTokenSource()
    private blameDecorationType = vscode.window.createTextEditorDecorationType({
        isWholeLine: false,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    })

    public async onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
        this.cancelToken.cancel()
        if (event.textEditor.document.uri.scheme !== 'sourcegraph') {
            return
        }
        this.cancelToken = new vscode.CancellationTokenSource()
        try {
            await this.onGitBlameDecorationsDidChange(event, this.cancelToken.token)
        } catch (error) {
            log.error(`onGitBlameDecorationsDidChange(${event.textEditor.document.uri.toString(true)})`, error)
        }
    }
    private async onGitBlameDecorationsDidChange(
        event: vscode.TextEditorSelectionChangeEvent,
        token: vscode.CancellationToken
    ): Promise<void> {
        const uri = this.fs.sourcegraphUri(event.textEditor.document.uri)
        const blames = await this.gitBlame(uri)
        if (token.isCancellationRequested) {
            // Don't update decorations if the selection has changed.
            return
        }
        const options: vscode.DecorationOptions[] = []
        for (const selection of event.selections) {
            const blameCandidates = blames.filter(
                // NOTE: Sourcegraph blame line numbers are 1-based, while VS Code selection lines are 0-based.
                blame => selection.end.line >= blame.startLine - 1 && selection.end.line < blame.endLine - 1
            )
            if (blameCandidates.length > 1) {
                log.debug({ blameCandidates })
            }
            if (blameCandidates.length !== 1) {
                continue
            }
            options.push(this.decorationOptions(uri, selection, blameCandidates[0]))
        }
        event.textEditor.setDecorations(this.blameDecorationType, options)
    }

    private decorationOptions(
        uri: SourcegraphUri,
        selection: vscode.Selection,
        blame: GitBlame
    ): vscode.DecorationOptions {
        const avatarURL = blame.author?.person?.avatarURL ? `![](${blame.author.person.avatarURL})` : ''
        const displayName = blame.author?.person?.displayName ? blame.author.person.displayName : ''
        const humanDate = blame.author?.date ? `, ${formatDistance(parseISO(blame.author.date), Date.now())} ago` : ''
        const date = blame.author?.date
            ? ` (${parseISO(blame.author.date).toLocaleTimeString(undefined, {
                  second: undefined,
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
              })})`
            : ''
        const messageHeader = blame?.message ? ` • ${blame.message}` : ''
        const commit = this.commitLink(selection, blame, uri)
        const message = blame?.message || ''
        const hoverMessage = new vscode.MarkdownString(`${avatarURL}${displayName}${humanDate}${date}

---

${commit}${message}`)
        hoverMessage.isTrusted = true
        return {
            range: new vscode.Range(selection.end.line, 1000, selection.end.line, 1001),
            hoverMessage,
            renderOptions: {
                after: {
                    margin: '2em',
                    contentText: `${displayName}${humanDate}${messageHeader}`,
                },
                light: {
                    after: {
                        color: '#5B5C5E',
                    },
                },
                dark: {
                    after: {
                        color: '#989A9E',
                    },
                },
            },
        }
    }

    private commitLink(selection: vscode.Selection, blame: GitBlame, uri: SourcegraphUri): string {
        if (!blame?.commit?.abbreviatedOID || !blame?.commit?.oid) {
            return ''
        }
        const parameters: GoToCommitParameters = { revision: blame.commit.oid, uri: uri.uri, line: selection.end.line }
        const encodedParameters = encodeURIComponent(JSON.stringify(parameters))
        return `[${blame.commit.abbreviatedOID}](command:extension.goToCommit?${encodedParameters} "Show Commit") • `
    }

    private async gitBlame(uri: SourcegraphUri): Promise<GitBlame[]> {
        let blame = this.gitBlameCache.get(uri.uri)
        if (!blame) {
            blame = await gitBlameQuery(
                {
                    repositoryName: uri.repositoryName,
                    revision: uri.revision,
                    filePath: uri.path || '',
                    // Don't use cancelation token because we want to cache the
                    // result even if the selection range has been updated.
                },
                emptyCancelationToken()
            )
            this.gitBlameCache.set(uri.uri, blame)
        }
        return blame
    }
}
