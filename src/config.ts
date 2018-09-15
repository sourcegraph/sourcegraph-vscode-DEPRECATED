'use strict'

// import vscode from 'vscode'

export function getSourcegraphUrl(): string {
    return 'http://localhost:3080'
    // const url = vscode.workspace.getConfiguration('sourcegraph').get<string>('url')! // has default value
    // if (url.endsWith('/')) {
    //     return url.slice(0, -1)
    // }
    // return url
}

export function getAccessToken(): string | undefined {
    return 'd7307a3e796813630991f954be2be65d5ca6992c'
    // return vscode.workspace.getConfiguration('sourcegraph').get<string>('accessToken')
}
