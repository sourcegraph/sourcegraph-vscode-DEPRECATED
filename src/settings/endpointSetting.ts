import * as vscode from 'vscode'
import { GraphQLSchema, graphqlSchemaQuery } from '../queries/graphqlSchemaQuery'
import { readConfiguration } from './readConfiguration'

let cachedSchema: Promise<GraphQLSchema> | undefined

export function activateEndpointSetting(): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(config => {
        if (config.affectsConfiguration('sourcegraph.url')) {
            cachedSchema = undefined
        }
    })
}

export function endpointSetting(): string {
    // has default value
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const url = readConfiguration().get<string>('url')!
    if (url.endsWith('/')) {
        return url.slice(0, -1)
    }
    return url
}

export function endpointHostnameSetting(): string {
    return new URL(endpointSetting()).hostname
}

export function endpointPortSetting(): number {
    const port = new URL(endpointSetting()).port
    return port ? parseInt(port, 10) : 443
}

export function endpointGraphQLSchema(): Promise<GraphQLSchema> {
    if (!cachedSchema) {
        cachedSchema = graphqlSchemaQuery()
    }
    return cachedSchema
}
