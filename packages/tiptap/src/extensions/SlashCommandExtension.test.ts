import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildSlashItems } from './SlashCommandExtension.js'

describe('SlashCommandExtension built-ins', () => {
  it('always exposes the Table entry', () => {
    const items = buildSlashItems([], [], '', {
      hasUpload: false,
      onInsertImage: () => {},
    })
    const table = items.find((i) => i.key === 'table')
    assert.ok(table, 'expected a "table" slash entry')
    assert.equal(table!.label, 'Table')
    assert.equal(table!.group, 'Insert')
  })

  it('omits the Image entry when no upload adapter is wired', () => {
    const items = buildSlashItems([], [], '', {
      hasUpload: false,
      onInsertImage: () => {},
    })
    const image = items.find((i) => i.key === 'image')
    assert.equal(image, undefined)
  })

  it('surfaces the Image entry when hasUpload is true', () => {
    const items = buildSlashItems([], [], '', {
      hasUpload: true,
      onInsertImage: () => {},
    })
    const image = items.find((i) => i.key === 'image')
    assert.ok(image, 'expected an "image" slash entry when hasUpload')
    assert.equal(image!.label, 'Image')
    assert.equal(image!.group, 'Insert')
  })

  it('Image command fires the onInsertImage callback', () => {
    let calls = 0
    const items = buildSlashItems([], [], '', {
      hasUpload: true,
      onInsertImage: () => { calls += 1 },
    })
    const image = items.find((i) => i.key === 'image')
    // Stand-in editor — the slash command chains through `.deleteRange(...)`
    // before firing the callback. We don't assert on the chain output;
    // confirming `calls === 1` proves the wire is connected.
    const stubChain = {
      focus:        () => stubChain,
      deleteRange:  () => stubChain,
      run:          () => true,
    }
    image!.command({
      editor: { chain: () => stubChain } as never,
      range:  { from: 0, to: 0 } as never,
    })
    assert.equal(calls, 1)
  })

  it('respects the search query against label / searchKey / group', () => {
    const items = buildSlashItems([], [], 'tab', {
      hasUpload: true,
      onInsertImage: () => {},
    })
    assert.ok(items.some((i) => i.key === 'table'),
      'expected `table` to match the "tab" query via label/searchKey')
    assert.equal(items.some((i) => i.key === 'paragraph'), false,
      'expected unrelated entries to drop out of the filtered list')
  })

  it('exposes lead + small entries under the Style group', () => {
    const items = buildSlashItems([], [], '', {
      hasUpload: false,
      onInsertImage: () => {},
    })
    const lead  = items.find((i) => i.key === 'lead')
    const small = items.find((i) => i.key === 'small')
    assert.ok(lead,  'expected a "lead" slash entry')
    assert.ok(small, 'expected a "small" slash entry')
    assert.equal(lead!.group,  'Style')
    assert.equal(small!.group, 'Style')
  })
})
