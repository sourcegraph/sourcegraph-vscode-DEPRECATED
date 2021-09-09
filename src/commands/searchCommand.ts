import open from 'open'
import * as vscode from 'vscode'
import { endpointSetting } from '../settings/endpointSetting'

/**
 * The command implementation for searching on Sourcegraph.com
 */
export async function searchCommand(): Promise<void> {
    await vscode.window.showInputBox().then(value => {
        if (!value) {
            return
        }
        return open(`${endpointSetting()}/search?patternType=literal&q=${encodeURIComponent(value)}`)
    })
}
