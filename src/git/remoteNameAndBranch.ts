import { GitHelpers } from './helpers'
import { getDefaultBranch } from '../config'

export interface RemoteName {
    /**
     * Remote name of the upstream repository,
     * or the first found remote name if no upstream is found
     */
    remoteName: string
}

export interface Branch {
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
export async function gitRemoteNameAndBranch(
    repoDirectory: string,
    git: Pick<GitHelpers, 'branch' | 'remotes' | 'upstreamAndBranch'>,
    log?: {
        appendLine: (value: string) => void
    }
): Promise<RemoteName & Branch> {
    let remoteName: string | undefined

    // Used to determine which part of upstreamAndBranch is the remote name, or as fallback if no upstream is set
    const remotes = await git.remotes(repoDirectory)
    // Use default branch name
    const branch = getDefaultBranch() ? getDefaultBranch() : await git.branch(repoDirectory);

    try {
        const upstreamAndBranch = await git.upstreamAndBranch(repoDirectory)
        // Subtract $BRANCH_NAME from $UPSTREAM_REMOTE/$BRANCH_NAME.
        // We can't just split on the delineating `/`, since refnames can include `/`:
        // https://sourcegraph.com/github.com/git/git@454cb6bd52a4de614a3633e4f547af03d5c3b640/-/blob/refs.c#L52-67

        // Example:
        // stdout: remote/two/tj/feature
        // remoteName: remote/two, branch: tj/feature

        const branchPosition = upstreamAndBranch.lastIndexOf(branch)
        const maybeRemote = upstreamAndBranch.slice(0, branchPosition - 1)
        if (maybeRemote) {
            remoteName = maybeRemote
        }
    } catch {
        // noop. upstream may not be set
    }

    // If we cannot find the remote name deterministically, we use the first
    // Git remote found.
    if (!remoteName) {
        if (remotes.length > 1) {
            log?.appendLine(`no upstream found, using first git remote: ${remotes[0]}`)
        }
        remoteName = remotes[0]
    }

    // Throw if a remote still isn't found
    if (!remoteName) {
        throw new Error('no configured git remotes')
    }

    return { remoteName, branch }
}
