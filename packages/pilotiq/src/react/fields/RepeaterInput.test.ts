import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { reorderRows, buildGridContainer } from './RepeaterInput.js'

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

describe('buildGridContainer', () => {
  it('returns the no-grid fallback when grid is undefined', () => {
    const out = buildGridContainer(undefined, 'r1')
    assert.equal(out.hasGrid, false)
    assert.equal(out.className, 'flex flex-col gap-3')
    assert.equal(out.style, undefined)
    assert.equal(out.styleBlock, null)
    assert.equal(out.wrapperStyle, undefined)
  })

  it('renders the scalar form as inline gridTemplateColumns with no wrapper styling', () => {
    const out = buildGridContainer(2, 'r1')
    assert.equal(out.hasGrid, true)
    assert.equal(out.className, 'grid gap-3')
    assert.deepEqual(out.style, { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' })
    assert.equal(out.styleBlock, null)
    // Fixed-N grids never need a CQ context — they're column-count agnostic.
    assert.equal(out.wrapperStyle, undefined)
  })

  it('renders the responsive form as @container queries against the parent wrapper', () => {
    const out = buildGridContainer({ default: 1, md: 2, xl: 3 }, 'r1')
    assert.equal(out.hasGrid, true)
    assert.equal(out.className, 'pq-grid-r1')
    assert.equal(out.style, undefined)
    assert.deepEqual(out.wrapperStyle, { containerType: 'inline-size' })
    assert.notEqual(out.styleBlock, null)
    const css = (out.styleBlock as { props: { children: string } }).props.children
    // Base rule is unconditional; breakpoint overrides switch to @container
    // (NOT @media) so a Repeater nested inside a narrow Split/aside grids
    // by its own allocated width, not by the viewport width.
    assert.match(css, /\.pq-grid-r1 \{ display: grid; gap: 0\.75rem; grid-template-columns: repeat\(1, minmax\(0, 1fr\)\); \}/)
    assert.match(css, /@container \(min-width: 48rem\) \{ \.pq-grid-r1 \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \} \}/)
    assert.match(css, /@container \(min-width: 80rem\) \{ \.pq-grid-r1 \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \} \}/)
    // Sanity — no leftover viewport @media rules.
    assert.equal(/@media/.test(css), false)
  })

  it('strips colons from useId scopeIds when forming the className', () => {
    // React 18's useId() returns ':r0:' / ':R3a:' shapes; the helper has
    // to scrub the colons so the className remains a valid CSS selector.
    const out = buildGridContainer({ default: 1, md: 2 }, ':r5:')
    assert.equal(out.className, 'pq-grid-r5')
  })
})
