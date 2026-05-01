import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Sum, Average, Count, Range } from './Summarizer.js'

describe('Summarizers', () => {
  describe('Sum', () => {
    it('sums numeric values', () => {
      assert.equal(Sum.make().compute([1, 2, 3, 4]), '10')
    })

    it('coerces strings and ignores non-numerics', () => {
      assert.equal(Sum.make().compute(['10', '5', null, undefined, 'abc']), '15')
    })

    it('returns 0 over an empty list', () => {
      assert.equal(Sum.make().compute([]), '0')
    })

    it('applies a custom format function', () => {
      const formatted = Sum.make()
        .format((n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n))
        .compute([1.5, 2.25, 3])
      assert.equal(formatted, '$6.75')
    })
  })

  describe('Average', () => {
    it('averages numeric values', () => {
      assert.equal(Average.make().compute([2, 4, 6]), '4')
    })

    it('returns 0 for an empty list', () => {
      assert.equal(Average.make().compute([]), '0')
    })

    it('skips non-numerics in the denominator', () => {
      assert.equal(Average.make().compute([10, 'bad', 20]), '15')
    })
  })

  describe('Count', () => {
    it('counts every entry, including non-numerics', () => {
      assert.equal(Count.make().compute([1, 'a', null, undefined]), '4')
    })

    it('returns 0 for empty input', () => {
      assert.equal(Count.make().compute([]), '0')
    })

    it('ignores label and format options for the value (Count is integer-only)', () => {
      const c = Count.make().label('Total entries').format(() => 'should be ignored')
      assert.equal(c.compute([1, 2, 3]), '3')
      assert.equal(c.toMeta().label, 'Total entries')
    })
  })

  describe('Range', () => {
    it('returns "min..max" over numeric values', () => {
      assert.equal(Range.make().compute([3, 1, 4, 1, 5, 9, 2]), '1..9')
    })

    it('returns "—" when no numeric values are present', () => {
      assert.equal(Range.make().compute([null, undefined, 'abc']), '—')
    })

    it('uses format function on each end of the range', () => {
      const r = Range.make().format((n) => `$${n}`).compute([5, 25, 10])
      assert.equal(r, '$5..$25')
    })
  })

  describe('toResult / toMeta', () => {
    it('toMeta carries kind + label only (no value)', () => {
      const m = Sum.make().label('Total').toMeta()
      assert.deepEqual(m, { kind: 'sum', label: 'Total' })
    })

    it('toResult bundles label + computed value', () => {
      const r = Average.make().label('Avg').toResult([10, 20])
      assert.deepEqual(r, { kind: 'average', label: 'Avg', value: '15' })
    })
  })
})
