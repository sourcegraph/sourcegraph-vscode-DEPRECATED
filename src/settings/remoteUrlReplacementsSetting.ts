import { readConfiguration } from './readConfiguration'

export function remoteUrlReplacementsSetting(): Record<string, string> {
    // has default value
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const replacements = readConfiguration().get<Record<string, string>>('remoteUrlReplacements')!
    return replacements
}
