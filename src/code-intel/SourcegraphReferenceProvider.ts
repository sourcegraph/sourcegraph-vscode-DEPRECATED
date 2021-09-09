import * as vscode from 'vscode'
import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import { SourcegraphUri } from '../file-system/SourcegraphUri'
import { SearchPatternType } from '../search/scanner'
import { referencesQuery } from '../queries/referencesQuery'
import { searchQuery } from '../queries/searchQuery'
import { endpointHostnameSetting } from '../settings/endpointSetting'

export class SourcegraphReferenceProvider implements vscode.ReferenceProvider {
    constructor(private readonly fs: SourcegraphFileSystemProvider) {}

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[] | undefined> {
        if (document.languageId === 'sourcegraph') {
            return this.searchReferences(document, token)
        }
        const uri = this.fs.sourcegraphUri(document.uri)
        const blob = await this.fs.fetchBlob(uri)
        const locationNodes = await referencesQuery(
            {
                repositoryName: blob.repositoryName,
                revision: blob.revision,
                path: blob.path,
                line: position.line,
                character: position.character,
            },
            token
        )
        return locationNodes.map(node => this.fs.toVscodeLocation(node))
    }

    private async searchReferences(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        const repos = [...this.fs.allRepositoryUris()]
            .map(repo => {
                const uri = SourcegraphUri.parse(repo)
                return `repo:^${uri.repositoryName}$${uri.revisionPart()}`
            })
            .join(' OR ')
        const query = `(${repos}) AND ${document.getText()}`
        return searchQuery(endpointHostnameSetting(), query, SearchPatternType.literal, token)
    }
}
