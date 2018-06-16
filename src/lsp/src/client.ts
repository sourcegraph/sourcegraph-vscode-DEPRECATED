/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { LanguageClient, RevealOutputChannelOn, LanguageClientOptions, ErrorCodes, MessageTransports, ProvideWorkspaceSymbolsSignature, ShowMessageParams, NotificationHandler, ResponseError, InitializeError } from '@sourcegraph/vscode-languageclient';
import { v4 as uuidV4 } from 'uuid';
import { MessageTrace, webSocketStreamOpener } from './connection';
import { lspWorkspace, repoExtension } from './main';
import * as log from './log';

export function activateLSP(): vscode.Disposable {
	const toDispose: vscode.Disposable[] = []; // things that should live for this extension's lifetime

	// Start workspace and initialize roots.
	toDispose.push(lspWorkspace);

	// Other disposables.
	toDispose.push(log.outputChannel);

	return {
		dispose(): void {
			dispose(toDispose);

			if (traceOutputChannel) {
				traceOutputChannel.dispose();
			}
		},
	};
}

function dispose(toDispose: vscode.Disposable[]): void {
	toDispose.forEach(disposable => disposable.dispose());
	toDispose.length = 0;
}

const REUSE_BACKEND_LANG_SERVERS = true;

/**
 * JSON-RPC 2.0 error codes returned by the LSP proxy.
 */
enum ProxyErrors {
	ModeNotFound = -32000
}

/**
* Creates a new LSP client. The mode specifies which backend language
* server to communicate with. The languageIds are the vscode document
* languages that this client should be used to provide hovers, etc.,
* for.
*/
export function newClient(mode: string, languageIds: string[], root: vscode.Uri, commitID: string): LanguageClient {
	if (!commitID) {
		throw new Error(`no commit ID for workspace ${root.toString()}`);
	}

	const options: LanguageClientOptions = {
		rootUri: root,
		revealOutputChannelOn: RevealOutputChannelOn.Never,
		documentSelector: languageIds.map(languageId => ({
			language: languageId,
			scheme: root.scheme,
			pattern: `${root.path}/**/*`,
		})),
		initializationOptions: {
			mode: mode,
			rev: commitID,
			session: REUSE_BACKEND_LANG_SERVERS ? undefined : uuidV4(),
		},
		initializationFailedHandler: (error: ResponseError<InitializeError> | Error | any): boolean => {
			if (error && error.code === ProxyErrors.ModeNotFound) {
				// Don't report to the user because we already show a nicer language
				// support warning.
				return false;
			}

			if (error && error.message) {
				vscode.window.showErrorMessage(error.message);
			}
			return false;
		},
		uriConverters: {
			code2Protocol: (value: vscode.Uri): string => {
				if (value.scheme === 'file') {
					return value.toString();
				}
				if (value.scheme === 'repo' || value.scheme === 'repo+version') {
					const folder = vscode.workspace.findContainingFolder(value);
					if (folder) {
						// Convert to the format that the LSP proxy server expects.
						return vscode.Uri.parse(`git://${folder.authority}${folder.path}`).with({
							query: commitID,
							fragment: repoExtension.toRelativePath(folder, value),
						}).toString();
					}
				}
				throw new Error(`unknown URI scheme in ${value.toString()}`);
			},
			protocol2Code: (value: string): vscode.Uri => {
				const uri = vscode.Uri.parse(value);
				if (uri.scheme === 'git') {
					// URI is of the form git://github.com/owner/repo?gitrev#dir/file.

					// Convert to repo://github.com/owner/repo/dir/file if in the same workspace.
					if (uri.with({ scheme: 'repo', query: '', fragment: '' }).toString() === root.toString()) {
						return root.with({ scheme: 'repo', path: root.path + `${uri.fragment !== '' ? `/${decodeURIComponent(uri.fragment)}` : ''}` });
					}

					// Convert to repo+version://github.com/owner/repo/dir/file.txt?gitrev.
					return uri.with({ scheme: 'repo+version', path: uri.path.replace(/\/$/, '') + '/' + decodeURIComponent(uri.fragment), fragment: '' });
				}
				throw new Error('language server sent URI with unsupported scheme: ' + value);
			},
		},
		middleware: {
			// Ignore workspace/symbol for clients whose root is not either (1) a
			// workspace root or (2) the same root as that of the active document.
			provideWorkspaceSymbols(query: string, token: vscode.CancellationToken, next: ProvideWorkspaceSymbolsSignature): vscode.ProviderResult<vscode.SymbolInformation[]> {
				const isSameRootAsActiveDocument = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.toString().startsWith(root.toString() + '/');
				const isInWorkspace = vscode.workspace.getWorkspaceFolder(root) || (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.some(folder => folder.uri.toString() === root.toString()));
				if (isSameRootAsActiveDocument || isInWorkspace) {
					return next(query, token);
				}
				return [];
			},
			onShowMessage: (params: ShowMessageParams, next: NotificationHandler<ShowMessageParams>) => {
				// Suppress warnings and errors from workspaces that aren't currently open (shown when fetching
				// external refs) to cut down on noise.
				if (!vscode.workspace.textDocuments.some(textDocument => {
					const folder = vscode.workspace.findContainingFolder(textDocument.uri);
					return folder ? root.toString() === folder.toString() : false;
				})) {
					return;
				}
				next(params);
			},
		},
	};

	const dummy = void 0 as any; // dummy server arg (we override createMessageTransports to supply this)

	return new class WebSocketLanguageClient extends LanguageClient {

		// Override to use a WebSocket transport instead of a StreamInfo (which requires a
		// duplex stream).
		protected createMessageTransports(encoding: string): Thenable<MessageTransports> {
			const endpoint = vscode.Uri.parse(vscode.workspace.getConfiguration('remote').get<string>('endpoint'));
			const wsOrigin = endpoint.with({ scheme: endpoint.scheme === 'http' ? 'ws' : 'wss' });

			// We include ?mode= in the url to make it easier to find the correct LSP
			// websocket connection in (e.g.) the Chrome network inspector. It does not
			// affect any behaviour.
			const url = `${wsOrigin}/.api/lsp?mode=${mode}`;
			return webSocketStreamOpener(url, createRequestTracer(mode));
		}
	}('lsp-' + mode, 'lsp-' + mode, dummy, options);
}

let traceOutputChannel: vscode.OutputChannel | undefined;

function createRequestTracer(languageId: string): ((trace: MessageTrace) => void) | undefined {
	return (trace: MessageTrace) => {
		if (!vscode.workspace.getConfiguration('lsp').get<boolean>('trace')) {
			return undefined;
		}

		if (!traceOutputChannel) {
			traceOutputChannel = vscode.window.createOutputChannel('LSP (trace)');
		}

		let label: string;
		if (!trace.response.error) {
			label = 'OK ';
		}
		else if (trace.response.error.code === ErrorCodes.RequestCancelled) {
			label = 'CXL';
		} else {
			label = 'ERR';
		}
		traceOutputChannel.appendLine(`${label} ${languageId} ${describeRequest(trace.request.method, trace.request.params)} — ${trace.endTime - trace.startTime}ms`);
		if (trace.response.meta && trace.response.meta['X-Trace']) {
			traceOutputChannel.appendLine(` - Trace: ${trace.response.meta['X-Trace']}`);
		}
		traceOutputChannel.appendLine('');
		// console.log('Request Params:', trace.request.params);
		// console.log('Response:', trace.response);
	};
}

function describeRequest(method: string, params: any): string {
	if (params.textDocument && params.textDocument.uri && params.position) {
		return `${method} @ ${params.position.line + 1}:${params.position.character + 1}`;
	}
	if (typeof params.query !== 'undefined') {
		return `${method} with query ${JSON.stringify(params.query)}`;
	}
	if (params.rootPath) {
		return `${method} ${params.rootPath}`;
	}
	return method;
}
