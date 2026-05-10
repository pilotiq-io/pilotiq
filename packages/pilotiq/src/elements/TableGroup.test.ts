import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { TableGroup, bucketDateValue, formatDateBucketTitle, orderByKeys } from './TableGroup.js'

describe('TableGroup', () => {
  describe('fluent setters', () => {
    it('label() round-trips on toMeta()', () => {
      const meta = TableGroup.make('status').label('Status').toMeta()
      assert.equal(meta.column, 'status')
      assert.equal(meta.label, 'Status')
    })

    it('falls back to column name when no label is set', () => {
      const meta = TableGroup.make('author_id').toMeta()
      assert.equal(meta.label, 'author_id')
    })

    it('collapsible() flips the meta flag', () => {
      assert.equal(TableGroup.make('s').toMeta().collapsible, undefined)
      assert.equal(TableGroup.make('s').collapsible().toMeta().collapsible, true)
      assert.equal(TableGroup.make('s').collapsible(false).toMeta().collapsible, undefined)
    })

    it('collapsed() flips the meta flag', () => {
      assert.equal(TableGroup.make('s').toMeta().collapsed, undefined)
      assert.equal(TableGroup.make('s').collapsed().toMeta().collapsed, true)
      assert.equal(TableGroup.make('s').collapsed(false).toMeta().collapsed, undefined)
    })

    it('date() flips the meta flag', () => {
      assert.equal(TableGroup.make('createdAt').toMeta().date, undefined)
      assert.equal(TableGroup.make('createdAt').date().toMeta().date, true)
    })

    it('chains multiple setters', () => {
      const meta = TableGroup.make('status')
        .label('Status')
        .collapsible()
        .collapsed()
        .toMeta()
      assert.deepEqual(meta, {
        column:      'status',
        label:       'Status',
        collapsible: true,
        collapsed:   true,
      })
    })
  })

  describe('record-derived title + description', () => {
    it('getTitleHandler is invoked with the full record', () => {
      const g = TableGroup.make<{ status: string }>('status')
        .getTitleFromRecordUsing(r => r.status === 'draft' ? 'Drafts' : 'Published')
      const fn = g.getTitleHandler()!
      assert.equal(fn({ status: 'draft' }), 'Drafts')
      assert.equal(fn({ status: 'live'  }), 'Published')
    })

    it('getDescriptionHandler is invoked with the full record', () => {
      const g = TableGroup.make<{ count: number }>('status')
        .getDescriptionFromRecordUsing(r => `${r.count} records`)
      const fn = g.getDescriptionHandler()!
      assert.equal(fn({ count: 12 }), '12 records')
    })
  })

  describe('bucketDateValue', () => {
    it('buckets ISO strings to YYYY-MM-DD', () => {
      assert.equal(bucketDateValue('2026-05-04T13:24:00.000Z'), '2026-05-04')
    })

    it('buckets Date instances', () => {
      assert.equal(bucketDateValue(new Date(Date.UTC(2026, 0, 9))), '2026-01-09')
    })

    it('buckets epoch numbers', () => {
      assert.equal(bucketDateValue(0), '1970-01-01')
    })

    it('returns empty string for null/undefined/empty', () => {
      assert.equal(bucketDateValue(null),      '')
      assert.equal(bucketDateValue(undefined), '')
      assert.equal(bucketDateValue(''),        '')
    })

    it('returns empty string for unparseable inputs', () => {
      assert.equal(bucketDateValue('not a date'), '')
    })
  })

  describe('orderUsing + orderByKeys', () => {
    it('default — comparator unset', () => {
      const g = TableGroup.make('status')
      assert.equal(g.getKeyComparator(), undefined)
    })

    it('orderUsing() stores the comparator', () => {
      const cmp = (a: string, b: string): number => a.length - b.length
      const g = TableGroup.make('status').orderUsing(cmp)
      assert.equal(g.getKeyComparator(), cmp)
    })

    it('orderByKeys ranks listed keys in order', () => {
      const cmp = orderByKeys(['draft', 'published', 'archived'])
      // Listed keys come back in declaration order, regardless of input.
      const sorted = ['archived', 'draft', 'published'].slice().sort(cmp)
      assert.deepEqual(sorted, ['draft', 'published', 'archived'])
    })

    it('orderByKeys puts unknown keys after the listed ones', () => {
      const cmp = orderByKeys(['draft', 'published'])
      // 'pending' isn't in the list — must sort after both listed keys.
      const sorted = ['pending', 'draft', 'published'].slice().sort(cmp)
      assert.deepEqual(sorted, ['draft', 'published', 'pending'])
    })

    it('orderByKeys breaks ties between unlisted keys alphabetically', () => {
      const cmp = orderByKeys(['draft'])
      const sorted = ['zeta', 'alpha', 'draft', 'beta'].slice().sort(cmp)
      assert.deepEqual(sorted, ['draft', 'alpha', 'beta', 'zeta'])
    })

    it('orderByKeys empty list collapses to alphabetic', () => {
      const cmp = orderByKeys([])
      const sorted = ['c', 'a', 'b'].slice().sort(cmp)
      assert.deepEqual(sorted, ['a', 'b', 'c'])
    })
  })

  describe('formatDateBucketTitle', () => {
    it('formats a parseable date as locale text', () => {
      // We don't pin to an exact locale string — just confirm it's
      // human-readable and contains the year.
      const out = formatDateBucketTitle('2026-05-04T00:00:00.000Z')
      assert.match(out, /2026/)
      assert.match(out, /May/)
    })

    it('returns empty string for null/empty', () => {
      assert.equal(formatDateBucketTitle(null), '')
      assert.equal(formatDateBucketTitle(''),   '')
    })

    it('returns the raw value for unparseable inputs', () => {
      assert.equal(formatDateBucketTitle('blob'), 'blob')
    })
  })

  describe('scopable + scopeQueryByKey + getKeyFromRecordUsing', () => {
    it('default — not scopable, no meta emit', () => {
      assert.equal(TableGroup.make('status').isScopable(), false)
      assert.equal(TableGroup.make('status').toMeta().scopable, undefined)
    })

    it('scopable() flips the meta flag', () => {
      assert.equal(TableGroup.make('s').scopable().toMeta().scopable, true)
      assert.equal(TableGroup.make('s').scopable(false).toMeta().scopable, undefined)
    })

    it('scopeQueryByKey() auto-arms scopable', () => {
      const g = TableGroup.make('status').scopeQueryByKey((q, _k) => q)
      assert.equal(g.isScopable(), true)
      assert.equal(g.toMeta().scopable, true)
    })

    it('getKeyFromRecordUsing() auto-arms scopable', () => {
      const g = TableGroup.make<{ s: string }>('status')
        .getKeyFromRecordUsing(r => r.s.toUpperCase())
      assert.equal(g.isScopable(), true)
    })

    it('scopable(false) after auto-arm opts back out', () => {
      const g = TableGroup.make('status').scopeQueryByKey((q, _k) => q).scopable(false)
      assert.equal(g.isScopable(), false)
      assert.equal(g.toMeta().scopable, undefined)
    })
  })

  describe('resolveKey', () => {
    it('default — raw column value as string', () => {
      const g = TableGroup.make('status')
      assert.equal(g.resolveKey({ status: 'draft' }), 'draft')
      assert.equal(g.resolveKey({ status: 42 }),      '42')
    })

    it('empty / null collapses to ""', () => {
      const g = TableGroup.make('status')
      assert.equal(g.resolveKey({ status: null }),      '')
      assert.equal(g.resolveKey({ status: undefined }), '')
      assert.equal(g.resolveKey({ status: '' }),        '')
    })

    it('date() returns the YYYY-MM-DD bucket', () => {
      const g = TableGroup.make('createdAt').date()
      assert.equal(g.resolveKey({ createdAt: '2026-05-04T12:00:00.000Z' }), '2026-05-04')
    })

    it('user handler wins', () => {
      const g = TableGroup.make<{ s: string }>('status')
        .getKeyFromRecordUsing(r => `K_${r.s}`)
      assert.equal(g.resolveKey({ s: 'a' }), 'K_a')
    })

    it('handler returning undefined collapses to ""', () => {
      const g = TableGroup.make<{ s: string | undefined }>('status')
        .getKeyFromRecordUsing(r => r.s)
      assert.equal(g.resolveKey({ s: undefined }), '')
    })

    it('throwing handler fails soft to ""', () => {
      const g = TableGroup.make('status')
        .getKeyFromRecordUsing(() => { throw new Error('boom') })
      assert.equal(g.resolveKey({ status: 'draft' }), '')
    })
  })

  describe('resolveScoper defaults', () => {
    it('plain group — exact match where(col, "=", key)', () => {
      const calls: Array<[string, string, unknown]> = []
      const q = { where: (col: string, op: string, val: unknown) => { calls.push([col, op, val]); return q } }
      const g = TableGroup.make('status')
      const scoper = g.resolveScoper<typeof q>()
      scoper(q, 'draft')
      assert.deepEqual(calls, [['status', '=', 'draft']])
    })

    it('date group — whole-day range', () => {
      const calls: Array<[string, string, unknown]> = []
      const q = { where: (col: string, op: string, val: unknown) => { calls.push([col, op, val]); return q } }
      const g = TableGroup.make('createdAt').date()
      const scoper = g.resolveScoper<typeof q>()
      scoper(q, '2026-05-04')
      assert.deepEqual(calls, [
        ['createdAt', '>=', '2026-05-04 00:00:00'],
        ['createdAt', '<=', '2026-05-04 23:59:59'],
      ])
    })

    it('date group — empty key is a no-op (no where call)', () => {
      let calls = 0
      const q = { where: (..._args: unknown[]) => { calls++; return q } }
      const g = TableGroup.make('createdAt').date()
      const scoper = g.resolveScoper<typeof q>()
      scoper(q, '')
      assert.equal(calls, 0)
    })

    it('user scoper wins over date() default', () => {
      const calls: string[] = []
      const q = { where: (col: string, op: string, val: unknown) => { calls.push(`${col} ${op} ${val}`); return q } }
      const g = TableGroup.make<unknown>('createdAt')
        .date()
        .scopeQueryByKey<typeof q>((qq, key) => qq.where('createdAt', '=', key))
      const scoper = g.resolveScoper<typeof q>()
      scoper(q, '2026-05-04')
      assert.deepEqual(calls, ['createdAt = 2026-05-04'])
    })
  })
})
