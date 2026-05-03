import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { TableGroup, bucketDateValue, formatDateBucketTitle } from './TableGroup.js'

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
})
