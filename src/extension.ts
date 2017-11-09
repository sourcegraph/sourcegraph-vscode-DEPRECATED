"use strict";
import * as vscode from "vscode";

const opn = require("opn");
const execa = require("execa");
const url = require("url");
const path = require("path");

const VERSION = "v1.0.9";

// gitRemotes returns the names of all git remotes, e.g. ["origin", "foobar"]
async function gitRemotes(repoDir: string) {
  return execa("git", ["remote"], { cwd: repoDir }).then(result => {
    return result.stdout.split("\n");
  });
}

// gitRemoteURL returns the remote URL for the given remote name.
// e.g. "origin" -> "git@github.com:foo/bar"
async function gitRemoteURL(repoDir: string, remoteName: string) {
  return execa("git", ["remote", "get-url", remoteName], {
    cwd: repoDir
  }).then(result => {
    return result.stdout;
  });
}

// gitDefaultRemoteURL returns the remote URL of the first Git remote found.
async function gitDefaultRemoteURL(repoDir: string) {
  const remotes = await gitRemotes(repoDir);
  if (remotes.length == 0) {
    return Promise.reject("no configured git remotes");
  }
  if (remotes.length > 1) {
    console.log("using first git remote:", remotes[0]);
  }
  return gitRemoteURL(repoDir, remotes[0]);
}

// gitRootDir returns the repository root directory for any directory within the
// repository.
async function gitRootDir(repoDir: string) {
  return execa("git", ["rev-parse", "--show-toplevel"], {
    cwd: repoDir
  }).then(result => {
    return result.stdout;
  });
}

// gitBranch returns either the current branch name of the repository OR in all
// other cases (e.g. detached HEAD state), it returns "HEAD".
async function gitBranch(repoDir: string) {
  return execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoDir
  }).then(result => {
    return result.stdout;
  });
}

function sourcegraphURL() {
  // Support old "URL" key or new "url" key.
  const url =
    vscode.workspace.getConfiguration("sourcegraph").get<string>("url") ||
    vscode.workspace.getConfiguration("sourcegraph").get<string>("URL");
  if (!url.endsWith("/")) {
    return url + "/";
  }
  return url;
}

// repoInfo returns the Sourcegraph repository URI, and the file path relative
// to the repository root. If the repository URI cannot be determined, empty
// strings are returned.
async function repoInfo(fileName: string) {
  let remoteURL = "";
  let branch = "";
  let fileRel = "";
  try {
    // Determine repository root directory.
    const fileDir = path.dirname(fileName);
    const repoRoot = await gitRootDir(fileDir);

    // Determine file path, relative to repository root.
    fileRel = fileName.slice(repoRoot.length + 1);
    remoteURL = await gitDefaultRemoteURL(repoRoot);
    branch = await gitBranch(repoRoot);
  } catch (e) {
    console.log("repoInfo:", e);
  }
  return [remoteURL, branch, fileRel];
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
    const [remoteURL, branch, fileRel] = await repoInfo(
      editor.document.uri.fsPath
    );
    if (remoteURL == "") {
      return;
    }

    // Open in browser.
    opn(
      `${sourcegraphURL()}-/editor` +
        `?remote_url=${encodeURIComponent(remoteURL)}` +
        `&branch=${encodeURIComponent(branch)}` +
        `&file=${encodeURIComponent(fileRel)}` +
        `&editor=${encodeURIComponent("VSCode")}` +
        `&version=${encodeURIComponent(VERSION)}` +
        `&start_row=${encodeURIComponent(
          String(editor.selection.start.line)
        )}` +
        `&start_col=${encodeURIComponent(
          String(editor.selection.start.character)
        )}` +
        `&end_row=${encodeURIComponent(String(editor.selection.end.line))}` +
        `&end_col=${encodeURIComponent(String(editor.selection.end.character))}`
    );
  } catch (e) {
    showError(e);
  }
}

// searchCommand is the command implementation for searching a cursor selection
// on Sourcegraph.
async function searchCommand(editor: vscode.TextEditor) {
  editor = vscode.window.activeTextEditor;
  try {
    const [remoteURL, branch, fileRel] = await repoInfo(
      editor.document.uri.fsPath
    );

    const query = editor.document.getText(editor.selection);
    if (query == "") {
      return; // nothing to query
    }

    // Search in browser.
    opn(
      `${sourcegraphURL()}-/editor` +
        `?remote_url=${encodeURIComponent(remoteURL)}` +
        `&branch=${encodeURIComponent(branch)}` +
        `&file=${encodeURIComponent(fileRel)}` +
        `&editor=${encodeURIComponent("VSCode")}` +
        `&version=${encodeURIComponent(VERSION)}` +
        `&search=${encodeURIComponent(query)}`
    );
  } catch (e) {
    showError(e);
  }
}

// activate is called when the extension is activated.
export function activate(context: vscode.ExtensionContext) {
  // Register our extension commands (see package.json).
  context.subscriptions.push(
    vscode.commands.registerCommand("extension.open", openCommand)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("extension.search", searchCommand)
  );
}

export function deactivate() {
  // no-op
}
