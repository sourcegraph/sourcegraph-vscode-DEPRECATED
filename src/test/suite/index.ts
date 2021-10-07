import path from 'path'
import Mocha from 'mocha'
import glob from 'glob'

export function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 15000, // large timeout since these tests do remote calls
    })

    const testsRoot = path.resolve(__dirname, '..')

    return new Promise((resolve, reject) => {
        glob('**/**.test.js', { cwd: testsRoot }, (error, files) => {
            if (error) {
                return reject(error)
            }

            // Add files to the test suite
            for (const file of files) {
                mocha.addFile(path.resolve(testsRoot, file))
            }

            try {
                // Run the mocha test
                mocha.run(failures => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`))
                    } else {
                        resolve()
                    }
                })
            } catch (error) {
                console.error(error)
                if (error instanceof Error) {
                    reject(error)
                }
                reject(new Error(JSON.stringify(error)))
            }
        })
    })
}
