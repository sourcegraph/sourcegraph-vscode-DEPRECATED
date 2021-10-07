import * as vscode from 'vscode'
import { log } from '../log'
import {
    repositoryComparisonDiffQuery,
    FileDiffNode,
    RepositoryComparisonParameters,
    RepositoryComparison,
} from '../queries/repositoryComparisonDiffQuery'
import { endpointHostnameSetting } from '../settings/endpointSetting'
import { emptyCancelationToken } from './emptyCancelationToken'
import { FileTree } from './FileTree'
import { SourcegraphFileSystemProvider } from './SourcegraphFileSystemProvider'
import { CompareRange, SourcegraphUri } from './SourcegraphUri'

const DEFAULT_COMMIT_HISTORY_LENGTH = 10

export class DiffsTreeDataProvider implements vscode.TreeDataProvider<string> {
    private repositoryComparisonCache = new Map<string, RepositoryComparison>()
    private treeItemCache = new Map<string, vscode.TreeItem>()
    private compareRangesByRepositoryName = new Map<string, CompareRange>()
    private diffNodeChanges = new vscode.EventEmitter<string | undefined>()
    public activeUri: vscode.Uri | undefined
    public onDidChangeTreeData?: vscode.Event<string | undefined> = this.diffNodeChanges.event
    constructor(public readonly fs: SourcegraphFileSystemProvider) {
        fs.onDidDownloadRepositoryFilenames(() => this.diffNodeChanges.fire(undefined))
    }
    // private treeView: vscode.TreeView<string> | undefined
    public updateCompareRangePart(repositoryName: string, kind: 'base' | 'head', revision: string): void {
        const old = this.compareRangeName(repositoryName)
        const updatedRange: CompareRange = { ...old }
        updatedRange[kind] = revision
        this.updateCompareRange(repositoryName, updatedRange)
    }
    public updateCompareRange(repositoryName: string, updatedRange: CompareRange): void {
        this.compareRangesByRepositoryName.set(repositoryName, updatedRange)
        this.diffNodeChanges.fire(undefined)
    }
    public setTreeView(newTreeView: vscode.TreeView<string>): void {
        // this.treeView = newTreeView
    }
    public async didFocus(vscodeUri: vscode.Uri | undefined): Promise<void> {
        this.activeUri = vscodeUri
        // if (vscodeUri && this.treeView) {
        // this.treeView.reveal(this.counter % 2 === 0 ? first.toString() : second.toString(), { select: true })
        // }
        return Promise.resolve()
    }
    public getTreeItem(element: string): vscode.TreeItem {
        // log.appendLine(`getTreeItem(${element})`)
        try {
            const node = DiffNode.parse(element)
            if (node.isRepositoryName()) {
                return {
                    label: node.repositoryName,
                    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                }
            }
            switch (node.kind) {
                case 'base':
                case 'head':
                    return {
                        id: node.toString(),
                        label: `${node.kind[0].toUpperCase()}${node.kind.slice(1)}: ${
                            this.compareRange(node)[node.kind]
                        }`,
                        resourceUri: vscode.Uri.parse('sourcegraph://host/.gitignore'),
                        tooltip: `Update ${node.kind} revision`,
                        contextValue: 'compareRange',
                        command: {
                            command: 'extension.updateCompareRange',
                            title: `Update ${node.kind} revision`,
                            arguments: [node.repositoryName, node.kind],
                        },
                    }
                case 'commits':
                    if (!node.commit) {
                        return {
                            label: 'Commits',
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        }
                    }
                    return this.treeItemCache.get(node.toString()) || {}
                case 'files':
                    if (!node.path) {
                        return { label: 'Files', collapsibleState: vscode.TreeItemCollapsibleState.Expanded }
                    }
                    return this.treeItemCache.get(node.toString()) || {}
                default:
                    return {}
            }
        } catch (error) {
            log.error(`getTreeItem(${element})`, error)
            return {}
        }
    }

    public async getChildren(element?: string): Promise<string[]> {
        // log.appendLine(`getChildren(${element})`)
        if (!element) {
            const repositoryNames = [
                ...new Set(this.fs.allRepositoryUris().map(uri => SourcegraphUri.parse(uri).repositoryName)),
            ]
            return repositoryNames.map(name => DiffNode.repositoryName(name).toString())
        }
        const node = DiffNode.parse(element)
        if (node.isRepositoryName()) {
            return [
                node.with({ kind: 'base' }),
                node.with({ kind: 'head' }),
                node.with({ kind: 'commits' }),
                node.with({ kind: 'files' }),
            ].map(node => node.toString())
        }
        switch (node.kind) {
            case 'files':
                return this.fileTreeChildren(node)
            case 'commits':
                if (!node.commit) {
                    const comparison = await this.nodeComparison(node)
                    const result: string[] = []
                    for (const commit of comparison.commits) {
                        if (!commit.oid) {
                            continue
                        }
                        const childNode = node.with({ commit: commit.oid })
                        const childKey = childNode.toString()
                        const commitMessageHeader = commit.message?.split(/\n\r?/)?.[0]
                        const avatarURL = commit.author?.person?.avatarURL
                        const childItem: vscode.TreeItem = {
                            id: childKey,
                            iconPath: avatarURL ? vscode.Uri.parse(avatarURL) : undefined,
                            label: commitMessageHeader || commit.abbreviatedOID || commit.oid,
                            tooltip: commit.message ? new vscode.MarkdownString(commit.message) : undefined,
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        }
                        this.treeItemCache.set(childKey, childItem)
                        result.push(childKey)
                    }
                    return result
                }
                return this.fileTreeChildren(node)
            case 'base':
            case 'head':
            default:
                return []
        }
    }

    public getParent(element: string): string | undefined {
        return undefined
    }

    private async fileTreeChildren(node: DiffNode): Promise<string[]> {
        const { tree, comparison } = await this.comparisonFileTree(node)
        const directChildren = tree.directChildren(node.path || '')
        const parent = SourcegraphUri.fromParts(endpointHostnameSetting(), node.repositoryName, {
            revision: this.compareRange(node).head,
            path: node.path,
        })
        const range = this.compareRange(node)
        const result: string[] = []
        for (const child of directChildren) {
            const uri = SourcegraphUri.parse(child)
            const childNode = node.with({ path: uri.path })
            const treeItem = this.newTreeItem(
                uri,
                childNode,
                parent,
                directChildren.length,
                range,
                this.oldPath(uri.path || '', comparison.files),
                comparison
            )
            if (uri.isFile() && !treeItem.command) {
                continue
            }
            const childKey = childNode.toString()
            this.treeItemCache.set(childKey, treeItem)
            result.push(childKey)
        }
        return result
    }

    private oldPath(newPath: string, nodes: FileDiffNode[]): FileDiffNode | undefined {
        for (const node of nodes) {
            if (newPath === node.newPath) {
                return node
            }
        }
        return
    }
    private async comparisonFileTree(node: DiffNode): Promise<{ tree: FileTree; comparison: RepositoryComparison }> {
        const comparison = await this.nodeComparison(node)
        const filenames: string[] = []
        for (const node of comparison.files) {
            if (node.newPath) {
                filenames.push(node.newPath)
            }
        }
        return {
            comparison,
            tree: new FileTree(
                SourcegraphUri.parse(`sourcegraph://${endpointHostnameSetting()}/${node.repositoryName}`),
                filenames
            ),
        }
    }

    private async nodeComparison(node: DiffNode): Promise<RepositoryComparison> {
        const id = (await this.fs.repositoryMetadata(node.repositoryName))?.id
        if (!id) {
            return { commits: [], files: [] }
        }
        const parameters: RepositoryComparisonParameters = {
            repositoryId: id,
            first: 1000,
            ...this.compareRange(node),
        }
        const key = JSON.stringify(parameters)
        let comparison = this.repositoryComparisonCache.get(key)
        if (!comparison) {
            comparison = await repositoryComparisonDiffQuery(parameters, emptyCancelationToken())
            this.repositoryComparisonCache.set(key, comparison)
        }
        return comparison
    }

    private compareRange(node: DiffNode): CompareRange {
        if (node.kind === 'commits' && node.commit) {
            return { head: node.commit, base: `${node.commit}~1` }
        }
        return this.compareRangeName(node.repositoryName)
    }
    private compareRangeName(repositoryName: string): CompareRange {
        let range = this.compareRangesByRepositoryName.get(repositoryName)
        if (!range) {
            range = {
                base: `HEAD~${DEFAULT_COMMIT_HISTORY_LENGTH}`,
                head: 'HEAD',
            }
            this.fs.repositoryMetadata(repositoryName).then(
                metadata => {
                    if (metadata?.defaultBranch) {
                        const head = metadata.defaultBranch
                        this.compareRangesByRepositoryName.set(repositoryName, {
                            base: `${head}~${DEFAULT_COMMIT_HISTORY_LENGTH}`,
                            head,
                        })
                        this.diffNodeChanges.fire(undefined)
                    }
                },
                () => {}
            )
            this.compareRangesByRepositoryName.set(repositoryName, range)
        }
        return range
    }

    public diffTitle(basename: string, range: CompareRange): string {
        return `${basename} (${range.base.slice(0, 7)} ↔ ${range.head.slice(0, 7)})`
    }

    private newTreeItem(
        uri: SourcegraphUri,
        childNode: DiffNode,
        parent: SourcegraphUri | undefined,
        parentChildrenCount: number,
        range: CompareRange,
        fileDiff: FileDiffNode | undefined,
        comparison: RepositoryComparison
    ): vscode.TreeItem {
        const command = uri.isFile()
            ? {
                  command: 'vscode.diff',
                  title: 'Compare files',
                  arguments: [
                      vscode.Uri.parse(
                          fileDiff?.oldPath
                              ? uri.withRevision(range.base).withPath(fileDiff.oldPath).uri
                              : this.fs.emptyFileUri()
                      ),
                      vscode.Uri.parse(uri.withRevision(range.head).uri),
                      this.diffTitle(uri.basename(), range),
                  ],
              }
            : undefined

        const fileStats = fileDiffStats(uri, fileDiff, comparison)
        const label = uri.treeItemLabel(parent)
        return {
            id: childNode.toString(),
            label,
            tooltip: fileStats.tooltip,
            collapsibleState: uri.isFile()
                ? vscode.TreeItemCollapsibleState.None
                : parentChildrenCount === 1 || comparison.files.length < 50
                ? // Expand by default for "small" diffs, where "small" is defined as touching less than 50 files.
                  vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed,
            command,
            resourceUri: vscode.Uri.parse(uri.uri),
            // TODO: figure out how to get an icon on the right side similar to
            // gitlens.  We can use the resourceUri below, but then we loose the
            // file icon.
            // resourceUri: vscode.Uri.parse('gitlens-view://commit-file/status/M'),
            contextValue: fileStats.contextValue,
        }
    }
}

interface FileStats {
    tooltip: string
    contextValue: string
}

function fileDiffStats(
    uri: SourcegraphUri,
    fileDiff: FileDiffNode | undefined,
    comparison: RepositoryComparison
): FileStats {
    let added = fileDiff?.stat?.added || 0
    let deleted = fileDiff?.stat?.deleted || 0
    let changed = fileDiff?.stat?.changed || 0
    if (uri.isDirectory()) {
        const path = uri.path ? uri.path + '/' : ''
        for (const file of comparison.files) {
            if (file.newPath?.startsWith(path)) {
                added += file.stat?.added || 0
                deleted += file.stat?.deleted || 0
                changed += file.stat?.changed || 0
            }
        }
    }
    const parts: string[] = []
    const addCount = (what: string, count: number): void => {
        if (count < 1) {
            return
        }
        const suffix = count > 1 ? 's' : ''
        parts.push(`${count.toLocaleString()} ${what}${suffix}`)
    }
    addCount('addition', added)
    addCount('change', changed)
    addCount('deletion', deleted)

    if (parts.length === 0) {
        return { tooltip: '', contextValue: '' }
    }
    const third = (added + deleted + changed) / 3
    const total = added + deleted + changed
    const maxColor = (): string => {
        if (added > deleted && added > changed) {
            added -= third
            return 'green'
        }
        if (deleted > added && deleted > changed) {
            deleted -= third
            return 'red'
        }
        changed -= third
        return 'orange'
    }
    const contextValue: string[] = [maxColor() + '1']
    if (total > 10) {
        contextValue.push(maxColor() + '2')
    }
    if (total > 100) {
        contextValue.push(maxColor() + '3')
    }

    return {
        tooltip: parts.join(', '),
        contextValue: contextValue.join('-'),
    }
}

type DiffNodeKind = 'base' | 'head' | 'commits' | 'files'
interface DiffNodeOptionals {
    kind?: DiffNodeKind
    commit?: string
    path?: string
}

class DiffNode {
    private constructor(
        public readonly repositoryName: string,
        public readonly kind: DiffNodeKind | undefined,
        public readonly commit: string | undefined,
        public readonly path: string | undefined
    ) {}

    public isRepositoryName(): boolean {
        return !this.kind && !this.commit && !this.path
    }
    public static repositoryName(repositoryName: string, optionals?: DiffNodeOptionals): DiffNode {
        return DiffNode.fromAny({ repositoryName, ...optionals })
    }
    public with(optionals: DiffNodeOptionals): DiffNode {
        return DiffNode.repositoryName(this.repositoryName, {
            kind: this.kind,
            commit: this.commit,
            path: this.path,
            ...optionals,
        })
    }
    public static parse(json: string): DiffNode {
        try {
            return this.fromAny(JSON.parse(json))
        } catch (error) {
            return log.errorAndThrow(`DiffUri.parse(json=${json})`, error)
        }
    }
    private static fromAny(any: any): DiffNode {
        const repositoryName = any?.repositoryName
        if (typeof repositoryName !== 'string') {
            throw new TypeError('DiffUri.fromAny() missing repositoryName')
        }
        let kind: DiffNodeKind | undefined
        if (any?.kind === 'base' || any?.kind === 'head' || any?.kind === 'commits' || any?.kind === 'files') {
            kind = any.kind
        }
        let commit: string | undefined
        if (typeof any?.commit === 'string') {
            commit = any.commit
        }
        let path: string | undefined
        if (typeof any?.path === 'string') {
            path = any.path
        }
        return new DiffNode(repositoryName, kind, commit, path)
    }
    public toString(): string {
        return JSON.stringify(this)
    }
}
