import * as vscode from 'vscode'
import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import { definitionQuery } from '../queries/definitionQuery'

export class SourcegraphDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private readonly fs: SourcegraphFileSystemProvider) {}
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        const uri = this.fs.sourcegraphUri(document.uri)
        const blob = await this.fs.fetchBlob(uri)
        const locations = await definitionQuery(
            {
                repositoryName: blob.repositoryName,
                revision: blob.revision,
                path: blob.path,
                line: position.line,
                character: position.character,
            },
            token
        )
        return locations.map(node => this.fs.toVscodeLocation(node))
    }
}
