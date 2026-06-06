import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Table } from '../elements/Table.js'
import { Column } from '../Column.js'
import {
  MultiSelectFilter,
  parseMultiSelectValue,
  encodeMultiSelectValue,
} from './MultiSelectFilter.js'
import { modelTableRecords } from '../orm/modelDefaults.js'
import type { ModelLike, ModelQuery, ModelWhereOperator } from '../orm/modelDefaults.js'

interface FakeOp { op: string; args: unknown[] }
class FakeQuery implements ModelQuery {
  // `with` / `withCount` are required on ModelQuery (eager-load surface);
  // stubs no-op them.
  with(): ModelQuery { return this }
  withCount(): ModelQuery { return this }
  ops: FakeOp[] = []
  where(...args: unknown[]): ModelQuery   { this.ops.push({ op: 'where', args });   return this }
  orWhere(...args: unknown[]): ModelQuery { this.ops.push({ op: 'orWhere', args }); return this }
  orderBy(c: string, d: 'ASC' | 'DESC' = 'ASC'): ModelQuery { this.ops.push({ op: 'orderBy', args: [c, d] }); return this }
  async paginate(p: number, pp?: number) { this.ops.push({ op: 'paginate', args: [p, pp] }); return { data: [], total: 0 } }
}

function fakeModel(): ModelLike & { name: string; model: ModelLike; lastQuery: FakeQuery | null } {
  let lastQuery: FakeQuery | null = null
  const M = {
    name: 'TestResource',
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
  } as unknown as ModelLike & { name: string; model: ModelLike; lastQuery: FakeQuery | null }
  M.model = M
  return M
}

describe('parseMultiSelectValue / encodeMultiSelectValue', () => {
  it('round-trips a typical comma-separated value', () => {
    const tokens = parseMultiSelectValue('draft,published,archived')
    assert.deepEqual(tokens, ['draft', 'published', 'archived'])
    assert.equal(encodeMultiSelectValue(tokens), 'draft,published,archived')
  })

  it('drops empty / whitespace-only tokens', () => {
    assert.deepEqual(parseMultiSelectValue('draft,  ,published,'), ['draft', 'published'])
  })

  it('parses empty / single-value strings', () => {
    assert.deepEqual(parseMultiSelectValue(''),       [])
    assert.deepEqual(parseMultiSelectValue('draft'),  ['draft'])
  })

  it('encodes the empty list as the empty string', () => {
    assert.equal(encodeMultiSelectValue([]), '')
  })
})

describe('MultiSelectFilter.toMeta', () => {
  it('emits kind:multiSelect + options + Any placeholder', () => {
    const meta = MultiSelectFilter.make('status')
      .options([
        { value: 'draft',     label: 'Draft' },
        { value: 'published', label: 'Published' },
      ])
      .toMeta()
    assert.equal(meta.kind, 'multiSelect')
    assert.equal(meta.placeholder, 'Any')
    assert.deepEqual(meta.options, [
      { value: 'draft',     label: 'Draft' },
      { value: 'published', label: 'Published' },
    ])
  })

  it('indicator joins selected option labels', () => {
    const meta = MultiSelectFilter.make('status')
      .options([
        { value: 'draft',     label: 'Draft' },
        { value: 'published', label: 'Published' },
        { value: 'archived',  label: 'Archived' },
      ])
      .withValue('draft,archived')
      .toMeta()
    assert.equal(meta.indicator, 'Status: Draft, Archived')
  })
})

describe('MultiSelectFilter ORM integration', () => {
  it('contributes a where(name, IN, values) clause via the default queryFn', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([MultiSelectFilter.make('status').options([
        { value: 'draft',     label: 'Draft' },
        { value: 'published', label: 'Published' },
      ])])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { status: 'draft,published' }, page: 1 })
    const ops = M.lastQuery!.ops
    const operator: ModelWhereOperator = 'IN'
    assert.deepEqual(ops[0], { op: 'where', args: ['status', operator, ['draft', 'published']] })
  })

  it('skips the clause when the parsed value list is empty', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title').searchable()])
      .filters([MultiSelectFilter.make('status')])
    const handler = modelTableRecords(M, table)
    // Only whitespace inside the comma-separated value: parses to [].
    await handler({ filters: { status: ' , , ' }, search: 'hi', page: 1 })
    const ops = M.lastQuery!.ops
    assert.equal(ops.find(o => o.op === 'where' && (o.args as unknown[])[0] === 'status'), undefined)
  })
})

describe('MultiSelectFilter — numeric option values', () => {
  it('normalizes numeric values to strings at the setter', () => {
    const f = MultiSelectFilter.make('categoryId').options([
      { value: 1, label: 'News' },
      { value: 2, label: 'Sports' },
    ])
    assert.deepEqual(f.getOptions(), [
      { value: '1', label: 'News' },
      { value: '2', label: 'Sports' },
    ])
  })
})
