/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { LanguageClient, WorkspaceSymbolRequest, SymbolInformation } from '@sourcegraph/vscode-languageclient';
import { Language } from './languages';

/**
 * FuzzyDefinitionProvider provides fuzzy jump-to-def results by
 * issuing a workspace/symbol query for the token currently at
 * point. Its accuracy is roughly equivalent (but probably better)
 * than most CTAGS implementations.
 */
export class FuzzyDefinitionProvider implements vscode.DefinitionProvider, vscode.Disposable {

	private toDispose: vscode.Disposable[] = [];

	constructor(
		private lang: Language,
		private root: vscode.Uri,
		private client: LanguageClient,
	) {
		this.register();
	}

	private register() {
		// register each new instance as a definition provider
		const folder = vscode.workspace.findContainingFolder(this.root);
		this.toDispose.push(vscode.languages.registerDefinitionProvider(this.lang.allLanguageIds.map(languageId => ({
			language: languageId,
			scheme: folder.scheme,
			pattern: `${folder.path}/**/*`,
		})), this));
	}

	public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {

		const wr = document.getWordRangeAtPosition(position);
		if (!wr) {
			return [];
		}
		const word = document.getText(wr);

		return this.client.sendRequest(WorkspaceSymbolRequest.type, {
			query: word
		}).then((results: SymbolInformation[]) => {
			return results.filter(r => r.name === word)
				.map(r => {
					const loc = this.client.protocol2CodeConverter.asLocation(r.location);
					return { ...loc, score: 0.5 };
				});
		});
	}

	public dispose(): void {
		this.toDispose.forEach(d => d.dispose());
	}
}
