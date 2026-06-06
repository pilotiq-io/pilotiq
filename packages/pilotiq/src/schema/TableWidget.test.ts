/**
 * Plan #15 Phase D — `TableWidget` element tests.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Column } from '../Column.js'
import { TableWidget } from './TableWidget.js'
import { resolveSchema, type RenderContext } from './resolveSchema.js'
import { isServerDataElement } from './ServerDataElement.js'
import type { ModelLike, ModelQuery } from '../orm/modelDefaults.js'

// ─── Test stubs ──────────────────────────────────────────────

class StubQuery implements ModelQuery {
  // `with` / `withCount` are required on ModelQuery (eager-load surface);
  // stubs no-op them.
  with(): ModelQuery { return this }
  withCount(): ModelQuery { return this }
  public readonly ops: Array<{ op: string; args: unknown[] }> = []
  constructor(private readonly rows: unknown[], private readonly total = rows.length) {}
  where(...args: unknown[]): this { this.ops.push({ op: 'where', args }); return this }
  orWhere(...args: unknown[]): this { this.ops.push({ op: 'orWhere', args }); return this }
  orderBy(column: string, direction?: 'ASC' | 'DESC'): this {
    this.ops.push({ op: 'orderBy', args: [column, direction] })
    return this
  }
  async paginate(page: number, perPage?: number): Promise<{ data: unknown[]; total: number }> {
    this.ops.push({ op: 'paginate', args: [page, perPage] })
    return { data: this.rows, total: this.total }
  }
}

function stubModel(rows: unknown[]): ModelLike {
  return {
    async find()    { return undefined },
    async create()  { return undefined },
    async update()  { return undefined },
    async delete()  { return undefined },
    query() { return new StubQuery(rows) },
  }
}

// ─── Tests ──────────────────────────────────────────────────

describe('TableWidget element', () => {
  describe('factory + identity', () => {
    it('TableWidget.make() returns an instance', () => {
      const w = TableWidget.make('recent')
      assert.ok(w instanceof TableWidget)
      assert.equal(w.getType(), 'tableWidget')
    })

    it('falls back to subclass class name when no id passed', () => {
      class RecentPosts extends TableWidget {}
      assert.equal(RecentPosts.make().getId(), 'RecentPosts')
    })

    it('explicit id wins over class name', () => {
      class RecentPosts extends TableWidget {}
      assert.equal(RecentPosts.make('explicit').getId(), 'explicit')
    })

    it('is a ServerDataElement', () => {
      assert.equal(isServerDataElement(TableWidget.make('a')), true)
    })

    it('lazy default = true (inherited)', () => {
      assert.equal(TableWidget.make('a').isLazy(), true)
    })
  })

  describe('label / viewAllUrl', () => {
    it('instance label setter wins over static', () => {
      class Static extends TableWidget {
        static override label = 'Static label'
      }
      const w = Static.make().label('Instance label')
      assert.equal(w.getLabel(), 'Instance label')
    })

    it('static label is the fallback', () => {
      class Static extends TableWidget {
        static override label = 'Static label'
      }
      assert.equal(Static.make().getLabel(), 'Static label')
    })

    it('returns undefined when neither set', () => {
      assert.equal(TableWidget.make('a').getLabel(), undefined)
    })

    it('viewAllUrl: instance wins over static', () => {
      class Static extends TableWidget {
        static override viewAllUrl = '/static'
      }
      assert.equal(Static.make().viewAllUrl('/instance').getViewAllUrl(), '/instance')
    })

    it('viewAllUrl: static is the fallback', () => {
      class Static extends TableWidget {
        static override viewAllUrl = '/static'
      }
      assert.equal(Static.make().getViewAllUrl(), '/static')
    })
  })

  describe('columns', () => {
    it('instance columns wins over static factory', () => {
      class Static extends TableWidget {
        static override columns = () => [Column.make('static')]
      }
      const w = Static.make().columns([Column.make('instance')])
      assert.equal(w.getColumns().length, 1)
      assert.equal(w.getColumns()[0]!.name, 'instance')
    })

    it('static columns() factory is the fallback', () => {
      class Static extends TableWidget {
        static override columns = () => [Column.make('a'), Column.make('b')]
      }
      const cols = Static.make().getColumns()
      assert.equal(cols.length, 2)
      assert.equal(cols[0]!.name, 'a')
    })

    it('returns [] when no columns configured', () => {
      assert.deepEqual(TableWidget.make('a').getColumns(), [])
    })
  })

  describe('toMeta()', () => {
    it('emits type=tableWidget with empty columns by default', async () => {
      const [meta] = await resolveSchema([TableWidget.make('a')])
      assert.equal(meta!.type, 'tableWidget')
      assert.deepEqual(meta!['columns'], [])
    })

    it('serializes columns inline (not as children)', async () => {
      const [meta] = await resolveSchema([
        TableWidget.make('a').columns([Column.make('title').label('Title')]),
      ])
      assert.equal(Array.isArray(meta!['columns']), true)
      assert.equal((meta!['columns'] as unknown[]).length, 1)
      assert.equal(((meta!['columns'] as Array<{ name: string; label: string }>)[0])!.label, 'Title')
      assert.equal(meta!.children, undefined)
    })

    it('emits label + viewAllUrl when set', async () => {
      const [meta] = await resolveSchema([
        TableWidget.make('a').label('Recent').viewAllUrl('/all'),
      ])
      assert.equal(meta!['label'], 'Recent')
      assert.equal(meta!['viewAllUrl'], '/all')
    })

    it('omits label + viewAllUrl when unset', async () => {
      const [meta] = await resolveSchema([TableWidget.make('a')])
      assert.equal(meta!['label'], undefined)
      assert.equal(meta!['viewAllUrl'], undefined)
    })

    it('serverData wire-shape stamps land on top', async () => {
      class W extends TableWidget {}
      const w = W.make().poll(60).lazy(false)
      const [meta] = await resolveSchema([w])
      assert.equal(meta!['serverData'], true)
      assert.equal(meta!['id'], 'W')
      assert.equal(meta!['poll'], 60)
      assert.equal(meta!['lazy'], false)
    })
  })

  describe('resolveServerData() — fluent records', () => {
    it('runs the instance .records(fn) hook', async () => {
      const w = TableWidget.make('a').records(async () => ({
        rows:  [{ id: 1, title: 'Hello' }],
        total: 1,
      }))
      const data = await w.resolveServerData({} as RenderContext)
      assert.deepEqual(data, { rows: [{ id: 1, title: 'Hello' }], total: 1 })
    })

    it('omits total when records() did', async () => {
      const w = TableWidget.make('a').records(async () => ({ rows: [{ id: 1 }] }))
      const data = await w.resolveServerData({} as RenderContext)
      assert.deepEqual(data, { rows: [{ id: 1 }] })
    })

    it('passes the render context to records()', async () => {
      let received: unknown = null
      const w = TableWidget.make('a').records(async (ctx) => {
        received = ctx
        return { rows: [] }
      })
      await w.resolveServerData({ user: { id: 1 } } as RenderContext)
      assert.deepEqual(received, { user: { id: 1 } })
    })
  })

  describe('resolveServerData() — subclass records', () => {
    it('subclass static records() runs when no instance setter', async () => {
      class Sub extends TableWidget {
        static override async records() {
          return { rows: [{ id: 1 }], total: 1 }
        }
      }
      const data = await Sub.make().resolveServerData({} as RenderContext)
      assert.deepEqual(data, { rows: [{ id: 1 }], total: 1 })
    })

    it('instance .records() overrides static records()', async () => {
      class Sub extends TableWidget {
        static override async records() {
          return { rows: [{ id: 'static' }] }
        }
      }
      const w = Sub.make().records(async () => ({ rows: [{ id: 'instance' }] }))
      const data = await w.resolveServerData({} as RenderContext)
      assert.deepEqual(data, { rows: [{ id: 'instance' }] })
    })
  })

  describe('resolveServerData() — model + query', () => {
    it('default model path uses paginate(1, 5)', async () => {
      const M = stubModel([{ id: 1 }, { id: 2 }])
      const w = TableWidget.make('a').model(M)
      const data = await w.resolveServerData({} as RenderContext)
      assert.deepEqual(data.rows, [{ id: 1 }, { id: 2 }])
      assert.equal(data.total, 2)
    })

    it('custom .query(fn) drives the model query', async () => {
      const M = stubModel([{ id: 1 }])
      let saw: ModelQuery | undefined
      const w = TableWidget.make('a').model(M).query(async (q) => {
        saw = q
        return q.orderBy('id', 'DESC').paginate(1, 3)
      })
      await w.resolveServerData({} as RenderContext)
      const ops = (saw as unknown as StubQuery).ops
      assert.equal(ops[0]!.op, 'orderBy')
      assert.equal(ops[1]!.op, 'paginate')
      assert.deepEqual(ops[1]!.args, [1, 3])
    })

    it('static query() on subclass is honored when instance has none', async () => {
      const M = stubModel([{ id: 99 }])
      class Sub extends TableWidget {
        static override model = M
        static override query = async (q: ModelQuery) =>
          q.orderBy('createdAt', 'DESC').paginate(1, 7)
      }
      const w = Sub.make()
      const data = await w.resolveServerData({} as RenderContext)
      assert.deepEqual(data.rows, [{ id: 99 }])
    })

    it('throws when no records source is configured', async () => {
      await assert.rejects(
        () => TableWidget.make('a').resolveServerData({} as RenderContext),
        /no rows source/,
      )
    })
  })

  describe('resolveServerData() — formatStateUsing per row', () => {
    it('runs server-side formatters and stamps row._formatted', async () => {
      const w = TableWidget.make('a')
        .columns([
          Column.make('title').formatStateUsing((value) => `> ${value}`),
          Column.make('plain'),
        ])
        .records(async () => ({
          rows: [{ title: 'Hello', plain: 'untouched' }],
        }))
      const data = await w.resolveServerData({} as RenderContext)
      const row = data.rows[0]!
      assert.deepEqual(row['_formatted'], { title: '> Hello' })
      assert.equal(row['plain'], 'untouched')
    })

    it('skipped entirely when no column has a formatter', async () => {
      const w = TableWidget.make('a')
        .columns([Column.make('title')])
        .records(async () => ({ rows: [{ title: 'Hello' }] }))
      const data = await w.resolveServerData({} as RenderContext)
      assert.equal(data.rows[0]!['_formatted'], undefined)
    })

    it('throwing formatter falls back silently', async () => {
      const w = TableWidget.make('a')
        .columns([Column.make('title').formatStateUsing(() => { throw new Error('boom') })])
        .records(async () => ({ rows: [{ title: 'Hello' }] }))
      const data = await w.resolveServerData({} as RenderContext)
      // No `title` key on `_formatted` — renderer falls back to raw value.
      assert.deepEqual(data.rows[0]!['_formatted'], {})
    })
  })
})
