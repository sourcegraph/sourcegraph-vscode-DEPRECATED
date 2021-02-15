import execa from 'execa'

export const gitHelpers = {
    /**
     * Returns the repository root directory for any directory within the
     * repository.
     */
    async rootDirectory(repoDirectory: string): Promise<string> {
        const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd: repoDirectory })
        return stdout
    },

    /**
     * Returns the names of all git remotes, e.g. ["origin", "foobar"]
     */
    async remotes(repoDirectory: string): Promise<string[]> {
        const { stdout } = await execa('git', ['remote'], { cwd: repoDirectory })
        return stdout.split('\n')
    },

    /**
     * Returns either the current branch name of the repository OR in all
     * other cases (e.g. detached HEAD state), it returns "HEAD".
     */
    async branch(repoDirectory: string): Promise<string> {
        const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDirectory })
        return stdout
    },

    /**
     * Returns a string in the format $UPSTREAM_REMOTE/$BRANCH_NAME, e.g. "origin/branch-name", throws if not found
     */
    async upstreamAndBranch(repoDirectory: string): Promise<string> {
        const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD@{upstream}'], { cwd: repoDirectory })
        return stdout
    },
}

export type GitHelpers = typeof gitHelpers
