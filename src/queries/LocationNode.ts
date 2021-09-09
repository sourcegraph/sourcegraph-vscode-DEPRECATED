import { Range } from './Range'

export interface LocationNode {
    resource: {
        path: string
        repository: {
            name: string
        }
        commit: {
            oid: string
        }
    }
    range: Range
}
