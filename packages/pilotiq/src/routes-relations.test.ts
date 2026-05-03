import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Router } from '@rudderjs/router'

import { Pilotiq } from './Pilotiq.js'
import { Resource } from './Resource.js'
import { RelationManager } from './RelationManager.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { TextField } from './fields/TextField.js'
import { registerPilotiqRoutes } from './routes.js'
import type { ModelLike, ModelQuery } from './orm/modelDefaults.js'
import { Action } from './actions/Action.js'

// ── Test doubles ─────────────────────────────────────────────────

interface Row extends Record<string, unknown> { id: string | number }

class StubQuery implements ModelQuery {
  private filters: Array<{ col: string; val: unknown }> = []
  constructor(private rows: Row[]) {}
  where(col: string, ...rest: unknown[]): ModelQuery {
    const val = rest.length === 1 ? rest[0] : rest[1]
    this.filters.push({ col, val })
    return this
  }
  orWhere(...args: unknown[]): ModelQuery { return this.where(args[0] as string, ...args.slice(1)) }
  orderBy(_c: string, _d?: 'ASC' | 'DESC'): ModelQuery { return this }
  async paginate() {
    let data = this.rows
    for (const f of this.filters) data = data.filter(r => r[f.col] === f.val)
    return { data, total: data.length }
  }
}

function fakeReq(overrides: Partial<{
  params: Record<string, string>
  body:   unknown
  query:  Record<string, string>
  headers: Record<string, string>
}> = {}): any {
  return {
    params: overrides.params ?? {},
    body:   overrides.body ?? null,
    query:  overrides.query ?? {},
    headers: overrides.headers ?? {},
    raw:    {},
  }
}

interface FakeRes {
  statusCode: number
  redirectedTo?: { url: string; code: number }
  sentBody?: unknown
  status(code: number): FakeRes
  redirect(url: string, code?: number): FakeRes
  send(body: unknown): FakeRes
  json(body: unknown): FakeRes
}

function fakeRes(): FakeRes {
  const r: FakeRes = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    redirect(url, code = 302) { this.redirectedTo = { url, code }; return this },
    send(body) { this.sentBody = body; return this },
    json(body) { this.sentBody = body; return this },
  }
  return r
}

async function callHandler(handler: (...args: any[]) => unknown, req: any = fakeReq(), res: any = fakeRes()) {
  const result = await handler(req, res)
  return { result, res: res as FakeRes }
}

// ── World builder ─────────────────────────────────────────────────

function buildWorld() {
  const postRows: Row[] = [
    { id: 'p1', parentId: 'u1', title: 'Post One' },
    { id: 'p2', parentId: 'u1', title: 'Post Two' },
    { id: 'p3', parentId: 'u2', title: 'Other Post' },
  ]
  const PostModel: ModelLike = {
    async find(id) { return postRows.find(r => r['id'] === id || String(r['id']) === String(id)) ?? null },
    async create(data) { const n: Row = { id: `p${postRows.length + 1}`, ...data }; postRows.push(n); return n },
    async update(id, data) { const r = postRows.find(r => r['id'] === id); if (r) Object.assign(r, data); return r ?? null },
    async delete(id) { const i = postRows.findIndex(r => r['id'] === id); if (i >= 0) postRows.splice(i, 1) },
    query() { return new StubQuery(postRows) },
  }

  const parents = new Map<string, { id: string; related: (n: string) => ModelQuery }>([
    ['u1', { id: 'u1', related: (_n) => new StubQuery(postRows.filter(r => r['parentId'] === 'u1')) }],
    ['u2', { id: 'u2', related: (_n) => new StubQuery(postRows.filter(r => r['parentId'] === 'u2')) }],
  ])
  const ParentModel: ModelLike = {
    async find(id) { return parents.get(String(id)) ?? null },
    async create() { throw new Error('not used') },
    async update() { throw new Error('not used') },
    async delete() { /* no-op */ },
    query() { throw new Error('not used') },
  }
  Object.assign(ParentModel as object, { relations: { posts: { model: () => PostModel } } })

  class PostResource extends Resource {
    static override label = 'Posts'
    static override labelSingular = 'Post'
    static override slug  = 'posts'
    static override get model() { return PostModel }
    static override form(form: Form): Form { return form.schema([TextField.make('title').required()]) }
  }
  class PostsManager extends RelationManager {
    static override relationship = 'posts'
    static override table(t: Table): Table { return t.columns([Column.make('title').sortable()]) }
    static override form(f: Form): Form  { return f.schema([TextField.make('title').required()]) }
  }
  class UserResource extends Resource {
    static override label = 'Users'
    static override slug  = 'users'
    static override get model() { return ParentModel }
    static override relations() { return [PostsManager] }
  }

  const panel = Pilotiq.make('T').path('/admin').resources([UserResource, PostResource])
  return { panel, UserResource, PostResource, PostsManager, postRows, ParentModel, PostModel }
}

// ── Tests ─────────────────────────────────────────────────────────

describe('relation routes — registration', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('registers list/create/edit/delete per manager', () => {
    const { panel } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const paths = router.list().map(r => `${r.method} ${r.path}`)

    assert.ok(paths.includes('GET /admin/users/:id/posts'),                    'list')
    assert.ok(paths.includes('GET /admin/users/:id/posts/create'),             'create-get')
    assert.ok(paths.includes('POST /admin/users/:id/posts/create'),            'create-post')
    assert.ok(paths.includes('GET /admin/users/:id/posts/:childId/edit'),      'edit-get')
    assert.ok(paths.includes('POST /admin/users/:id/posts/:childId/edit'),     'edit-post')
    assert.ok(paths.includes('POST /admin/users/:id/posts/:childId/delete'),   'delete')
  })

  it('throws at boot when a manager uses a reserved relationship', () => {
    class BadM extends RelationManager {
      static override relationship = 'edit'
    }
    class WithBad extends Resource {
      static override slug = 'things'
      static override relations() { return [BadM] }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([WithBad])
    assert.throws(
      () => registerPilotiqRoutes(new Router(), panel),
      /uses reserved relationship "edit"/,
    )
  })
})

describe('relation routes — list handler', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('returns relation-list view with parent-scoped table rows', async () => {
    const { panel } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts' && r.method === 'GET')!
    const { result } = await callHandler(route.handler, fakeReq({ params: { id: 'u1' } }))

    const view = result as { id: string; props: Record<string, unknown> }
    assert.equal(view.id, 'pilotiq.relation-list')
    const schema = view.props['schemaData'] as Array<Record<string, unknown>>
    const tableMeta = schema.find(s => s['type'] === 'table')
    assert.ok(tableMeta, 'expected a table element')
    const rows = tableMeta['rows'] as Array<Record<string, unknown>>
    assert.deepEqual(rows.map(r => r['id']).sort(), ['p1', 'p2'])
  })

  it('404s when the parent record is missing', async () => {
    const { panel } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts' && r.method === 'GET')!
    const { res } = await callHandler(route.handler, fakeReq({ params: { id: 'unknown' } }))
    assert.equal(res.statusCode, 404)
  })

  it('403s when manager.canViewAny denies', async () => {
    const { panel } = buildWorld()
    // Patch the manager class registered with the panel.
    const R = panel.getConfig().resources[0]!
    const M = R.relations()[0]!
    ;(M as unknown as { canViewAny: (...a: unknown[]) => Promise<boolean> }).canViewAny = async () => false

    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts' && r.method === 'GET')!
    const { res } = await callHandler(route.handler, fakeReq({ params: { id: 'u1' } }))
    assert.equal(res.statusCode, 403)
  })
})

describe('relation routes — create POST', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('creates a child and redirects to the list', async () => {
    const { panel, postRows } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts/create' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'u1' }, body: { title: 'Fresh post' } }),
    )

    assert.equal(res.redirectedTo?.url, '/admin/users/u1/posts')
    assert.equal(res.redirectedTo?.code, 303)
    assert.ok(postRows.some(r => r['title'] === 'Fresh post'))
  })

  it('422 on validation failure with prefilled values', async () => {
    const { panel } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts/create' && r.method === 'POST')!
    const { result, res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'u1' }, body: { title: '' } }),    // required violated
    )
    assert.equal(res.statusCode, 422)
    const view = result as { id: string; props: Record<string, unknown> }
    assert.equal(view.id, 'pilotiq.relation-create')
    assert.equal(view.props['hasErrors'], true)
  })
})

describe('relation routes — edit + delete POST', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('edit POST updates the child and redirects', async () => {
    const { panel, postRows } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts/:childId/edit' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'u1', childId: 'p1' }, body: { title: 'Renamed' } }),
    )
    assert.equal(res.redirectedTo?.code, 303)
    assert.equal(postRows.find(r => r['id'] === 'p1')!['title'], 'Renamed')
  })

  it('edit POST 404s when the child belongs to a different parent (IDOR)', async () => {
    const { panel } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts/:childId/edit' && r.method === 'POST')!
    // p3 belongs to u2, not u1 — this MUST not edit anything.
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'u1', childId: 'p3' }, body: { title: 'Hacked' } }),
    )
    assert.equal(res.statusCode, 404)
  })

  it('delete POST removes the child and redirects to the list', async () => {
    const { panel, postRows } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts/:childId/delete' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'u1', childId: 'p2' } }),
    )
    assert.equal(res.redirectedTo?.url, '/admin/users/u1/posts')
    assert.equal(res.redirectedTo?.code, 303)
    assert.ok(!postRows.some(r => r['id'] === 'p2'), 'child p2 should be deleted')
  })

  it('delete POST 404s under IDOR', async () => {
    const { panel, postRows } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts/:childId/delete' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'u1', childId: 'p3' } }),
    )
    assert.equal(res.statusCode, 404)
    // p3 still in store untouched
    assert.ok(postRows.some(r => r['id'] === 'p3'))
  })
})

// ── M2M follow-up: manager-scoped _action + _detach routes ──────────

/** World builder for a `belongsToMany` Article ↔ Tag relation. */
function buildM2MWorld() {
  const tagRows: Row[] = [
    { id: 't1', name: 'red' },
    { id: 't2', name: 'blue' },
    { id: 't3', name: 'green' },
  ]
  const TagModel: ModelLike = {
    async find(id) { return tagRows.find(r => String(r['id']) === String(id)) ?? null },
    async create() { throw new Error('not used') },
    async update() { throw new Error('not used') },
    async delete() { /* no-op */ },
    query() { return new StubQuery(tagRows) },
  }

  // Mutable pivot store: which tag ids are attached to each article.
  const pivot = new Map<string, Set<string>>([
    ['a1', new Set(['t1', 't2'])],
    ['a2', new Set([])],
  ])

  function makeRelatedAccessor(articleId: string) {
    return {
      where(_col: string, _op: string, val: unknown) {
        return {
          paginate: async (_p: number, _pp: number) => {
            const id = String(val)
            const attached = pivot.get(articleId) ?? new Set()
            const data = attached.has(id) ? [tagRows.find(r => String(r['id']) === id)!] : []
            return { data, total: data.length }
          },
        }
      },
      paginate: async (_p: number, _pp: number) => {
        const attached = pivot.get(articleId) ?? new Set()
        const data = tagRows.filter(r => attached.has(String(r['id'])))
        return { data, total: data.length }
      },
      attach: async (input: unknown) => {
        const ids = Array.isArray(input) ? input.map(String) : [String(input)]
        const set = pivot.get(articleId) ?? new Set()
        for (const id of ids) set.add(id)
        pivot.set(articleId, set)
      },
      detach: async (input: unknown) => {
        const ids = Array.isArray(input) ? input.map(String) : input === undefined ? [] : [String(input)]
        const set = pivot.get(articleId) ?? new Set()
        let n = 0
        for (const id of ids) { if (set.delete(id)) n++ }
        return n
      },
    }
  }

  const ArticleModel: ModelLike = {
    async find(id) {
      const articleId = String(id)
      if (!pivot.has(articleId)) return null
      return {
        id: articleId,
        related: (_n: string) => makeRelatedAccessor(articleId) as never,
      }
    },
    async create() { throw new Error('not used') },
    async update() { throw new Error('not used') },
    async delete() { /* no-op */ },
    query() { throw new Error('not used') },
  }
  // Tag the Article-side relations map with the M2M discriminator so
  // `getRelationType` flips the manager mode to belongsToMany.
  Object.assign(ArticleModel as object, {
    relations: { tags: { type: 'belongsToMany', model: () => TagModel } },
  })

  class TagResource extends Resource {
    static override label = 'Tags'
    static override labelSingular = 'Tag'
    static override slug  = 'tags'
    static override get model() { return TagModel }
  }
  class TagsManager extends RelationManager {
    static override relationship = 'tags'
    static override table(t: Table): Table { return t.columns([Column.make('name').sortable()]) }
  }
  class ArticleResource extends Resource {
    static override label = 'Articles'
    static override slug  = 'articles'
    static override get model() { return ArticleModel }
    static override relations() { return [TagsManager] }
  }

  const panel = Pilotiq.make('T').path('/admin').resources([ArticleResource, TagResource])
  return { panel, ArticleResource, TagResource, TagsManager, pivot, tagRows }
}

describe('relation routes — M2M registration', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('mounts manager-scoped _action and _detach routes for every manager', () => {
    const { panel } = buildWorld()  // hasMany world — _action still mounts unconditionally
    registerPilotiqRoutes(router, panel)
    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(paths.includes('POST /admin/users/:id/posts/_action/:actionName'))
    assert.ok(paths.includes('POST /admin/users/:id/posts/:childId/_detach'))
  })

  it('mounts the same manager-scoped routes for M2M managers', () => {
    const { panel } = buildM2MWorld()
    registerPilotiqRoutes(router, panel)
    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(paths.includes('POST /admin/articles/:id/tags/_action/:actionName'))
    assert.ok(paths.includes('POST /admin/articles/:id/tags/:childId/_detach'))
  })
})

describe('relation routes — _detach (M2M)', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('detaches an attached tag and redirects to the list', async () => {
    const { panel, pivot } = buildM2MWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/articles/:id/tags/:childId/_detach' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'a1', childId: 't1' } }),
    )
    assert.equal(res.redirectedTo?.url, '/admin/articles/a1/tags')
    assert.equal(res.redirectedTo?.code, 303)
    assert.equal(pivot.get('a1')?.has('t1'), false)
    assert.equal(pivot.get('a1')?.has('t2'), true)
  })

  it('IDOR-404s when the tag is not attached to this article', async () => {
    const { panel, pivot } = buildM2MWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/articles/:id/tags/:childId/_detach' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'a1', childId: 't3' } }),  // t3 isn't attached
    )
    assert.equal(res.statusCode, 404)
    // Pivot untouched.
    assert.equal(pivot.get('a1')?.size, 2)
  })

  it('404s when the manager mode is hasMany (not M2M)', async () => {
    const { panel, postRows } = buildWorld()  // hasMany world
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts/:childId/_detach' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'u1', childId: 'p1' } }),
    )
    assert.equal(res.statusCode, 404)
    assert.match(String(res.sentBody), /belongsToMany/)
    // Underlying record unchanged.
    assert.ok(postRows.some(r => r['id'] === 'p1'))
  })

  it('403s when manager.canDetach denies', async () => {
    const { panel } = buildM2MWorld()
    const M = panel.getConfig().resources[0]!.relations()[0]!
    ;(M as unknown as { canDetach: () => Promise<boolean> }).canDetach = async () => false
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/articles/:id/tags/:childId/_detach' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'a1', childId: 't1' } }),
    )
    assert.equal(res.statusCode, 403)
  })
})

describe('relation routes — _action (manager-scoped)', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('dispatches a handler-style action with ctx.relation stamped', async () => {
    const { panel, pivot } = buildM2MWorld()
    // Wire up `relationAttach` on the manager's table so we have a
    // dispatchable handler-style action to fire. Using the real factory
    // exercises the full pipeline.
    const TagsManager = panel.getConfig().resources[0]!.relations()[0]!
    const originalTable = TagsManager.table.bind(TagsManager)
    ;(TagsManager as unknown as { table: typeof TagsManager.table }).table = (t, ctx) => {
      return originalTable(t, ctx).headerActions([Action.relationAttach(TagsManager, ctx)])
    }

    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/articles/:id/tags/_action/:actionName' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({
        params: { id: 'a2', actionName: 'relationAttach' },
        body:   { _attachId: 't3', ids: [] },
        headers: { accept: 'application/json' },
      }),
    )

    const body = res.sentBody as { ok: boolean; redirect?: string; notifications?: Array<{ title: string }> }
    assert.equal(body.ok, true)
    // Pivot state mutated by the handler — proves ctx.relation was stamped.
    assert.equal(pivot.get('a2')?.has('t3'), true)
    assert.match(body.notifications?.[0]?.title ?? '', /attached/)
  })

  it('404s when the named action is not registered on the manager', async () => {
    const { panel } = buildM2MWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/articles/:id/tags/_action/:actionName' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({
        params: { id: 'a1', actionName: 'unknownAction' },
        body:   {},
        headers: { accept: 'application/json' },
      }),
    )
    assert.equal(res.statusCode, 404)
  })

  it('403s when parent canEdit denies', async () => {
    const { panel } = buildM2MWorld()
    const R = panel.getConfig().resources[0]!
    ;(R as unknown as { canEdit: () => Promise<boolean> }).canEdit = async () => false
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/articles/:id/tags/_action/:actionName' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({
        params: { id: 'a1', actionName: 'relationAttach' },
        headers: { accept: 'application/json' },
      }),
    )
    assert.equal(res.statusCode, 403)
  })
})
