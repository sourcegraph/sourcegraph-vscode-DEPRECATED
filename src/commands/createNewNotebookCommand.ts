import * as vscode from 'vscode'

export async function createNewNotebookCommand(): Promise<void> {
    await vscode.workspace.openNotebookDocument(
        'sourcegraph-notebook',
        new vscode.NotebookData([new vscode.NotebookCellData(vscode.NotebookCellKind.Code, '', 'sourcegraph')])
    )
    // TODO: use `showNotebookDocument` once it's available in the stable VS Code API. It's currently only part of the "proposed API".
    // await vscode.windowshowNotebookDocument(notebookDocument)
}
