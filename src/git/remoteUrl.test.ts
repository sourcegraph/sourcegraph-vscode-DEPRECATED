import assert from 'assert'
import { gitRemoteUrlWithReplacements } from './remoteUrl'

describe('remoteUrl', () => {
    it('returns the remote URL given a remote name', async () => {
        const remoteUrl = await gitRemoteUrlWithReplacements('', 'origin', () => ({}), {
            remoteUrl: () => Promise.resolve('git@github.com:sourcegraph/sourcegraph-vscode.git'),
        })

        assert.strictEqual(remoteUrl, 'git@github.com:sourcegraph/sourcegraph-vscode.git', 'incorrect remote URL')
    })

    it('replaces values in URL', async () => {
        const remoteUrl = await gitRemoteUrlWithReplacements('', 'origin', () => ({ github: 'gitlab' }), {
            remoteUrl: () => Promise.resolve('git@github.com:sourcegraph/sourcegraph-vscode.git'),
        })

        assert.strictEqual(remoteUrl, 'git@gitlab.com:sourcegraph/sourcegraph-vscode.git', 'incorrect remote URL')
    })
})
