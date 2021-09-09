import * as vscode from 'vscode'
import { scanSearchQuery, SearchPatternType } from './scanner'
import { decorate, DecoratedToken } from './decoratedToken'

export class SourcegraphSemanticTokenProvider
    implements vscode.DocumentSemanticTokensProvider, vscode.SemanticTokensLegend {
    public tokenTypes: string[] = [
        'namespace',
        'class',
        'enum',
        'interface',
        'struct',
        'typeParameter',
        'type',
        'parameter',
        'variable',
        'property',
        'enumMember',
        'event',
        'function',
        'method',
        'macro',
        'label',
        'comment',
        'string',
        'keyword',
        'number',
        'regexp',
        'operator',
    ]
    public tokenModifiers: string[] = []
    public onDidChangeSemanticTokens?: vscode.Event<void> | undefined
    public provideDocumentSemanticTokens(
        document: vscode.TextDocument,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        token: vscode.CancellationToken
    ): vscode.SemanticTokens {
        const builder = new vscode.SemanticTokensBuilder(this)
        const lines = document.getText().split(/\r?\n/g)
        const patternType = SearchPatternType.regexp
        const interpretComments = true
        for (const [line, text] of lines.entries()) {
            const result = scanSearchQuery(text, interpretComments, patternType)
            if (result.type === 'success') {
                for (const token of result.term) {
                    for (const decoratedToken of decorate(token)) {
                        const start = new vscode.Position(line, decoratedToken.range.start)
                        const end = new vscode.Position(line, decoratedToken.range.end)
                        const range = new vscode.Range(start, end)
                        const type = sourcegraphDecoratedTokenTypeToSemanticTokenType(decoratedToken)
                        if (type) {
                            builder.push(range, type)
                        }
                    }
                }
            }
        }
        return builder.build()
    }
}

function sourcegraphDecoratedTokenTypeToSemanticTokenType(token: DecoratedToken): string {
    switch (token.type) {
        case 'closingParen':
        case 'openingParen':
            return 'namespace'
        case 'comment':
            return 'comment'
        case 'field':
            return 'property'
        case 'filter':
            return 'class'
        case 'keyword':
            return 'keyword'
        case 'literal':
            return 'number'
        case 'metaPath':
            return 'regexp'
        case 'metaContextPrefix':
        case 'metaPredicate':
        case 'metaRegexp':
        case 'metaRepoRevisionSeparator':
        case 'metaRevision':
            return 'interface'
        case 'pattern':
            return ''
        default:
            return ''
    }
}
