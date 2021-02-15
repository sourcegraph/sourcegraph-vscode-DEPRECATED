import execa from 'execa'
import * as path from 'path'
import { log } from '../log'
import { getRemoteUrlReplacements } from '../config'
import { gitHelpers, GitHelpers } from './helpers'

/**
 * Returns the remote URL for the given remote name.
 * e.g. `origin` -> `git@github.com:foo/bar`
 */
async function gitRemoteURL(repoDirectory: string, remoteName: string): Promise<string> {
    let { stdout } = await execa('git', ['remote', 'get-url', remoteName], { cwd: repoDirectory })
    const replacementsList = getRemoteUrlReplacements()

    const stdoutBefore = stdout

    for (const replacement in replacementsList) {
        if (typeof replacement === 'string') {
            stdout = stdout.replace(replacement, replacementsList[replacement])
        }
    }
    log.appendLine(`${stdoutBefore} became ${stdout}`)
    return stdout
}

interface RemoteName {
    /**
     * Remote name of the upstream repository,
     * or the first found remote name if no upstream is found
     */
    remoteName: string
}

interface Branch {
    /**
     * Remote branch name, or 'HEAD' if it isn't found because
     * e.g. detached HEAD state, upstream branch points to a local branch
     */
    branch: string
}

/**
 * Returns the remote name and branch
 *
 * @param repoDirectory the repository root directory
 * @param git gitHelpers object
 *
 */
async function gitRemoteNameAndBranch(
    repoDirectory: string,
    git: Pick<GitHelpers, 'branch' | 'remotes' | 'upstreamAndBranch'>
): Promise<RemoteName & Branch> {
    let remoteName: string | undefined
    let branch = 'HEAD'

    // Used to determine which part of upstreamAndBranch is the remote name, or as fallback if no upstream is set
    const remotes = await git.remotes(repoDirectory)

    try {
        const upstreamAndBranch = await git.upstreamAndBranch(repoDirectory)

        // Longest prefix match out of remotes to determine where to split $UPSTREAM_REMOTE/$BRANCH_NAME.
        // We can't just split on the delineating `/`, since refnames can include `/`:
        // https://sourcegraph.com/github.com/git/git@454cb6bd52a4de614a3633e4f547af03d5c3b640/-/blob/refs.c#L52-67

        // Example:
        // remotes: ['remote', 'remote/two', 'otherremote']
        // stdout: remote/two/tj/feature
        // remoteName: remote/two, branch: tj/feature

        let indexOfBranch = 0
        for (const remote of remotes) {
            if (upstreamAndBranch.startsWith(remote)) {
                indexOfBranch = Math.max(remote.length + 1, indexOfBranch)
            }
        }

        const maybeRemote = upstreamAndBranch.slice(0, indexOfBranch - 1)
        const maybeBranch = upstreamAndBranch.slice(indexOfBranch)
        if (maybeRemote && maybeBranch) {
            remoteName = maybeRemote
            branch = maybeBranch
        }
    } catch {
        // noop. upstream may not be set
    }

    // If we cannot find the remote name deterministically, we use the first
    // Git remote found.
    if (!remoteName) {
        if (remotes.length > 1) {
            log.appendLine(`no upstream found, using first git remote: ${remotes[0]}`)
        }
        remoteName = remotes[0]
        branch = await git.branch(repoDirectory)
    }

    // Throw if a remote still isn't found
    if (!remoteName) {
        throw new Error('no configured git remotes')
    }

    return { remoteName, branch }
}

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

        const remoteNameAndBranch = await gitRemoteNameAndBranch(repoRoot, gitHelpers)
        const { branch, remoteName } = remoteNameAndBranch
        const remoteURL = await gitRemoteURL(repoRoot, remoteName)

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
