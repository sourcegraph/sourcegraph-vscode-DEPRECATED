import assert from 'assert'
import { GitHelpers } from './helpers'
import { gitRemoteNameAndBranch } from './remoteNameAndBranch'

describe('git', () => {
    function createMockGitHelpers(
        remotes: string[],
        branch: string,
        upstreamAndBranch: string
    ): Pick<GitHelpers, 'branch' | 'remotes' | 'upstreamAndBranch'> {
        return {
            remotes: () => Promise.resolve(remotes),
            branch: () => Promise.resolve(branch),
            upstreamAndBranch: () => {
                if (!upstreamAndBranch) {
                    throw new Error(`fatal: no upstream configured for branch ${branch}`)
                }

                return Promise.resolve(upstreamAndBranch)
            },
        }
    }

    describe('gitRemoteNameAndBranch()', () => {
        it('handles simple upstream and branch names', async () => {
            const { remoteName, branch } = await gitRemoteNameAndBranch(
                '',
                createMockGitHelpers(['origin'], 'feature', 'origin/feature')
            )

            assert.strictEqual(remoteName, 'origin', 'incorrect remote name')
            assert.strictEqual(branch, 'feature', 'incorrect branch name')
        })

        it('handles branch names with slashes', async () => {
            const { remoteName, branch } = await gitRemoteNameAndBranch(
                '',
                createMockGitHelpers(['origin'], 'author/feature', 'origin/author/feature')
            )

            assert.strictEqual(remoteName, 'origin', 'incorrect remote name')
            assert.strictEqual(branch, 'author/feature', 'incorrect branch name')
        })

        it('handles remote and branch names with slashes', async () => {
            const { remoteName, branch } = await gitRemoteNameAndBranch(
                '',
                createMockGitHelpers(['remote/one', 'remote/two'], 'feature', 'remote/two/feature')
            )

            assert.strictEqual(remoteName, 'remote/two', 'incorrect remote name')
            assert.strictEqual(branch, 'feature', 'incorrect branch name')
        })

        it('falls back to first remote when no upstream is configured', async () => {
            const { remoteName, branch } = await gitRemoteNameAndBranch(
                '',
                createMockGitHelpers(['remote-one', 'remote-two', 'remote-three'], 'feature', '')
            )

            assert.strictEqual(remoteName, 'remote-one', 'incorrect remote name')
            assert.strictEqual(branch, 'feature', 'incorrect branch name')
        })

        it('falls back to first remote and branch when branch is not pushed to upstream', async () => {
            const { remoteName, branch } = await gitRemoteNameAndBranch(
                '',
                createMockGitHelpers(['origin'], 'feature', 'origin/master')
            )

            assert.strictEqual(remoteName, 'origin', 'incorrect remote name')
            assert.strictEqual(branch, 'master', 'incorrect branch name')
        })
    })
})
