import * as path from 'path'
import { log } from '../log'
import { defaultBranchSetting } from '../settings/defaultBranchSetting'
import { remoteUrlReplacementsSetting } from '../settings/remoteUrlReplacementsSetting'
import { gitHelpers } from './helpers'
import { Branch, gitRemoteNameAndBranch } from './remoteNameAndBranch'
import { gitRemoteUrlWithReplacements } from './remoteUrl'

interface RepositoryInfo extends Branch {
    /** Git repository remote URL */
    remoteURL: string

    /** File path relative to the repository root */
    fileRelative: string
}

/**
 * Returns the Git repository remote URL, the current branch, and the file path
 * relative to the repository root. Returns undefined if no remote is found
 */
export async function repoInfo(filePath: string): Promise<RepositoryInfo | undefined> {
    try {
        // Determine repository root directory.
        const fileDirectory = path.dirname(filePath)
        const repoRoot = await gitHelpers.rootDirectory(fileDirectory)

        // Determine file path relative to repository root.
        let fileRelative = filePath.slice(repoRoot.length + 1)

        let { branch, remoteName } = await gitRemoteNameAndBranch(repoRoot, gitHelpers, log)
        const remoteURL = await gitRemoteUrlWithReplacements(
            repoRoot,
            remoteName,
            remoteUrlReplacementsSetting,
            gitHelpers,
            log
        )
        branch = defaultBranchSetting() || branch

        if (process.platform === 'win32') {
            fileRelative = fileRelative.replace(/\\/g, '/')
        }
        log.appendLine(`repoInfo(${filePath}): remoteURL="${remoteURL}" branch="${branch}" fileRel="${fileRelative}"`)
        return { remoteURL, branch, fileRelative }
    } catch (error) {
        log.appendLine(`repoInfo(${filePath}): ${error as string}`)
        return undefined
    }
}
