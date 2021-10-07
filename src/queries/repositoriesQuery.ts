import * as vscode from 'vscode'
import { graphqlQuery } from './graphqlQuery'
import gql from 'tagged-template-noop'

export async function repositoriesQuery(query: string, token: vscode.CancellationToken): Promise<string[]> {
    const response = await graphqlQuery<RepositoryParameters, RepositoryResult>(
        gql`
            query RepositoriesForPopover($query: String, $first: Int) {
                repositories(first: $first, query: $query) {
                    nodes {
                        name
                        isFork
                    }
                    totalCount
                    pageInfo {
                        hasNextPage
                    }
                }
            }
        `,
        {
            query,
            first: 10000,
        },
        token
    )
    return response?.data?.repositories?.nodes?.filter(node => !node.isFork).map(node => node.name) || []
}

interface RepositoryParameters {
    query: string
    first: number
}

interface RepositoryResult {
    data?: {
        repositories?: {
            nodes?: RepositoryNode[]
        }
    }
    first: number
}
interface RepositoryNode {
    name: string
    isFork: boolean
}
