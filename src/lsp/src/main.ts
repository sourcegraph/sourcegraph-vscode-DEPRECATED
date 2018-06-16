/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { activateLSP } from './client';
import { IRepoExtension } from '../../repo/src/api';
import { Workspace, IWorkspace } from './workspace';

/**
 * The 'repo' extension's public API, guaranteed to be set before we call into other file's
 * functions in our activate function.
 */
export let repoExtension: IRepoExtension;

/**
 * The global LSP workspace, consisting of all LSP roots. See the IWorkspace documentation
 * for how this differs from the VS Code workspace root folders.
 */
export let lspWorkspace: IWorkspace;

export function activate(context: vscode.ExtensionContext): void {
	vscode.extensions.getExtension<IRepoExtension>('sourcegraph.repo').activate().then(ext => {
		repoExtension = ext;

		lspWorkspace = new Workspace();

		context.subscriptions.push(activateLSP());
	});
}
