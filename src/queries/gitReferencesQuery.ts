import * as vscode from 'vscode'
import { graphqlQuery } from './graphqlQuery'
import gql from 'tagged-template-noop'

export interface GitReference {
    displayName: string
    name: string
    url: string
    type: string
}

export async function gitReferencesQuery(
    parameters: GitReferencesParameters,
    token: vscode.CancellationToken
): Promise<GitReference[]> {
    const type = parameters.query.startsWith('branch:')
        ? ', type: GIT_BRANCH'
        : parameters.query.startsWith('tag:')
        ? ', type: GIT_TAG'
        : ''
    if (parameters.query.startsWith('branch:')) {
        parameters.query = parameters.query.slice('branch:'.length)
    }
    if (parameters.query.startsWith('tag:')) {
        parameters.query = parameters.query.slice('tag:'.length)
    }
    const ancestoryQuery = /~(\d+)/
    const ancestorSuffix = parameters.query.match(ancestoryQuery)?.[0]
    parameters.query = parameters.query.replace(ancestoryQuery, '')
    const response = await graphqlQuery<GitReferencesParameters, GitReferencesResult>(
        gql`
            query RepositoryGitRefs($repositoryId: ID!, $query: String) {
                node(id: $repositoryId) {
                    __typename
                    ... on Repository {
                        gitRefs(first: 100, query: $query, orderBy: AUTHORED_OR_COMMITTED_AT${type}) {
                            __typename
                            ...GitRefConnectionFields
                        }
                        __typename
                    }
                }
            }

            fragment GitRefConnectionFields on GitRefConnection {
                nodes {
                    __typename
                    ...GitRefFields
                }
            }

            fragment GitRefFields on GitRef {
                displayName
                name
                url
                type
            }
        `,
        parameters,
        token
    )

    const result = response?.data?.node?.gitRefs?.nodes || []
    if (ancestorSuffix) {
        for (const reference of result) {
            reference.displayName = reference.displayName + ancestorSuffix
            reference.name = reference.name + ancestorSuffix
            reference.url = reference.url + ancestorSuffix
        }
    }
    return result
}

interface GitReferencesParameters {
    repositoryId: string
    query: string
}
interface GitReferencesResult {
    data?: {
        node?: {
            gitRefs?: {
                nodes?: GitReference[]
            }
        }
    }
}
