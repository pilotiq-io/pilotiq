import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { syncRowGates, type RowGateMeta } from './syncRowGates.js'

interface TestRow extends RowGateMeta {
  // Local-only fields the helper must preserve verbatim.
  children?:    unknown[]
  itemLabel?:   string
  extraActions?: unknown[]
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

  it('preserves local-only fields (children / itemLabel / extraActions / type / unknownType)', () => {
    const children = [{ kind: 'placeholder' }]
    const extras   = [{ kind: 'action' }]
    const prev: TestRow[] = [
      row('a', { children, itemLabel: 'Apple',  extraActions: extras, type: 'heading', unknownType: false }),
      row('b', { children, itemLabel: 'Banana', type: 'paragraph' }),
    ]
    const out = syncRowGates(prev, [{ id: 'a', hidden: true }, { id: 'b' }])
    assert.equal(out[0]?.children,     children)
    assert.equal(out[0]?.itemLabel,    'Apple')
    assert.equal(out[0]?.extraActions, extras)
    assert.equal(out[0]?.type,         'heading')
    assert.equal(out[0]?.hidden,       true)
    assert.equal(out[1]?.itemLabel,    'Banana')
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
})
