import assert from 'assert'
import { MarkdownFile } from './MarkdownFile'

function checkRoundtrip(name: string, input: string) {
    it(name, () => {
        const original = input.replace(/'''/g, '```')
        const file = MarkdownFile.parseContent(original)
        const obtained = file.renderAsString()
        assert.deepStrictEqual(obtained, original)
    })
}

describe('MarkdownFile', () => {
    checkRoundtrip(
        'basic',
        `This is markdown
'''sourcegraph
lang:go Indexer
'''
This is after
'''go
const x = 42
'''
`
    )

    checkRoundtrip(
        'no-closing-backticks',
        `This is markdown
'''sourcegraph
lang:go Indexer

Hello
`
    )
})
