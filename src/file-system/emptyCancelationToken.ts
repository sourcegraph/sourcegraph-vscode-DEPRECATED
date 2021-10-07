import * as vscode from 'vscode'

export function emptyCancelationToken(): vscode.CancellationToken {
    return new vscode.CancellationTokenSource().token
}
