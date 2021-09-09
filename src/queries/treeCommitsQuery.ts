import * as vscode from 'vscode'
import { graphqlQuery } from './graphqlQuery'
import gql from 'tagged-template-noop'
import { log } from '../log'

export async function treeCommitsQuery(
    parameters: TreeCommitsParameters,
    token: vscode.CancellationToken
): Promise<string[]> {
    const response = await graphqlQuery<TreeCommitsParameters, TreeCommitsResult>(
        gql`
            query TreeCommits($repositoryId: ID!, $revision: String!, $filePath: String, $first: Int) {
                node(id: $repositoryId) {
                    ... on Repository {
                        commit(rev: $revision) {
                            ancestors(first: $first, path: $filePath) {
                                nodes {
                                    ...GitCommitFields
                                }
                            }
                        }
                    }
                }
            }

            fragment GitCommitFields on GitCommit {
                oid
            }
        `,
        parameters,
        token
    )

    const result = response?.data?.node?.commit?.ancestors?.nodes?.flatMap(node => (node.oid ? [node.oid] : [])) || []
    log.appendLine(`TREE_COMMITS ${JSON.stringify(result)}`)
    return result
}

export interface TreeCommitsParameters {
    repositoryId: string
    revision: string
    filePath: string
    first: number
}

interface TreeCommitsResult {
    data?: {
        node?: {
            commit?: {
                ancestors?: {
                    nodes?: TreeCommitNode[]
                }
            }
        }
    }
}

interface TreeCommitNode {
    oid?: string
}
