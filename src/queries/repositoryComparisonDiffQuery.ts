import * as vscode from 'vscode'
import { graphqlQuery } from './graphqlQuery'
import gql from 'tagged-template-noop'

export interface RepositoryComparison {
    files: FileDiffNode[]
    commits: CommitNode[]
}

export async function repositoryComparisonDiffQuery(
    parameters: RepositoryComparisonParameters,
    token: vscode.CancellationToken
): Promise<RepositoryComparison> {
    const response = await graphqlQuery<RepositoryComparisonParameters, RepositoryComparisonResult>(
        gql`
            query RepositoryComparisonDiff(
                $repositoryId: ID!
                $base: String
                $head: String
                $first: Int
                $after: String
            ) {
                node(id: $repositoryId) {
                    ... on Repository {
                        comparison(base: $base, head: $head) {
                            fileDiffs(first: $first, after: $after) {
                                nodes {
                                    ...FileDiffFields
                                }
                                totalCount
                                diffStat {
                                    ...DiffStatFields
                                }
                            }
                            commits(first: $first) {
                                nodes {
                                    oid
                                    abbreviatedOID
                                    message
                                    author {
                                        person {
                                            displayName
                                            avatarURL
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            fragment FileDiffFields on FileDiff {
                oldPath
                newPath
                stat {
                    added
                    changed
                    deleted
                }
            }

            fragment DiffStatFields on DiffStat {
                added
                changed
                deleted
            }
        `,
        parameters,
        token
    )
    return {
        files: response?.data?.node?.comparison?.fileDiffs?.nodes || [],
        commits: response?.data?.node?.comparison?.commits?.nodes || [],
    }
}

interface RepositoryComparisonResult {
    data?: {
        node?: {
            comparison?: {
                fileDiffs?: {
                    nodes?: FileDiffNode[]
                }
                commits?: {
                    nodes?: CommitNode[]
                }
            }
        }
    }
}

export interface CommitNode {
    oid?: string
    abbreviatedOID?: string
    message?: string
    author?: {
        person?: {
            displayName?: string
            avatarURL?: string
        }
    }
}

export interface FileDiffNode {
    oldPath?: string
    newPath?: string
    stat?: {
        added?: number
        changed?: number
        deleted?: number
    }
}

export interface RepositoryComparisonParameters {
    repositoryId: string
    base: string
    head: string
    first: number
}
