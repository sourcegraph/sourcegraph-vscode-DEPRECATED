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
    return '5328077082b4ab52940882da16b21be10abef26a'
    // return vscode.workspace.getConfiguration('sourcegraph').get<string>('accessToken')
}
