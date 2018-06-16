/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { LanguageClient, TextDocumentPositionParams } from '@sourcegraph/vscode-languageclient';
import { Dependent, listDependents } from './dependents';
import { SymbolLocationInformation, TextDocumentXDefinitionRequest, WorkspaceReferencesParams, ReferenceInformation, WorkspaceXReferencesRequest } from './lsp';
import { lspWorkspace, repoExtension } from './main';
import { Language } from './languages';

/**
 * Provides references drawn from multiple external roots. To obtain the
 * list of references for a token at position P in root R, it first
 * retrieves a list of roots that depend on R. For each such dependent
 * root D, it creates a new LSP connection and calls workspace/xreferences
 * to find all references in D to the original token in R.
 *
 * NOTE: It may be more efficient to compile results and create multiple
 * connections on the server instead of here in the client. Also, this technique
 * exposes more of Sourcegraph's API than is strictly necessary.
 */
export class MultiWorkspaceProvider implements vscode.ReferenceProvider, vscode.Disposable {
	private static MAX_DEPENDENT_REPOS = 10;

	private toDispose: vscode.Disposable[] = [];

	constructor(
		private lang: Language,
		private root: vscode.Uri,

		/**
		 * The LSP client for the root from which these requests originate.
		 */
		private sourceRootClient: LanguageClient,
	) {
		this.register();
	}

	private register(): void {
		const folder = vscode.workspace.findContainingFolder(this.root);
		this.toDispose.push(vscode.languages.registerReferenceProvider(this.lang.allLanguageIds.map(languageId => ({
			language: languageId,
			scheme: folder.scheme,
			pattern: `${folder.path}/**/*`,
		})), this));
	}

	public provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken, progress: vscode.ProgressCallback<vscode.Location[]>): vscode.ProviderResult<vscode.Location[]> {
		const handleError = error => {
			// We don't want failures in one repo to prevent results from other repos from showing
			// so just log errors and pretend no results were returned.
			console.warn(error);
			return [];
		};
		return this.queryDefinitionInfo(document, position).then(definitionInfos =>
			this.onlySuccesses(definitionInfos.map(definitionInfo =>
				this.listDependents(document, position).then(dependents =>
					this.onlySuccesses(dependents.map(dependent => {
						return this.getClientForRoot(dependent.workspace).then(client => {
							if (!client) {
								return [];
							}
							const refs2Locations = (references: ReferenceInformation[]): vscode.Location[] => {
								return references.map(r => this.sourceRootClient.protocol2CodeConverter.asLocation(r.reference));
							};
							const progressHandler = (references: ReferenceInformation[]) => {
								progress(refs2Locations(references));
							};
							const params: WorkspaceReferencesParams = { query: definitionInfo.symbol, hints: dependent.hints, limit: 50 };
							return client.sendRequestWithStreamingResponse(WorkspaceXReferencesRequest.type, params, token, progressHandler).then(refs2Locations);
						});
					}), handleError)
				)
			), handleError)
		)
			.then((resultLists: vscode.Location[][][]) => {
				// Flatten list.
				const results: vscode.Location[] = [];
				resultLists.forEach(list => {
					list.forEach(l => results.push.apply(results, l));
				});
				return results;
			});
	}

	/**
	 * Returns a promise that resolves to the resolved results of the input promises.
	 * handleError handles errors from input thenables and should return a default value to use.
	 * The returned promise always resolves and is never rejected as long as handleError doesn't throw.
	 */
	private onlySuccesses<R>(thenables: Thenable<R>[], handleError: (any) => R): Promise<R[]> {
		return Promise.all(thenables.map(thenable => {
			try {
				return thenable.then(v => v, handleError);
			} catch (e) {
				return handleError(e);
			}
		}));
	}

	private getClientForRoot(folder: vscode.Uri): Thenable<LanguageClient | undefined> {
		let root = lspWorkspace.getRoot(folder);
		if (!root) {
			root = lspWorkspace.addRoot(folder);
		}
		return root.ensureLanguageActivated(this.lang);
	}

	private queryDefinitionInfo(document: vscode.TextDocument, position: vscode.Position): Thenable<SymbolLocationInformation[]> {
		return this.sourceRootClient.sendRequest(TextDocumentXDefinitionRequest.type, {
			textDocument: { uri: this.sourceRootClient.code2ProtocolConverter.asUri(document.uri).toString() },
			position: this.sourceRootClient.code2ProtocolConverter.asPosition(position),
		} as TextDocumentPositionParams);
	}

	/**
	 * Returns reference information about the given definition.
	 */
	private listDependents(document: vscode.TextDocument, position: vscode.Position): Thenable<Dependent[]> {
		const folder = vscode.workspace.findContainingFolder(document.uri);
		if (!folder) {
			throw new Error(`unable to find root for ${document.uri}`);
		}

		return repoExtension.resolveResourceRevision(document.uri).then(revision => {
			return listDependents({
				repo: folder.authority + folder.path,
				rev: revision.id,
				path: repoExtension.toRelativePath(folder, document.uri),
				mode: this.lang.mode,
				line: position.line,
				character: position.character,
			}).then(dependents => dependents.slice(0, MultiWorkspaceProvider.MAX_DEPENDENT_REPOS));
		});
	}

	public dispose(): void {
		this.toDispose.forEach(d => d.dispose());
		// Do not dispose the currentRootClient because we do not own it.
	}
}
