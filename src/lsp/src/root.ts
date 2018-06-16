/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { LanguageClient } from '@sourcegraph/vscode-languageclient';
import { Language, getLanguage, getLanguageForResource, isEnabled } from './languages';
import { newClient } from './client';
import { MultiWorkspaceProvider } from './multiWorkspace';
import { FuzzyDefinitionProvider } from './fuzzyDefinition';
import { repoExtension } from './main';
import { IRepository } from '../../repo/src/api';
import * as log from './log';

/**
 * Per-workspace root folder state.
 */
export class Root {

	/**
	 * All active language clients for this root, keyed on the mode of the server.
	 */
	private modeClients = new Map<string, LanguageClient>();

	private repo: IRepository;

	/**
	 * Things that should be disposed when the root is reset (i.e., when the revision of
	 * its underlying source control changes and we need to reinitialize LSP clients).
	 */
	private toDisposeOnReset: vscode.Disposable[] = [];

	private toDispose: vscode.Disposable[] = [];

	constructor(
		/**
		 * The root resource (e.g., "repo://github.com/foo/bar").
		 */
		public readonly resource: vscode.Uri,
	) {
		this.repo = repoExtension.getRepository(resource);

		this.activate();

		this.registerListeners();
	}

	private registerListeners(): void {
		// Activate the language client for new documents when they are opened.
		vscode.workspace.onDidOpenTextDocument(doc => {
			if (this.isInRoot(doc.uri)) {
				this.ensureResourceActivated(doc);
			}
		}, null, this.toDispose);

		// If the revision changed, we need to kill the LSP clients because the
		// revision is specified immutable in our LSP initialization request.
		let lastRevision: vscode.SCMRevision | undefined;
		this.repo.onDidChangeStatus(() => {
			if (!revisionsEqual(lastRevision, this.repo.revision)) {
				this.deactivate();
			}
			if (this.repo.revision.id) {
				this.activate();
			}
			lastRevision = this.repo.revision;
		});
	}

	/**
	 * Starts language servers for all auto-detected languages represented in files in
	 * this root.
	 */
	private activate(): Thenable<void> {
		return this.repo.resolvedRevision.then<any>(() => {
			// Search the workspace for file types to know what to activate. This lets us
			// start initializing language features when the user first loads a workspace, not
			// just when they view a file, which reduces perceived load time. It also makes
			// workspace/symbols work before a file is open.
			//
			// NOTE(sqs): This currently searches *all* roots in the workspace each
			// time. There is no way to limit the search to a specific root. But the other
			// roots are already cached (probably), so this is not a big problem.
			const activateFound = vscode.workspace.findFiles('**/*', undefined, 250)
				.then(resources =>
					Promise.all(
						resources.filter(resource => this.isInRoot(resource))
							.map(resource => this.ensureResourceActivated(resource))
					)
				);

			// Activate language clients for documents open in this root. This lets us start
			// initializing language features for a specific document before our
			// workspace-wide search above (which might take a few seconds) has finished.
			const activateOpen = Promise.all(
				vscode.workspace.textDocuments
					.filter(doc => this.isInRoot(doc.uri))
					.map(doc => this.ensureResourceActivated(doc))
			);

			return Promise.all<any>([activateFound, activateOpen]);
		});
	}

	/**
	 * Returns whether the resource is at or inside this root.
	 */
	public isInRoot(uri: vscode.Uri): boolean {
		const folder = vscode.workspace.findContainingFolder(uri);
		return folder && folder.toString() === this.resource.toString();
	}

	/**
	 * Called when a document or other resource underneath this root's folder was
	 * activated (opened, focused, etc.). It ensures that the language client for the
	 * resource is activated.
	 */
	private ensureResourceActivated(arg: vscode.TextDocument | vscode.Uri): Thenable<void> {
		let resource: vscode.Uri;
		let lang: Language;
		if (arg instanceof vscode.Uri) {
			resource = arg;
			lang = getLanguageForResource(arg);
		} else {
			resource = arg.uri;
			lang = getLanguage(arg.languageId);
		}

		if (!this.isInRoot(resource)) {
			throw new Error(`unable to activate language client for resource ${resource.toString()} not in root ${this.resource.toString()}`);
		}

		return this.ensureLanguageActivated(lang) as Thenable<any>;
	}

	/**
	 * Ensures that the language client for the language and root is connected and ready.
	 */
	public ensureLanguageActivated(lang: Language): Thenable<LanguageClient | undefined> {
		if (!isEnabled(lang)) {
			return Promise.resolve(undefined);
		}

		return this.repo.resolvedRevision.then(revision => {
			let client: LanguageClient;
			let created = false;
			if (this.modeClients.has(lang.mode)) {
				// Client already exists.
				client = this.modeClients.get(lang.mode);
			} else {
				// Create new client.
				client = newClient(lang.mode, lang.allLanguageIds, this.resource, revision.id);
				created = true;
				this.modeClients.set(lang.mode, client);
				this.toDisposeOnReset.push(client.start());

				// Initialize cross-repo and fuzzy support.
				this.toDisposeOnReset.push(new MultiWorkspaceProvider(lang, this.resource, client));
				this.toDisposeOnReset.push(new FuzzyDefinitionProvider(lang, this.resource, client));
			}

			return client.onReady().then(
				() => client,
				err => {
					if (created) {
						log.outputChannel.appendLine(`Error activating LSP root ${lang.mode} for ${this.resource.toString()}: ${err}.`);
					}
					return undefined;
				},
			);
		});
	}

	/**
	 * Deactivates all active language clients.
	 */
	private deactivate(): void {
		this.toDisposeOnReset.forEach(disposable => disposable.dispose());
		this.toDisposeOnReset = [];
		this.modeClients.clear();
	}

	public dispose(): void {
		this.toDisposeOnReset.forEach(disposable => disposable.dispose());
		this.toDispose.forEach(disposable => disposable.dispose());
	}
}

function revisionsEqual(a: vscode.SCMRevision | undefined, b: vscode.SCMRevision | undefined): boolean {
	return (!a && !b) ||
		(a && b && a.rawSpecifier === b.rawSpecifier && a.specifier === b.specifier && a.id === b.id);
}
