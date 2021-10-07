import * as vscode from 'vscode'
import { log } from '../log'

export async function timedAsync<T>(what: string, thunk: () => Promise<T>): Promise<T> {
    const start = Date.now()
    const result = await thunk()
    const end = Date.now()
    const elapsedMilliseconds = end - start
    if (elapsedMilliseconds > 0) {
        log.appendLine(`TIME ${what}: ${elapsedMilliseconds}ms`)
    }
    return result
}
export function timed<T>(what: string, thunk: () => T): T {
    const start = Date.now()
    const result = thunk()
    const end = Date.now()
    const elapsedMilliseconds = end - start
    if (elapsedMilliseconds > 0) {
        log.appendLine(`TIME ${what}: ${elapsedMilliseconds}ms`)
    }
    return result
}

export function readConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('sourcegraph')
}
