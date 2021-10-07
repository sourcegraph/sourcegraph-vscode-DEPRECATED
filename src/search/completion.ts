// This source file is copy-pasted and adjusted from the sourcegraph/sourcegraph repo
// https://sourcegraph.com/github.com/sourcegraph/sourcegraph@7ce0484274d7382f4b9b2898d77c3987e51fffa6/-/blob/client/shared/src/search/query/completion.ts?L4
import * as vscode from 'vscode'

import { FilterType, isNegatableFilter, resolveFilter, FILTERS } from './filters'
import { Filter, Token } from './token'

export const repositoryCompletionItemKind = vscode.CompletionItemKind.Color
const filterCompletionItemKind = vscode.CompletionItemKind.Issue

const FILTER_TYPE_COMPLETIONS: Omit<vscode.CompletionItem, 'range'>[] = Object.keys(FILTERS)
    .flatMap(label => {
        const filterType = label as FilterType
        const completionItem: Omit<vscode.CompletionItem, 'range' | 'detail'> = {
            label,
            kind: filterCompletionItemKind,
            insertText: `${label}:`,
            filterText: label,
        }
        if (isNegatableFilter(filterType)) {
            return [
                {
                    ...completionItem,
                    detail: FILTERS[filterType].description(false),
                },
                {
                    ...completionItem,
                    label: `-${label}`,
                    insertText: `-${label}:`,
                    filterText: `-${label}`,
                    detail: FILTERS[filterType].description(true),
                },
            ]
        }
        return [
            {
                ...completionItem,
                detail: FILTERS[filterType].description,
            },
        ]
    })
    // Set a sortText so that filter type suggestions
    // are shown before dynamic suggestions.
    .map((completionItem, index) => ({
        ...completionItem,
        sortText: `0${index}`,
    }))

const completeStart = (): vscode.CompletionList => ({
    items: FILTER_TYPE_COMPLETIONS.map(
        (suggestion): vscode.CompletionItem => ({
            ...suggestion,
        })
    ),
})

function completeDefault(
    token: Token,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _globbing: boolean
): vscode.CompletionList {
    // Offer autocompletion of filter values
    const staticSuggestions = FILTER_TYPE_COMPLETIONS.map(
        (suggestion): vscode.CompletionItem => ({
            ...suggestion,
        })
    )
    // If the token being typed matches a known filter,
    // only return static filter type suggestions.
    // This avoids blocking on dynamic suggestions to display
    // the suggestions widget.
    if (
        token.type === 'pattern' &&
        staticSuggestions.some(({ label }) => typeof label === 'string' && label.startsWith(token.value.toLowerCase()))
    ) {
        return { items: staticSuggestions }
    }

    return { items: staticSuggestions }
}

function completeFilter(
    token: Filter,
    column: number,
    globbing: boolean,
    isSourcegraphDotCom?: boolean
): vscode.CompletionList | null {
    const { value } = token
    const completingValue = !value || value.range.start + 1 <= column
    if (!completingValue) {
        return null
    }
    const resolvedFilter = resolveFilter(token.field.value)
    if (!resolvedFilter) {
        return null
    }
    let staticSuggestions: vscode.CompletionItem[] = []
    if (resolvedFilter.definition.discreteValues) {
        staticSuggestions = resolvedFilter.definition.discreteValues(token.value, isSourcegraphDotCom).map(
            ({ label, insertText }, index): vscode.CompletionItem => ({
                label,
                sortText: index.toString().padStart(2, '1'), // suggestions sort by order in the list, not alphabetically (up to 99 values).
                kind: vscode.CompletionItemKind.Value,
                insertText: `${insertText || label} `,
                filterText: label,
            })
        )
    }
    if (isSourcegraphDotCom === true && (value === undefined || (value.type === 'literal' && value.value === ''))) {
        // On Sourcegraph.com, prompt only static suggestions if there is no value to use for generating dynamic suggestions yet.
        return { items: staticSuggestions }
    }
    return { items: staticSuggestions }
}

/**
 * Returns the completion items for a search query being typed in the Monaco query input,
 * including both static and dynamically fetched suggestions.
 */
export function getCompletionItems(
    tokens: Token[],
    { character }: Pick<vscode.Position, 'character'>,
    globbing: boolean,
    isSourcegraphDotCom?: boolean
): vscode.CompletionList | null {
    character += 1
    if (character === 1) {
        // Show all filter suggestions on the first column.
        return completeStart()
    }
    const tokenAtColumn = tokens.find(({ range }) => range.start + 1 <= character && range.end + 1 >= character)
    if (!tokenAtColumn) {
        throw new Error('getCompletionItems: no token at character')
    }
    const token = tokenAtColumn
    // When the token at column is labeled as a pattern or whitespace, and none of filter,
    // operator, nor quoted value, show static filter type suggestions, followed by dynamic suggestions.
    if (token.type === 'pattern' || token.type === 'whitespace') {
        return completeDefault(token, globbing)
    }
    if (token.type === 'filter') {
        return completeFilter(token, character, globbing, isSourcegraphDotCom)
    }
    return null
}
