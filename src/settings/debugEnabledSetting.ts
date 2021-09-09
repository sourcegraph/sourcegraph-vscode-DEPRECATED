import { readConfiguration } from './readConfiguration'

export function debugEnabledSetting(): boolean {
    return readConfiguration().get<boolean>('debug', false)
}
