import open from 'open'
import * as vscode from 'vscode'
import { repoInfo } from '../git'
import { endpointSetting } from '../settings/endpointSetting'

/**
 * The command implementation for searching a cursor selection on Sourcegraph.
 */
export async function searchSelectionCommand(extensionVersion: string): Promise<void> {
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
        `${endpointSetting()}/-/editor` +
            `?remote_url=${encodeURIComponent(remoteURL)}` +
            `&branch=${encodeURIComponent(branch)}` +
            `&file=${encodeURIComponent(fileRelative)}` +
            `&editor=${encodeURIComponent('VSCode')}` +
            `&version=${encodeURIComponent(extensionVersion)}` +
            `&search=${encodeURIComponent(query)}`
    )
}
