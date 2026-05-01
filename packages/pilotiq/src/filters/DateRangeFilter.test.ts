import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Table } from '../elements/Table.js'
import { Column } from '../Column.js'
import {
  DateRangeFilter,
  parseDateRangeValue,
  encodeDateRangeValue,
} from './DateRangeFilter.js'
import { modelTableRecords } from '../orm/modelDefaults.js'
import type { ModelLike, ModelQuery } from '../orm/modelDefaults.js'

interface FakeOp { op: string; args: unknown[] }
class FakeQuery implements ModelQuery {
  ops: FakeOp[] = []
  where(...args: unknown[]): ModelQuery   { this.ops.push({ op: 'where', args });   return this }
  orWhere(...args: unknown[]): ModelQuery { this.ops.push({ op: 'orWhere', args }); return this }
  orderBy(c: string, d: 'ASC' | 'DESC' = 'ASC'): ModelQuery { this.ops.push({ op: 'orderBy', args: [c, d] }); return this }
  async paginate() { this.ops.push({ op: 'paginate', args: [] }); return { data: [], total: 0 } }
}

function fakeModel(): ModelLike & { lastQuery: FakeQuery | null } {
  let lastQuery: FakeQuery | null = null
  return {
    async find() { return null },
    async create(d: Record<string, unknown>) { return d },
    async update(_id: string | number, d: Record<string, unknown>) { return d },
    async delete() {},
    query(): ModelQuery {
      const q = new FakeQuery()
      lastQuery = q
      return q
    },
    get lastQuery() { return lastQuery },
  } as unknown as ModelLike & { lastQuery: FakeQuery | null }
}

describe('parseDateRangeValue', () => {
  it('round-trips a closed range', () => {
    assert.deepEqual(
      parseDateRangeValue('2026-01-01..2026-12-31'),
      { from: '2026-01-01', to: '2026-12-31' },
    )
  })

  it('round-trips an open-from range', () => {
    assert.deepEqual(parseDateRangeValue('2026-01-01..'), { from: '2026-01-01' })
  })

  it('round-trips an open-to range', () => {
    assert.deepEqual(parseDateRangeValue('..2026-12-31'), { to: '2026-12-31' })
  })

  it('treats empty / `..` as the empty range', () => {
    assert.deepEqual(parseDateRangeValue(''),    {})
    assert.deepEqual(parseDateRangeValue('..'),  {})
  })

  it('treats a missing separator as a single from bound', () => {
    assert.deepEqual(parseDateRangeValue('2026-01-01'), { from: '2026-01-01' })
  })

  it('trims whitespace on both sides', () => {
    assert.deepEqual(
      parseDateRangeValue('  2026-01-01 .. 2026-12-31  '),
      { from: '2026-01-01', to: '2026-12-31' },
    )
  })
})

describe('encodeDateRangeValue', () => {
  it('encodes a closed range', () => {
    assert.equal(encodeDateRangeValue({ from: '2026-01-01', to: '2026-12-31' }), '2026-01-01..2026-12-31')
  })
  it('encodes open-from / open-to', () => {
    assert.equal(encodeDateRangeValue({ from: '2026-01-01' }), '2026-01-01..')
    assert.equal(encodeDateRangeValue({ to:   '2026-12-31' }), '..2026-12-31')
  })
  it('returns empty string when both sides are missing', () => {
    assert.equal(encodeDateRangeValue({}),                       '')
    assert.equal(encodeDateRangeValue({ from: '', to: '' }),     '')
  })
})

describe('DateRangeFilter shape', () => {
  it('toMeta emits kind:dateRange + includesTime + Any placeholder', () => {
    const meta = DateRangeFilter.make('publishedAt').toMeta()
    assert.equal(meta.kind,         'dateRange')
    assert.equal(meta.includesTime, false)
    assert.equal(meta.placeholder,  'Any')
    assert.equal(meta.minDate,      undefined)
    assert.equal(meta.maxDate,      undefined)
  })

  it('includesTime() flips the meta flag', () => {
    const meta = DateRangeFilter.make('publishedAt').includesTime(true).toMeta()
    assert.equal(meta.includesTime, true)
  })

  it('minDate / maxDate accept ISO strings + Date objects', () => {
    const date = new Date(2026, 0, 15) // 2026-01-15 local
    const meta = DateRangeFilter.make('publishedAt')
      .minDate('2020-01-01')
      .maxDate(date)
      .toMeta()
    assert.equal(meta.minDate, '2020-01-01')
    assert.equal(meta.maxDate, '2026-01-15')
  })

  it('Date bounds include time when includesTime(true) was set first', () => {
    const date = new Date(2026, 0, 15, 14, 30) // 2026-01-15 14:30 local
    const meta = DateRangeFilter.make('publishedAt')
      .includesTime(true)
      .maxDate(date)
      .toMeta()
    assert.equal(meta.maxDate, '2026-01-15T14:30')
  })

  it('placeholder override wins over Any default', () => {
    const meta = DateRangeFilter.make('publishedAt').placeholder('Any time').toMeta()
    assert.equal(meta.placeholder, 'Any time')
  })
})

describe('DateRangeFilter default query handler', () => {
  it('closed range emits two where clauses (>=, <=)', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([DateRangeFilter.make('publishedAt')])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { publishedAt: '2026-01-01..2026-12-31' }, page: 1 })
    const wheres = M.lastQuery!.ops.filter(o => o.op === 'where')
    assert.deepEqual(wheres[0]!.args, ['publishedAt', '>=', '2026-01-01'])
    assert.deepEqual(wheres[1]!.args, ['publishedAt', '<=', '2026-12-31'])
  })

  it('open-from emits a single >= clause', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([DateRangeFilter.make('publishedAt')])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { publishedAt: '2026-01-01..' }, page: 1 })
    const wheres = M.lastQuery!.ops.filter(o => o.op === 'where')
    assert.equal(wheres.length, 1)
    assert.deepEqual(wheres[0]!.args, ['publishedAt', '>=', '2026-01-01'])
  })

  it('open-to emits a single <= clause', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([DateRangeFilter.make('publishedAt')])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { publishedAt: '..2026-12-31' }, page: 1 })
    const wheres = M.lastQuery!.ops.filter(o => o.op === 'where')
    assert.equal(wheres.length, 1)
    assert.deepEqual(wheres[0]!.args, ['publishedAt', '<=', '2026-12-31'])
  })

  it('parseFilterValues drops `..` (no clauses)', async () => {
    // The parser drops empty values upstream, but `..` is non-empty —
    // the default handler itself short-circuits the no-bound case.
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([DateRangeFilter.make('publishedAt')])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { publishedAt: '..' }, page: 1 })
    const wheres = M.lastQuery!.ops.filter(o => o.op === 'where')
    assert.equal(wheres.length, 0)
  })

  it('user .query(fn) override sees the raw encoded value', async () => {
    const M = fakeModel()
    let received: string | undefined
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([
        DateRangeFilter.make('publishedAt').query((q, value) => {
          received = value
          return q
        }),
      ])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { publishedAt: '2026-01-01..2026-12-31' }, page: 1 })
    assert.equal(received, '2026-01-01..2026-12-31')
  })
})
