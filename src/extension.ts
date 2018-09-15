'use strict'

import opn from 'opn'
import * as vscode from 'vscode'
import { activateComments } from './comments'
import { getSourcegraphUrl } from './config'
import { repoInfo } from './git'
import { log } from './log'

const VERSION = require('../package.json').version

/**
 * Displays an error message to the user.
 */
function showError(err: Error): void {
    vscode.window.showErrorMessage(err.message)
}

const handleCommandErrors = (command: (...args: any[]) => any) => async (...args: any[]) => {
    try {
        return await command(...args)
    } catch (error) {
        showError(error)
    }
}

/**
 * The command implementation for opening a cursor selection on Sourcegraph.
 */
async function openCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        throw new Error('No active editor')
    }
    const [remoteURL, branch, fileRel] = await repoInfo(editor.document.uri.fsPath)
    if (remoteURL === '') {
        return
    }

    // Open in browser.
    await opn(
        `${getSourcegraphUrl()}-/editor` +
            `?remote_url=${encodeURIComponent(remoteURL)}` +
            `&branch=${encodeURIComponent(branch)}` +
            `&file=${encodeURIComponent(fileRel)}` +
            `&editor=${encodeURIComponent('VSCode')}` +
            `&version=${encodeURIComponent(VERSION)}` +
            `&start_row=${encodeURIComponent(String(editor.selection.start.line))}` +
            `&start_col=${encodeURIComponent(String(editor.selection.start.character))}` +
            `&end_row=${encodeURIComponent(String(editor.selection.end.line))}` +
            `&end_col=${encodeURIComponent(String(editor.selection.end.character))}`
    )
}

/**
 * The command implementation for searching a cursor selection on Sourcegraph.
 */
async function searchCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        throw new Error('No active editor')
    }
    const [remoteURL, branch, fileRel] = await repoInfo(editor.document.uri.fsPath)

    const query = editor.document.getText(editor.selection)
    if (query === '') {
        return // nothing to query
    }

    // Search in browser.
    await opn(
        `${getSourcegraphUrl()}-/editor` +
            `?remote_url=${encodeURIComponent(remoteURL)}` +
            `&branch=${encodeURIComponent(branch)}` +
            `&file=${encodeURIComponent(fileRel)}` +
            `&editor=${encodeURIComponent('VSCode')}` +
            `&version=${encodeURIComponent(VERSION)}` +
            `&search=${encodeURIComponent(query)}`
    )
}

/**
 * Called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext): void {
    console.log('hi sg')
    log.appendLine('sourcegraph')
    log.show()
    // Register our extension commands (see package.json).
    context.subscriptions.push(vscode.commands.registerCommand('extension.open', handleCommandErrors(openCommand)))
    context.subscriptions.push(vscode.commands.registerCommand('extension.search', handleCommandErrors(searchCommand)))
    activateComments(context)
}

export function deactivate(): void {
    // no-op
}
