import { repositoriesQuery } from '../queries/repositoriesQuery'

import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import { SourcegraphUri } from '../file-system/SourcegraphUri'
import { openSourcegraphUriCommand } from './openSourcegraphUriCommand'
import { BrowseQuickPickItem, SourcegraphQuickPick } from './SourcegraphQuickPick'
import { recentlyOpenRepositoriesSetting } from '../settings/recentlyOpenRepositoriesSetting'
import { endpointSetting } from '../settings/endpointSetting'
import { log } from '../log'

export async function goToRepositoryCommand(fs: SourcegraphFileSystemProvider): Promise<void> {
    const quick = new SourcegraphQuickPick(fs)
    quick.pick.title = 'Type in a repository or paste a Sourcegraph URL'
    quick.pick.matchOnDescription = true
    quick.pick.matchOnDetail = true
    const recentlyOpenRepositories = recentlyOpenRepositoriesSetting.load()
    quick.pick.items = recentlyOpenRepositories
    const sourcegraphEndpoint = endpointSetting()
    quick.onDidChangeValue(async query => {
        if (query.text === '') {
            quick.pick.items = recentlyOpenRepositories
            return
        }
        if (query.text.startsWith(sourcegraphEndpoint)) {
            try {
                const uri = SourcegraphUri.parse(query.text)
                const item: BrowseQuickPickItem = {
                    uri: uri.uri,
                    label: recentlyOpenRepositoriesSetting.label(uri.repositoryName),
                    description: uri.path,
                    detail: query.text,
                }
                quick.pick.items = [item]
            } catch (error) {
                log.error(`goToRepositoryCommand(${query.text})`, error)
            }
            return
        }
        quick.pick.busy = true
        const repos = await repositoriesQuery(query.text, query.token)
        if (!query.token.isCancellationRequested) {
            const queryItems: BrowseQuickPickItem[] = repos.map(repo => ({
                label: recentlyOpenRepositoriesSetting.label(repo),
                uri: '',
                unresolvedRepositoryName: repo,
            }))
            quick.pick.items = [...queryItems, ...recentlyOpenRepositories]
            quick.pick.busy = false
        }
    })
    const uri = await quick.showQuickPickAndGetUserInput()
    await recentlyOpenRepositoriesSetting.update({ label: uri.repositoryName, uri: uri.uri })
    await openSourcegraphUriCommand(fs, uri)
}
