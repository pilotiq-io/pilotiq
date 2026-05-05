import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { syncRowGates, type RowGateMeta } from './syncRowGates.js'

interface TestRow extends RowGateMeta {
  // Local-only fields the helper must preserve verbatim.
  children?:    unknown[]
  type?:        string
  unknownType?: boolean
}

function row(id: string, extras: Partial<TestRow> = {}): TestRow {
  return { id, ...extras }
}

describe('syncRowGates', () => {
  it('returns the same reference when every row already matches', () => {
    const prev = [row('a'), row('b')]
    const out  = syncRowGates(prev, [{ id: 'a' }, { id: 'b' }])
    assert.equal(out, prev)
  })

  it('stamps `hidden: true` when fresh meta hides a previously-visible row', () => {
    const prev = [row('a'), row('b')]
    const out  = syncRowGates(prev, [{ id: 'a' }, { id: 'b', hidden: true }])
    assert.notEqual(out, prev)
    assert.equal(out[0]?.hidden, undefined)
    assert.equal(out[1]?.hidden, true)
  })

  it('clears `hidden` when fresh meta drops the flag', () => {
    const prev: TestRow[] = [row('a', { hidden: true })]
    const out = syncRowGates(prev, [{ id: 'a' }])
    assert.notEqual(out, prev)
    assert.equal(out[0]?.hidden, undefined)
    assert.ok(!('hidden' in (out[0] ?? {})))
  })

  it('toggles each capability flag independently', () => {
    const prev: TestRow[] = [row('a', { canDelete: false }), row('b', { canClone: false }), row('c', { canReorder: false })]
    const out = syncRowGates(prev, [
      { id: 'a' },                          // canDelete cleared
      { id: 'b', canClone: false },         // canClone unchanged
      { id: 'c', canDelete: false },        // canReorder cleared, canDelete set
    ])
    assert.notEqual(out, prev)
    assert.equal(out[0]?.canDelete,  undefined)
    assert.equal(out[1]?.canClone,   false)
    assert.equal(out[1]?.canDelete,  undefined)
    assert.equal(out[2]?.canReorder, undefined)
    assert.equal(out[2]?.canDelete,  false)
  })

  it('preserves local-only fields (children / type / unknownType) — never echoed back from server', () => {
    const children = [{ kind: 'placeholder' }]
    const prev: TestRow[] = [
      row('a', { children, type: 'heading', unknownType: false }),
      row('b', { children, type: 'paragraph' }),
    ]
    const out = syncRowGates(prev, [{ id: 'a', hidden: true }, { id: 'b' }])
    assert.equal(out[0]?.children,     children)
    assert.equal(out[0]?.type,         'heading')
    assert.equal(out[0]?.unknownType,  false)
    assert.equal(out[0]?.hidden,       true)
    assert.equal(out[1]?.children,     children)
    assert.equal(out[1]?.type,         'paragraph')
  })

  it('leaves rows whose ids aren\'t in the fresh list untouched (client added a row mid-flight)', () => {
    const prev = [row('a', { hidden: true }), row('b'), row('c-local-only')]
    const out = syncRowGates(prev, [{ id: 'a' }, { id: 'b' }])
    // a's hidden flag cleared because fresh has it, b unchanged, c left alone.
    assert.equal(out[0]?.hidden, undefined)
    assert.equal(out[1]?.hidden, undefined)
    assert.equal(out[2]?.id,     'c-local-only')
  })

  it('preserves row order — never reorders or appends', () => {
    const prev = [row('a'), row('b'), row('c')]
    const out = syncRowGates(prev, [{ id: 'b' }, { id: 'a' }, { id: 'c', hidden: true }])
    assert.equal(out[0]?.id, 'a')
    assert.equal(out[1]?.id, 'b')
    assert.equal(out[2]?.id, 'c')
    assert.equal(out[2]?.hidden, true)
  })

  it('does not mutate input rows', () => {
    const a: TestRow = row('a')
    const b: TestRow = row('b', { hidden: true })
    syncRowGates([a, b], [{ id: 'a', hidden: true }, { id: 'b' }])
    assert.equal(a.hidden, undefined)
    assert.equal(b.hidden, true)
  })

  it('returns the same reference when fresh is empty (no row meta to sync)', () => {
    const prev = [row('a'), row('b')]
    const out = syncRowGates(prev, [])
    assert.equal(out, prev)
  })

  it('treats `hidden: false` and missing `hidden` as equivalent (no-op)', () => {
    const prev = [row('a')]
    const out = syncRowGates(prev, [{ id: 'a', hidden: false }])
    assert.equal(out, prev)
  })

  it('combines all four flag transitions in a single sync', () => {
    const prev: TestRow[] = [
      row('a', { hidden: true, canDelete: false, canClone: false, canReorder: false }),
    ]
    const out = syncRowGates(prev, [{ id: 'a' }])
    assert.notEqual(out, prev)
    assert.equal(out[0]?.hidden,     undefined)
    assert.equal(out[0]?.canDelete,  undefined)
    assert.equal(out[0]?.canClone,   undefined)
    assert.equal(out[0]?.canReorder, undefined)
  })

  describe('itemLabel sync', () => {
    it('updates itemLabel when fresh meta carries a different string', () => {
      const prev: TestRow[] = [row('a', { itemLabel: 'Apple' })]
      const out = syncRowGates(prev, [{ id: 'a', itemLabel: 'Apricot' }])
      assert.notEqual(out, prev)
      assert.equal(out[0]?.itemLabel, 'Apricot')
    })

    it('clears itemLabel when fresh meta drops it (label fn returned non-string this resolve)', () => {
      const prev: TestRow[] = [row('a', { itemLabel: 'Apple' })]
      const out = syncRowGates(prev, [{ id: 'a' }])
      assert.notEqual(out, prev)
      assert.equal(out[0]?.itemLabel, undefined)
      assert.ok(!('itemLabel' in (out[0] ?? {})))
    })

    it('stamps itemLabel when fresh meta adds it (was missing on prev)', () => {
      const prev: TestRow[] = [row('a')]
      const out = syncRowGates(prev, [{ id: 'a', itemLabel: 'Apple' }])
      assert.notEqual(out, prev)
      assert.equal(out[0]?.itemLabel, 'Apple')
    })

    it('keeps reference identity when itemLabel is byte-identical across resolves', () => {
      const prev: TestRow[] = [row('a', { itemLabel: 'Apple' })]
      const out = syncRowGates(prev, [{ id: 'a', itemLabel: 'Apple' }])
      assert.equal(out, prev)
    })
  })

  describe('extraActions sync', () => {
    it('updates extraActions when the action list changes shape', () => {
      const prevActions = [{ name: 'send', label: 'Send' }]
      const freshActions = [{ name: 'send', label: 'Send' }, { name: 'archive', label: 'Archive' }]
      const prev: TestRow[] = [row('a', { extraActions: prevActions })]
      const out = syncRowGates(prev, [{ id: 'a', extraActions: freshActions }])
      assert.notEqual(out, prev)
      assert.equal(out[0]?.extraActions, freshActions)
    })

    it('updates extraActions when an action toggles disabled mid-form (visibility re-resolved)', () => {
      const prevActions  = [{ name: 'send', label: 'Send', disabled: false }]
      const freshActions = [{ name: 'send', label: 'Send', disabled: true }]
      const prev: TestRow[] = [row('a', { extraActions: prevActions })]
      const out = syncRowGates(prev, [{ id: 'a', extraActions: freshActions }])
      assert.notEqual(out, prev)
      assert.equal(out[0]?.extraActions, freshActions)
    })

    it('clears extraActions when fresh meta drops them (every action failed visibility)', () => {
      const prev: TestRow[] = [row('a', { extraActions: [{ name: 'send' }] })]
      const out = syncRowGates(prev, [{ id: 'a' }])
      assert.notEqual(out, prev)
      assert.equal(out[0]?.extraActions, undefined)
      assert.ok(!('extraActions' in (out[0] ?? {})))
    })

    it('treats fresh empty array same as undefined (clears prev)', () => {
      const prev: TestRow[] = [row('a', { extraActions: [{ name: 'send' }] })]
      const out = syncRowGates(prev, [{ id: 'a', extraActions: [] }])
      assert.notEqual(out, prev)
      assert.equal(out[0]?.extraActions, undefined)
    })

    it('keeps reference identity when extraActions are byte-identical across resolves', () => {
      const actions = [{ name: 'send', label: 'Send' }]
      const prev: TestRow[] = [row('a', { extraActions: actions })]
      const out = syncRowGates(prev, [{ id: 'a', extraActions: [{ name: 'send', label: 'Send' }] }])
      assert.equal(out, prev)
    })
  })

  it('combines flag + itemLabel + extraActions transitions in a single sync', () => {
    const prev: TestRow[] = [
      row('a', { hidden: true, itemLabel: 'Old', extraActions: [{ name: 'a' }] }),
    ]
    const out = syncRowGates(prev, [{ id: 'a', itemLabel: 'New', extraActions: [{ name: 'b' }] }])
    assert.notEqual(out, prev)
    assert.equal(out[0]?.hidden,       undefined)
    assert.equal(out[0]?.itemLabel,    'New')
    assert.deepEqual(out[0]?.extraActions, [{ name: 'b' }])
  })
})
