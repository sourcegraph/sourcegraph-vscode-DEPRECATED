import { emptyCancelationToken } from '../file-system/emptyCancelationToken'
import { graphqlQueryWithAccessToken } from './graphqlQuery'

export async function currentUserQuery(accessToken: string): Promise<string> {
    const result = await graphqlQueryWithAccessToken<CurrentUserParameters, CurrentUserResult>(
        'query { currentUser { username }}',
        {},
        emptyCancelationToken(),
        accessToken
    )
    const username = result?.data?.currentUser?.username
    if (username) {
        return username
    }
    throw new Error(`invalid access token ${accessToken}`)
}

interface CurrentUserParameters {}
interface CurrentUserResult {
    data?: {
        currentUser?: {
            username?: string
        }
    }
}
