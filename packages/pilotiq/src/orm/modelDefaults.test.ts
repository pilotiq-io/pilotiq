import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Resource } from '../Resource.js'
import { Form } from '../elements/Form.js'
import { Table } from '../elements/Table.js'
import { Column } from '../Column.js'
import { TextField } from '../fields/TextField.js'
import { defaultListPage, defaultCreatePage, defaultEditPage } from '../defaultPages.js'
import type { ModelLike, ModelQuery } from './modelDefaults.js'
import type { TableContext } from '../elements/Table.js'
import {
  applyColumnSearch,
  defaultRelatedQuery,
  resolveRelatedQuery,
  modelRelationTableRecords,
  getRelationType,
  findRecord,
} from './modelDefaults.js'

// ── Fake ModelLike that records every call so tests can assert on it ──

interface FakeCall { kind: string; args: unknown[] }

function makeFakeModel(opts: {
  primaryKey?: string
  paginateResult?: { data: unknown[]; total: number }
  findResult?: unknown
  createResult?: unknown
  updateResult?: unknown
} = {}): ModelLike & { calls: FakeCall[]; lastQuery: FakeQuery | null } {
  const calls: FakeCall[] = []
  let lastQuery: FakeQuery | null = null

  const model = {
    primaryKey: opts.primaryKey,
    async find(id: string | number) {
      calls.push({ kind: 'find', args: [id] })
      return opts.findResult ?? null
    },
    async create(data: Record<string, unknown>) {
      calls.push({ kind: 'create', args: [data] })
      return opts.createResult ?? { id: 'new', ...data }
    },
    async update(id: string | number, data: Record<string, unknown>) {
      calls.push({ kind: 'update', args: [id, data] })
      return opts.updateResult ?? { id, ...data }
    },
    async delete(id: string | number) {
      calls.push({ kind: 'delete', args: [id] })
    },
    query(): ModelQuery {
      const q = new FakeQuery(opts.paginateResult ?? { data: [], total: 0 })
      lastQuery = q
      return q
    },
    calls,
    get lastQuery() { return lastQuery },
  } as unknown as ModelLike & { calls: FakeCall[]; lastQuery: FakeQuery | null }

  return model
}

class FakeQuery implements ModelQuery {
  // `with` / `withCount` are required on ModelQuery (eager-load surface);
  // stubs no-op them.
  with(): ModelQuery { return this }
  withCount(): ModelQuery { return this }
  ops: Array<{ op: string; args: unknown[] }> = []
  constructor(private readonly _paginateResult: { data: unknown[]; total: number }) {}

  where(...args: unknown[]): ModelQuery   { this.ops.push({ op: 'where', args });   return this }
  orWhere(...args: unknown[]): ModelQuery { this.ops.push({ op: 'orWhere', args }); return this }
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): ModelQuery {
    this.ops.push({ op: 'orderBy', args: [column, direction] })
    return this
  }
  async paginate(page: number, perPage?: number): Promise<{ data: unknown[]; total: number }> {
    this.ops.push({ op: 'paginate', args: [page, perPage] })
    return this._paginateResult
  }
}

/**
 * Records ops like FakeQuery but also implements `whereGroup` — the
 * callback runs against a fresh sub-builder whose ops are spliced back
 * under a single `{ op: 'whereGroup', group: [...] }` entry. Mirrors the
 * rudder QueryBuilder's grouped-clause shape so we can assert the search
 * OR-chain is parenthesised (and AND-composes with surrounding scopes).
 */
class GroupingQuery extends FakeQuery {
  whereGroup(fn: (q: ModelQuery) => ModelQuery | void): ModelQuery {
    const sub = new GroupingQuery({ data: [], total: 0 })
    fn(sub)
    this.ops.push({ op: 'whereGroup', args: [], group: sub.ops } as never)
    return this
  }
}

describe('applyColumnSearch — grouped multi-column search', () => {
  it('wraps the OR-chain in a whereGroup so it AND-composes with a preceding scope', () => {
    const q = new GroupingQuery({ data: [], total: 0 })
    q.where('deletedAt', null)                       // soft-delete scope at root
    applyColumnSearch(q, ['title', 'slug'], '%foo%')

    const ops = q.ops as Array<{ op: string; args: unknown[]; group?: Array<{ op: string; args: unknown[] }> }>
    assert.deepEqual(ops[0], { op: 'where', args: ['deletedAt', null] })
    // The search lives inside one group, NOT leaked to the root.
    assert.equal(ops[1]!.op, 'whereGroup')
    assert.deepEqual(ops[1]!.group, [
      { op: 'where',   args: ['title', 'LIKE', '%foo%'] },
      { op: 'orWhere', args: ['slug',  'LIKE', '%foo%'] },
    ])
  })

  it('falls back to a flat where/orWhere chain when whereGroup is absent', () => {
    const q = new FakeQuery({ data: [], total: 0 })
    applyColumnSearch(q, ['title', 'slug'], '%foo%')
    assert.deepEqual(q.ops, [
      { op: 'where',   args: ['title', 'LIKE', '%foo%'] },
      { op: 'orWhere', args: ['slug',  'LIKE', '%foo%'] },
    ])
  })
})

// ── Tests ────────────────────────────────────────────────────────────

describe('Model-driven defaults — list page Table.records', () => {
  let model: ReturnType<typeof makeFakeModel>

  class ArticleResource extends Resource {
    static override label         = 'Articles'
    static override labelSingular = 'Article'
    static override slug          = 'articles'
    static override get model() { return model }
    static override table(table: Table): Table {
      return table.columns([
        Column.make('title').sortable().searchable(),
        Column.make('slug').searchable(),
        Column.make('createdAt').sortable(),
      ]).defaultSort('createdAt', 'desc').paginate(20)
    }
  }

  beforeEach(() => {
    model = makeFakeModel({ paginateResult: { data: [{ id: '1' }], total: 7 } })
  })

  it('paginates with default sort + perPage when ctx is empty', async () => {
    const List   = defaultListPage(ArticleResource)
    const schema = await List.schema() as Array<{ getType(): string }>
    const table  = schema[1] as Table
    const handler = table.getRecords()
    assert.ok(handler, 'records handler should be installed')

    const result = await handler({ page: 1 } as TableContext)
    assert.deepEqual(result, { rows: [{ id: '1' }], total: 7 })

    const ops = model.lastQuery!.ops
    // No search / no sort applied here — defaults to paginate(1, undefined).
    // The defaultSort + perPage are honored by loadTableRecords (the URL
    // query parser), not the records handler — verified separately below.
    assert.equal(ops.length, 1)
    assert.deepEqual(ops[0], { op: 'paginate', args: [1, 20] })
  })

  it('applies search across every searchable column with LIKE/orWhere', async () => {
    const List = defaultListPage(ArticleResource)
    const table = (await List.schema())[1] as unknown as Table
    const handler = table.getRecords()!

    await handler({ search: 'foo', page: 1 } as TableContext)
    const ops = model.lastQuery!.ops
    assert.deepEqual(ops[0], { op: 'where',   args: ['title', 'LIKE', '%foo%'] })
    assert.deepEqual(ops[1], { op: 'orWhere', args: ['slug',  'LIKE', '%foo%'] })
    assert.deepEqual(ops[2], { op: 'paginate', args: [1, 20] })
  })

  it('translates ctx.sort to orderBy with uppercased direction', async () => {
    const List = defaultListPage(ArticleResource)
    const table = (await List.schema())[1] as unknown as Table
    const handler = table.getRecords()!

    await handler({ sort: { column: 'createdAt', direction: 'desc' }, page: 2, perPage: 5 } as TableContext)
    const ops = model.lastQuery!.ops
    assert.deepEqual(ops[0], { op: 'orderBy',  args: ['createdAt', 'DESC'] })
    assert.deepEqual(ops[1], { op: 'paginate', args: [2, 5] })
  })

  it('user-supplied .records() wins over the model default', async () => {
    class CustomResource extends ArticleResource {
      static override table(table: Table): Table {
        return table.columns([Column.make('title')])
          .records(async () => ({ rows: [{ id: 'custom' }], total: 1 }))
      }
    }
    const table = (await defaultListPage(CustomResource).schema())[1] as unknown as Table
    // The user's records handler stays — running it should NOT touch the model.
    const handler = table.getRecords()!
    const result  = await handler({} as TableContext)
    assert.deepEqual(result, { rows: [{ id: 'custom' }], total: 1 })
    assert.equal(model.calls.length, 0)
  })
})

describe('Model-driven defaults — Form.save', () => {
  let model: ReturnType<typeof makeFakeModel>

  class ArticleResource extends Resource {
    static override label         = 'Articles'
    static override labelSingular = 'Article'
    static override slug          = 'articles'
    static override get model() { return model }
    static override form(form: Form): Form {
      return form.schema([TextField.make('title').required()])
    }
  }

  beforeEach(() => {
    model = makeFakeModel()
  })

  it('create page calls model.create when ctx has no record', async () => {
    const Create = defaultCreatePage(ArticleResource)
    const form   = (Create.schema() as Array<unknown>)[1] as Form
    const save   = form.getSave()!

    await save({ title: 'Hello' }, { values: { title: 'Hello' } })
    assert.deepEqual(model.calls, [{ kind: 'create', args: [{ title: 'Hello' }] }])
  })

  it('edit page calls model.update with the record id when ctx.record carries one', async () => {
    const Edit = defaultEditPage(ArticleResource)
    const form = (Edit.schema() as Array<unknown>)[1] as Form
    const save = form.getSave()!

    await save({ title: 'Updated' }, { values: { title: 'Updated' }, record: { id: 42, title: 'Old' } })
    assert.deepEqual(model.calls, [{ kind: 'update', args: [42, { title: 'Updated' }] }])
  })

  it('honors ModelLike.primaryKey when discriminating create vs update', async () => {
    model = makeFakeModel({ primaryKey: 'uuid' })
    const Edit = defaultEditPage(ArticleResource)
    const form = (Edit.schema() as Array<unknown>)[1] as Form
    const save = form.getSave()!

    await save({ title: 'X' }, { values: { title: 'X' }, record: { uuid: 'abc-123', title: 'Old' } })
    assert.deepEqual(model.calls, [{ kind: 'update', args: ['abc-123', { title: 'X' }] }])
  })

  it('user-supplied Form.save() wins over the model default', async () => {
    let calledWith: unknown
    class CustomResource extends ArticleResource {
      static override form(form: Form): Form {
        return form.schema([TextField.make('title')]).save(async (data) => {
          calledWith = data
          return { id: 'custom' }
        })
      }
    }
    const Create = defaultCreatePage(CustomResource)
    const form   = (Create.schema() as Array<unknown>)[1] as Form
    const save   = form.getSave()!

    await save({ title: 'Hi' }, { values: { title: 'Hi' } })
    assert.deepEqual(calledWith, { title: 'Hi' })
    assert.equal(model.calls.length, 0)
  })
})

describe('Model-driven defaults — Form.loadRecord + Resource.deleteRecord', () => {
  let model: ReturnType<typeof makeFakeModel>

  class ArticleResource extends Resource {
    static override label         = 'Articles'
    static override labelSingular = 'Article'
    static override slug          = 'articles'
    static override get model() { return model }
    static override form(form: Form): Form {
      return form.schema([TextField.make('title')])
    }
  }

  beforeEach(() => {
    // loadRecord routes through `R.query(ctx).where(pk, id).paginate(1, 1)`
    // (so a `Resource.query()` override scopes per-record loads too).
    // Tests therefore configure paginateResult, not findResult — `find()`
    // is no longer on the load path.
    model = makeFakeModel({ paginateResult: { data: [{ id: '7', title: 'Loaded' }], total: 1 } })
  })

  it('edit page loadRecord routes through Resource.query → where(pk, id) → paginate(1, 1)', async () => {
    const Edit = defaultEditPage(ArticleResource)
    const form = (Edit.schema() as Array<unknown>)[1] as Form
    const load = form.getLoadRecord()!

    const record = await load('7', { values: {} })
    assert.deepEqual(record, { id: '7', title: 'Loaded' })
    // No bare `find(id)` call — the load goes through the query builder
    // so user-installed `Resource.query` scopes apply.
    assert.equal(model.calls.find(c => c.kind === 'find'), undefined)
    const ops = model.lastQuery!.ops
    assert.deepEqual(ops[0], { op: 'where',    args: ['id', '=', '7'] })
    assert.deepEqual(ops[1], { op: 'paginate', args: [1, 1] })
  })

  it('edit page loadRecord returns null when the scoped query yields no rows', async () => {
    model = makeFakeModel({ paginateResult: { data: [], total: 0 } })
    const Edit = defaultEditPage(ArticleResource)
    const form = (Edit.schema() as Array<unknown>)[1] as Form
    const record = await form.getLoadRecord()!('7', { values: {} })
    assert.equal(record, null)
  })

  it('deleteRecord proxies to model.delete', async () => {
    await ArticleResource.deleteRecord('7')
    assert.deepEqual(model.calls, [{ kind: 'delete', args: ['7'] }])
  })

  it('deleteRecord still throws when no model is set and the user did not override', async () => {
    class NoModelResource extends Resource {
      static override label = 'Bare'
    }
    await assert.rejects(
      () => NoModelResource.deleteRecord('1'),
      /no deleteRecord/,
    )
  })

  it('user-supplied Resource.deleteRecord wins over the model default', async () => {
    let called = false
    class CustomResource extends ArticleResource {
      static override async deleteRecord(_id: string): Promise<void> {
        called = true
      }
    }
    await CustomResource.deleteRecord('7')
    assert.equal(called, true)
    assert.equal(model.calls.length, 0)
  })
})

describe('Model-driven defaults — sentinel errors when no model + no handler', () => {
  class BareResource extends Resource {
    static override label         = 'Bare'
    static override labelSingular = 'Bare'
    static override slug          = 'bare'
    static override form(form: Form): Form {
      return form.schema([TextField.make('title')])
    }
  }

  it('create page save still throws the sentinel error when neither model nor save is set', () => {
    const Create = defaultCreatePage(BareResource)
    const form   = (Create.schema() as Array<unknown>)[1] as Form
    const save   = form.getSave()!
    assert.throws(() => (save as () => unknown)(), /no save handler/)
  })

  it('edit page loadRecord still throws the sentinel error when neither model nor loadRecord is set', () => {
    const Edit = defaultEditPage(BareResource)
    const form = (Edit.schema() as Array<unknown>)[1] as Form
    const load = form.getLoadRecord()!
    assert.throws(() => (load as () => unknown)(), /no loadRecord handler/)
  })
})

// ── Plan #11 relation helpers ─────────────────────────────────────────

describe('defaultRelatedQuery (Plan #11)', () => {
  it('delegates to parent.related(name) and returns the ModelQuery', () => {
    const q = new FakeQuery({ data: [], total: 0 })
    const parent = {
      relatedCalls: [] as string[],
      related(name: string): ModelQuery {
        this.relatedCalls.push(name)
        return q
      },
    }
    const out = defaultRelatedQuery(parent, 'posts')
    assert.equal(out, q)
    assert.deepEqual(parent.relatedCalls, ['posts'])
  })

  it('throws a clear error when the parent has no .related() method', () => {
    const parent = { id: 1, name: 'no-related-here' }
    assert.throws(
      () => defaultRelatedQuery(parent, 'posts'),
      /Cannot resolve relation "posts" — parent record has no \.related\(\) method/,
    )
  })

  it('throws when parent is null/undefined', () => {
    assert.throws(() => defaultRelatedQuery(null,      'posts'), /Cannot resolve relation/)
    assert.throws(() => defaultRelatedQuery(undefined, 'posts'), /Cannot resolve relation/)
  })
})

describe('resolveRelatedQuery (Plan #11)', () => {
  it('prefers ModelLike.relatedQuery override when present', () => {
    const customQ = new FakeQuery({ data: [], total: 0 })
    const calls: Array<{ parent: unknown; name: string }> = []
    const M: ModelLike = {
      ...makeFakeModel(),
      relatedQuery(parent, name) {
        calls.push({ parent, name })
        return customQ
      },
    }
    const parent = { id: 1, related(_n: string): ModelQuery { throw new Error('should not be called') } }
    const out = resolveRelatedQuery(M, parent, 'posts')
    assert.equal(out, customQ)
    assert.deepEqual(calls, [{ parent, name: 'posts' }])
  })

  it('falls back to parent.related(name) when no override is set', () => {
    const M: ModelLike = makeFakeModel()
    const q = new FakeQuery({ data: [], total: 0 })
    const parent = { related(_n: string): ModelQuery { return q } }
    const out = resolveRelatedQuery(M, parent, 'posts')
    assert.equal(out, q)
  })
})

describe('modelRelationTableRecords (Plan #11)', () => {
  it('drives pagination through parent.related(name) with sort/search/perPage', async () => {
    const q = new FakeQuery({ data: [{ id: 1 }, { id: 2 }], total: 17 })
    const relatedCalls: string[] = []
    const parent = {
      related(name: string): ModelQuery {
        relatedCalls.push(name)
        return q
      },
    }
    const parentModel: ModelLike = makeFakeModel()
    const table = Table.make()
      .columns([
        Column.make('title').sortable().searchable(),
        Column.make('body').searchable(),
      ])
      .paginate(10)
    const handler = modelRelationTableRecords(parentModel, parent, 'posts', table)

    const ctx: TableContext = { search: 'hello', page: 2, perPage: 10, sort: { column: 'title', direction: 'asc' } }
    const result = await handler(ctx)

    assert.deepEqual(relatedCalls, ['posts'])
    assert.deepEqual(result, { rows: [{ id: 1 }, { id: 2 }], total: 17 })

    // Search → where + orWhere across the two searchable columns,
    // then orderBy + paginate.
    assert.deepEqual(q.ops[0], { op: 'where',   args: ['title', 'LIKE', '%hello%'] })
    assert.deepEqual(q.ops[1], { op: 'orWhere', args: ['body',  'LIKE', '%hello%'] })
    assert.deepEqual(q.ops[2], { op: 'orderBy', args: ['title', 'ASC'] })
    assert.deepEqual(q.ops[3], { op: 'paginate', args: [2, 10] })
  })

  it('honors the parent ModelLike.relatedQuery override', async () => {
    const q = new FakeQuery({ data: [], total: 0 })
    const overrideCalls: Array<{ parent: unknown; name: string }> = []
    const parentModel: ModelLike = {
      ...makeFakeModel(),
      relatedQuery(parent, name) {
        overrideCalls.push({ parent, name })
        return q
      },
    }
    // This parent has NO `.related()` method — so falling back to
    // defaultRelatedQuery would throw. The override must win.
    const parent = { id: 99 }

    const table = Table.make().columns([Column.make('title')])
    const handler = modelRelationTableRecords(parentModel, parent, 'children', table)
    const result = await handler({})

    assert.deepEqual(result, { rows: [], total: 0 })
    assert.deepEqual(overrideCalls, [{ parent, name: 'children' }])
  })
})

describe('getRelationType (M2M follow-up)', () => {
  it('reads the type field off a parent model relations map', () => {
    const M: ModelLike = {
      async find() { return null },
      async create() { return null },
      async update() { return null },
      async delete() { /* no-op */ },
      query() { return null as never },
    }
    Object.assign(M as object, {
      relations: {
        tags:    { type: 'belongsToMany', model: () => null },
        posts:   { type: 'hasMany',       model: () => null },
        author:  { type: 'belongsTo',     model: () => null },
      },
    })
    assert.equal(getRelationType(M, 'tags'),   'belongsToMany')
    assert.equal(getRelationType(M, 'posts'),  'hasMany')
    assert.equal(getRelationType(M, 'author'), 'belongsTo')
  })

  it('defaults to hasMany when the relations map is missing', () => {
    const M: ModelLike = {
      async find() { return null },
      async create() { return null },
      async update() { return null },
      async delete() { /* no-op */ },
      query() { return null as never },
    }
    assert.equal(getRelationType(M, 'whatever'), 'hasMany')
  })

  it('defaults to hasMany when the relation entry has no type field', () => {
    const M: ModelLike = {
      async find() { return null },
      async create() { return null },
      async update() { return null },
      async delete() { /* no-op */ },
      query() { return null as never },
    }
    Object.assign(M as object, {
      // Some users author light test stubs without `type` — keep tolerating.
      relations: { posts: { model: () => null, foreignKey: 'parentId' } },
    })
    assert.equal(getRelationType(M, 'posts'), 'hasMany')
  })
})

// ── Resource.query() override + findRecord helper ────────────────────

describe('Resource.query() override', () => {
  let model: ReturnType<typeof makeFakeModel>

  class ArticleResource extends Resource {
    static override label = 'Articles'
    static override slug  = 'articles'
    static override get model() { return model }
  }

  beforeEach(() => {
    model = makeFakeModel({ paginateResult: { data: [], total: 0 } })
  })

  it('default returns this.model.query()', () => {
    const q = ArticleResource.query()
    assert.equal(q, model.lastQuery)
  })

  it('throws a clear error when called on a Resource without a model', () => {
    class NoModelResource extends Resource {
      static override label = 'Bare'
    }
    assert.throws(
      () => NoModelResource.query(),
      /requires `static model = …` to be set/,
    )
  })

  it('subclass override receives ctx and can splice in a where-clause', async () => {
    class TenantResource extends ArticleResource {
      static override query(ctx?: { user?: unknown }) {
        const tenantId = (ctx?.user as { tenantId?: string } | undefined)?.tenantId
        return super.query(ctx).where('tenantId', tenantId)
      }
    }
    const q = TenantResource.query({ user: { tenantId: 't42' } })
    const ops = (q as unknown as { ops: Array<{ op: string; args: unknown[] }> }).ops
    assert.deepEqual(ops[0], { op: 'where', args: ['tenantId', 't42'] })
  })

  it('list-page Table.records routes through R.query(ctx) — override scopes flow through', async () => {
    let capturedUser: unknown
    class TenantResource extends ArticleResource {
      static override table(table: Table): Table {
        return table.columns([Column.make('title')])
      }
      static override query(ctx?: { user?: unknown }) {
        capturedUser = ctx?.user
        return super.query(ctx)
      }
    }
    const table = (await defaultListPage(TenantResource).schema())[1] as unknown as Table
    const handler = table.getRecords()!
    await handler({ page: 1, user: { tenantId: 't42' } } as unknown as TableContext)
    assert.deepEqual(capturedUser, { tenantId: 't42' })
  })

  it('list-page Table.records does NOT pass user when none is set on ctx', async () => {
    let capturedCtx: unknown
    class WatchResource extends ArticleResource {
      static override table(table: Table): Table { return table.columns([Column.make('title')]) }
      static override query(ctx?: { user?: unknown }) {
        capturedCtx = ctx
        return super.query(ctx)
      }
    }
    const table = (await defaultListPage(WatchResource).schema())[1] as unknown as Table
    await table.getRecords()!({ page: 1 } as TableContext)
    assert.equal(capturedCtx, undefined)
  })
})

describe('findRecord helper', () => {
  let model: ReturnType<typeof makeFakeModel>

  class ArticleResource extends Resource {
    static override label = 'Articles'
    static override slug  = 'articles'
    static override get model() { return model }
  }

  beforeEach(() => {
    model = makeFakeModel({ paginateResult: { data: [{ id: '7', title: 'Loaded' }], total: 1 } })
  })

  it('returns the first row from R.query(ctx).where(pk, id).paginate(1, 1)', async () => {
    const out = await findRecord(ArticleResource, '7')
    assert.deepEqual(out, { id: '7', title: 'Loaded' })
    const ops = model.lastQuery!.ops
    assert.deepEqual(ops[0], { op: 'where',    args: ['id', '=', '7'] })
    assert.deepEqual(ops[1], { op: 'paginate', args: [1, 1] })
  })

  it('returns undefined when the scoped query yields no rows', async () => {
    model = makeFakeModel({ paginateResult: { data: [], total: 0 } })
    const out = await findRecord(ArticleResource, '7')
    assert.equal(out, undefined)
  })

  it('honours a custom `primaryKey` on the model', async () => {
    model = makeFakeModel({
      primaryKey: 'uuid',
      paginateResult: { data: [{ uuid: 'abc' }], total: 1 },
    })
    await findRecord(ArticleResource, 'abc')
    const ops = model.lastQuery!.ops
    assert.deepEqual(ops[0], { op: 'where', args: ['uuid', '=', 'abc'] })
  })

  it('threads ctx.user through to R.query', async () => {
    let capturedUser: unknown
    class TenantResource extends ArticleResource {
      static override query(ctx?: { user?: unknown }) {
        capturedUser = ctx?.user
        return super.query(ctx)
      }
    }
    await findRecord(TenantResource, '7', { user: { tenantId: 't42' } })
    assert.deepEqual(capturedUser, { tenantId: 't42' })
  })

  it('returns undefined when the Resource has no model', async () => {
    class NoModelResource extends Resource {
      static override label = 'Bare'
    }
    const out = await findRecord(NoModelResource, '7')
    assert.equal(out, undefined)
  })

  it('records loaded through findRecord are filterable via override — record outside scope is invisible', async () => {
    // Simulate a tenant scope: the override emits a where-clause that
    // narrows results to a specific tenant. The fake query records the
    // clauses; if we paginate on a non-matching tenant, the fake returns
    // empty data. Pilotiq treats the missed lookup as "not found", so the
    // override's scope acts as an authorization fence.
    model = makeFakeModel({ paginateResult: { data: [], total: 0 } })
    class TenantResource extends ArticleResource {
      static override query(ctx?: { user?: unknown }) {
        const tenantId = (ctx?.user as { tenantId?: string } | undefined)?.tenantId
        return super.query(ctx).where('tenantId', tenantId ?? null)
      }
    }
    const out = await findRecord(TenantResource, '7', { user: { tenantId: 'other-tenant' } })
    assert.equal(out, undefined)
    const ops = model.lastQuery!.ops
    assert.deepEqual(ops[0], { op: 'where',    args: ['tenantId', 'other-tenant'] })
    assert.deepEqual(ops[1], { op: 'where',    args: ['id', '=', '7'] })
    assert.deepEqual(ops[2], { op: 'paginate', args: [1, 1] })
  })
})

describe('ModelQuery.with / withCount (eager-load typing)', () => {
  it('chains with(...) and withCount(...) without assertions', async () => {
    // The roadmap gap: `TableWidget.query(q => q.with('author'))` and
    // friends receive a pilotiq-typed ModelQuery — the eager-load pair
    // must be REQUIRED members so chaining typechecks without `!`.
    const q: ModelQuery = new FakeQuery({ data: [], total: 0 })
    const chained = q.with('author', 'tags').withCount('comments').where('status', 'published')
    const result = await chained.paginate(1, 5)
    assert.deepEqual(result, { data: [], total: 0 })
  })

  it('whereGroup callbacks receive the where-chain subset (ModelQueryGroup)', () => {
    // Compile-time contract: the group sub-builder only promises the
    // where family — mirroring rudder's contracts-level QueryBuilder,
    // which lacks the hydrating extras inside group callbacks.
    const calls: string[] = []
    const group: import('./modelDefaults.js').ModelQueryGroup = {
      where:   (..._args: unknown[]) => { calls.push('where');   return group },
      orWhere: (..._args: unknown[]) => { calls.push('orWhere'); return group },
    }
    group.where('a', 1).orWhere('b', 2)
    assert.deepEqual(calls, ['where', 'orWhere'])
  })
})
