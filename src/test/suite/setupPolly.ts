import { Polly, setupMocha } from '@pollyjs/core'
import NodeHTTPAdapter from '@pollyjs/adapter-node-http'
import FSPersister from '@pollyjs/persister-fs'
import mocha from 'mocha'

export function setupPolly(): void {
    Polly.register(NodeHTTPAdapter)
    Polly.register(FSPersister)
    setupMocha(
        {
            adapters: ['node-http'],
            persister: 'fs',
            // logging: true,
            recordIfMissing: true,
        },
        mocha
    )
}
