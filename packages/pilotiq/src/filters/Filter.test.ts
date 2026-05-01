import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Table } from '../elements/Table.js'
import { Column } from '../Column.js'
import { SelectFilter } from './SelectFilter.js'
import { BooleanFilter, coerceBooleanFilterValue } from './BooleanFilter.js'
import { TernaryFilter } from './TernaryFilter.js'
import { DateRangeFilter } from './DateRangeFilter.js'
import { parseFilterValues, loadTableRecords } from '../elements/dispatchTable.js'
import { modelTableRecords } from '../orm/modelDefaults.js'
import type { ModelLike, ModelQuery } from '../orm/modelDefaults.js'

describe('SelectFilter / BooleanFilter shape', () => {
  it('SelectFilter.toMeta emits kind:select + options + placeholder', () => {
    const meta = SelectFilter.make('status')
      .options([{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }])
      .toMeta()
    assert.equal(meta.kind, 'select')
    assert.equal(meta.name, 'status')
    assert.equal(meta.label, 'Status')
    assert.deepEqual(meta.options, [
      { value: 'draft', label: 'Draft' },
      { value: 'published', label: 'Published' },
    ])
    assert.equal(meta.placeholder, 'All')
  })

  it('BooleanFilter.toMeta emits kind:boolean + Any placeholder', () => {
    const meta = BooleanFilter.make('featured').toMeta()
    assert.equal(meta.kind, 'boolean')
    assert.equal(meta.placeholder, 'Any')
  })

  it('label() override wins over the auto-derived label', () => {
    assert.equal(SelectFilter.make('status').label('Publish state').toMeta().label, 'Publish state')
  })

  it('withValue mirrors current selection into meta', () => {
    const meta = SelectFilter.make('status').withValue('published').toMeta()
    assert.equal(meta.value, 'published')
  })

  it('coerceBooleanFilterValue maps string values to booleans', () => {
    assert.equal(coerceBooleanFilterValue('1'),     true)
    assert.equal(coerceBooleanFilterValue('true'),  true)
    assert.equal(coerceBooleanFilterValue('yes'),   true)
    assert.equal(coerceBooleanFilterValue('on'),    true)
    assert.equal(coerceBooleanFilterValue('0'),     false)
    assert.equal(coerceBooleanFilterValue('false'), false)
    assert.equal(coerceBooleanFilterValue(''),      false)
  })
})

describe('Filter.indicator + active-value formatting', () => {
  it('omits indicator when no value is set', () => {
    const meta = SelectFilter.make('status').toMeta()
    assert.equal(meta.indicator, undefined)
  })

  it('SelectFilter formats active value via option label', () => {
    const meta = SelectFilter.make('status')
      .options([{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }])
      .withValue('published')
      .toMeta()
    assert.equal(meta.indicator, 'Status: Published')
  })

  it('SelectFilter falls back to raw value when option missing', () => {
    const meta = SelectFilter.make('status').withValue('mystery').toMeta()
    assert.equal(meta.indicator, 'Status: mystery')
  })

  it('BooleanFilter renders Yes / No', () => {
    assert.equal(BooleanFilter.make('featured').withValue('1').toMeta().indicator,  'Featured: Yes')
    assert.equal(BooleanFilter.make('featured').withValue('0').toMeta().indicator,  'Featured: No')
  })

  it('TernaryFilter maps yes / no / blank through the configured labels', () => {
    const f = TernaryFilter.make('verified')
      .trueLabel('Verified').falseLabel('Unverified').blankLabel('Pending')
    assert.equal(f.withValue('yes').toMeta().indicator,   'Verified: Verified')
    assert.equal(f.withValue('no').toMeta().indicator,    'Verified: Unverified')
    assert.equal(f.withValue('blank').toMeta().indicator, 'Verified: Pending')
  })

  it('DateRangeFilter formats both / one-sided ranges', () => {
    const f = DateRangeFilter.make('publishedAt')
    assert.equal(f.withValue('2026-01-01..2026-12-31').toMeta().indicator, 'PublishedAt: 2026-01-01 → 2026-12-31')
    assert.equal(f.withValue('2026-01-01..').toMeta().indicator,           'PublishedAt: ≥ 2026-01-01')
    assert.equal(f.withValue('..2026-12-31').toMeta().indicator,           'PublishedAt: ≤ 2026-12-31')
  })

  it('Filter.indicator(string) is a literal override', () => {
    const meta = SelectFilter.make('status')
      .options([{ value: 'draft', label: 'Draft' }])
      .indicator('Filtered')
      .withValue('draft')
      .toMeta()
    assert.equal(meta.indicator, 'Filtered')
  })

  it('Filter.indicator(fn) receives value + filter for custom formatting', () => {
    const meta = SelectFilter.make('status')
      .label('Publish state')
      .options([{ value: 'draft', label: 'Draft' }])
      .indicator((v, f) => `${f.getLabel()} = ${v}`)
      .withValue('draft')
      .toMeta()
    assert.equal(meta.indicator, 'Publish state = draft')
  })
})

describe('Table.filters() + getFilters()', () => {
  it('attaches filters as children alongside columns', () => {
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([SelectFilter.make('status'), BooleanFilter.make('featured')])
    const filters = table.getFilters()
    assert.equal(filters.length, 2)
    assert.equal(filters[0]!.name, 'status')
    assert.equal(filters[1]!.name, 'featured')
    // Columns still present
    assert.equal(table.getColumns().length, 1)
  })

  it('replacing filters does not clobber columns', () => {
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([SelectFilter.make('status')])
      .filters([BooleanFilter.make('featured')])  // replace
    assert.equal(table.getFilters().length, 1)
    assert.equal(table.getFilters()[0]!.name, 'featured')
    assert.equal(table.getColumns().length, 1)
  })
})

describe('parseFilterValues', () => {
  it('returns empty when no filters are registered', () => {
    assert.deepEqual(parseFilterValues({ status: 'x' }, []), {})
  })

  it('drops reserved query keys + non-matching names', () => {
    const filters = [SelectFilter.make('status'), BooleanFilter.make('featured')]
    const r = parseFilterValues(
      { status: 'published', featured: '1', search: 'hi', sort: 'title:asc', unknown: 'x' },
      filters,
    )
    assert.deepEqual(r, { status: 'published', featured: '1' })
  })

  it('drops empty-string values', () => {
    const filters = [SelectFilter.make('status')]
    assert.deepEqual(parseFilterValues({ status: '' }, filters), {})
  })
})

describe('loadTableRecords mirrors filter values + passes them in TableContext', () => {
  it('Filter.withValue is called for each parsed filter, ctx.filters reaches the records handler', async () => {
    let receivedCtx: unknown
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([
        SelectFilter.make('status').options([{ value: 'published', label: 'Published' }]),
        BooleanFilter.make('featured'),
      ])
      .records(async (ctx) => { receivedCtx = ctx; return { rows: [], total: 0 } })

    await loadTableRecords([table], { status: 'published', featured: '1' })

    const ctx = receivedCtx as { filters?: Record<string, string> }
    assert.deepEqual(ctx.filters, { status: 'published', featured: '1' })

    const filters = table.getFilters()
    assert.equal(filters[0]!.getValue(), 'published')
    assert.equal(filters[1]!.getValue(), '1')
  })

  it('omits ctx.filters when no filter values are present', async () => {
    let receivedCtx: { filters?: unknown } = {}
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([SelectFilter.make('status')])
      .records(async (ctx) => { receivedCtx = ctx; return { rows: [], total: 0 } })

    await loadTableRecords([table], {})
    assert.equal(receivedCtx.filters, undefined)
  })
})

// ── modelTableRecords applies filter where-clauses ────────────────────

interface FakeOp { op: string; args: unknown[] }
class FakeQuery implements ModelQuery {
  ops: FakeOp[] = []
  where(...args: unknown[]): ModelQuery   { this.ops.push({ op: 'where', args });   return this }
  orWhere(...args: unknown[]): ModelQuery { this.ops.push({ op: 'orWhere', args }); return this }
  orderBy(c: string, d: 'ASC' | 'DESC' = 'ASC'): ModelQuery { this.ops.push({ op: 'orderBy', args: [c, d] }); return this }
  async paginate(p: number, pp?: number) { this.ops.push({ op: 'paginate', args: [p, pp] }); return { data: [], total: 0 } }
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

describe('modelTableRecords applies filters', () => {
  it('select filter contributes a where(name, value) clause', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([SelectFilter.make('status').options([{ value: 'published', label: 'Published' }])])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { status: 'published' }, page: 1 })
    const ops = M.lastQuery!.ops
    assert.deepEqual(ops[0], { op: 'where', args: ['status', 'published'] })
  })

  it('boolean filter coerces the string value to a boolean', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([BooleanFilter.make('featured')])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { featured: '1' }, page: 1 })
    const ops = M.lastQuery!.ops
    assert.deepEqual(ops[0], { op: 'where', args: ['featured', true] })
  })

  it('Filter.query(fn) custom hook overrides the default where clause', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([
        SelectFilter.make('age').query((q, value) => q.where('age', '>=', Number(value))),
      ])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { age: '18' }, page: 1 })
    const ops = M.lastQuery!.ops
    assert.deepEqual(ops[0], { op: 'where', args: ['age', '>=', 18] })
  })

  it('skips filters with empty / undefined values', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title').searchable()])
      .filters([SelectFilter.make('status')])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { status: '' }, search: 'hi', page: 1 })
    const ops = M.lastQuery!.ops
    // Only the search clause + paginate, no status where.
    assert.equal(ops.find(o => o.op === 'where' && (o.args as unknown[])[0] === 'status'), undefined)
  })
})
