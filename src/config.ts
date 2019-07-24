import vscode from 'vscode'

export function getSourcegraphUrl(): string {
    const url = vscode.workspace.getConfiguration('sourcegraph').get<string>('url')! // has default value
    if (url.endsWith('/')) {
        return url.slice(0, -1)
    }
    return url
}

export function getIgnoreRemoteHostname(): boolean {
    const ignoreRemoteHostname = vscode.workspace.getConfiguration('sourcegraph').get<boolean>('ignoreRemoteHostname')! // has default value
    return ignoreRemoteHostname
}

export function getRemoteUrlPrepend(): Record<string, string> {
    const remoteUrlPrepend = vscode.workspace
        .getConfiguration('sourcegraph')
        .get<Record<string, string>>('remoteUrlPrepend')! // had default value
    return remoteUrlPrepend
}
