import * as vscode from 'vscode'
import { BrowseQuickPickItem } from '../commands/SourcegraphQuickPick'
import { SourcegraphUri } from '../file-system/SourcegraphUri'
import { readConfiguration } from './readConfiguration'

const settingKey = 'recentlyOpenFiles'

export const recentlyOpenFilesSetting = {
    load: loadRecentlyVisitedFilesSetting,
    update: updateRecentlyVisitedFilesSetting,
}

async function updateRecentlyVisitedFilesSetting(newValue: string): Promise<void> {
    const config = readConfiguration()
    const oldValues = config.get<string[]>(settingKey, [])
    if (!oldValues.includes(newValue)) {
        return config.update(settingKey, [newValue, ...oldValues].slice(0, 10))
    }
}

function loadRecentlyVisitedFilesSetting(): BrowseQuickPickItem[] {
    const config = readConfiguration()
    const settingValues = config.get<string[]>(settingKey, [])
    const result: BrowseQuickPickItem[] = []
    const validSettingValues: string[] = []
    for (const value of settingValues) {
        const item = parseRecentlyVisitedFile(value)
        if (item) {
            validSettingValues.push(value)
            result.push(item)
        }
    }
    if (validSettingValues.length !== settingValues.length) {
        config.update(settingKey, validSettingValues, vscode.ConfigurationTarget.Global).then(
            () => {},
            () => {}
        )
    }
    return result
}

/**
 * @param settingValue the value from the user settings, which may be invalid because users can manually update settings.
 * @returns undefined when the setting value is invalid.
 */
function parseRecentlyVisitedFile(settingValue: string): BrowseQuickPickItem | undefined {
    try {
        const uri = SourcegraphUri.parse(settingValue)
        if (uri.path) {
            return {
                uri: uri.uri,
                label: uri.path,
                description: uri.repositoryName,
                detail: 'Recently open',
                unresolvedRepositoryName: uri.repositoryName,
            }
        }
        // eslint-disable-next-line no-empty
    } catch {}
    return undefined
}
