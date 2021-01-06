import execa from 'execa'
import * as path from 'path'
import { log } from './log'
import { getRemoteUrlReplacements } from './config'

/**
 * Returns the repository root directory for any directory within the
 * repository.
 */
async function gitRootDirectory(repoDirectory: string): Promise<string> {
    const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd: repoDirectory })
    return stdout
}

/**
 * Returns the names of all git remotes, e.g. ["origin", "foobar"]
 */
async function gitRemotes(repoDirectory: string): Promise<string[]> {
    const { stdout } = await execa('git', ['remote'], { cwd: repoDirectory })
    return stdout.split('\n')
}

/**
 * Returns the remote URL for the given remote name.
 * e.g. `origin` -> `git@github.com:foo/bar`
 */
async function gitRemoteURL(repoDirectory: string, { remoteName }: RemoteName): Promise<string> {
    let { stdout } = await execa('git', ['remote', 'get-url', remoteName], { cwd: repoDirectory })
    const replacementsList = getRemoteUrlReplacements()

    for (const replacement in replacementsList) {
        if (typeof replacement === 'string') {
            stdout = stdout.replace(replacement, replacementsList[replacement])
        }
    }

    return stdout
}

interface RemoteName {
    /**
     * Remote name of the upstream repository,
     * or the first remote name if no upstream is found
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
 */
async function gitRemoteNameAndBranch(repoDirectory: string): Promise<RemoteName & Branch> {
    let remoteName = ''
    let branch = 'HEAD'

    const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD@{upstream}'], { cwd: repoDirectory })
    const remoteAndBranch = stdout.split('/')

    if (remoteAndBranch.length === 1) {
        // The upstream branch points to a local branch.
        ;[remoteName] = remoteAndBranch
    }
    if (remoteAndBranch.length === 2) {
        ;[remoteName, branch] = remoteAndBranch
    }

    // If we cannot find the remote name deterministically, we use the first
    // Git remote found.
    if (!remoteName) {
        const remotes = await gitRemotes(repoDirectory)
        if (remotes.length === 0) {
            throw new Error('no configured git remotes')
        }
        if (remotes.length > 1) {
            log.appendLine(`using first git remote: ${remotes[0]}`)
            remoteName = remotes[0]
        }
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
 * relative to the repository root. Empty strings are returned if this cannot be
 * determined.
 */
export async function repoInfo(filePath: string): Promise<RepositoryInfo> {
    let remoteURL = ''
    let branch = ''
    let fileRelative = ''
    try {
        // Determine repository root directory.
        const fileDirectory = path.dirname(filePath)
        const repoRoot = await gitRootDirectory(fileDirectory)

        // Determine file path relative to repository root.
        fileRelative = filePath.slice(repoRoot.length + 1)

        const remoteNameAndBranch = await gitRemoteNameAndBranch(repoRoot)
        branch = remoteNameAndBranch.branch
        remoteURL = await gitRemoteURL(repoRoot, remoteNameAndBranch)

        if (process.platform === 'win32') {
            fileRelative = fileRelative.replace(/\\/g, '/')
        }
    } catch (error) {
        log.appendLine(`repoInfo(${filePath}): ${error as string}`)
    }
    log.appendLine(`repoInfo(${filePath}): remoteURL="${remoteURL}" branch="${branch}" fileRel="${fileRelative}"`)
    return { remoteURL, branch, fileRelative }
}

