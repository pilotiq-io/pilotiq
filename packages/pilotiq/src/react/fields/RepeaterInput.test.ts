import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { reorderRows } from './RepeaterInput.js'

describe('reorderRows', () => {
  it('moves a row from a higher index to a lower one', () => {
    const rows = ['a', 'b', 'c', 'd']
    assert.deepEqual(reorderRows(rows, 2, 0), ['c', 'a', 'b', 'd'])
  })

  it('moves a row from a lower index to a higher one', () => {
    const rows = ['a', 'b', 'c', 'd']
    assert.deepEqual(reorderRows(rows, 0, 3), ['b', 'c', 'a', 'd'])
  })

  it('inserts at the end when insertBefore equals length', () => {
    const rows = ['a', 'b', 'c']
    assert.deepEqual(reorderRows(rows, 0, 3), ['b', 'c', 'a'])
  })

  it('inserts at the start when insertBefore is 0', () => {
    const rows = ['a', 'b', 'c']
    assert.deepEqual(reorderRows(rows, 2, 0), ['c', 'a', 'b'])
  })

  it('returns the same array when from === insertBefore (no-op)', () => {
    const rows = ['a', 'b', 'c']
    assert.equal(reorderRows(rows, 1, 1), rows)
  })

  it('returns the same array when insertBefore is the slot just past from (no-op)', () => {
    // Dragging row 1 to "before row 2" leaves it where it is.
    const rows = ['a', 'b', 'c']
    assert.equal(reorderRows(rows, 1, 2), rows)
  })

  it('returns the same array when fromIdx is out of range', () => {
    const rows = ['a', 'b', 'c']
    assert.equal(reorderRows(rows, 5, 1), rows)
    assert.equal(reorderRows(rows, -1, 1), rows)
  })

  it('returns the same array when insertBefore is out of range', () => {
    const rows = ['a', 'b', 'c']
    assert.equal(reorderRows(rows, 0, 5), rows)
    assert.equal(reorderRows(rows, 0, -1), rows)
  })

  it('does not mutate the input array', () => {
    const rows  = ['a', 'b', 'c', 'd']
    const snap  = rows.slice()
    reorderRows(rows, 1, 3)
    assert.deepEqual(rows, snap)
  })

  it('handles single-element arrays as a no-op', () => {
    const rows = ['only']
    assert.equal(reorderRows(rows, 0, 0), rows)
    assert.equal(reorderRows(rows, 0, 1), rows)
  })

  it('preserves object identity for non-moved rows', () => {
    const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' }
    const out = reorderRows([a, b, c], 0, 3)
    assert.equal(out[0], b)
    assert.equal(out[1], c)
    assert.equal(out[2], a)
  })
})
