import assert from 'assert'

import * as vscode from 'vscode'
import { setupPolly } from './setupPolly'
import { fs, files } from '../../extension'

async function showUri(uri: string): Promise<void> {
    const textDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri))
    await vscode.window.showTextDocument(textDocument)
}

suite('Sourcegraph VS Code', () => {
    setupPolly()
    const repo1 =
        'sourcegraph://sourcegraph.com/github.com/sourcegraph/sourcegraph@7f7726f6c5ad58493d1af038606cd66a9566b278'
    test('SourcegraphFileSystemProvider', async () => {
        const textDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(`${repo1}/-/blob/.nvmrc`))
        assert.strictEqual(textDocument.getText(), '16.7.0\n')
        const children = await fs.readDirectory(vscode.Uri.parse(`${repo1}/-/tree/.github`))

        // We support listing directories with `/-/blob/` prefixes even if those
        // aren't supported on sourcegraph.com. The reason we do this is because
        // clicking on directories from the file path breadcrumbs in VS Code
        // sends `fs.readDirectory` requests to the parent URIs of the open file
        // (which has a `/-/blob` prefix).
        const blobChildren = await fs.readDirectory(vscode.Uri.parse(`${repo1}/-/blob/.github`))
        assert.deepStrictEqual(children, blobChildren)

        children.sort(([filename1], [filename2]) => filename1.localeCompare(filename2))
        assert.deepStrictEqual(children, [
            ['CODEOWNERS', vscode.FileType.File],
            ['ISSUE_TEMPLATE', vscode.FileType.Directory],
            ['PULL_REQUEST_TEMPLATE', vscode.FileType.Directory],
            ['PULL_REQUEST_TEMPLATE.md', vscode.FileType.File],
            ['teams.yml', vscode.FileType.File],
            ['workflows', vscode.FileType.Directory],
        ])
    })

    test('FilesTreeDataProvider', async () => {
        await showUri(`${repo1}/-/blob/ui/assets/assets_dev.go`)
        assert.deepStrictEqual(files.fs.allRepositoryUris(), [repo1])
        assert.deepStrictEqual(await files.getChildren(undefined), [repo1])
        const children = await files.getChildren(repo1)
        assert(
            children?.includes(`${repo1}/-/tree/ui/assets`),
            `children=${JSON.stringify(children)} did not include ui/assets`
        )
        assert.deepStrictEqual((await files.getChildren(`${repo1}/-/tree/ui/assets`))?.sort(), [
            `${repo1}/-/blob/ui/assets/.gitignore`,
            `${repo1}/-/blob/ui/assets/assets_dev.go`,
            `${repo1}/-/blob/ui/assets/assets_dist.go`,
            `${repo1}/-/blob/ui/assets/doc.go`,
            `${repo1}/-/blob/ui/assets/load_manifest_dev.go`,
            `${repo1}/-/blob/ui/assets/load_manifest_dist.go`,
            `${repo1}/-/blob/ui/assets/manifest.go`,
            `${repo1}/-/tree/ui/assets/img`,
        ])
        assert.deepStrictEqual(await files.getParent(`${repo1}/-/tree/ui/assets`), repo1)
        assert(
            (await files.getTreeItem(`${repo1}/-/blob/ui/assets/doc.go`))?.resourceUri?.path.endsWith('doc.go'),
            'resourceUri does not end with "doc.go"'
        )
    })
})
