'use strict'
import execa from 'execa'
import opn from 'opn'
import * as path from 'path'
import * as vscode from 'vscode'

const VERSION = require('../package.json').version

/**
 * Returns the names of all git remotes, e.g. ["origin", "foobar"]
 */
async function gitRemotes(repoDir: string): Promise<string[]> {
    const { stdout } = await execa('git', ['remote'], { cwd: repoDir })
    return stdout.split('\n')
}

/**
 * Returns the remote URL for the given remote name.
 * e.g. `origin` -> `git@github.com:foo/bar`
 */
async function gitRemoteURL(repoDir: string, remoteName: string): Promise<string> {
    const { stdout } = await execa('git', ['remote', 'get-url', remoteName], { cwd: repoDir })
    return stdout
}

/**
 * Returns the remote URL of the first Git remote found.
 */
async function gitDefaultRemoteURL(repoDir: string): Promise<string> {
    const remotes = await gitRemotes(repoDir)
    if (remotes.length === 0) {
        throw new Error('no configured git remotes')
    }
    if (remotes.length > 1) {
        console.log('using first git remote:', remotes[0])
    }
    return await gitRemoteURL(repoDir, remotes[0])
}

/**
 * Returns the repository root directory for any directory within the
 * repository.
 */
async function gitRootDir(repoDir: string): Promise<string> {
    const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd: repoDir })
    return stdout
}

/**
 * Returns either the current branch name of the repository OR in all
 * other cases (e.g. detached HEAD state), it returns "HEAD".
 */
async function gitBranch(repoDir: string): Promise<string> {
    const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDir })
    return stdout
}

function sourcegraphURL(): string {
    // Use "remote.endpoint" when the extension is installed in Sourcegraph Editor, else use "sourcegraph.url"
    const url =
        vscode.workspace.getConfiguration('remote').get<string>('endpoint') ||
        vscode.workspace.getConfiguration('sourcegraph').get<string>('url')! // has default value
    if (!url.endsWith('/')) {
        return url + '/'
    }
    return url
}

/**
 * Returns the Sourcegraph repository URI, and the file path relative
 * to the repository root. If the repository URI cannot be determined, empty
 * strings are returned.
 */
async function repoInfo(fileName: string): Promise<[string, string, string]> {
    let remoteURL = ''
    let branch = ''
    let fileRel = ''
    try {
        // Determine repository root directory.
        const fileDir = path.dirname(fileName)
        const repoRoot = await gitRootDir(fileDir)

        // Determine file path, relative to repository root.
        fileRel = fileName.slice(repoRoot.length + 1)
        remoteURL = await gitDefaultRemoteURL(repoRoot)
        branch = await gitBranch(repoRoot)
    } catch (e) {
        console.log('repoInfo:', e)
    }
    return [remoteURL, branch, fileRel]
}

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
        `${sourcegraphURL()}-/editor` +
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
        `${sourcegraphURL()}-/editor` +
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
    // Register our extension commands (see package.json).
    context.subscriptions.push(vscode.commands.registerCommand('extension.open', handleCommandErrors(openCommand)))
    context.subscriptions.push(vscode.commands.registerCommand('extension.search', handleCommandErrors(searchCommand)))
}

export function deactivate(): void {
    // no-op
}
