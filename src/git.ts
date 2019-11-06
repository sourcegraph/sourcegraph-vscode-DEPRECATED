import execa from 'execa'
import * as path from 'path'
import { log } from './log'
import { getRemoteUrlReplacements } from './config'

/**
 * Returns the names of all git remotes, e.g. ["origin", "foobar"]
 */
async function gitRemotes(repoDir: string): Promise<string[]> {
    const { stdout } = await execa('git', ['remote'], { cwd: repoDir })
    return stdout.split('\n')
}

/**
 * Returns the remote URL for the given remote name.
 * e.g. `origin` -> `git@github.com:foo/bar`
 */
async function gitRemoteURL(repoDir: string, remoteName: string): Promise<string> {
    let { stdout } = await execa('git', ['remote', 'get-url', remoteName], { cwd: repoDir })
    const replacementsList = getRemoteUrlReplacements()

    for (const r in replacementsList) {
        if (typeof r === 'string') {
            stdout = stdout.replace(r, replacementsList[r])
        }
    }

    return stdout
}

/**
 * Returns the remote URL of the first Git remote found.
 */
async function gitDefaultRemoteURL(repoDir: string): Promise<string> {
    const remotes = await gitRemotes(repoDir)
    if (remotes.length === 0) {
        throw new Error('no configured git remotes')
    }
    if (remotes.length > 1) {
        log.appendLine(`using first git remote: ${remotes[0]}`)
    }
    return await gitRemoteURL(repoDir, remotes[0])
}

/**
 * Returns the repository root directory for any directory within the
 * repository.
 */
async function gitRootDir(repoDir: string): Promise<string> {
    const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd: repoDir })
    return stdout
}

/**
 * Returns either the current branch name of the repository OR in all
 * other cases (e.g. detached HEAD state), it returns "HEAD".
 */
async function gitBranch(repoDir: string): Promise<string> {
    const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDir })
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
    let fileRel = ''
    try {
        // Determine repository root directory.
        const fileDir = path.dirname(filePath)
        const repoRoot = await gitRootDir(fileDir)

        // Determine file path, relative to repository root.
        fileRel = filePath.slice(repoRoot.length + 1)
        remoteURL = await gitDefaultRemoteURL(repoRoot)
        branch = await gitBranch(repoRoot)
        if (process.platform === 'win32') {
            fileRel = fileRel.replace(/\\/g, '/')
        }
    } catch (e) {
        log.appendLine(`repoInfo(${filePath}): ${e}`)
    }
    log.appendLine(`repoInfo(${filePath}): remoteURL="${remoteURL}" branch="${branch}" fileRel="${fileRel}"`)
    return [remoteURL, branch, fileRel]
}
