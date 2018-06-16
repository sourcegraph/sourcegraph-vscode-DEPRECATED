/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { extname } from 'path';

/**
 * The release phases for a language.
 */
export enum ReleaseStatus {
	Ignored, // there will probably never be language support (plain text, .ini files, etc.)
	Unsupported, // displays a dismissable error message to the user (with "Don't Show Again")
	Preview, // enabled for users with lsp.previewLanguages == true
	General, // always enabled for all users
}

/**
 * The level of LSP feature coverage of the backend language server
 * for this language.
 */
export enum FeatureCoverage {
	Partial, // only some LSP features are supported
	Full, // all relevant LSP features are supported
}

/**
 * Information about a language that is (or isn't) supported by
 * Sourcegraph.
 */
export interface Language {
	name: string; // human-readable name (e.g., "C++" not "c++")
	extensionId: string; // 'publisher/name' of vscode extension with language definition
	mode?: string; // which backend language server to use (e.g, 'go' or 'typescript')
	releaseStatus: ReleaseStatus;
	featureCoverage?: FeatureCoverage;

	/**
	 * The language contribution information provided by the language's extension.
	 */
	contribution?: ILanguageExtensionPoint;

	/**
	 * A list of all language IDs that should be serviced with this same language
	 * server. For example, getLanguageByFileExtension(".c") would return a Language with
	 * allLanguageIds of ["c", "cpp"] because both C and C++ are handled by the same
	 * language server.
	 */
	allLanguageIds?: string[];
}

/**
 * The type of an extension's contributes.languages entry, taken from vscode.
 */
export interface ILanguageExtensionPoint {
	id: string;
	extensions?: string[];
	filenames?: string[];
	filenamePatterns?: string[];
}

/**
 * The source of truth for information about supported (and
 * unsupported) languages.
 */
const languages: Language[] = [
	{
		name: 'C/C++',
		extensionId: 'vscode.cpp',
		releaseStatus: ReleaseStatus.Unsupported,
	},
	{
		name: 'C#',
		extensionId: 'vscode.csharp',
		releaseStatus: ReleaseStatus.Unsupported,
	},
	{
		name: 'Groovy',
		extensionId: 'vscode.groovy',
		releaseStatus: ReleaseStatus.Unsupported,
	},
	{
		name: 'Go',
		extensionId: 'vscode.go',
		mode: 'go',
		releaseStatus: ReleaseStatus.General,
		featureCoverage: FeatureCoverage.Full,
	},
	{
		name: 'Java',
		extensionId: 'vscode.java',
		mode: 'java',
		releaseStatus: ReleaseStatus.General,
		featureCoverage: FeatureCoverage.Full,
	},
	{
		name: 'JavaScript',
		extensionId: 'vscode.javascript',
		mode: 'javascript',
		releaseStatus: ReleaseStatus.General,
		featureCoverage: FeatureCoverage.Partial,
	},
	{
		name: 'Lua',
		extensionId: 'vscode.lua',
		releaseStatus: ReleaseStatus.Unsupported,
	},
	{
		name: 'Objective-C',
		extensionId: 'vscode.objective-c',
		releaseStatus: ReleaseStatus.Unsupported,
	},
	{
		name: 'PHP',
		extensionId: 'vscode.php',
		mode: 'php',
		releaseStatus: ReleaseStatus.General,
		featureCoverage: FeatureCoverage.Partial,
	},
	{
		name: 'Perl',
		extensionId: 'vscode.perl',
		releaseStatus: ReleaseStatus.Unsupported,
	},
	{
		name: 'Python',
		extensionId: 'vscode.python',
		mode: 'python',
		releaseStatus: ReleaseStatus.General,
		featureCoverage: FeatureCoverage.Partial,
	},
	{
		name: 'R',
		extensionId: 'vscode.r',
		releaseStatus: ReleaseStatus.Unsupported,
	},
	{
		name: 'Ruby',
		extensionId: 'vscode.ruby',
		releaseStatus: ReleaseStatus.Unsupported,
	},
	{
		name: 'Rust',
		extensionId: 'vscode.rust',
		releaseStatus: ReleaseStatus.Unsupported,
	},
	{
		name: 'SQL',
		extensionId: 'vscode.sql',
		releaseStatus: ReleaseStatus.Unsupported,
	},
	{
		name: 'Swift',
		extensionId: 'vscode.swift',
		mode: 'swift',
		releaseStatus: ReleaseStatus.General,
		featureCoverage: FeatureCoverage.Partial,
	},
	{
		name: 'TypeScript',
		extensionId: 'vscode.typescript',
		mode: 'typescript',
		releaseStatus: ReleaseStatus.General,
		featureCoverage: FeatureCoverage.Full,
	},
];

interface ILanguageExtension {
	packageJSON: { contributes: { languages: ILanguageExtensionPoint[] } };
}

const languagesById = new Map<string, Language | undefined>();

/**
* Returns the language with the given languageId. Some languages have
* multiple languageIds (e.g., TypeScript has both 'typescript' and
* 'typescriptreact' for two different syntax variants).
*/
export function getLanguage(languageId: string): Language | undefined {
	if (languagesById.has(languageId)) { return languagesById.get(languageId); }

	for (let i = 0; i < languages.length; i++) {
		const ext: ILanguageExtension = vscode.extensions.getExtension(languages[i].extensionId);
		for (let j = 0; j < ext.packageJSON.contributes.languages.length; j++) {
			if (ext.packageJSON.contributes.languages[j].id === languageId) {
				const lang = createLanguage(languages[i], ext.packageJSON.contributes.languages[j]);
				languagesById.set(languageId, lang);
				return lang;
			}
		}
	}
	languagesById.set(languageId, undefined);
	return undefined;
}

const languagesByFileExtension = new Map<string, Language | undefined>();

/**
* Returns the language contribution for the given file extension (which should include the
* leading ".").
*/
export function getLanguageForResource(resource: vscode.Uri): Language | undefined {
	const fileExtension = extname(resource.path);
	if (languagesByFileExtension.has(fileExtension)) { return languagesByFileExtension.get(fileExtension); }

	for (let i = 0; i < languages.length; i++) {
		const ext: ILanguageExtension = vscode.extensions.getExtension(languages[i].extensionId);
		for (let j = 0; j < ext.packageJSON.contributes.languages.length; j++) {
			if (ext.packageJSON.contributes.languages[j].extensions && ext.packageJSON.contributes.languages[j].extensions.indexOf(fileExtension) !== -1) {
				const lang = createLanguage(languages[i], ext.packageJSON.contributes.languages[j]);
				languagesById.set(ext.packageJSON.contributes.languages[j].id, lang);
				languagesByFileExtension.set(fileExtension, lang);
				return lang;
			}
		}
	}
	languagesByFileExtension.set(fileExtension, undefined);
	return undefined;
}

function createLanguage(language: Language, contribution: ILanguageExtensionPoint): Language {
	return {
		...language,
		contribution,
		allLanguageIds: (vscode.extensions.getExtension(language.extensionId) as ILanguageExtension).packageJSON.contributes.languages.map(lang => lang.id),
	};
}

/**
 * Reports whether LSP should be enabled for the current user for a
 * file in the given language.
 */
export function isEnabled(lang: Language): boolean {
	return !!lang;
}
