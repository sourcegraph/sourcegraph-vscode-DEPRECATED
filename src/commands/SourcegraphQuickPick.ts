import * as vscode from 'vscode'
import { log } from '../log'
import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import { SourcegraphUri } from '../file-system/SourcegraphUri'

export interface NewQuickPickValue {
    text: string
    token: vscode.CancellationToken
}

export interface BrowseQuickPickItem extends vscode.QuickPickItem {
    uri: string
    unresolvedRepositoryName?: string
}

export class SourcegraphQuickPick {
    constructor(private readonly fs: SourcegraphFileSystemProvider) {}

    private recentlyOpenItems: BrowseQuickPickItem[] = []
    private didPickNewValue = new vscode.EventEmitter<NewQuickPickValue>()
    public readonly pick = vscode.window.createQuickPick<BrowseQuickPickItem>()
    public onDidChangeValue: vscode.Event<NewQuickPickValue> = this.didPickNewValue.event

    public showQuickPickAndGetUserInput(): Promise<SourcegraphUri> {
        return new Promise<SourcegraphUri>((resolve, reject) => {
            let selection: BrowseQuickPickItem | undefined = undefined
            this.pick.items = this.recentlyOpenItems
            let pendingRequests: vscode.CancellationTokenSource = new vscode.CancellationTokenSource()
            const onCancelableDidChangeValue = async (value: string) => {
                if (pendingRequests) {
                    pendingRequests.cancel()
                    pendingRequests.dispose()
                    pendingRequests = new vscode.CancellationTokenSource()
                }
                this.didPickNewValue.fire({
                    text: value,
                    token: pendingRequests.token,
                })
            }
            onCancelableDidChangeValue(this.pick.value)
            this.pick.onDidChangeValue(onCancelableDidChangeValue)
            this.pick.onDidChangeSelection(items => {
                if (items.length > 0) {
                    selection = items[items.length - 1]
                }
            })
            this.pick.onDidAccept(async () => {
                if (!selection) {
                    log.appendLine(`onDidAccept - selection is empty`)
                    return
                }
                this.pick.busy = true
                try {
                    const uri = await this.resolveFileUri(selection)
                    resolve(uri)
                    this.pick.dispose()
                } catch (error) {
                    this.pick.busy = false
                    log.error(`onDidAccept(${JSON.stringify(selection)})`, error)
                }
            })
            this.pick.onDidHide(() => {
                this.pick.dispose()
                reject()
            })
            this.pick.show()
        })
    }

    private async resolveFileUri(selection: BrowseQuickPickItem): Promise<SourcegraphUri> {
        let uriString = selection.uri
        if (selection.unresolvedRepositoryName && (!uriString || !SourcegraphUri.parse(uriString).path)) {
            // Update the missing file path
            uriString = (await this.fs.defaultFileUri(selection.unresolvedRepositoryName)).uri
        }
        return SourcegraphUri.parse(uriString)
    }
}
