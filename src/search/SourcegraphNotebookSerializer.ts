import { TextDecoder, TextEncoder } from 'util'
import * as vscode from 'vscode'
import { log } from '../log'
import { openSourcegraphUriCommand } from '../commands/openSourcegraphUriCommand'
import { searchHtml } from './searchHtml'
import { SearchPatternType } from './scanner'
import { MarkdownPart, MarkdownPartKind, MarkdownFile } from './MarkdownFile'
import { SourcegraphUri } from '../file-system/SourcegraphUri'
import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import { endpointHostnameSetting } from '../settings/endpointSetting'

export class SourcegraphNotebookSerializer implements vscode.NotebookSerializer {
    private readonly decoder = new TextDecoder()
    private readonly encoder = new TextEncoder()
    private readonly messageChannel = vscode.notebooks.createRendererMessaging('sourcegraph-location-renderer')
    private order = 0

    constructor(fs: SourcegraphFileSystemProvider) {
        const controller = vscode.notebooks.createNotebookController(
            'sourcegraph-notebook-controller-id',
            'sourcegraph-notebook',
            'Sourcegraph Notebook'
        )
        controller.supportedLanguages = ['sourcegraph']
        controller.supportsExecutionOrder = true
        controller.executeHandler = (cells, notebook, controller) => this.executeNotebook(cells, notebook, controller)
        this.messageChannel.onDidReceiveMessage(async event => {
            const uriString: unknown = event.message?.uri
            if (event.message?.request === 'openEditor' && typeof uriString === 'string') {
                let uri = SourcegraphUri.parse(uriString)
                if (uri.isCommit()) {
                    log.debug({ uri: uri.uri })
                    return
                }
                if (!uri.path) {
                    uri = await fs.defaultFileUri(uri.repositoryName)
                }
                if (!uri.revision) {
                    uri = uri.withRevision((await fs.repositoryMetadata(uri.repositoryName))?.defaultBranch)
                }
                await openSourcegraphUriCommand(fs, uri)
            } else if (event.message?.request === 'logMessage' && typeof event.message?.message === 'string') {
                log.appendLine(event.message.message)
            }
        })
    }

    public async executeNotebook(
        cells: vscode.NotebookCell[],
        _notebook: vscode.NotebookDocument,
        controller: vscode.NotebookController
    ): Promise<void> {
        for (const cell of cells) {
            const execution = controller.createNotebookCellExecution(cell)
            execution.token.onCancellationRequested(() => {
                log.appendLine(`cancelled execution ${cell.index}`)
                execution.end(false)
            })
            execution.executionOrder = ++this.order
            try {
                execution.start(Date.now())
                const html = await searchHtml(
                    endpointHostnameSetting(),
                    cell.document.getText(),
                    SearchPatternType.literal,
                    execution.token
                )
                await execution.replaceOutput(
                    new vscode.NotebookCellOutput([
                        new vscode.NotebookCellOutputItem(
                            new TextEncoder().encode(
                                JSON.stringify({
                                    html,
                                })
                            ),
                            'application/sourcegraph-location'
                        ),
                    ])
                )
                execution.end(true, Date.now())
            } catch (error) {
                const message = error instanceof Error ? error.message : JSON.stringify(error)
                await execution.replaceOutput(
                    new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(`ERROR: ${message}`)])
                )
                execution.end(false, Date.now())
            }
        }
    }

    public deserializeNotebook(
        data: Uint8Array,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _token: vscode.CancellationToken
    ): vscode.NotebookData {
        const content = this.decoder.decode(data)
        const file = MarkdownFile.parseContent(content)
        const cells: vscode.NotebookCellData[] = []
        for (const part of file.parts) {
            cells.push({
                kind:
                    part.kind === MarkdownPartKind.Markup
                        ? vscode.NotebookCellKind.Markup
                        : vscode.NotebookCellKind.Code,
                languageId: part.kind === MarkdownPartKind.Markup ? 'markdown' : 'sourcegraph',
                metadata: {
                    startBackticks: part.startBackticks,
                    endBackticks: part.endBackticks,
                },
                value: part.value,
            })
        }
        return { cells }
    }

    public serializeNotebook(
        data: vscode.NotebookData,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _token: vscode.CancellationToken
    ): Uint8Array {
        const parts: MarkdownPart[] = []
        for (const cell of data.cells) {
            if (cell.kind === vscode.NotebookCellKind.Code) {
                parts.push(
                    new MarkdownPart(
                        MarkdownPartKind.CodeFence,
                        cell.value,
                        cell.metadata?.startBackticks || '```sourcegraph',
                        cell.metadata?.endBackticks || '```'
                    )
                )
            } else if (cell.kind === vscode.NotebookCellKind.Markup) {
                parts.push(new MarkdownPart(MarkdownPartKind.Markup, cell.value))
            }
        }
        return this.encoder.encode(new MarkdownFile(parts).renderAsString())
    }
}
