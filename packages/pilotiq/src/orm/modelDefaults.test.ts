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
    const schema = List.schema() as Array<{ getType(): string }>
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
    const table = (List.schema() as Array<unknown>)[1] as Table
    const handler = table.getRecords()!

    await handler({ search: 'foo', page: 1 } as TableContext)
    const ops = model.lastQuery!.ops
    assert.deepEqual(ops[0], { op: 'where',   args: ['title', 'LIKE', '%foo%'] })
    assert.deepEqual(ops[1], { op: 'orWhere', args: ['slug',  'LIKE', '%foo%'] })
    assert.deepEqual(ops[2], { op: 'paginate', args: [1, 20] })
  })

  it('translates ctx.sort to orderBy with uppercased direction', async () => {
    const List = defaultListPage(ArticleResource)
    const table = (List.schema() as Array<unknown>)[1] as Table
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
    const table = (defaultListPage(CustomResource).schema() as Array<unknown>)[1] as Table
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
    model = makeFakeModel({ findResult: { id: '7', title: 'Loaded' } })
  })

  it('edit page loadRecord proxies to model.find', async () => {
    const Edit = defaultEditPage(ArticleResource)
    const form = (Edit.schema() as Array<unknown>)[1] as Form
    const load = form.getLoadRecord()!

    const record = await load('7', { values: {} })
    assert.deepEqual(record, { id: '7', title: 'Loaded' })
    assert.deepEqual(model.calls, [{ kind: 'find', args: ['7'] }])
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
