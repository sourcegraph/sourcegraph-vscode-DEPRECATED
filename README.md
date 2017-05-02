# Sourcegraph for VS Code

The Sourcegraph extension for VS Code enables you to quickly open and search code on Sourcegraph.com easily and efficiently.

## Installation

1. Open the extensions tab on the left side of VS Code.
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

Please file an issue: https://github.com/sourcegraph/sourcegraph-sublime/issues/new


## Uninstallation

1. Open the extensions tab on the left side of VS Code.
2. Search for `Sourcegraph` -> Gear icon -> `Uninstall` and `Reload`.


## Development

To develop the extension:

- `git clone` the repository somewhere and open it with `code .`.
- Press <kbd>F5</kbd> to open a new VS Code window with the extension loaded.
- After making changes to `src/extension.ts`, reload the window by clicking the reload icon in the debug toolbar or with <kbd>F5</kbd>.
- To release a new version, you MUST update the following files:
  1. `README.md` (describe ALL changes)
  2. `CHANGELOG.md` (copy rom README.md change above)
  3. `src/extension.ts` (`VERSION` constant)
  - Then `git commit -m "all: release v<THE VERSION>` and `git push` and `git tag v<THE VERSION>` and `git push --tags`.


## Version History

- v1.0.0 - Initial Release; basic Open File & Search functionality.
