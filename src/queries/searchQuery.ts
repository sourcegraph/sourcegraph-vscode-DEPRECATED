import * as vscode from 'vscode'
import { SearchPatternType } from '../search/scanner'
import { graphqlQuery } from './graphqlQuery'
import gql from 'tagged-template-noop'

export function searchQueryResult(
    query: string,
    patternType: SearchPatternType,
    token: vscode.CancellationToken
): Promise<SearchResult | undefined> {
    return graphqlQuery<SearchParameters, SearchResult>(
        gql`
            query($query: String!) {
                search(query: $query) {
                    results {
                        results {
                            __typename
                            ... on FileMatch {
                                ...FileMatchFields
                            }
                            ... on CommitSearchResult {
                                ...CommitSearchResultFields
                            }
                            ... on Repository {
                                ...RepositoryFields
                            }
                        }
                        ...SearchResultsAlertFields
                    }
                }
            }
            fragment FileMatchFields on FileMatch {
                repository {
                    name
                    url
                }
                file {
                    name
                    path
                    url
                    content
                    commit {
                        oid
                    }
                }
                lineMatches {
                    preview
                    lineNumber
                    offsetAndLengths
                    limitHit
                }
            }

            fragment CommitSearchResultFields on CommitSearchResult {
                commit {
                    message
                    author {
                        person {
                            name
                        }
                    }
                }
                matches {
                    url
                    body {
                        text
                    }
                    highlights {
                        character
                        line
                        length
                    }
                }
            }

            fragment RepositoryFields on Repository {
                name
                stars
            }

            fragment SearchResultsAlertFields on SearchResults {
                alert {
                    title
                    description
                    proposedQueries {
                        description
                        query
                    }
                }
            }
        `,
        { query },
        token
    )
}

export async function searchQuery(
    host: string,
    query: string,
    patternType: SearchPatternType,
    token: vscode.CancellationToken
): Promise<vscode.Location[]> {
    const result = await searchQueryResult(query, patternType, token)
    const results: vscode.Location[] = []
    const nodes = result?.data?.search?.results?.results
    for (const node of nodes || []) {
        const url = node?.file?.url
        if (!url) {
            continue
        }
        for (const lineMatch of node.lineMatches || []) {
            const line = lineMatch.lineNumber
            if (!line) {
                continue
            }
            for (const offsetsAndLength of lineMatch.offsetAndLengths || []) {
                const [character, length] = offsetsAndLength
                const start = new vscode.Position(line, character)
                const end = new vscode.Position(line, character + length)
                results.push(
                    new vscode.Location(vscode.Uri.parse(`sourcegraph://${host}${url}`), new vscode.Range(start, end))
                )
            }
        }
    }
    return results
}

export interface SearchParameters {
    query: string
}

export interface SearchResult {
    data?: {
        search?: {
            results?: {
                results?: SearchResultNode[]
            }
        }
    }
}

export interface SearchResultNode {
    __typename: string
    name?: string
    stars?: number
    file?: {
        url?: string
    }
    repository?: {
        stars?: number
    }
    lineMatches?: LineMatch[]
    matches?: CommitMatch[]
    commit?: {
        message?: string
    }
}

export interface LineMatch {
    lineNumber?: number
    offsetAndLengths?: [number, number][]
    preview?: string
}

export interface CommitMatch {
    url?: string
    body?: {
        text?: string
    }
    highlights?: CommitHighlight[]
}

export interface CommitHighlight {
    character?: number
    line?: number
    length?: number
}
