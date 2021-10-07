import * as vscode from 'vscode'
import { graphqlQuery } from './graphqlQuery'
import { TextEncoder } from 'util'
import gql from 'tagged-template-noop'

export interface FileContents {
    content: Uint8Array
    isBinary: boolean
    byteSize: number
}

export async function contentQuery(
    parameters: ContentParameters,
    token: vscode.CancellationToken
): Promise<FileContents | undefined> {
    const contentResult = await graphqlQuery<ContentParameters, ContentResult>(
        gql`
            query Content($repository: String!, $revision: String!, $path: String!) {
                repository(name: $repository) {
                    commit(rev: $revision) {
                        blob(path: $path) {
                            content
                            binary
                            byteSize
                        }
                    }
                }
            }
        `,
        parameters,
        token
    )
    const content = contentResult?.data?.repository?.commit?.blob?.content
    const isBinary = contentResult?.data?.repository?.commit?.blob?.binary
    const byteSize = contentResult?.data?.repository?.commit?.blob?.byteSize
    if (typeof content === 'string' && typeof isBinary === 'boolean' && typeof byteSize === 'number') {
        return { content: new TextEncoder().encode(content), isBinary, byteSize }
    }
    return undefined
}

interface ContentParameters {
    repository: string
    revision: string
    path: string
}

interface ContentResult {
    data?: {
        repository?: {
            commit?: {
                blob?: {
                    content?: string
                    binary?: boolean
                    byteSize?: number
                }
            }
        }
    }
}
