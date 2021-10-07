import { DiffsTreeDataProvider } from '../file-system/DiffsTreeDataProvider'
import { log } from '../log'
import { endpointHostnameSetting } from '../settings/endpointSetting'
import { pickGitReference } from './switchGitRevisionCommand'

export async function updateCompareRange(diffs: DiffsTreeDataProvider, commandArguments: any[]): Promise<void> {
    const repositoryName: string = commandArguments[0]
    if (typeof repositoryName !== 'string') {
        return log.errorAndThrow(
            `updateCompareRange(${JSON.stringify(commandArguments)})`,
            'first argument is not a string'
        )
    }
    const kind: 'base' | 'head' = commandArguments[1]
    if (kind !== 'base' && kind !== 'head') {
        log.errorAndThrow(
            `updateCompareRange(${JSON.stringify(commandArguments)})`,
            "second argument is not 'base' or 'head'"
        )
    }
    const uri = await pickGitReference(
        diffs.fs,
        repositoryName,
        reference => `sourcegraph://${endpointHostnameSetting()}${reference.url}`
    )
    diffs.updateCompareRangePart(repositoryName, kind, uri.revision)
}
