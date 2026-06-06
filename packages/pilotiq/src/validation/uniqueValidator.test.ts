import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { unique } from './uniqueValidator.js'
import type { ModelLike, ModelQuery } from '../orm/modelDefaults.js'

// ── Fake ModelLike — records every where() call so tests can assert ──

interface FakeQueryOp { op: string; args: unknown[] }

class FakeQuery implements ModelQuery {
  // `with` / `withCount` are required on ModelQuery (eager-load surface);
  // stubs no-op them.
  with(): ModelQuery { return this }
  withCount(): ModelQuery { return this }
  ops: FakeQueryOp[] = []
  constructor(private readonly _data: unknown[]) {}

  where(...args: unknown[]): ModelQuery   { this.ops.push({ op: 'where',   args }); return this }
  orWhere(...args: unknown[]): ModelQuery { this.ops.push({ op: 'orWhere', args }); return this }
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): ModelQuery {
    this.ops.push({ op: 'orderBy', args: [column, direction] }); return this
  }
  async paginate(page: number, perPage?: number) {
    this.ops.push({ op: 'paginate', args: [page, perPage] })
    return { data: this._data, total: this._data.length }
  }
}

function makeModel(opts: { rows?: unknown[]; primaryKey?: string } = {}) {
  let lastQuery: FakeQuery | null = null
  const model = {
    primaryKey: opts.primaryKey,
    async find() { return null },
    async create(data: Record<string, unknown>) { return { id: 'new', ...data } },
    async update(id: string | number, data: Record<string, unknown>) { return { id, ...data } },
    async delete() {},
    query(): ModelQuery {
      const q = new FakeQuery(opts.rows ?? [])
      lastQuery = q
      return q
    },
    get lastQuery() { return lastQuery },
  } as unknown as ModelLike & { lastQuery: FakeQuery | null }
  return model
}

describe('unique() validator', () => {
  it('passes when value is empty (defers to required())', async () => {
    const model = makeModel({ rows: [{ id: 1, email: 'a@b.com' }] })
    const v = unique({ model, column: 'email' })
    assert.equal(await v(''),        null)
    assert.equal(await v(null),      null)
    assert.equal(await v(undefined), null)
  })

  it('passes when no row matches', async () => {
    const model = makeModel({ rows: [] })
    const v = unique({ model, column: 'email' })
    assert.equal(await v('new@b.com', { values: { email: 'new@b.com' } }), null)
  })

  it('rejects when a row matches and there is no current record (create)', async () => {
    const model = makeModel({ rows: [{ id: 1, email: 'a@b.com' }] })
    const v = unique({ model, column: 'email' })
    assert.equal(await v('a@b.com', { values: { email: 'a@b.com' } }), 'Already taken')
  })

  it('passes on edit when the only matching row is the record under edit', async () => {
    const model = makeModel({ rows: [{ id: 7, email: 'a@b.com' }] })
    const v = unique({ model, column: 'email' })
    const ctx = { values: { email: 'a@b.com' }, record: { id: 7, email: 'a@b.com' } }
    assert.equal(await v('a@b.com', ctx), null)
  })

  it('rejects on edit when matching row is a DIFFERENT record', async () => {
    const model = makeModel({ rows: [{ id: 99, email: 'a@b.com' }] })
    const v = unique({ model, column: 'email' })
    const ctx = { values: { email: 'a@b.com' }, record: { id: 7, email: 'old@b.com' } }
    assert.equal(await v('a@b.com', ctx), 'Already taken')
  })

  it('honors primaryKey override on the model', async () => {
    const model = makeModel({ rows: [{ uuid: 'abc', email: 'a@b.com' }], primaryKey: 'uuid' })
    const v = unique({ model, column: 'email' })
    const ctx = { values: { email: 'a@b.com' }, record: { uuid: 'abc' } }
    assert.equal(await v('a@b.com', ctx), null)
  })

  it('ignoreRecord:false rejects even when the match is the current record', async () => {
    const model = makeModel({ rows: [{ id: 7, email: 'a@b.com' }] })
    const v = unique({ model, column: 'email', ignoreRecord: false })
    const ctx = { values: { email: 'a@b.com' }, record: { id: 7 } }
    assert.equal(await v('a@b.com', ctx), 'Already taken')
  })

  it('emits a custom message when configured', async () => {
    const model = makeModel({ rows: [{ id: 1, email: 'a@b.com' }] })
    const v = unique({ model, column: 'email', message: 'That email is taken' })
    assert.equal(await v('a@b.com', { values: { email: 'a@b.com' } }), 'That email is taken')
  })

  it('caseInsensitive uses LIKE with escaped wildcards', async () => {
    const model = makeModel({ rows: [] })
    const v = unique({ model, column: 'name', caseInsensitive: true })
    await v('100% solid_steel\\bar', { values: { name: '100% solid_steel\\bar' } })
    const where = model.lastQuery!.ops.find(o => o.op === 'where')
    assert.deepEqual(where!.args, ['name', 'LIKE', '100\\% solid\\_steel\\\\bar'])
  })

  it('caseInsensitive uses plain where for non-strings', async () => {
    const model = makeModel({ rows: [] })
    const v = unique({ model, column: 'count', caseInsensitive: true })
    await v(42, { values: { count: 42 } })
    const where = model.lastQuery!.ops.find(o => o.op === 'where')
    assert.deepEqual(where!.args, ['count', 42])
  })

  it('applies extra where() clauses for scoped uniqueness', async () => {
    const model = makeModel({ rows: [] })
    const v = unique({
      model, column: 'name',
      where: ({ values }) => ({ tenantId: values?.tenantId }),
    })
    await v('Alpha', { values: { name: 'Alpha', tenantId: 't-1' } })
    const wheres = model.lastQuery!.ops.filter(o => o.op === 'where')
    assert.equal(wheres.length, 2)
    assert.deepEqual(wheres[0]!.args, ['name', 'Alpha'])
    assert.deepEqual(wheres[1]!.args, ['tenantId', 't-1'])
  })

  it('skips where() entries with undefined value', async () => {
    const model = makeModel({ rows: [] })
    const v = unique({
      model, column: 'name',
      where: () => ({ tenantId: undefined, status: 'active' }),
    })
    await v('Alpha', { values: { name: 'Alpha' } })
    const wheres = model.lastQuery!.ops.filter(o => o.op === 'where')
    assert.equal(wheres.length, 2) // primary + status, NOT tenantId
    assert.deepEqual(wheres[1]!.args, ['status', 'active'])
  })

  it('falls back to ctx.values key when column option is omitted', async () => {
    // The validator doesn't know its owning Field's name, so without
    // `column` it scans ctx.values for a key whose value matches `value`.
    const model = makeModel({ rows: [{ id: 1, slug: 'taken' }] })
    const v = unique({ model })
    assert.equal(await v('taken', { values: { slug: 'taken' } }), 'Already taken')
    const where = model.lastQuery!.ops.find(o => o.op === 'where')
    assert.deepEqual(where!.args, ['slug', 'taken'])
  })

  it('paginates with (1, 2) so we can distinguish own-record from real conflict', async () => {
    const model = makeModel({ rows: [] })
    const v = unique({ model, column: 'email' })
    await v('x@y.com', { values: { email: 'x@y.com' } })
    const page = model.lastQuery!.ops.find(o => o.op === 'paginate')
    assert.deepEqual(page!.args, [1, 2])
  })

  it('rejects on edit when 2+ rows match, even if one is the current record', async () => {
    // Defensive: shouldn't happen with a real unique index, but if it
    // does, "every match is me" is false → conflict.
    const model = makeModel({
      rows: [{ id: 7, email: 'a@b.com' }, { id: 99, email: 'a@b.com' }],
    })
    const v = unique({ model, column: 'email' })
    const ctx = { values: { email: 'a@b.com' }, record: { id: 7 } }
    assert.equal(await v('a@b.com', ctx), 'Already taken')
  })

  it('thrown errors propagate (no silent fail-closed)', async () => {
    const model = {
      async find() { return null },
      async create() { return null },
      async update() { return null },
      async delete() {},
      query(): ModelQuery {
        return {
          where() { return this },
          orWhere() { return this },
          orderBy() { return this },
          async paginate() { throw new Error('db down') },
        } as unknown as ModelQuery
      },
    } as ModelLike
    const v = unique({ model, column: 'email' })
    await assert.rejects(
      async () => { await v('a@b.com', { values: { email: 'a@b.com' } }) },
      /db down/,
    )
  })

  it('carries no serialized descriptor (skips client mirroring)', () => {
    const model = makeModel({ rows: [] })
    const v = unique({ model, column: 'email' })
    assert.equal(v.serialized, undefined)
  })
})
