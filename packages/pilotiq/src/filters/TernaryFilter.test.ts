import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Table } from '../elements/Table.js'
import { Column } from '../Column.js'
import { TernaryFilter } from './TernaryFilter.js'
import { modelTableRecords } from '../orm/modelDefaults.js'
import type { ModelLike, ModelQuery } from '../orm/modelDefaults.js'

interface FakeOp { op: string; args: unknown[] }
class FakeQueryWithNull implements ModelQuery {
  ops: FakeOp[] = []
  where(...args: unknown[]): ModelQuery   { this.ops.push({ op: 'where', args });   return this }
  orWhere(...args: unknown[]): ModelQuery { this.ops.push({ op: 'orWhere', args }); return this }
  orderBy(c: string, d: 'ASC' | 'DESC' = 'ASC'): ModelQuery { this.ops.push({ op: 'orderBy', args: [c, d] }); return this }
  whereNull(column: string): ModelQuery { this.ops.push({ op: 'whereNull', args: [column] }); return this }
  async paginate() { this.ops.push({ op: 'paginate', args: [] }); return { data: [], total: 0 } }
}

class FakeQueryNoNull implements ModelQuery {
  ops: FakeOp[] = []
  where(...args: unknown[]): ModelQuery   { this.ops.push({ op: 'where', args });   return this }
  orWhere(...args: unknown[]): ModelQuery { this.ops.push({ op: 'orWhere', args }); return this }
  orderBy(c: string, d: 'ASC' | 'DESC' = 'ASC'): ModelQuery { this.ops.push({ op: 'orderBy', args: [c, d] }); return this }
  // intentionally no whereNull — exercises the fallback path
  async paginate() { this.ops.push({ op: 'paginate', args: [] }); return { data: [], total: 0 } }
}

type FakeQuery = FakeQueryWithNull | FakeQueryNoNull

function fakeModel(opts: { whereNull?: boolean } = { whereNull: true }): ModelLike & { lastQuery: FakeQuery | null } {
  let lastQuery: FakeQuery | null = null
  const hasWhereNull = opts.whereNull ?? true
  return {
    async find() { return null },
    async create(d: Record<string, unknown>) { return d },
    async update(_id: string | number, d: Record<string, unknown>) { return d },
    async delete() {},
    query(): ModelQuery {
      const q: FakeQuery = hasWhereNull ? new FakeQueryWithNull() : new FakeQueryNoNull()
      lastQuery = q
      return q
    },
    get lastQuery() { return lastQuery },
  } as unknown as ModelLike & { lastQuery: FakeQuery | null }
}

describe('TernaryFilter shape', () => {
  it('toMeta emits kind:ternary + three options + Any placeholder', () => {
    const meta = TernaryFilter.make('verified').toMeta()
    assert.equal(meta.kind, 'ternary')
    assert.equal(meta.placeholder, 'Any')
    assert.deepEqual(meta.options, [
      { value: 'yes',   label: 'Yes' },
      { value: 'no',    label: 'No' },
      { value: 'blank', label: 'Blank' },
    ])
  })

  it('label overrides win', () => {
    const meta = TernaryFilter.make('verified')
      .trueLabel('Verified')
      .falseLabel('Unverified')
      .blankLabel('Pending')
      .toMeta()
    assert.deepEqual(meta.options, [
      { value: 'yes',   label: 'Verified' },
      { value: 'no',    label: 'Unverified' },
      { value: 'blank', label: 'Pending' },
    ])
  })

  it('nullable(false) drops the blank option', () => {
    const meta = TernaryFilter.make('verified').nullable(false).toMeta()
    assert.deepEqual(meta.options, [
      { value: 'yes', label: 'Yes' },
      { value: 'no',  label: 'No' },
    ])
  })

  it('placeholder() override wins over Any default', () => {
    const meta = TernaryFilter.make('verified').placeholder('Filter…').toMeta()
    assert.equal(meta.placeholder, 'Filter…')
  })
})

describe('TernaryFilter default query handler', () => {
  it('yes → where(name, true)', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([TernaryFilter.make('verified')])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { verified: 'yes' }, page: 1 })
    assert.deepEqual(M.lastQuery!.ops[0], { op: 'where', args: ['verified', true] })
  })

  it('no → where(name, false)', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([TernaryFilter.make('verified')])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { verified: 'no' }, page: 1 })
    assert.deepEqual(M.lastQuery!.ops[0], { op: 'where', args: ['verified', false] })
  })

  it('blank → whereNull(name) when the query exposes it', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([TernaryFilter.make('verified')])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { verified: 'blank' }, page: 1 })
    assert.deepEqual(M.lastQuery!.ops[0], { op: 'whereNull', args: ['verified'] })
  })

  it('blank → where(name, null) when whereNull is missing', async () => {
    const M = fakeModel({ whereNull: false })
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([TernaryFilter.make('verified')])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { verified: 'blank' }, page: 1 })
    assert.deepEqual(M.lastQuery!.ops[0], { op: 'where', args: ['verified', null] })
  })

  it('empty / unknown values produce no clause', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([TernaryFilter.make('verified')])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { verified: '' }, page: 1 })
    // Only the paginate op should land — no where for the filter.
    assert.equal(M.lastQuery!.ops.find(o => o.op === 'where'), undefined)

    await handler({ filters: { verified: 'maybe' }, page: 1 })
    // 'maybe' isn't yes/no/blank so the handler falls through to no-op.
    const wheresAfter = M.lastQuery!.ops.filter(o => o.op === 'where')
    assert.equal(wheresAfter.length, 0)
  })

  it('user .query(fn) override replaces the default handler', async () => {
    const M = fakeModel()
    const table = Table.make()
      .columns([Column.make('title')])
      .filters([
        TernaryFilter.make('verified').query((q, value) =>
          q.where('verified_state', value === 'yes' ? 1 : 0),
        ),
      ])
    const handler = modelTableRecords(M, table)
    await handler({ filters: { verified: 'yes' }, page: 1 })
    assert.deepEqual(M.lastQuery!.ops[0], { op: 'where', args: ['verified_state', 1] })
  })
})
