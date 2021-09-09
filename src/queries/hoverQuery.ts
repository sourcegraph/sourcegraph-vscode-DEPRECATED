import * as vscode from 'vscode'
import { graphqlQuery } from './graphqlQuery'
import { PositionParameters } from './PositionParameters'
import gql from 'tagged-template-noop'

export async function hoverQuery(
    parameters: PositionParameters,
    token: vscode.CancellationToken
): Promise<string | undefined> {
    const response = await graphqlQuery<PositionParameters, HoverResult>(
        gql`
            query Hover($repositoryName: String!, $revision: String!, $path: String!, $line: Int!, $character: Int!) {
                repository(name: $repositoryName) {
                    commit(rev: $revision) {
                        blob(path: $path) {
                            lsif {
                                hover(line: $line, character: $character) {
                                    markdown {
                                        text
                                    }
                                    range {
                                        start {
                                            line
                                            character
                                        }
                                        end {
                                            line
                                            character
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `,
        parameters,
        token
    )
    return response?.data?.repository?.commit?.blob?.lsif?.hover?.markdown?.text
}

interface HoverResult {
    data?: {
        repository?: {
            commit?: {
                blob?: {
                    lsif?: {
                        hover?: {
                            markdown?: {
                                text?: string
                            }
                            range?: Range
                        }
                    }
                }
            }
        }
    }
}
