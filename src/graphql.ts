'use strict'

import { default as fetch, Headers, RequestInit } from 'node-fetch'
import { getAccessToken, getSourcegraphUrl } from './config'

export const graphQLContent = Symbol('graphQLContent')
export interface GraphQLDocument {
    [graphQLContent]: string
}

/**
 * Use this template string tag for all GraphQL queries
 */
export const gql = (template: TemplateStringsArray, ...substitutions: any[]): GraphQLDocument => ({
    [graphQLContent]: String.raw(template, ...substitutions.map(s => s[graphQLContent] || s)),
})

export async function queryGraphQL(
    graphQLDocument: GraphQLDocument,
    variables: { [name: string]: any }
): Promise<SourcegraphGQL.IQuery> {
    return requestGraphQL(graphQLDocument, variables) as Promise<SourcegraphGQL.IQuery>
}

export async function mutateGraphQL(
    graphQLDocument: GraphQLDocument,
    variables: { [name: string]: any }
): Promise<SourcegraphGQL.IMutation> {
    return requestGraphQL(graphQLDocument, variables) as Promise<SourcegraphGQL.IMutation>
}

async function requestGraphQL(
    graphQLDocument: GraphQLDocument,
    variables: { [name: string]: any }
): Promise<SourcegraphGQL.IQuery | SourcegraphGQL.IMutation> {
    const headers = new Headers()
    headers.append('User-Agent', 'Sourcegraph for Visual Studio Code')

    const accessToken = getAccessToken()
    if (accessToken) {
        headers.append('Authorization', `token ${accessToken}`)
    }

    const query = graphQLDocument[graphQLContent]
    const nameMatch = query.match(/^\s*(?:query|mutation)\s+(\w+)/)
    const graphqlUrl = getSourcegraphUrl() + '/.api/graphql' + (nameMatch ? '?' + nameMatch[1] : '')
    const init: RequestInit = {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
    }
    const resp = await fetch(graphqlUrl, init)

    const contentType = resp.headers.get('Content-Type') || ''
    if (!contentType.includes('json')) {
        const responseText = await resp.text()
        throw Object.assign(new Error(`Sourcegraph API Error ${resp.status} ${resp.statusText}: ${responseText}`), {
            responseText,
        })
    }

    const response = await resp.json()
    if (response.errors && response.errors.length > 0) {
        const multierror = response.errors.map((e: any) => e.message).join('\n')
        throw Object.assign(new Error(`Sourcegraph API Error ${resp.status} ${resp.statusText}: ${multierror}`), {
            response,
        })
    }
    return response.data
}
