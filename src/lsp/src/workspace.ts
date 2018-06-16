/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { Root } from './root';
import * as log from './log';
import { repoExtension } from './main';

/**
 * Manages all of the LSP roots inside of a workspace. The workspace roots and the LSP
 * roots are different (although there may be many roots that are both a workspace root
 * and an LSP root). An LSP root is the containing repository of any open file. A
 * workspace root is the vscode concept. For example, if the user has a multi-root
 * workbench window open with roots A and B, and has two editor tabs open with files F1
 * (which exists underneath A) and F2 (which exists underneath a repo C other than A or
 * B), then the LSP roots are A and C, and the workspace roots are A and B.
 */
export interface IWorkspace extends vscode.Disposable {
	/**
	 * Returns the LSP root that exactly matches the folder URI. (It does not return the
	 * "nearest parent root" or anything smart; it'll just return undefined if there is no
	 * exact match.)
	 */
	getRoot(folder: vscode.Uri): Root | undefined;

	/**
	 * Adds an LSP root to enable language features on documents inside this root.
	 */
	addRoot(folder: vscode.Uri): Root;

	/**
	 * Removes the LSP root if it is not a workspace root folder and if there are no open
	 * documents inside of the root.
	 */
	removeRootIfUnused(folder: vscode.Uri): void;
}

export class Workspace implements vscode.Disposable {

	/**
	 * All known roots. The keys are the URI of the root.
	 */
	private roots = new Map<string, Root>();

	private toDispose: vscode.Disposable[] = [];

	constructor() {
		// Load initial workspace folders as LSP roots so that workspace/symbol, etc.,
		// work across all of them.
		if (vscode.workspace.workspaceFolders) {
			for (const folder of vscode.workspace.workspaceFolders) {
				if (repoExtension.isRepoResource(folder.uri)) {
					this.addRoot(folder.uri, 'initial workspaceFolders');
				}
			}
		}

		// Add/remove LSP roots when workspace roots change.
		this.toDispose.push(vscode.workspace.onDidChangeWorkspaceFolders(e => {
			for (const folder of e.added) {
				if (repoExtension.isRepoResource(folder.uri)) {
					this.addRoot(folder.uri, 'added to workspaceFolders');
				}
			}
			for (const folder of e.removed) {
				this.removeRootIfUnused(folder.uri, 'removed from workspaceFolders');
			}
		}));

		// Load roots of currently visible documents so that language features work in
		// them, even if they are not inside a workspace root.
		for (const editor of vscode.window.visibleTextEditors) {
			if (!editor.document) {
				continue;
			}
			const folder = this.getRootURI(editor.document.uri);
			if (folder && repoExtension.isRepoResource(folder)) {
				this.addRoot(folder, 'initial visibleTextEditors');
			}
		}

		// Add/remove LSP roots when open documents change.
		vscode.workspace.onDidOpenTextDocument(doc => {
			// Wait a second if doc isn't visible to avoid starting sessions each time the
			// user Ctrl/Cmd-hovers (which triggers an open document event).
			const visible = vscode.window.visibleTextEditors.some(editor => editor.document === doc);
			setTimeout(() => {
				if (!visible && vscode.workspace.textDocuments.indexOf(doc) === -1) {
					return; // doc was closed while we waited
				}

				const folder = this.getRootURI(doc.uri);
				if (folder && repoExtension.isRepoResource(folder)) {
					this.addRoot(folder, 'opened document');
				}
			}, visible ? 0 : 1000);
		});
		vscode.workspace.onDidCloseTextDocument(doc => {
			const folder = this.getRootURI(doc.uri);
			if (folder) {
				this.removeRootIfUnused(folder, 'closed document');
			}
		});
	}

	private getRootURI(resource: vscode.Uri): vscode.Uri | undefined {
		return vscode.workspace.findContainingFolder(resource);
	}

	public getRoot(folder: vscode.Uri): Root | undefined {
		return this.roots.get(folder.toString());
	}

	public addRoot(folder: vscode.Uri, reason?: string): Root {
		let root = this.roots.get(folder.toString());
		if (!root) {
			log.outputChannel.appendLine(`Add LSP root: ${folder.toString()} ${reason || ''}`);
			root = new Root(folder);
		}
		this.roots.set(folder.toString(), root);
		return root;
	}

	public removeRootIfUnused(folder: vscode.Uri, reason?: string): void {
		const root = this.roots.get(folder.toString());
		if (!root) {
			return;
		}

		const isWorkspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.some(f => f.uri.toString() === folder.toString());
		const hasOpenDocuments = vscode.workspace.textDocuments.some(doc => root.isInRoot(doc.uri));
		if (!isWorkspaceRoot && !hasOpenDocuments) {
			log.outputChannel.appendLine(`Remove LSP root: ${folder.toString()} ${reason || ''}`);
			this.roots.delete(folder.toString());

			// Delay before disposing our LanguageClient so that it can run its on
			// DidCloseTextDocument event handlers (e.g., to notify the server that the
			// document was closed).
			setTimeout(() => root.dispose(), 500);
		}
	};

	public dispose(): void {
		for (const repo of this.roots.values()) {
			repo.dispose();
		}

		this.toDispose.forEach(disposable => disposable.dispose());
	}
}
