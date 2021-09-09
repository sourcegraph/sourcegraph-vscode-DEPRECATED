import * as vscode from 'vscode'
import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import { hoverQuery } from '../queries/hoverQuery'

export class SourcegraphHoverProvider implements vscode.HoverProvider {
    constructor(private readonly fs: SourcegraphFileSystemProvider) {}
    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        const blob = await this.fs.fetchBlob(this.fs.sourcegraphUri(document.uri))
        const hover = await hoverQuery(
            {
                repositoryName: blob.repositoryName,
                revision: blob.revision,
                path: blob.path,
                line: position.line,
                character: position.character,
            },
            token
        )
        if (!hover) {
            return undefined
        }
        return {
            contents: [new vscode.MarkdownString(hover)],
        }
    }
}
