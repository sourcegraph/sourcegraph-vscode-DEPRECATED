/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as vscode from 'vscode'
import { DiffsTreeDataProvider } from '../file-system/DiffsTreeDataProvider'
import { CompareRange, SourcegraphUri } from '../file-system/SourcegraphUri'
import { log } from '../log'
import { repositoryComparisonDiffQuery } from '../queries/repositoryComparisonDiffQuery'
import { resolveRevisionQuery } from '../queries/resolveRevisionQuery'

export interface GoToCommitParameters {
    revision: string
    uri: string
    line: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function goToCommitCommand(diffs: DiffsTreeDataProvider, commandArguments: any[]): void {
    vscode.window
        // Ideally, this progress bar should use ProgressLocation.SourceControl but it doesn't seem to work.
        .withProgress<void>({ location: vscode.ProgressLocation.Window, title: 'Fetching blame' }, (progress, token) =>
            goToCommitCommandUnsafe(diffs, commandArguments, token)
                .catch(error => log.error(`goToCommitCommand(${JSON.stringify(commandArguments)})`, error))
                .then(() => progress.report({ increment: 100 }))
        )
        .then(
            () => {},
            () => {}
        )
}

async function goToCommitCommandUnsafe(
    diffs: DiffsTreeDataProvider,
    commandArguments: any[],
    token: vscode.CancellationToken
): Promise<void> {
    const parameters: GoToCommitParameters = commandArguments[0]
    if (typeof parameters.revision !== 'string') {
        throw new TypeError('.commit is not a string')
    }
    if (typeof parameters.uri !== 'string') {
        throw new TypeError('.uri is not a string')
    }
    if (typeof parameters.line !== 'number') {
        throw new TypeError('.line is not a number')
    }

    // This command uses the variable naming convention revision{1,2,3} to
    // refer to the following three different revisions:
    // - Revision 3: the revision of the current open document, aka `parameters.uri.revision`.
    // - Revision 2: the revision of the document we want to open, aka `parameters.revision`.
    // - Revision 1: the parent revision of "Revision 2".
    const uri3 = SourcegraphUri.parse(parameters.uri)
    const repositoryName = uri3.repositoryName
    const repositoryId = (await diffs.fs.repositoryMetadata(repositoryName, token))?.id
    if (!repositoryId) {
        throw new Error(`unable to find repository ID for ${repositoryName}`)
    }

    const revisionSpec1 = `${parameters.revision}~1`
    const revision2 = parameters.revision

    const diffsPromise1 = repositoryComparisonDiffQuery(
        { base: revisionSpec1, head: revision2, first: 10000, repositoryId },
        token
    )
    const diffsPromise2 = repositoryComparisonDiffQuery(
        { base: revision2, head: uri3.revision, first: 10000, repositoryId },
        token
    )
    const revisionPromise1 = resolveRevisionQuery({ repositoryName, revision: revisionSpec1 }, token)

    const diffs1 = await diffsPromise1
    const diffs2 = await diffsPromise2
    const revision1 = await revisionPromise1

    if (!revision1) {
        throw new Error('no revision1')
    }
    const node2 = diffs2.files.find(file => file.newPath === uri3.path)
    const path2 = node2?.oldPath || uri3.path
    const node1 = diffs1.files.find(file => file.newPath === path2)
    const path1 = node1?.oldPath

    const uri2 = uri3.with({ revision: revision2, path: path2 })
    const uri1 = path1 ? uri3.with({ revision: revision1, path: path1 }) : SourcegraphUri.parse(diffs.fs.emptyFileUri())

    const revisionRange: CompareRange = { base: revision1, head: revision2 }
    const title = diffs.diffTitle(uri2.basename(), revisionRange)
    // The vscode.diff command supports revealing a specific range. Example
    // https://sourcegraph.com/github.com/microsoft/vscode@bde7d28924dc3192ab95c6fed193ae91b821f773/-/blob/extensions/git/src/commands.ts?L2650:105
    const options: vscode.TextDocumentShowOptions = {
        selection: await revealRangeUri2(parameters, uri3, uri2),
    }
    await vscode.commands.executeCommand(
        'vscode.diff',
        vscode.Uri.parse(uri1.uri),
        // NOTE: there are cases where `uri2.uri` does not exist because the
        // file has been renamed and `repositoryComparisonDiffQuery` doesn't
        // detect the rename.  There's currently no way to get the original
        // filename before the rename, but his information is part of
        // `git-blame` output and could be added to the Sourcegraph GraphQL API.
        vscode.Uri.parse(uri2.uri),
        title,
        options
    )
    diffs.updateCompareRange(repositoryName, revisionRange)
}

// Returns the range in the `head` document that should be revealed when opening
// the VS Code diff editor.  This range is computed with a heuristic: we reveal
// the first line that has the same text contents in both files.  This method
// returns false positive results when multiple lines in either document have
// the exact same text contents (which can totally happen). It would be nice to
// improve this heuristic better, maybe git can provide this information
// directly?
async function revealRangeUri2(
    parameters: GoToCommitParameters,
    uri3: SourcegraphUri,
    uri2: SourcegraphUri
): Promise<vscode.Range | undefined> {
    try {
        if (uri3.uri === uri2.uri) {
            return new vscode.Range(parameters.line, 0, parameters.line, 1000)
        }
        const textDocumentPromise3 = vscode.workspace.openTextDocument(vscode.Uri.parse(uri3.uri))
        const textDocumentPromise2 = vscode.workspace.openTextDocument(vscode.Uri.parse(uri2.uri))
        const textDocument3 = await textDocumentPromise3
        const textDocument2 = await textDocumentPromise2
        const textSearch = textDocument3.getText(new vscode.Range(parameters.line, 0, parameters.line, 1000))
        const revealLine = textDocument2
            .getText()
            .split(/\n\r?/)
            .findIndex(line => line === textSearch)
        return revealLine > 0 ? new vscode.Range(revealLine, 0, revealLine, 1000) : undefined
    } catch {
        return undefined
    }
}
