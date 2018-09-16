import { default as fetch, Headers, RequestInit } from 'node-fetch'
import { getAccessToken, getSourcegraphUrl } from './config'

export async function queryGraphQL(
    graphQLDocument: string,
    variables: { [name: string]: any }
): Promise<any> {
    return requestGraphQL(graphQLDocument, variables) as Promise<any>
}

async function requestGraphQL(
    graphQLDocument: string,
    variables: { [name: string]: any }
): Promise<SourcegraphGQL.IQuery | SourcegraphGQL.IMutation> {
    const headers = new Headers()
    headers.append('User-Agent', 'Sourcegraph for Visual Studio Code')

    const accessToken = getAccessToken()
    if (accessToken) {
        headers.append('Authorization', `token ${accessToken}`)
    }

    const nameMatch = graphQLDocument.match(/^\s*(?:query|mutation)\s+(\w+)/)
    const graphqlUrl = getSourcegraphUrl() + '/.api/graphql' + (nameMatch ? '?' + nameMatch[1] : '')
    const init: RequestInit = {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: graphQLDocument, variables }),
    }
    const resp = await fetch(graphqlUrl, init)

    const contentType = resp.headers.get('Content-Type') || ''
    if (!contentType.includes('json')) {
        const responseText = await resp.text()
        throw Object.assign(new Error(`Sourcegraph API Error ${resp.status} ${resp.statusText}: ${responseText}`), {
            responseText,
        })
    }
    return await resp.json()
}
