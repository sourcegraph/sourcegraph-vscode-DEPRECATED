import { request, RequestOptions } from 'https'
import { CancellationToken } from 'vscode'
import { log } from '../log'
import { debugEnabledSetting } from '../settings/debugEnabledSetting'
import { endpointHostnameSetting, endpointSetting } from '../settings/endpointSetting'
import {
    accessTokenSetting,
    deleteAccessTokenSetting,
    promptUserForAccessTokenSetting,
} from '../settings/accessTokenSetting'
import { version } from '../extension'

export function graphqlQuery<A, B>(query: string, variables: A, token: CancellationToken): Promise<B | undefined> {
    return graphqlQueryWithAccessToken(query, variables, token, accessTokenSetting())
}

export function graphqlQueryWithAccessToken<A, B>(
    query: string,
    variables: A,
    token: CancellationToken,
    accessToken?: string
): Promise<B | undefined> {
    if (accessToken) {
        accessToken = accessToken.trim()
    }
    return new Promise<B | undefined>((resolve, reject) => {
        const data = JSON.stringify({
            query,
            variables,
        })
        const headers: any = {
            'Content-Length': data.length,
            'User-Agent': `VS Code/${version}`,
        }
        if (accessToken) {
            headers.Authorization = `token ${accessToken}`
        }
        const options: RequestOptions = {
            hostname: endpointHostnameSetting(),
            port: 443,
            path: '/.api/graphql',
            method: 'POST',
            headers,
        }
        const curlCommand = (): string => {
            const data: string = JSON.stringify({ query: query.replace(/\s+/g, '  '), variables })
            const authorization = accessToken ? `-H 'Authorization: token ${accessToken}' ` : ''
            return `curl ${authorization}-d '${data}' ${endpointSetting()}/.api/graphql`
        }
        const onReject = async (error: any) => {
            if (error === 'Invalid access token.\n') {
                // Prompt the user to update the access token setting and try again with the new setting.
                try {
                    if (accessToken) {
                        await deleteAccessTokenSetting(accessToken)
                    }
                    const toFixThisProblem =
                        process.env.SRC_ACCESS_TOKEN === accessToken
                            ? '. To fix this problem, remove the environment variables SRC_ACCESS_TOKEN and reload VS Code.'
                            : ''
                    const newAccessToken = await promptUserForAccessTokenSetting(
                        'Invalid Sourcegraph Access Token',
                        `The server at ${endpointHostnameSetting()} is unable to use the access token ${accessToken}.` +
                            toFixThisProblem
                    )
                    log.appendLine(`re-trying GraphQL query with new access token '${newAccessToken}'`)
                    const newResult = await graphqlQueryWithAccessToken<A, B>(query, variables, token, newAccessToken)
                    resolve(newResult)
                } catch (newError) {
                    log.error('failed to get valid access token', error)
                    reject(newError)
                }
            } else {
                reject(error)
            }
        }
        const req = request(options, res => {
            const body: Uint8Array[] = []
            res.on('data', json => {
                body.push(json)
            })
            res.on('error', onReject)
            const onClose = () => {
                const json = Buffer.concat(body).toString()
                if (res.statusCode === 200) {
                    try {
                        const parsed = JSON.parse(json)
                        const errors = parsed['errors']
                        if (errors) {
                            reject(JSON.stringify(errors))
                        }
                        resolve(parsed)
                    } catch (error) {
                        log.error(`graphql(${curlCommand()})`, error)
                        onReject(error)
                    }
                } else {
                    log.error(`graphql(${curlCommand()}), statusCode=${res.statusCode}`, json)
                    onReject(json)
                }
            }
            res.on('close', onClose)
            res.on('end', onClose)
        })
        req.on('error', onReject)
        req.write(data)
        req.end()
        if (debugEnabledSetting()) {
            log.appendLine(curlCommand())
        }
        token.onCancellationRequested(() => {
            req.destroy()
        })
    })
}
