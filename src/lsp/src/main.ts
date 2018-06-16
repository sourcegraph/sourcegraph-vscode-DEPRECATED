/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { newClient } from './client';
import * as log from './log';

export function activate(context: vscode.ExtensionContext): void {
	// ids (shellscript) come from https://code.visualstudio.com/docs/languages/identifiers
	const client = newClient('bash', ['shellscript'], vscode.Uri.parse('repo://github.com/LUSHDigital/modelgen#install.sh'), '7347947f32ac85b435217c04172153814b8c48d2');

	client.start()

	client.onReady().then(
		() => {
			console.log('hi');
		},
		err => {
				log.outputChannel.appendLine(`Error activating LSP root: ${err}.`)
		}
	)
}
