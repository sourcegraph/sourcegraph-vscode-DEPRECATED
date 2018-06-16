/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import 'isomorphic-fetch';

export interface IDependencyReference {
	dependencyData: string;
	repoId: number;
	hints: string;
}

export interface IDependencyReferences {
	dependencyReferenceData: IDependencyReferencesData;
	repoData: IRepoDataMap;
}

export interface IDependencyReferencesData {
	references: Array<IDependencyReference>;
	location: IDepLocation;
}

export interface IDepLocation {
	location: string;
	symbol: string;
}

export interface IRepoDataMap {
	repos: Array<IRepository>;
	repoIds: Array<number>;
}

export interface IRepository {
	// Limited set of fields
	id: string;
	uri: string;
	lastIndexedRevOrLatest: ICommitState;
}

export interface ICommitState {
	commit: ICommit | null;
}

export interface ICommit {
	sha1: string;
}

export interface Vars {
	repo: string;
	rev: string;
	path: string;
	mode: string;
	line: number;
	character: number;
}

export interface Dependent {
	workspace: vscode.Uri;
	hints: { [key: string]: any };
}

/**
 * Returns a list of workspaces that have references to the symbol represented in Vars.
 * Vars may point to any reference token of a symbol, it does not need to be resolved to the definition of the symbol.
 */
export function listDependents(vars: Vars): Thenable<Dependent[]> {
	return queryDependencyReferences(vars).then(data => {
		if (!data || !data.repoData.repos) { return []; }
		const idToRepo = (id: number): IRepository => {
			const i = data.repoData.repoIds.indexOf(id);
			if (i === -1) { throw new Error('repo id not found'); }
			return data.repoData.repos[i];
		};

		return data.dependencyReferenceData.references.map(ref => {
			const repo = idToRepo(ref.repoId);
			const commit = repo.lastIndexedRevOrLatest.commit;
			const workspace = commit ? vscode.Uri.parse(`repo+version://${repo.uri}?${repo.lastIndexedRevOrLatest.commit.sha1}`) : undefined;
			return {
				workspace,
				hints: ref.hints ? JSON.parse(ref.hints) : {},
			};
		}).filter(dep => dep.workspace);
	});
}

function queryDependencyReferences(vars: Vars): Thenable<IDependencyReferences> {
	const query = `
query DependencyReferences($repo: String, $rev: String, $mode: String, $line: Int, $character: Int) {
	root {
		repository(uri: $repo) {
			commit(rev: $rev) {
				commit {
					file(path: $path) {
						dependencyReferences(Language: $mode, Line: $line, Character: $character) {
							dependencyReferenceData {
								references {
									dependencyData
									repoId
									hints
								}
								location {
									location
									symbol
								}
							}
							repoData {
								repos {
									id
									uri
									lastIndexedRevOrLatest {
										commit {
											sha1
										}
									}
								}
								repoIds
							}
						}
					}
				}
			}
		}
	}
}`;
	return fetchGQL<any>(query, vars, 'dependencyReferences').then(resp => {
		const root = resp.data.root;
		if (!root.repository ||
			!root.repository.commit ||
			!root.repository.commit.commit ||
			!root.repository.commit.commit.file ||
			!root.repository.commit.commit.file.dependencyReferences ||
			!root.repository.commit.commit.file.dependencyReferences.repoData ||
			!root.repository.commit.commit.file.dependencyReferences.dependencyReferenceData ||
			!root.repository.commit.commit.file.dependencyReferences.dependencyReferenceData.references.length) {
			return null;
		}
		return root.repository.commit.commit.file.dependencyReferences as IDependencyReferences;
	});
}

function fetchGQL<T>(query: string, variables: { [name: string]: any }, caller: string): Thenable<T> {
	const endpoint = vscode.workspace.getConfiguration('remote').get<string>('endpoint');
	return fetch(`${endpoint}/.api/graphql?${caller}`, { method: 'POST', body: JSON.stringify({ query, variables }) })
		.then(resp => resp.json() as Thenable<T>);
}
