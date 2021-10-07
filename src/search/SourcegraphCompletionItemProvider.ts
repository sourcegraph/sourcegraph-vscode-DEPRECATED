import * as vscode from 'vscode'
import { getCompletionItems } from './completion'
import { scanSearchQuery, SearchPatternType } from './scanner'

export class SourcegraphCompletionItemProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _token: vscode.CancellationToken,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: vscode.CompletionContext
    ): vscode.CompletionList | null {
        const scanned = scanSearchQuery(document.getText(), true, SearchPatternType.literal)
        if (scanned.type === 'success') {
            return getCompletionItems(scanned.term, position, true, true)
        }
        return null
    }
}
