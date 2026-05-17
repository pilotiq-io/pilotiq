import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  applyRelationshipRenames,
  registerRelationshipRenameHandler,
  _resetRelationshipRenameRegistryForTests,
  type RelationshipRenameEntry,
  type RelationshipRenameHandler,
} from './relationshipRenameDispatch.js'

describe('relationshipRenameDispatch', () => {
  beforeEach(() => {
    _resetRelationshipRenameRegistryForTests()
  })

  it('routes a rename through the registered handler for its formId', () => {
    const seen: ReadonlyArray<RelationshipRenameEntry>[] = []
    registerRelationshipRenameHandler('form-1', (renames) => { seen.push(renames) })

    applyRelationshipRenames('form-1', [
      { field: 'comments', old: 'uuid-foo', new: '42' },
    ])

    assert.equal(seen.length, 1)
    assert.deepEqual(seen[0], [{ field: 'comments', old: 'uuid-foo', new: '42' }])
  })

  it('isolates handlers across formIds — multi-form pages do not cross-fire', () => {
    const a: RelationshipRenameEntry[][] = []
    const b: RelationshipRenameEntry[][] = []
    registerRelationshipRenameHandler('form-a', (r) => { a.push([...r]) })
    registerRelationshipRenameHandler('form-b', (r) => { b.push([...r]) })

    applyRelationshipRenames('form-a', [{ field: 'x', old: 'u', new: '1' }])

    assert.equal(a.length, 1)
    assert.equal(b.length, 0)
  })

  it('cleanup unregisters the handler', () => {
    let calls = 0
    const off = registerRelationshipRenameHandler('form-1', () => { calls += 1 })
    off()
    applyRelationshipRenames('form-1', [{ field: 'x', old: 'u', new: '1' }])
    assert.equal(calls, 0)
  })

  it("cleanup does NOT wipe a handler that another caller replaced (StrictMode-safe)", () => {
    // StrictMode dev double-mount: provider A mounts, registers fn1; React
    // schedules cleanup; provider A's effect re-runs and registers fn2; THEN
    // the cleanup of the first effect fires. fn2 must survive.
    let calls1 = 0
    let calls2 = 0
    const fn1: RelationshipRenameHandler = () => { calls1 += 1 }
    const fn2: RelationshipRenameHandler = () => { calls2 += 1 }

    const off1 = registerRelationshipRenameHandler('form-1', fn1)
    registerRelationshipRenameHandler('form-1', fn2)
    off1()

    applyRelationshipRenames('form-1', [{ field: 'x', old: 'u', new: '1' }])
    assert.equal(calls1, 0)
    assert.equal(calls2, 1, 'second registration survived the first cleanup')
  })

  it('apply with no handler registered is a silent no-op', () => {
    // The success path always fires apply; consumers without a collab
    // plugin shouldn't see any error.
    assert.doesNotThrow(() => {
      applyRelationshipRenames('form-unknown', [{ field: 'x', old: 'u', new: '1' }])
    })
  })

  it('apply with empty or undefined rename list short-circuits', () => {
    let calls = 0
    registerRelationshipRenameHandler('form-1', () => { calls += 1 })

    applyRelationshipRenames('form-1', [])
    applyRelationshipRenames('form-1', undefined)

    assert.equal(calls, 0)
  })

  it('apply with empty formId is a no-op', () => {
    let calls = 0
    registerRelationshipRenameHandler('', () => { calls += 1 })
    applyRelationshipRenames('', [{ field: 'x', old: 'u', new: '1' }])
    assert.equal(calls, 0)
  })

  it('register returns a stub cleanup when formId is empty (no crash)', () => {
    const off = registerRelationshipRenameHandler('', () => {})
    assert.doesNotThrow(off)
  })

  it('handler errors propagate so FormRenderer can surface a save-failed toast', () => {
    registerRelationshipRenameHandler('form-1', () => {
      throw new Error('binding wedged')
    })
    assert.throws(
      () => applyRelationshipRenames('form-1', [{ field: 'x', old: 'u', new: '1' }]),
      /binding wedged/,
    )
  })
})
