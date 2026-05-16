import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  computeReconcilePlan,
  markSubmitForReconcile,
  consumeReconcileFlag,
} from './repeaterReconcile.js'

describe('computeReconcilePlan', () => {
  it('returns empty plan when current and authoritative match', () => {
    const plan = computeReconcilePlan({
      current:       ['a', 'b', 'c'],
      authoritative: ['a', 'b', 'c'],
    })
    assert.deepEqual(plan.toRemove, [])
    assert.deepEqual(plan.toAdd,    [])
  })

  it('flags orphan CRDT rows as toRemove (PK-switch happy path)', () => {
    // Submitting tab reloaded — server returned the new DB PK; CRDT
    // still carries the renderer-minted UUID from the just-saved row.
    const plan = computeReconcilePlan({
      current:       ['uuid-foo', '42'],
      authoritative: ['42'],
    })
    assert.deepEqual(plan.toRemove, ['uuid-foo'])
    assert.deepEqual(plan.toAdd,    [])
  })

  it('flags missing CRDT rows as toAdd (raw-SQL-seeded record)', () => {
    // First peer to open a record whose DB rows weren't seeded into the
    // Y.Doc (no `seedRowArraysFromRecord` coverage for relationship-
    // backed fields). Reconciler ensures CRDT mirrors initialRows.
    const plan = computeReconcilePlan({
      current:       [],
      authoritative: ['42', '43'],
    })
    assert.deepEqual(plan.toRemove, [])
    assert.deepEqual(plan.toAdd,    ['42', '43'])
  })

  it('handles both directions in a single pass', () => {
    const plan = computeReconcilePlan({
      current:       ['uuid-foo', 'uuid-bar', '42'],
      authoritative: ['42', '43'],
    })
    assert.deepEqual(plan.toRemove, ['uuid-foo', 'uuid-bar'])
    assert.deepEqual(plan.toAdd,    ['43'])
  })

  it('preserves order from inputs in toRemove / toAdd', () => {
    const plan = computeReconcilePlan({
      current:       ['z', 'a', 'm'],
      authoritative: ['a', 'b', 'c'],
    })
    // toRemove walks current in order; toAdd walks authoritative in order.
    // Order-stability matters because reconciler applies them sequentially
    // and we want deterministic test snapshots.
    assert.deepEqual(plan.toRemove, ['z', 'm'])
    assert.deepEqual(plan.toAdd,    ['b', 'c'])
  })
})

describe('markSubmitForReconcile / consumeReconcileFlag', () => {
  // Minimal in-memory sessionStorage stub — Node lacks one, and we
  // want to avoid bringing in jsdom for a flag-roundtrip test.
  const realSessionStorage = (globalThis as { sessionStorage?: Storage }).sessionStorage
  const store: Map<string, string> = new Map()

  before(() => {
    ;(globalThis as { sessionStorage?: Storage }).sessionStorage = {
      get length() { return store.size },
      key:        (i: number) => Array.from(store.keys())[i] ?? null,
      getItem:    (k: string) => store.has(k) ? store.get(k)! : null,
      setItem:    (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear:      () => { store.clear() },
    } as Storage
  })

  after(() => {
    if (realSessionStorage === undefined) {
      delete (globalThis as { sessionStorage?: Storage }).sessionStorage
    } else {
      (globalThis as { sessionStorage?: Storage }).sessionStorage = realSessionStorage
    }
  })

  beforeEach(() => { store.clear() })

  it('returns false when no flag has been set', () => {
    assert.equal(consumeReconcileFlag('form-1'), false)
  })

  it('round-trips a flag and clears on first consume', () => {
    markSubmitForReconcile('form-1')
    assert.equal(consumeReconcileFlag('form-1'), true)
    // Second read: flag was cleared on the first consume.
    assert.equal(consumeReconcileFlag('form-1'), false)
  })

  it('scopes the flag per formId', () => {
    markSubmitForReconcile('form-1')
    assert.equal(consumeReconcileFlag('form-2'), false)
    assert.equal(consumeReconcileFlag('form-1'), true)
  })

  it('no-ops on empty formId (mark and consume both)', () => {
    markSubmitForReconcile('')
    assert.equal(store.size, 0)
    assert.equal(consumeReconcileFlag(''), false)
  })
})
