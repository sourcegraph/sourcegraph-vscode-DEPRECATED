# LSP extension

The LSP extension provides language support by communicating with backend language servers on a remote server. It also shows messages when the user views a file using an unsupported language.

Its vscode-languageclient dep is built from the github.com/sourcegraph/vscode-languageserver-node `patch` branch.

## Add a new language

1. Add the vscode extension for syntax highlighting for this language. For example, to add Python, you'd add `'python'` to the `builinExtensions` array in `extensionPoints.ts` (and you can also add it to `noLoadModules` because we only need to use its syntax highlighting, not its other modules, which don't run in the browser). Note that this change is outside of this extension.
1. Add or update the `src/languages.ts` file's `languages` array.
