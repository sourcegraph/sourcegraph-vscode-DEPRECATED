/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TextDocumentPositionParams, TextDocumentRegistrationOptions, Location as LSPLocation } from '@sourcegraph/vscode-languageclient/lib/client';
import { RequestType, RequestTypeWithStreamingResponse } from '@sourcegraph/vscode-jsonrpc';

/**
 * SymbolDescriptor represents information about a programming construct like a
 * variable, class, interface, etc that has a reference to it. It is up to the
 * language server to define the schema of this object.
 *
 * SymbolDescriptor usually uniquely identifies a symbol, but it is not
 * guaranteed to do so.
 * export type SymbolDescriptor = { [key: string]: any };
 */
export type SymbolDescriptor = { [key: string]: any };

/**
 *  SymbolLocationInformation is the response type for the `textDocument/xdefinition` extension.
 */
export interface SymbolLocationInformation {
	location?: LSPLocation;
	symbol: SymbolDescriptor;
}

export namespace TextDocumentXDefinitionRequest {
	export const type = new RequestType<TextDocumentPositionParams, SymbolLocationInformation[], void, TextDocumentRegistrationOptions>('textDocument/xdefinition');
}

/**
* WorkspaceReferencesParams is parameters for the `workspace/xreferences`
* extension. See: https://github.com/sourcegraph/language-server-protocol/blob/master/extension-workspace-reference.md
*/
export interface WorkspaceReferencesParams {
	query: SymbolDescriptor;
	hints?: { [key: string]: any };
	limit?: number;
}

export interface ReferenceInformation {
	reference: LSPLocation;
	symbol: SymbolDescriptor;
}

export namespace WorkspaceXReferencesRequest {
	export const type = new RequestTypeWithStreamingResponse<WorkspaceReferencesParams, ReferenceInformation[], ReferenceInformation[], void, TextDocumentRegistrationOptions>('workspace/xreferences');
}
