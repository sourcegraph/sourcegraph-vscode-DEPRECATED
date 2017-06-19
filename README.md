# Sourcegraph for VS Code [![visual_studio_code](https://rawgit.com/aleen42/badges/master/src/visual_studio_code.svg)](https://marketplace.visualstudio.com/items?itemName=sourcegraph.sourcegraph)

The Sourcegraph extension for VS Code enables you to quickly open and search code on Sourcegraph.com easily and efficiently.

## Installation

1. Open the extensions tab on the left side of VS Code (<kbd>Cmd+Shift+X</kbd> or <kbd>Ctrl+Shift+X</kbd>).
2. Search for `Sourcegraph` -> `Install` and `Reload`.


## Usage

In the command palette (`Cmd+Shift+P` or `Ctrl+Shift+P`), search for `Sourcegraph:` to see available actions.

Keyboard Shortcuts:

| Description                     | Mac                 | Linux / Windows  |
|---------------------------------|---------------------|------------------|
| Open file in Sourcegraph        | <kbd>Option+A</kbd> | <kbd>Alt+A</kbd> |
| Search selection in Sourcegraph | <kbd>Option+S</kbd> | <kbd>Alt+S</kbd> |


## Extension Settings

This extension contributes the following settings:

* `sourcegraph.URL`: The Sourcegraph instance to use. Specify your on-premises Sourcegraph instance here, if applicable.


## Questions & Feedback

Please file an issue: https://github.com/sourcegraph/sourcegraph-vscode/issues/new


## Uninstallation

1. Open the extensions tab on the left side of VS Code (<kbd>Cmd+Shift+X</kbd> or <kbd>Ctrl+Shift+X</kbd>).
2. Search for `Sourcegraph` -> Gear icon -> `Uninstall` and `Reload`.


## Development

To develop the extension:

- `git clone` the repository somewhere
- Run `npm install` in the directory
- Open the repo with `code .`
- Press <kbd>F5</kbd> to open a new VS Code window with the extension loaded.
- After making changes to `src/extension.ts`, reload the window by clicking the reload icon in the debug toolbar or with <kbd>F5</kbd>.
- To release a new version:
  1. Update `README.md` (describe ALL changes)
  2. Update `CHANGELOG.md` (copy from README.md change above)
  3. Update `src/extension.ts` (`VERSION` constant)
  4. Publish on the VS Code store by following https://code.visualstudio.com/docs/extensions/publish-extension (contact @slimsag or @lindaxie for access)
    - `vsce login sourcegraph` (see also https://marketplace.visualstudio.com/manage/publishers/sourcegraph)
    - `cd sourcegraph-vscode` and `vsce publish <major|minor|patch>`
  7. `git add . && git commit -m "all: release v<THE VERSION>" && git push`
  8. `git tag v<THE VERSION> && git push --tags`


## Version History

- v1.0.8 - Added back and fixed search functionality.
- v1.0.5 - Temporarily removed broken search functionality.
- v1.0.0 - Initial Release; basic Open File functionality.
