import * as vscode from 'vscode'
import { SourcegraphFileSystemProvider } from './file-system/SourcegraphFileSystemProvider'
import { SourcegraphSemanticTokenProvider } from './search/SourcegraphSemanticTokenProvider'
import { goToFileCommand } from './commands/goToFileCommand'
import { createNewNotebookCommand } from './commands/createNewNotebookCommand'
import { openSourcegraphUriCommand } from './commands/openSourcegraphUriCommand'
import { SourcegraphUri } from './file-system/SourcegraphUri'
import { goToRepositoryCommand } from './commands/goToRepositoryCommand'
import { openCommand } from './commands/openCommand'
import { searchCommand } from './commands/searchCommand'
import { SourcegraphCompletionItemProvider } from './search/SourcegraphCompletionItemProvider'
import { SourcegraphNotebookSerializer } from './search/SourcegraphNotebookSerializer'
import { log } from './log'
import { searchSelectionCommand } from './commands/searchSelectionCommand'
import { SourcegraphHoverProvider } from './code-intel/SourcegraphHoverProvider'
import { SourcegraphDefinitionProvider } from './code-intel/SourcegraphDefinitionProvider'
import { SourcegraphReferenceProvider } from './code-intel/SourcegraphReferenceProvider'
import { FilesTreeDataProvider } from './file-system/FilesTreeDataProvider'
import { switchGitRevisionCommand } from './commands/switchGitRevisionCommand'
import { openFileInBrowserCommand } from './commands/openFileInBrowserCommand'
import { DiffsTreeDataProvider } from './file-system/DiffsTreeDataProvider'
import { updateCompareRange } from './commands/updateCompareRangeCommand'
import { BlameDecorationProvider } from './file-system/BlameDecorationProvider'
import { goToCommitCommand } from './commands/goToCommitCommand'
import { activateEndpointSetting } from './settings/endpointSetting'

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
export const { version } = require('../package.json')

/**
 * Displays an error message to the user.
 */
async function showError(error: Error): Promise<void> {
    await vscode.window.showErrorMessage(error.message)
}

const handleCommandErrors = <P extends unknown[], R>(what: string, command: (...args: P) => Promise<R>) => async (
    ...args: P
): Promise<R | void> => {
    try {
        return await command(...args)
    } catch (error) {
        if (error instanceof Error) {
            log.error(what, error)
            await showError(error)
        }
    }
}

export const fs = new SourcegraphFileSystemProvider()
export const files = new FilesTreeDataProvider(fs)
export const diffs = new DiffsTreeDataProvider(fs)
export const blames = new BlameDecorationProvider(fs)

/**
 * Called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext): void {
    // Register our extension commands (see package.json).
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.open',
            handleCommandErrors('extension.open', () => openCommand(version))
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.search',
            handleCommandErrors('extension.search', () => searchCommand())
        )
    )

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.search.selection',
            handleCommandErrors('extension.search.selection', () => searchSelectionCommand(version))
        )
    )

    // Register file-system related functionality.
    vscode.workspace.registerFileSystemProvider('sourcegraph', fs, { isReadonly: true })
    vscode.languages.registerHoverProvider({ scheme: 'sourcegraph' }, new SourcegraphHoverProvider(fs))
    vscode.languages.registerDefinitionProvider({ scheme: 'sourcegraph' }, new SourcegraphDefinitionProvider(fs))
    const referenceProvider = new SourcegraphReferenceProvider(fs)
    vscode.languages.registerReferenceProvider({ scheme: 'sourcegraph' }, referenceProvider)

    const filesTreeView = vscode.window.createTreeView<string>('sourcegraph.files', {
        treeDataProvider: files,
        showCollapseAll: true,
    })
    files.setTreeView(filesTreeView)

    const diffsTreeView = vscode.window.createTreeView('sourcegraph.diffs', {
        treeDataProvider: diffs,
        showCollapseAll: true,
    })

    diffs.setTreeView(diffsTreeView)
    for (const treeView of [filesTreeView, diffsTreeView]) {
        context.subscriptions.push(treeView)
    }

    const semanticTokens = new SourcegraphSemanticTokenProvider()
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.goToFileInFolder', async (uri: string | undefined) => {
            if (typeof uri === 'string') {
                await goToFileCommand(fs, uri)
            } else {
                log.error(`extension.goToFileInFolder - invalid argument ${uri || 'undefined'}`)
            }
        })
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.goToFile',
            handleCommandErrors('extension.goToFile', () => goToFileCommand(fs))
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.goToRepository',
            handleCommandErrors('extension.goToRepository', () => goToRepositoryCommand(fs))
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.switchGitRevision',
            handleCommandErrors('extension.switchGitRevision', (uri: string | undefined) =>
                switchGitRevisionCommand(files, uri)
            )
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.updateCompareRange', async (...commandArguments) => {
            await updateCompareRange(diffs, commandArguments)
        })
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.openFileInBrowser',
            handleCommandErrors('extension.openFileInBrowser', (uri: string | undefined) =>
                openFileInBrowserCommand(files, uri)
            )
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.newNotebook',
            handleCommandErrors('extension.newNotebook', () => createNewNotebookCommand())
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.focusActiveFile',
            handleCommandErrors('extension.focusActiveFile', () => files.focusActiveFile())
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.openFile', async uri => {
            if (typeof uri === 'string') {
                await openSourcegraphUriCommand(fs, SourcegraphUri.parse(uri))
            } else {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                log.error(`extension.openFile(${uri}) argument is not a string`)
            }
        })
    )

    // Register Notebooks related functionality.
    vscode.languages.registerReferenceProvider({ language: 'sourcegraph' }, referenceProvider)
    vscode.languages.registerDocumentSemanticTokensProvider({ language: 'sourcegraph' }, semanticTokens, semanticTokens)
    vscode.languages.registerCompletionItemProvider(
        { language: 'sourcegraph' },
        new SourcegraphCompletionItemProvider()
    )
    for (const treeProvider of [files, diffs]) {
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => treeProvider.didFocus(editor?.document.uri))
        )
        treeProvider.didFocus(vscode.window.activeTextEditor?.document.uri).then(
            () => {},
            () => {}
        )
    }
    context.subscriptions.push(activateEndpointSetting())
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(event => blames.onDidChangeTextEditorSelection(event))
    )
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.goToCommit', (...commandArguments) =>
            goToCommitCommand(diffs, commandArguments)
        )
    )
    vscode.workspace.registerNotebookSerializer('sourcegraph-notebook', new SourcegraphNotebookSerializer(fs), {})
}

export function deactivate(): void {
    // no-op
}
