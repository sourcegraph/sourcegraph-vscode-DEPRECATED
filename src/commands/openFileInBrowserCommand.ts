import open from 'open'
import { FilesTreeDataProvider } from '../file-system/FilesTreeDataProvider'
import { SourcegraphUri } from '../file-system/SourcegraphUri'

export async function openFileInBrowserCommand(
    tree: FilesTreeDataProvider,
    uriString: string | undefined
): Promise<void> {
    const activeTextDocument = uriString ? SourcegraphUri.parse(uriString) : tree.activeTextDocument()
    if (!activeTextDocument || !activeTextDocument.path) {
        return
    }

    await open(activeTextDocument.uri.replace('sourcegraph://', 'https://'))
}
