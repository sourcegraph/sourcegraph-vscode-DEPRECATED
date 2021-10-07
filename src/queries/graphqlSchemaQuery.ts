import { graphqlQuery } from './graphqlQuery'
import gql from 'tagged-template-noop'
import { emptyCancelationToken } from '../file-system/emptyCancelationToken'
// import { log } from '../log'
// import { endpointHostnameSetting } from '../settings/endpointSetting'

export class GraphQLSchema {
    public readonly blameFilenameField: string
    constructor(private readonly types: Map<string, string[]>) {
        const isBlameFilenameSupported = this.types.get('Hunk')?.includes('filename') || false
        this.blameFilenameField = isBlameFilenameSupported ? 'filename\n' : ''
    }
    public static empty(): GraphQLSchema {
        return new GraphQLSchema(new Map())
    }
}

export async function graphqlSchemaQuery(): Promise<GraphQLSchema> {
    const response = await graphqlQuery<{}, SchemaResponse>(
        gql`
            query {
                __schema {
                    types {
                        name
                        fields {
                            name
                        }
                    }
                }
            }
        `,
        {},
        emptyCancelationToken()
    )
    const result = new Map<string, string[]>()
    for (const type of response?.data?.__schema?.types || []) {
        const fields = type.fields?.map(field => field.name) || []
        result.set(type.name, fields)
    }
    return new GraphQLSchema(result)
}

interface SchemaResponse {
    data?: {
        __schema?: {
            types: SchemaType[]
        }
    }
}

interface SchemaType {
    name: string
    fields?: { name: string }[]
}
