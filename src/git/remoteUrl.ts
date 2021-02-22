import { GitHelpers } from './helpers'

/**
 * Returns the remote URL for the given remote name with remote URL replacements.
 * e.g. `origin` -> `git@github.com:foo/bar`
 */
export async function gitRemoteUrlWithReplacements(
    repoDirectory: string,
    remoteName: string,
    getRemoteUrlReplacements: () => Record<string, string>,
    gitHelpers: Pick<GitHelpers, 'remoteUrl'>,
    log?: { appendLine: (value: string) => void }
): Promise<string> {
    let stdout = await gitHelpers.remoteUrl(remoteName, repoDirectory)
    const replacementsList = getRemoteUrlReplacements()

    const stdoutBefore = stdout

    for (const replacement in replacementsList) {
        if (typeof replacement === 'string') {
            stdout = stdout.replace(replacement, replacementsList[replacement])
        }
    }
    log?.appendLine(`${stdoutBefore} became ${stdout}`)
    return stdout
}
