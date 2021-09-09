/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from 'vscode'
import { SourcegraphUri } from './SourcegraphUri'
import { log } from '../log'
import { FileTree } from './FileTree'
import { filesQuery } from '../queries/filesQuery'
import { LocationNode } from '../queries/LocationNode'
import { RepositoryMetadata, repositoryMetadataQuery } from '../queries/repositoryMetadataQuery'
import { contentQuery as contents } from '../queries/contentQuery'
import { emptyCancelationToken } from './emptyCancelationToken'
import { endpointHostnameSetting } from '../settings/endpointSetting'

export interface RepositoryFileNames {
    repositoryUri: string
    repositoryName: string
    fileNames: string[]
}

export interface Blob {
    uri: string
    repositoryName: string
    revision: string
    path: string
    content: Uint8Array
    isBinaryFile: boolean
    byteSize: number
    time: number
    type: vscode.FileType
}

export class SourcegraphFileSystemProvider implements vscode.FileSystemProvider {
    private fileNamesByRepository: Map<string, Promise<string[]>> = new Map()
    private metadata: Map<string, RepositoryMetadata> = new Map()
    private didDownloadFilenames = new vscode.EventEmitter<string>()

    // ======================
    // FileSystemProvider API
    // ======================
    private didChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>() // Never used.
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.didChangeFile.event
    public async stat(vscodeUri: vscode.Uri): Promise<vscode.FileStat> {
        const uri = this.sourcegraphUri(vscodeUri)
        const now = Date.now()
        if (uri.uri === this.emptyFileUri()) {
            return { mtime: now, ctime: now, size: 0, type: vscode.FileType.File }
        }
        const files = await this.downloadFiles(uri)
        const isFile = uri.path && files.includes(uri.path)
        const type = isFile ? vscode.FileType.File : vscode.FileType.Directory
        // log.appendLine(
        //     `stat(${uri.uri}) path=${uri.path || '""'} files.length=${files.length} type=${vscode.FileType[type]}`
        // )
        return {
            // It seems to be OK to return hardcoded values for the timestamps
            // and the byte size.  If it turns out the byte size needs to be
            // correct for some reason, then we can use
            // `this.fetchBlob(uri).byteSize` to get the value for files.
            mtime: now,
            ctime: now,
            size: 1337,
            type,
        }
    }

    public emptyFileUri(): string {
        return 'sourcegraph://sourcegraph.com/empty-file.txt'
    }

    public async readFile(vscodeUri: vscode.Uri): Promise<Uint8Array> {
        const uri = this.sourcegraphUri(vscodeUri)
        if (uri.uri === this.emptyFileUri()) {
            return new Uint8Array()
        }
        const blob = await this.fetchBlob(uri)
        return blob.content
    }

    public async readDirectory(vscodeUri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const uri = this.sourcegraphUri(vscodeUri)
        if (uri.uri.endsWith('/-')) {
            return []
        }
        const tree = await this.getFileTree(uri)
        const children = tree.directChildren(uri.path || '')
        return children.map(childUri => {
            const child = SourcegraphUri.parse(childUri)
            const type = child.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File
            return [child.basename(), type]
        })
    }

    public createDirectory(uri: vscode.Uri): void {
        throw new Error('Method not supported in read-only file system.')
    }
    public writeFile(
        _uri: vscode.Uri,
        _content: Uint8Array,
        _options: { create: boolean; overwrite: boolean }
    ): void | Thenable<void> {
        throw new Error('Method not supported in read-only file system.')
    }
    public delete(_uri: vscode.Uri, _options: { recursive: boolean }): void {
        throw new Error('Method not supported in read-only file system.')
    }
    public rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean }): void {
        throw new Error('Method not supported in read-only file system.')
    }
    public watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        throw new Error('Method not supported in read-only file system.')
    }

    // ===============================
    // Helper methods for external use
    // ===============================

    public onDidDownloadRepositoryFilenames: vscode.Event<string> = this.didDownloadFilenames.event

    public allRepositoryUris(): string[] {
        return [...this.fileNamesByRepository.keys()]
    }

    public async allFileFromOpenRepositories(folder?: SourcegraphUri): Promise<RepositoryFileNames[]> {
        const promises: RepositoryFileNames[] = []
        const folderRepositoryUri = folder?.repositoryUri()
        for (const [repositoryUri, downloadingFileNames] of this.fileNamesByRepository.entries()) {
            if (folderRepositoryUri && repositoryUri !== folderRepositoryUri) {
                continue
            }
            try {
                const fileNames = await downloadingFileNames
                const uri = SourcegraphUri.parse(repositoryUri)
                promises.push({
                    repositoryUri: uri.repositoryUri(),
                    repositoryName: `${uri.repositoryName}${uri.revisionPart()}`,
                    fileNames,
                })
            } catch {
                log.error(`failed to download files for repository '${repositoryUri}'`)
            }
        }
        return promises
    }

    public toVscodeLocation(node: LocationNode): vscode.Location {
        const metadata = this.metadata.get(node.resource.repository.name)
        let revision = node.resource.commit.oid
        if (metadata?.defaultBranch && revision === metadata?.defaultOid) {
            revision = metadata.defaultBranch
        }
        return new vscode.Location(
            vscode.Uri.parse(
                SourcegraphUri.fromParts(endpointHostnameSetting(), node.resource.repository.name, {
                    revision,
                    path: node.resource.path,
                }).uri
            ),
            new vscode.Range(
                new vscode.Position(node.range.start.line, node.range.start.character),
                new vscode.Position(node.range.end.line, node.range.end.character)
            )
        )
    }

    /**
     * @returns the URI of a file in the given repository. The file is the
     * toplevel readme file if it exists, otherwise it's the file with the
     * shortest name in the repository.
     */
    public async defaultFileUri(repositoryName: string): Promise<SourcegraphUri> {
        const token = emptyCancelationToken()
        const defaultBranch = (await this.repositoryMetadata(repositoryName, token))?.defaultBranch
        if (!defaultBranch) {
            const message = `repository '${repositoryName}' has no default branch`
            log.error(message)
            throw new Error(message)
        }
        const uri = SourcegraphUri.fromParts(endpointHostnameSetting(), repositoryName, { revision: defaultBranch })
        const files = await this.downloadFiles(uri)
        const readmes = files.filter(name => name.match(/readme/i))
        const candidates = readmes.length > 0 ? readmes : files
        let readme: string | undefined
        for (const candidate of candidates) {
            if (candidate === '' || candidate === 'lsif-java.json') {
                // Skip auto-generated file for JVM packages
                continue
            }
            if (!readme) {
                readme = candidate
            } else if (candidate.length < readme.length) {
                readme = candidate
            }
        }
        const defaultFile = readme || files[0]
        return SourcegraphUri.fromParts(endpointHostnameSetting(), repositoryName, {
            revision: defaultBranch,
            path: defaultFile,
        })
    }

    public async fetchBlob(uri: SourcegraphUri): Promise<Blob> {
        await this.repositoryMetadata(uri.repositoryName)
        const token = emptyCancelationToken()
        if (!uri.revision) {
            const error = `missing revision for URI '${uri.uri}'`
            log.error(error)
            throw new Error(error)
        }
        const path = uri.path || ''
        const content = await contents(
            {
                repository: uri.repositoryName,
                revision: uri.revision,
                path,
            },
            token
        )

        if (content) {
            const toCacheResult: Blob = {
                uri: uri.uri,
                repositoryName: uri.repositoryName,
                revision: uri.revision,
                content: content.content,
                isBinaryFile: content.isBinary,
                byteSize: content.byteSize,
                path,
                time: new Date().getMilliseconds(),
                type: vscode.FileType.File,
            }

            // Start downloading the repository files in the background.
            this.downloadFiles(uri).then(
                () => {},
                () => {}
            )

            return toCacheResult
        }
        log.error(`fetchBlob(${uri.uri}) not found`)
        throw new Error(`Not found '${uri.uri}'`)
    }

    public async repositoryMetadata(
        repositoryName: string,
        token?: vscode.CancellationToken
    ): Promise<RepositoryMetadata | undefined> {
        let metadata = this.metadata.get(repositoryName)
        if (metadata) {
            return metadata
        }
        metadata = await repositoryMetadataQuery({ repositoryName }, token || emptyCancelationToken())
        this.metadata.set(repositoryName, metadata)
        return metadata
    }

    public downloadFiles(uri: SourcegraphUri): Promise<string[]> {
        const key = uri.repositoryUri()
        const fileNamesByRepository = this.fileNamesByRepository
        let downloadingFiles = this.fileNamesByRepository.get(key)
        if (!downloadingFiles) {
            downloadingFiles = filesQuery(
                { repository: uri.repositoryName, revision: uri.revision },
                emptyCancelationToken()
            )
            vscode.window
                .withProgress(
                    {
                        location: vscode.ProgressLocation.Window,
                        title: `Loading ${uri.repositoryName}`,
                    },
                    async progress => {
                        try {
                            await downloadingFiles
                            this.didDownloadFilenames.fire(key)
                        } catch (error) {
                            log.error(`downloadFiles(${key})`, error)
                            fileNamesByRepository.delete(key)
                        }
                        progress.report({ increment: 100 })
                    }
                )
                .then(
                    () => {},
                    () => {}
                )

            this.fileNamesByRepository.set(key, downloadingFiles)
        }
        return downloadingFiles
    }

    public sourcegraphUri(uri: vscode.Uri): SourcegraphUri {
        return SourcegraphUri.parse(uri.toString(true))
    }

    public async getFileTree(uri: SourcegraphUri): Promise<FileTree> {
        const files = await this.downloadFiles(uri)
        return new FileTree(uri, files)
    }
}
