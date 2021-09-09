import * as vscode from 'vscode'
import { graphqlQuery } from './graphqlQuery'
import gql from 'tagged-template-noop'

export async function resolveRevisionQuery(
    parameters: ResolveRevisionParameters,
    token: vscode.CancellationToken
): Promise<string | undefined> {
    const result = await graphqlQuery<ResolveRevisionParameters, ResolveRevisionResponse>(
        gql`
            query ResolveRevision($repositoryName: String!, $revision: String!) {
                repository(name: $repositoryName) {
                    commit(rev: $revision) {
                        oid
                    }
                }
            }
        `,
        parameters,
        token
    )
    return result?.data?.repository?.commit?.oid
}

export interface ResolveRevisionParameters {
    repositoryName: string
    revision: string
}

interface ResolveRevisionResponse {
    data?: {
        repository?: {
            commit?: {
                oid?: string
            }
        }
    }
}
