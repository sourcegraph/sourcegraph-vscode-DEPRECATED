'use strict';
import * as vscode from 'vscode';

const opn = require('opn');
const execa = require('execa');
const url = require('url');
const path = require('path');

const VERSION = "v1.0.2"

// gitRemotes returns the names of all git remotes, e.g. ["origin", "foobar"]
async function gitRemotes(repoDir: string) {
    return execa("git", ["remote"], { cwd: repoDir }).then(result => {
        return result.stdout.split("\n")
    });
}

// gitRemoteURL returns the remote URL for the given remote name.
// e.g. "origin" -> "git@github.com:foo/bar"
async function gitRemoteURL(repoDir: string, remoteName: string) {
    return execa("git", ["remote", "get-url", remoteName], { cwd: repoDir }).then(result => {
        return result.stdout
    });
}

// gitDefaultRemoteURL returns the remote URL of the first Git remote found.
async function gitDefaultRemoteURL(repoDir: string) {
    const remotes = await gitRemotes(repoDir)
    if (remotes.length == 0) {
        return Promise.reject("no configured git remotes")
    }
    if (remotes.length > 1) {
        console.log("using first git remote:", remotes[0])
    }
    return gitRemoteURL(repoDir, remotes[0])
}

// gitRootDir returns the repository root directory for any directory within the
// repository.
async function gitRootDir(repoDir: string) {
    return execa("git", ["rev-parse", "--show-toplevel"], { cwd: repoDir }).then(result => {
        return result.stdout
    });
}

// gitBranch returns either the current branch name of the repository OR in all
// other cases (e.g. detached HEAD state), it returns "HEAD".
async function gitBranch(repoDir: string) {
    return execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoDir }).then(result => {
        return result.stdout
    });
}

// removePrefixes removes any of the given prefixes from the input string `s`.
// Only one prefix is removed.
function removePrefixes(s: string, prefixes: string[]) {
    prefixes.every((prefix) => {
        if (s.startsWith(prefix)) {
            s = s.slice(prefix.length)
            return false
        }
        return true
    })
    return s
}

// replaceLastOccurrence returns `s` with the last occurrence of `a` replaced by
// `b`.
function replaceLastOccurrence(s: string, a: string, b: string) {
    const k = s.lastIndexOf(a)
    if (k === -1) { return s }
    return s.slice(0, k) + b + s.slice(k + 1)
}

// repoFromRemoteURL returns the repository name from the remote URL. An
// exception is raised if it cannot be determined. Supported formats are:
//
// 	optional("ssh://" OR "git://" OR "https://" OR "https://")
// 	+ optional("username") + optional(":password") + optional("@")
// 	+ "github.com"
// 	+ "/" OR ":"
// 	+ "<organization>" + "/" + "<username>"
//
function repoFromRemoteURL(remoteURL: string) {
    // Normalize all URL schemes into "http://" just for parsing purposes. We
    // don't actually care about the scheme itself.
    let r = removePrefixes(remoteURL, ["ssh://", "git://", "https://", "http://"])

    // Normalize github.com:foo/bar -> github.com/foo/bar -- Note we only do the
    // last occurrence as it may be included earlier in the case of 'foo:bar@github.com'
    r = replaceLastOccurrence(r, ":", "/")

    const u = url.parse("http://" + r)
    if (!u.host.endsWith("github.com")) { // Note: using endswith because netloc may have 'username:password@' prefix.
        throw new Error("repository remote is not github.com: " + remoteURL)
    }
    return "github.com" + u.path
}

function sourcegraphURL() {
    const url = vscode.workspace.getConfiguration("sourcegraph").get<string>("URL");
    if (!url.endsWith("/")) {
        return url + "/";
    }
    return url
}

function lineHash(s: vscode.Selection) {
    if (s.isEmpty) {
        return `L${s.start.line + 1}:${s.start.character + 1}`
    }
    return `L${s.start.line + 1}:${s.start.character + 1}-${s.end.line + 1}:${s.end.character + 1}`
}

function branchStr(branch: string) {
    if (branch === "HEAD") {
        return "" // Detached head state
    }
    if (branch === "master") {
        // Assume master is the default branch, for now.
        return ""
    }
    return "@" + branch
}

// repoInfo returns the Sourcegraph repository URI, and the file path relative
// to the repository root. If the repository URI cannot be determined, an
// exception is thrown.
async function repoInfo(fileName: string) {
    // Determine repository root directory.
    const fileDir = path.dirname(fileName)
    const repoRoot = await gitRootDir(fileDir)

    // Determine file path, relative to repository root.
    const fileRel = fileName.slice(repoRoot.length + 1)
    const repo = repoFromRemoteURL(await gitDefaultRemoteURL(repoRoot))
    const branch = await gitBranch(repoRoot)
    return [repo, branch, fileRel]
}

// showError displays an error message to the user.
function showError(err: Error): void {
    vscode.window.showErrorMessage(err.message);
}

// openCommand is the command implementation for opening a cursor selection on
// Sourcegraph.
async function openCommand(editor: vscode.TextEditor) {
    editor = vscode.window.activeTextEditor;
    try {
        const [repo, branch, fileRel] = await repoInfo(editor.document.uri.fsPath)

        // Open in browser.
        opn(`${sourcegraphURL()}${repo}${branchStr(branch)}/-/blob/${fileRel}?utm_source=VSCode-${VERSION}#${lineHash(editor.selection)}`)
    } catch (e) {
        showError(e);
    }
}

// searchCommand is the command implementation for searching a cursor selection
// on Sourcegraph.
async function searchCommand(editor: vscode.TextEditor) {
    editor = vscode.window.activeTextEditor;
    try {
        const query = editor.document.getText(editor.selection);
        if (query == "") {
            return // nothing to query
        }

        // Search in browser.
        opn(`${sourcegraphURL()}search?q=${encodeURIComponent(query)}&utm_source=VSCode-${VERSION}`)
    } catch (e) {
        showError(e);
    }
}

// activate is called when the extension is activated.
export function activate(context: vscode.ExtensionContext) {
    // Register our extension commands (see package.json).
    context.subscriptions.push(vscode.commands.registerCommand('extension.open', openCommand));
    context.subscriptions.push(vscode.commands.registerCommand('extension.search', searchCommand));
}

export function deactivate() {
    // no-op
}