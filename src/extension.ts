import open from 'open'
import * as vscode from 'vscode'
import { getSourcegraphUrl } from './config'
import { repoInfo, RepositoryInfo } from './git'

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { version } = require('../package.json')

/**
 * Displays an error message to the user.
 */
async function showError(error: Error): Promise<void> {
    await vscode.window.showErrorMessage(error.message)
}

const handleCommandErrors = <P extends unknown[], R>(command: (...args: P) => Promise<R>) => async (
    ...args: P
): Promise<R | void> => {
    try {
        return await command(...args)
    } catch (error) {
        await showError(error)
    }
}

/**
 * Returns the Sourcegraph URL for a cursor selection.
 */
const getSelectionSourcegraphUrl = (editor: vscode.TextEditor, repositoryInfo: RepositoryInfo): string => {
    const { remoteURL, branch, fileRelative } = repositoryInfo
    return `${getSourcegraphUrl()}/-/editor` +
        `?remote_url=${encodeURIComponent(remoteURL)}` +
        `&branch=${encodeURIComponent(branch)}` +
        `&file=${encodeURIComponent(fileRelative)}` +
        `&editor=${encodeURIComponent('VSCode')}` +
        `&version=${encodeURIComponent(version)}` +
        `&start_row=${encodeURIComponent(String(editor.selection.start.line))}` +
        `&start_col=${encodeURIComponent(String(editor.selection.start.character))}` +
        `&end_row=${encodeURIComponent(String(editor.selection.end.line))}` +
        `&end_col=${encodeURIComponent(String(editor.selection.end.character))}`
}

/**
 * The command implementation for opening a cursor selection on Sourcegraph.
 */
async function openCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        throw new Error('No active editor')
    }
    const repositoryInfo = await repoInfo(editor.document.uri.fsPath)
    if (!repositoryInfo) {
        return
    }
    // Open in browser.
    await open(getSelectionSourcegraphUrl(editor, repositoryInfo))
}

/**
 * The command implementation for copying the Sourcegraph URL of a cursor selection.
 */
async function copyUrlCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        throw new Error('No active editor')
    }
    const repositoryInfo = await repoInfo(editor.document.uri.fsPath)
    if (!repositoryInfo) {
        return
    }
    // Copy to clipboard.
    await vscode.env.clipboard.writeText(getSelectionSourcegraphUrl(editor, repositoryInfo))
}

/**
 * The command implementation for searching a cursor selection on Sourcegraph.
 */
async function searchSelectionCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        throw new Error('No active editor')
    }
    const repositoryInfo = await repoInfo(editor.document.uri.fsPath)
    if (!repositoryInfo) {
        return
    }
    const { remoteURL, branch, fileRelative } = repositoryInfo

    const query = editor.document.getText(editor.selection)
    if (query === '') {
        return // nothing to query
    }

    // Search in browser.
    await open(
        `${getSourcegraphUrl()}/-/editor` +
        `?remote_url=${encodeURIComponent(remoteURL)}` +
        `&branch=${encodeURIComponent(branch)}` +
        `&file=${encodeURIComponent(fileRelative)}` +
        `&editor=${encodeURIComponent('VSCode')}` +
        `&version=${encodeURIComponent(version)}` +
        `&search=${encodeURIComponent(query)}`
    )
}

/**
 * The command implementation for searching on Sourcegraph.com
 */

async function searchCommand(): Promise<void> {
    await vscode.window.showInputBox().then(value => {
        if (!value) {
            return
        }
        return open(`${getSourcegraphUrl()}/search?patternType=literal&q=${encodeURIComponent(value)}`)
    })
}

/**
 * Called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext): void {
    // Register our extension commands (see package.json).
    context.subscriptions.push(vscode.commands.registerCommand(
        'extension.open',
        handleCommandErrors(openCommand)))
    context.subscriptions.push(vscode.commands.registerCommand(
        'extension.copyUrl',
        handleCommandErrors(copyUrlCommand)))
    context.subscriptions.push(vscode.commands.registerCommand(
        'extension.search.selection',
        handleCommandErrors(searchSelectionCommand)))
    context.subscriptions.push(vscode.commands.registerCommand(
        'extension.search',
        handleCommandErrors(searchCommand)))
}

export function deactivate(): void {
    // no-op
}
