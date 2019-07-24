import vscode from 'vscode'

export function getSourcegraphUrl(): string {
    const url = vscode.workspace.getConfiguration('sourcegraph').get<string>('url')! // has default value
    if (url.endsWith('/')) {
        return url.slice(0, -1)
    }
    return url
}

export function getRemoteUrlReplacements(): Record<string, string> {
    const replacements = vscode.workspace
        .getConfiguration('sourcegraph')
        .get<Record<string, string>>('remoteUrlReplacements')! // has default value
    return replacements
}
