import { readConfiguration } from './readConfiguration'

export function defaultBranchSetting(): string {
    // has default value
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const branch = readConfiguration().get<string>('defaultBranch')!

    return branch
}
