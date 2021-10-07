/**
 * Renders the 'application/sourcegraph-location' MIME type for Sourcegraph Notebooks
 *
 * This file is intentionally written in JavaScript (not TypeScript) so that it
 * can be used un-processed (no compilation) by the VS Code Notebook renderer API.
 *
 * @see https://code.visualstudio.com/api/extension-guides/notebook#notebook-renderer
 * @param {vscode-notebook-renderer.RendererContext<TState>} context
 * @returns {vscode-notebook-renderer.RendererApi}
 */
export const activate = context => ({
  renderOutputItem(data /* vscode-notebook-renderer.OutputItem */, element /* HTMLElement */) {
    if (!context.postMessage) {
      return
    }
    element.innerHTML = data.json().html
    const elements = document.querySelectorAll(`.sourcegraph-location`)
    for (const element of elements) {
      element.addEventListener('click', () => {
        context.postMessage({
          request: 'openEditor',
          uri: element.id,
        })
      })
    }
  },
})
