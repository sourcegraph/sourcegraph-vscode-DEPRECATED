import * as path from 'path'

import { runTests } from '@vscode/test-electron'
import { sys } from 'typescript'

async function main(): Promise<void> {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../')

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './suite/index')

        // Download VS Code, unzip it and run the integration test
        const code = await runTests({ extensionDevelopmentPath, extensionTestsPath })
        sys.exit(code)
    } catch (error) {
        console.error('Failed to run tests', error)
        process.exit(1)
    }
}

main().then(
    () => {},
    () => {}
)