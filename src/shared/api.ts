import { queryGraphQL } from '../graphql'
import { createAggregateError } from './errors'

const discussionCommentFieldsFragment = `
    fragment DiscussionCommentFields on DiscussionComment {
      id
      author {
        ...UserFields
      }
      contents
      html
      inlineURL
      createdAt
      updatedAt
    }
  `

function discussionThreadFieldsFragment(relativeRev?: string): string {
    let relativeRevFields = ''
    if (relativeRev) {
        relativeRevFields = `
        relativePath(rev: $relativeRev)
        relativeSelection(rev: $relativeRev) {
          startLine
          startCharacter
          endLine
          endCharacter
        }
    `
    }
    return `
    fragment DiscussionThreadFields on DiscussionThread {
      id
      author {
        ...UserFields
      }
      title
      target {
        __typename
        ... on DiscussionThreadTargetRepo {
          repository {
            name
          }
          path
          branch {
            displayName
          }
          revision {
            displayName
          }
          selection {
            startLine
            startCharacter
            endLine
            endCharacter
            linesBefore
            lines
            linesAfter
          }
          ${relativeRevFields}
        }
      }
      inlineURL
      createdAt
      updatedAt
      archivedAt
    }

    fragment UserFields on User {
      displayName
      username
      avatarURL
    }
  `
}

/**
 * Creates a new discussion thread.
 *
 * @return Promise that emits the new discussion thread.
 */
export async function createThread(
    input: SourcegraphGQL.IDiscussionThreadCreateInput,
    relativeRev = ''
): Promise<SourcegraphGQL.IDiscussionThread> {
    const { data, errors } = await queryGraphQL(
        `
        mutation CreateThread($input: DiscussionThreadCreateInput!, $relativeRev: String!) {
          discussions {
            createThread(input: $input) {
              ...DiscussionThreadFields
              comments {
                totalCount
                nodes {
                  ...DiscussionCommentFields
                }
              }
            }
          }
        }
        ${discussionThreadFieldsFragment(relativeRev)}
        ${discussionCommentFieldsFragment}
      `,
        { input, relativeRev }
    )
    if (!data || !data.discussions || !data.discussions.createThread) {
        throw createAggregateError(errors)
    }
    return data.discussions.createThread
}

/**
 * Fetches discussion threads.
 */
export async function fetchDiscussionThreads(opts: {
    first?: number
    query?: string
    threadID?: string
    authorUserID?: string
    targetRepositoryID?: string
    targetRepositoryName?: string
    targetRepositoryGitCloneURL?: string
    targetRepositoryPath?: string
    relativeRev?: string
}): Promise<SourcegraphGQL.IDiscussionThreadConnection> {
    opts.relativeRev = opts.relativeRev || ''
    const { data, errors } = await queryGraphQL(
        `
        query DiscussionThreads(
          $first: Int
          $query: String
          $threadID: ID
          $authorUserID: ID
          $targetRepositoryID: ID
          $targetRepositoryName: String
          $targetRepositoryGitCloneURL: String
          $targetRepositoryPath: String
          $relativeRev: String!
        ) {
          discussionThreads(
            first: $first
            query: $query
            threadID: $threadID
            authorUserID: $authorUserID
            targetRepositoryID: $targetRepositoryID
            targetRepositoryName: $targetRepositoryName
            targetRepositoryGitCloneURL: $targetRepositoryGitCloneURL
            targetRepositoryPath: $targetRepositoryPath
          ) {
            totalCount
            pageInfo {
              hasNextPage
            }
            nodes {
              ...DiscussionThreadFields
              comments {
                totalCount
              }
            }
          }
        }
        ${discussionThreadFieldsFragment(opts.relativeRev)}
      `,
        opts
    )
    if (!data || !data.discussionThreads) {
        throw createAggregateError(errors)
    }
    return data.discussionThreads
}

/**
 * Fetches a discussion thread and its comments.
 */
export async function fetchDiscussionThreadAndComments(
    threadID: string,
    relativeRev = ''
): Promise<SourcegraphGQL.IDiscussionThread> {
    const { data, errors } = await queryGraphQL(
        `
        query DiscussionThreadComments($threadID: ID!, $relativeRev: String!) {
          discussionThreads(threadID: $threadID) {
            totalCount
            nodes {
              ...DiscussionThreadFields
              comments {
                totalCount
                nodes {
                  ...DiscussionCommentFields
                }
              }
            }
          }
        }
        ${discussionThreadFieldsFragment(relativeRev)}
        ${discussionCommentFieldsFragment}
      `,
        { threadID, relativeRev }
    )
    if (
        !data ||
        !data.discussionThreads ||
        !data.discussionThreads.nodes ||
        data.discussionThreads.nodes.length !== 1
    ) {
        throw createAggregateError(errors)
    }
    return data.discussionThreads.nodes[0]
}

/**
 * Adds a comment to an existing discussion thread.
 *
 * @return Promise that emits the updated discussion thread and its comments.
 */
export async function addCommentToThread(
    threadID: string,
    contents: string,
    relativeRev = ''
): Promise<SourcegraphGQL.IDiscussionThread> {
    const { data, errors } = await queryGraphQL(
        `
        mutation AddCommentToThread($threadID: ID!, $contents: String!, $relativeRev: String!) {
          discussions {
            addCommentToThread(threadID: $threadID, contents: $contents) {
              ...DiscussionThreadFields
              comments {
                totalCount
                nodes {
                  ...DiscussionCommentFields
                }
              }
            }
          }
        }
        ${discussionThreadFieldsFragment(relativeRev)}
        ${discussionCommentFieldsFragment}
      `,
        { threadID, contents, relativeRev }
    )
    if (!data || !data.discussions || !data.discussions.addCommentToThread) {
        throw createAggregateError(errors)
    }
    return data.discussions.addCommentToThread
}

/**
 * Renders Markdown to HTML.
 *
 * @return Promise that emits the HTML string, which is already sanitized and escaped and thus is always safe to render.
 */
export async function renderMarkdown(markdown: string, options?: SourcegraphGQL.IMarkdownOptions): Promise<string> {
    const { data, errors } = await queryGraphQL(
        `
        query RenderMarkdown($markdown: String!, $options: MarkdownOptions) {
          renderMarkdown(markdown: $markdown, options: $options)
        }
      `,
        { markdown }
    )
    if (!data || !data.renderMarkdown) {
        throw createAggregateError(errors)
    }
    return data.renderMarkdown
}
