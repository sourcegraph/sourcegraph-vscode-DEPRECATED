import * as vscode from 'vscode'
import { graphqlQuery } from './graphqlQuery'
import gql from 'tagged-template-noop'

export async function gitBlameQuery(
    parameters: GitBlameParameters,
    token: vscode.CancellationToken
): Promise<GitBlame[]> {
    const response = await graphqlQuery<GitBlameParameters, GitBlameResponse>(
        gql`
            query GitBlame($repositoryName: String!, $revision: String!, $filePath: String!) {
                repository(name: $repositoryName) {
                    commit(rev: $revision) {
                        blob(path: $filePath) {
                            blame(startLine: 0, endLine: 0) {
                                startLine
                                endLine
                                author {
                                    person {
                                        email
                                        displayName
                                        avatarURL
                                        user {
                                            username
                                        }
                                    }
                                    date
                                }
                                message
                                commit {
                                    oid
                                    abbreviatedOID
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
    return response?.data?.repository?.commit?.blob?.blame || []
}

export interface GitBlame {
    startLine: number
    endLine: number
    author?: {
        person?: {
            email?: string
            displayName?: string
            avatarURL?: string
        }
        date?: string
    }
    message?: string
    commit?: {
        oid?: string
        abbreviatedOID?: string
    }
}

export interface GitBlameParameters {
    repositoryName: string
    revision: string
    filePath: string
}

export interface GitBlameResponse {
    data?: {
        repository?: {
            commit?: {
                blob?: {
                    blame?: GitBlame[]
                }
            }
        }
    }
}
