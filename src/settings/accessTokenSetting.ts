import open from 'open'
import * as vscode from 'vscode'
import { log } from '../log'
import { currentUserQuery } from '../queries/currentUserQuery'
import { endpointSetting } from './endpointSetting'
import { readConfiguration } from './readConfiguration'

let cachedAccessToken: Promise<string | undefined> | undefined
const invalidAccessTokens = new Set<string>()

export function accessTokenSetting(): string | undefined {
    const fromSettings = readConfiguration().get<string>('accessToken')
    if (fromSettings) {
        return fromSettings
    }

    const environmentVariable = process.env.SRC_ACCESS_TOKEN
    if (environmentVariable && !invalidAccessTokens.has(environmentVariable)) {
        return environmentVariable
    }

    return undefined
}

export async function deleteAccessTokenSetting(tokenValueToDelete: string): Promise<void> {
    invalidAccessTokens.add(tokenValueToDelete)
    const currentValue = readConfiguration().get<string>('accessToken')
    if (currentValue === tokenValueToDelete) {
        cachedAccessToken = undefined
        await readConfiguration().update('accessToken', undefined, vscode.ConfigurationTarget.Global)
    } else {
        log.appendLine(
            `can't delete access token '${tokenValueToDelete}' because it doesn't match ` +
                `existing configuration value '${currentValue || 'undefined'}'`
        )
    }
}

export function promptUserForAccessTokenSetting(title: string, detail: string): Promise<string | undefined> {
    if (!cachedAccessToken) {
        cachedAccessToken = unconditionallyPromptUserForAccessTokenSetting(title, detail)
        cachedAccessToken.then(
            token => {
                log.appendLine(`new access token from user: ${token || 'undefined'}`)
            },
            error => {
                log.error('promptUserForAccessTokenSetting', error)
                cachedAccessToken = undefined
            }
        )
    }
    return cachedAccessToken
}

async function unconditionallyPromptUserForAccessTokenSetting(
    title: string,
    detail: string
): Promise<string | undefined> {
    const openBrowserMessage = 'Open browser to create an access token'
    const logout = 'Continue without an access token'
    const userChoice = await vscode.window.showErrorMessage(title, { modal: true, detail }, openBrowserMessage, logout)

    if (userChoice === openBrowserMessage) {
        await open(`${endpointSetting()}/user/settings/tokens`)
        const newToken = await vscode.window.showInputBox({
            title: 'Paste your Sourcegraph access token here',
            ignoreFocusOut: true,
        })
        if (newToken) {
            try {
                const currentUser = await currentUserQuery(newToken)
                await readConfiguration().update('accessToken', newToken, vscode.ConfigurationTarget.Global)
                const successMessage = `Successfully logged into Sourcegraph as user '${currentUser}'`
                log.appendLine(successMessage)
                await vscode.window.showInformationMessage(successMessage)
                cachedAccessToken = undefined
                return newToken
            } catch {
                await vscode.window.showErrorMessage(
                    "Invalid Access Token. To fix this problem, update the 'sourcegraph.accessToken' setting and try again"
                )
            }
        } else {
            log.error('askUserToCreateAccessToken - The user provided an empty access token')
        }
    } else {
        log.error('askUserToCreateAccessToken - The user decided not to open the browser')
    }

    return undefined
}

export async function updateAccessTokenSetting(newValue?: string): Promise<void> {
    await readConfiguration().update('accessToken', newValue)
}
