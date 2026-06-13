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

  it('omits the align / lead / small / clear-format entries (toolbar-only)', () => {
    const items = buildSlashItems([], [], '', {
      hasUpload: false,
      onInsertImage: () => {},
    })
    // These stay reachable via the toolbar buttons, but were removed from the
    // slash menu to keep it focused on real content blocks (issues #151/#152).
    for (const key of ['align-left', 'align-center', 'align-right', 'lead', 'small', 'clear-format']) {
      assert.equal(items.some((i) => i.key === key), false,
        `expected "${key}" to be absent from the slash menu`)
    }
  })

  it('always exposes the Details entry under the Insert group', () => {
    const items = buildSlashItems([], [], '', {
      hasUpload: false,
      onInsertImage: () => {},
    })
    const details = items.find((i) => i.key === 'details')
    assert.ok(details, 'expected a "details" slash entry')
    assert.equal(details!.label, 'Collapsible block')
    assert.equal(details!.group, 'Insert')
  })

  it('Details search matches "collapsible" / "summary" / "toggle"', () => {
    for (const q of ['collapsible', 'summary', 'toggle']) {
      const items = buildSlashItems([], [], q, {
        hasUpload: false,
        onInsertImage: () => {},
      })
      assert.ok(
        items.some((i) => i.key === 'details'),
        `expected the Details entry to match search query "${q}"`,
      )
    }
  })

  it('exposes Two-column and Three-column grid entries under Insert', () => {
    const items = buildSlashItems([], [], '', {
      hasUpload: false,
      onInsertImage: () => {},
    })
    const two   = items.find((i) => i.key === 'grid-2')
    const three = items.find((i) => i.key === 'grid-3')
    assert.ok(two,   'expected a "grid-2" slash entry')
    assert.ok(three, 'expected a "grid-3" slash entry')
    assert.equal(two!.label,   'Two-column grid')
    assert.equal(two!.group,   'Insert')
    assert.equal(three!.label, 'Three-column grid')
    assert.equal(three!.group, 'Insert')
  })

  it('Grid search matches "columns" / "split" / "layout"', () => {
    for (const q of ['columns', 'split', 'layout']) {
      const items = buildSlashItems([], [], q, {
        hasUpload: false,
        onInsertImage: () => {},
      })
      assert.ok(
        items.some((i) => i.key === 'grid-2'),
        `expected the Two-column grid entry to match search query "${q}"`,
      )
    }
  })

  it('Three-column grid distinguishes by "three" / "3"', () => {
    for (const q of ['three', '3']) {
      const items = buildSlashItems([], [], q, {
        hasUpload: false,
        onInsertImage: () => {},
      })
      assert.ok(
        items.some((i) => i.key === 'grid-3'),
        `expected the Three-column grid entry to match search query "${q}"`,
      )
    }
  })

  it('ranks a label match above a searchKey-only mention ("/summary")', () => {
    // The Details entry lists "summary" in its searchKey and is defined BEFORE
    // the Summary block, so a naive substring filter surfaced Collapsible block
    // first. Relevance ranking must put the Summary block (exact label) on top.
    const items = buildSlashItems([], [], 'summary', {
      hasUpload: false,
      onInsertImage: () => {},
    })
    assert.equal(items[0]?.key, 'summary',
      'expected the Summary block (label match) to rank first for "summary"')
    const summaryIdx = items.findIndex((i) => i.key === 'summary')
    const detailsIdx = items.findIndex((i) => i.key === 'details')
    assert.ok(detailsIdx > summaryIdx,
      'expected Collapsible block (searchKey mention) to rank below Summary')
  })

  it('keeps the Details entry matchable by its searchKey, just lower', () => {
    // Membership unchanged: "summary" still returns Details (regression guard
    // for the existing searchKey behaviour).
    const items = buildSlashItems([], [], 'summary', {
      hasUpload: false,
      onInsertImage: () => {},
    })
    assert.ok(items.some((i) => i.key === 'details'),
      'expected Details to remain in the results for "summary"')
  })

  it('prefix label matches outrank substring/searchKey matches', () => {
    // "pros" is a label-word prefix of "Pros & cons" — it should lead even
    // though other entries mention comparison words.
    const items = buildSlashItems([], [], 'pros', {
      hasUpload: false,
      onInsertImage: () => {},
    })
    assert.equal(items[0]?.key, 'pros-cons',
      'expected Pros & cons to rank first for "pros"')
  })

  it('ties preserve original menu order (stable sort)', () => {
    // Both Key takeaways and Summary list "tldr" in their searchKey (equal
    // score); Key takeaways is defined first, so it must stay first.
    const items = buildSlashItems([], [], 'tldr', {
      hasUpload: false,
      onInsertImage: () => {},
    })
    const keyIdx = items.findIndex((i) => i.key === 'key-takeaways')
    const sumIdx = items.findIndex((i) => i.key === 'summary')
    assert.ok(keyIdx !== -1 && sumIdx !== -1, 'expected both entries to match "tldr"')
    assert.ok(keyIdx < sumIdx,
      'expected stable order: Key takeaways (defined first) before Summary')
  })
})
