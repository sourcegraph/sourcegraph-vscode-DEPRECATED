import execa from 'execa'
import * as path from 'path'
import { log } from './log'
import { getRemoteUrlReplacements } from './config'

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
async function gitRemoteURL(repoDirectory: string, remoteName: string): Promise<string> {
    let { stdout } = await execa('git', ['remote', 'get-url', remoteName], { cwd: repoDirectory })
    const replacementsList = getRemoteUrlReplacements()

    for (const replacement in replacementsList) {
        if (typeof replacement === 'string') {
            stdout = stdout.replace(replacement, replacementsList[replacement])
        }
    }

    return stdout
}

/**
 * Returns the remote URL of the first Git remote found.
 */
async function gitDefaultRemoteURL(repoDirectory: string): Promise<string> {
    const remotes = await gitRemotes(repoDirectory)
    if (remotes.length === 0) {
        throw new Error('no configured git remotes')
    }
    if (remotes.length > 1) {
        log.appendLine(`using first git remote: ${remotes[0]}`)
    }
    return gitRemoteURL(repoDirectory, remotes[0])
}

/**
 * Returns the repository root directory for any directory within the
 * repository.
 */
async function gitRootDirectory(repoDirectory: string): Promise<string> {
    const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd: repoDirectory })
    return stdout
}

/**
 * Returns either the current branch name of the repository OR in all
 * other cases (e.g. detached HEAD state), it returns "HEAD".
 */
async function gitBranch(repoDirectory: string): Promise<string> {
    const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDirectory })
    return stdout
}

/**
 * Returns the Git repository remote URL, the current branch, and the file path
 * relative to the repository root. Empty strings are returned if this cannot be
 * determined.
 */
export async function repoInfo(filePath: string): Promise<[string, string, string]> {
    let remoteURL = ''
    let branch = ''
    let fileRelative = ''
    try {
        // Determine repository root directory.
        const fileDirectory = path.dirname(filePath)
        const repoRoot = await gitRootDirectory(fileDirectory)

        // Determine file path, relative to repository root.
        fileRelative = filePath.slice(repoRoot.length + 1)
        remoteURL = await gitDefaultRemoteURL(repoRoot)
        branch = await gitBranch(repoRoot)
        if (process.platform === 'win32') {
            fileRelative = fileRelative.replace(/\\/g, '/')
        }
    } catch (error) {
        log.appendLine(`repoInfo(${filePath}): ${error as string}`)
    }
    log.appendLine(`repoInfo(${filePath}): remoteURL="${remoteURL}" branch="${branch}" fileRel="${fileRelative}"`)
    return [remoteURL, branch, fileRelative]
}
