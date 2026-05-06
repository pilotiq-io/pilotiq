import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Pilotiq } from './Pilotiq.js'
import { Resource } from './Resource.js'
import { Column } from './Column.js'
import { Table } from './elements/Table.js'
import type { ModelLike, ModelQuery, ModelWhereOperator } from './orm/modelDefaults.js'
import { searchAllResources } from './search.js'
import { searchData } from './pageData.js'
import { Heading } from './schema/Heading.js'
import { Text } from './schema/Text.js'

// ─── Fake ModelQuery / ModelLike ────────────────────────────

interface FakeRow { id: string | number; [key: string]: unknown }

function fakeModel(rows: FakeRow[]): ModelLike & {
  recordedQueries: Array<{ wheres: Array<[string, ModelWhereOperator | unknown, unknown?]>; limit?: number }>
} {
  const recordedQueries: Array<{ wheres: Array<[string, ModelWhereOperator | unknown, unknown?]>; limit?: number }> = []

  const M: ModelLike & { recordedQueries: typeof recordedQueries } = {
    primaryKey: 'id',
    async find(id) { return rows.find(r => String(r['id']) === String(id)) ?? null },
    async create(data) { return data },
    async update(_id, data) { return data },
    async delete(_id) {},
    query(): ModelQuery {
      const wheres: Array<[string, ModelWhereOperator | unknown, unknown?]> = []
      const matches = (row: FakeRow): boolean => {
        // OR-of-LIKE only for our tests; column LIKE '%needle%'
        if (wheres.length === 0) return true
        return wheres.some(([col, op, val]) => {
          const haystack = String(row[col as string] ?? '').toLowerCase()
          if (op === 'LIKE') {
            const needle = String(val).replace(/^%|%$/g, '').toLowerCase()
            return haystack.includes(needle)
          }
          if (op === undefined) {
            return String(row[col as string] ?? '') === String(val)
          }
          return false
        })
      }
      const q: ModelQuery = {
        where(col: string, opOrVal: unknown, val?: unknown): ModelQuery {
          wheres.push([col, val !== undefined ? opOrVal : undefined, val !== undefined ? val : opOrVal])
          return q
        },
        orWhere(col: string, opOrVal: unknown, val?: unknown): ModelQuery {
          wheres.push([col, val !== undefined ? opOrVal : undefined, val !== undefined ? val : opOrVal])
          return q
        },
        orderBy(_col: string): ModelQuery { return q },
        async paginate(page: number, perPage = 10) {
          recordedQueries.push({ wheres: [...wheres], limit: perPage })
          const matched = rows.filter(matches)
          const start = (page - 1) * perPage
          return { data: matched.slice(start, start + perPage), total: matched.length }
        },
      }
      return q
    },
    recordedQueries,
  }
  return M
}

// ─── Tests ──────────────────────────────────────────────────

describe('searchAllResources (Plan #12)', () => {
  it('returns [] for queries shorter than 2 chars', async () => {
    const M = fakeModel([{ id: '1', title: 'Hello' }])
    class A extends Resource {
      static override label = 'Articles'
      static override slug  = 'articles'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
    assert.deepEqual(await searchAllResources(pilotiq, '',  null), [])
    assert.deepEqual(await searchAllResources(pilotiq, 'a', null), [])
  })

  it('skips resources with globalSearch=false', async () => {
    const M = fakeModel([{ id: '1', title: 'Hello world' }])
    class A extends Resource {
      static override label = 'Articles'
      static override slug  = 'articles'
      // globalSearch defaults to false
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
    assert.deepEqual(await searchAllResources(pilotiq, 'hello', null), [])
  })

  it('returns matching rows from opted-in resources', async () => {
    const M = fakeModel([
      { id: '1', title: 'Hello world' },
      { id: '2', title: 'Goodbye' },
      { id: '3', title: 'Hello again' },
    ])
    class A extends Resource {
      static override label = 'Articles'
      static override slug  = 'articles'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
    const results = await searchAllResources(pilotiq, 'hello', null)
    assert.equal(results.length, 2)
    assert.equal(results[0]!.resource, 'articles')
    assert.equal(results[0]!.resourceLabel, 'Articles')
    assert.equal(results[0]!.title, 'Hello world')
    assert.equal(results[0]!.url, '/admin/articles/1')
  })

  it('applies subtitle override when set', async () => {
    const M = fakeModel([{ id: '1', title: 'Post', publishedAt: '2026-04-01' }])
    class A extends Resource {
      static override label = 'Articles'
      static override slug  = 'articles'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
      static override getGlobalSearchResultSubtitle(record: unknown): string | undefined {
        const r = record as { publishedAt?: string }
        return r.publishedAt ? `Published ${r.publishedAt}` : undefined
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
    const results = await searchAllResources(pilotiq, 'post', null)
    assert.equal(results[0]!.subtitle, 'Published 2026-04-01')
  })

  it('honors getGlobalSearchResultUrl override', async () => {
    const M = fakeModel([{ id: '99', title: 'Edit me' }])
    class A extends Resource {
      static override label = 'Articles'
      static override slug  = 'articles'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
      static override getGlobalSearchResultUrl(record: unknown, base: string): string {
        return `${base}/articles/${(record as { id: string }).id}/edit`
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
    const results = await searchAllResources(pilotiq, 'edit', null)
    assert.equal(results[0]!.url, '/admin/articles/99/edit')
  })

  it('drops resources where canAccess returns false', async () => {
    const M1 = fakeModel([{ id: '1', title: 'A1' }])
    const M2 = fakeModel([{ id: '2', title: 'A2' }])
    class Visible extends Resource {
      static override label = 'Visible'
      static override slug  = 'visible'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M1
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
    }
    class Hidden extends Resource {
      static override label = 'Hidden'
      static override slug  = 'hidden'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M2
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
      static override async canAccess(_user: unknown): Promise<boolean> { return false }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([Visible, Hidden])
    const results = await searchAllResources(pilotiq, 'A1', null)
    assert.equal(results.length, 1)
    assert.equal(results[0]!.resource, 'visible')
  })

  it('drops resources where canViewAny returns false', async () => {
    const M = fakeModel([{ id: '1', title: 'Hidden' }])
    class A extends Resource {
      static override label = 'Articles'
      static override slug  = 'articles'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
      static override async canViewAny(_user: unknown): Promise<boolean> { return false }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
    const results = await searchAllResources(pilotiq, 'hidden', null)
    assert.equal(results.length, 0)
  })

  it('continues other resources when one throws on getGlobalSearchQuery', async () => {
    const M1 = fakeModel([{ id: '1', title: 'works' }])
    class Broken extends Resource {
      static override label = 'Broken'
      static override slug  = 'broken'
      static override globalSearch = true
      static override getGlobalSearchQuery(_needle: string): ModelQuery | undefined {
        throw new Error('intentional')
      }
    }
    class OK extends Resource {
      static override label = 'OK'
      static override slug  = 'ok'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M1
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([Broken, OK])
    // Silence the warn during the test.
    const originalWarn = console.warn
    console.warn = () => {}
    try {
      const results = await searchAllResources(pilotiq, 'works', null)
      assert.equal(results.length, 1)
      assert.equal(results[0]!.resource, 'ok')
    } finally {
      console.warn = originalWarn
    }
  })

  it('returns [] when a resource has no model AND no override', async () => {
    class A extends Resource {
      static override label        = 'Modeless'
      static override slug         = 'modeless'
      static override globalSearch = true
      // No model. No getGlobalSearchQuery override. No data source → skip.
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
    const results = await searchAllResources(pilotiq, 'anything', null)
    assert.equal(results.length, 0)
  })

  it('caps results per resource via opts.limitPerResource', async () => {
    const M = fakeModel(Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: `row ${i}` })))
    class A extends Resource {
      static override label = 'Many'
      static override slug  = 'many'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
    const results = await searchAllResources(pilotiq, 'row', null, { limitPerResource: 3 })
    assert.equal(results.length, 3)
  })

  it('caps total results across all resources', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: String(i), title: `row ${i}` }))
    const Ma = fakeModel(rows.map(r => ({ ...r, id: `a-${r.id}` })))
    const Mb = fakeModel(rows.map(r => ({ ...r, id: `b-${r.id}` })))
    class A extends Resource {
      static override label = 'A'
      static override slug  = 'a'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = Ma
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
    }
    class B extends Resource {
      static override label = 'B'
      static override slug  = 'b'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = Mb
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A, B])
    const results = await searchAllResources(pilotiq, 'row', null, {
      limitPerResource: 10,
      limitTotal:       7,
    })
    assert.equal(results.length, 7)
  })

  it('uses getGlobalSearchQuery override when present', async () => {
    const M = fakeModel([{ id: '1', title: 'pre-override' }])
    let queryArg = ''
    class A extends Resource {
      static override label = 'Override'
      static override slug  = 'override'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
      static override getGlobalSearchQuery(needle: string): ModelQuery | undefined {
        queryArg = needle
        // Just return the unmodified query so paginate still produces the row.
        return M.query()
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
    const results = await searchAllResources(pilotiq, 'anything', null)
    assert.equal(queryArg, 'anything')
    assert.equal(results.length, 1)
  })

  it('searchData wraps searchAllResources with resolveUser', async () => {
    const M = fakeModel([{ id: '1', title: 'searchable' }])
    let userSeen: unknown = 'untouched'
    class A extends Resource {
      static override label = 'Articles'
      static override slug  = 'articles'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
      static override async canAccess(user: unknown): Promise<boolean> {
        userSeen = user
        return true
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A]).user(() => ({ role: 'admin' }))
    const result = await searchData(pilotiq, 'searchable', { fakeReq: true })
    assert.equal(result.ok, true)
    assert.equal(result.results.length, 1)
    assert.deepEqual(userSeen, { role: 'admin' })
  })

  it('serializes the resource icon onto each result', async () => {
    const M = fakeModel([{ id: '1', title: 'AB' }])
    class A extends Resource {
      static override label = 'Articles'
      static override slug  = 'articles'
      static override icon  = 'newspaper'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
    const results = await searchAllResources(pilotiq, 'AB', null)
    assert.equal(results[0]!.icon, 'newspaper')
  })

  it('omits renderHooks key when no global-search hooks registered', async () => {
    const M = fakeModel([{ id: '1', title: 'searchable' }])
    class A extends Resource {
      static override label = 'Articles'
      static override slug  = 'articles'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
    const result = await searchData(pilotiq, 'searchable')
    assert.equal('renderHooks' in result, false)
  })

  it('resolves panels::global-search.results.before/.after when registered', async () => {
    const M = fakeModel([{ id: '1', title: 'searchable' }])
    class A extends Resource {
      static override label = 'Articles'
      static override slug  = 'articles'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
    }
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
      .renderHook('panels::global-search.results.before', () => [Heading.make('Before')])
      .renderHook('panels::global-search.results.after',  () => [Text.make('After')])
    const result = await searchData(pilotiq, 'searchable')
    assert.equal(result.ok, true)
    const hooks = result.renderHooks
    assert.ok(hooks, 'renderHooks should be present')
    const before = hooks!['panels::global-search.results.before']
    const after  = hooks!['panels::global-search.results.after']
    assert.equal(before?.length, 1)
    assert.equal(after?.length,  1)
    assert.equal(before![0]!['type'], 'heading')
    assert.equal(after![0]!['type'],  'text')
  })

  it('passes resolved user into the global-search hook context', async () => {
    const M = fakeModel([{ id: '1', title: 'searchable' }])
    class A extends Resource {
      static override label = 'Articles'
      static override slug  = 'articles'
      static override globalSearch = true
      static override recordTitleAttribute = 'title'
      static override model = M
      static override table(table: Table): Table {
        return table.columns([Column.make('title').searchable()])
      }
    }
    let userSeen: unknown = 'untouched'
    const pilotiq = Pilotiq.make('test').path('/admin').resources([A])
      .user(() => ({ role: 'editor' }))
      .renderHook('panels::global-search.results.before', (ctx) => {
        userSeen = ctx.user
        return [Heading.make('Hi')]
      })
    await searchData(pilotiq, 'searchable', { fakeReq: true })
    assert.deepEqual(userSeen, { role: 'editor' })
  })
})
