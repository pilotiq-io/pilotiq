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

/**
 * Adapt a stub `find(id)` to the `query().where(pk, id).paginate(1, 1)`
 * shape that pilotiq's `findRecord(R, id, ctx)` now drives. Lets these
 * tests keep their `find(id)` map-backed stubs without rewriting them
 * into row arrays.
 */
function findAdapter(find: (id: string) => Promise<unknown>): ModelQuery {
  let captured: unknown
  const q: ModelQuery = {
    where(...args: unknown[]): ModelQuery {
      captured = args.length === 2 ? args[1] : args[2]
      return q
    },
    orWhere(...args: unknown[]): ModelQuery {
      captured = args.length === 2 ? args[1] : args[2]
      return q
    },
    orderBy(): ModelQuery { return q },
    async paginate() {
      const r = await find(String(captured))
      return { data: r ? [r] : [], total: r ? 1 : 0 }
    },
  }
  return q
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
    query(): ModelQuery { return findAdapter((this as ModelLike).find as (id: string) => Promise<unknown>) },
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

  it('registers list/create/view/edit/delete per manager', () => {
    const { panel } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const paths = router.list().map(r => `${r.method} ${r.path}`)

    assert.ok(paths.includes('GET /admin/users/:id/posts'),                    'list')
    assert.ok(paths.includes('GET /admin/users/:id/posts/create'),             'create-get')
    assert.ok(paths.includes('POST /admin/users/:id/posts/create'),            'create-post')
    assert.ok(paths.includes('GET /admin/users/:id/posts/:childId'),           'view-get')
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

describe('relation routes — view GET (Phase A)', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('returns relation-view for a child that belongs to the parent', async () => {
    const { panel } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts/:childId' && r.method === 'GET')!
    const { result, res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'u1', childId: 'p1' } }),
    )
    assert.equal(res.statusCode, 200)
    const view = result as { id: string; props: Record<string, unknown> }
    assert.equal(view.id, 'pilotiq.relation-view')
    assert.equal(view.props['mode'], 'view')
    assert.equal(view.props['childId'], 'p1')
  })

  it('404s under IDOR (child belongs to a different parent)', async () => {
    const { panel } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts/:childId' && r.method === 'GET')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'u1', childId: 'p3' } }),    // p3 is u2's
    )
    assert.equal(res.statusCode, 404)
  })

  it('404s when childId is the literal "create" reserved token', async () => {
    const { panel } = buildWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts/:childId' && r.method === 'GET')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'u1', childId: 'create' } }),
    )
    assert.equal(res.statusCode, 404)
  })

  it('403s when manager.canView denies', async () => {
    const { panel } = buildWorld()
    const R = panel.getConfig().resources[0]!
    const M = R.relations()[0]!
    ;(M as unknown as { canView: (...a: unknown[]) => Promise<boolean> }).canView = async () => false

    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/users/:id/posts/:childId' && r.method === 'GET')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'u1', childId: 'p1' } }),
    )
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

/** World builder for a M2M Article ↔ Tag relation. Defaults to
 * `belongsToMany`; pass `'morphToMany'` or `'morphedByMany'` to flip the
 * relations-map type so `getRelationType` resolves to the polymorphic
 * variant. The runtime accessor surface (where, paginate, attach,
 * detach) is identical across all three — the rudder ORM stamps +
 * filters the polymorphic discriminator on the morph variants
 * automatically, so pilotiq's plumbing is mode-agnostic beyond the
 * detach 404 gate + visibility predicates. */
function buildM2MWorld(morphMode: 'belongsToMany' | 'morphToMany' | 'morphedByMany' = 'belongsToMany') {
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
    query(): ModelQuery { return findAdapter((this as ModelLike).find as (id: string) => Promise<unknown>) },
  }
  // Tag the Article-side relations map with the M2M discriminator so
  // `getRelationType` flips the manager mode to the requested variant.
  Object.assign(ArticleModel as object, {
    relations: { tags: { type: morphMode, model: () => TagModel } },
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
    // Error message lists every M2M mode pilotiq accepts so the user
    // knows what to declare on the parent's `static relations` map.
    assert.match(String(res.sentBody), /belongsToMany/)
    assert.match(String(res.sentBody), /morphToMany/)
    assert.match(String(res.sentBody), /morphedByMany/)
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

// ── Polymorphic M2M follow-up: morphToMany / morphedByMany ──────────
//
// Both modes share the `belongsToMany` accessor surface (attach /
// detach / sync). Pilotiq's plumbing is mode-agnostic beyond the
// `_detach` 404 gate + visibility predicates — the tests below confirm
// the same routes and stub accessors that worked for `belongsToMany`
// also work for the morph variants.

describe('relation routes — morphToMany (owning polymorphic side)', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('mounts the manager-scoped routes for morphToMany managers', () => {
    const { panel } = buildM2MWorld('morphToMany')
    registerPilotiqRoutes(router, panel)
    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(paths.includes('POST /admin/articles/:id/tags/_action/:actionName'))
    assert.ok(paths.includes('POST /admin/articles/:id/tags/:childId/_detach'))
  })

  it('detaches an attached tag and redirects to the list (morphToMany)', async () => {
    const { panel, pivot } = buildM2MWorld('morphToMany')
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

  it('IDOR-404s when the tag is not attached (morphToMany)', async () => {
    const { panel, pivot } = buildM2MWorld('morphToMany')
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/articles/:id/tags/:childId/_detach' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'a1', childId: 't3' } }),
    )
    assert.equal(res.statusCode, 404)
    assert.equal(pivot.get('a1')?.size, 2)
  })

  it('dispatches relationAttach with ctx.relation stamped (morphToMany)', async () => {
    const { panel, pivot } = buildM2MWorld('morphToMany')
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
    const body = res.sentBody as { ok: boolean }
    assert.equal(body.ok, true)
    assert.equal(pivot.get('a2')?.has('t3'), true)
  })
})

describe('relation routes — morphedByMany (inverse polymorphic side)', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('mounts the manager-scoped routes for morphedByMany managers', () => {
    const { panel } = buildM2MWorld('morphedByMany')
    registerPilotiqRoutes(router, panel)
    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(paths.includes('POST /admin/articles/:id/tags/_action/:actionName'))
    assert.ok(paths.includes('POST /admin/articles/:id/tags/:childId/_detach'))
  })

  it('detaches an attached tag and redirects to the list (morphedByMany)', async () => {
    const { panel, pivot } = buildM2MWorld('morphedByMany')
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/articles/:id/tags/:childId/_detach' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'a1', childId: 't1' } }),
    )
    assert.equal(res.redirectedTo?.url, '/admin/articles/a1/tags')
    assert.equal(res.redirectedTo?.code, 303)
    assert.equal(pivot.get('a1')?.has('t1'), false)
  })

  it('dispatches relationAttach with ctx.relation stamped (morphedByMany)', async () => {
    const { panel, pivot } = buildM2MWorld('morphedByMany')
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
    const body = res.sentBody as { ok: boolean }
    assert.equal(body.ok, true)
    assert.equal(pivot.get('a2')?.has('t3'), true)
  })
})

// ── Polymorphic follow-up: morphMany auto-injection ─────────────────

/** World builder for a polymorphic `morphMany` relation:
 *    Post.comments  → Comment.commentable
 *    Video.comments → Comment.commentable
 *  Children carry `commentableId` + `commentableType`. The discriminator
 *  defaults to the parent's `class.morphAlias ?? class.name`. */
function buildMorphWorld() {
  const commentRows: Row[] = [
    { id: 'c1', commentableId: 'p1', commentableType: 'Post',  body: 'Existing on post' },
    { id: 'c2', commentableId: 'v1', commentableType: 'Video', body: 'Existing on video' },
  ]

  const CommentModel: ModelLike = {
    async find(id) { return commentRows.find(r => String(r['id']) === String(id)) ?? null },
    async create(data) {
      const n: Row = { id: `c${commentRows.length + 1}`, ...data }
      commentRows.push(n)
      return n
    },
    async update(id, data) {
      const r = commentRows.find(r => String(r['id']) === String(id))
      if (r) Object.assign(r, data)
      return r ?? null
    },
    async delete(id) {
      const i = commentRows.findIndex(r => String(r['id']) === String(id))
      if (i >= 0) commentRows.splice(i, 1)
    },
    query() { return new StubQuery(commentRows) },
  }

  // Parent factory — returns a record whose constructor.name doubles as
  // the morph discriminator (mirrors rudder's runtime where the live
  // record is an instance of `class Post extends Model {}`). We fake the
  // class identity via `Object.setPrototypeOf`.
  function makeParentRecord(klass: { name: string; morphAlias?: string; primaryKey?: string }, id: string) {
    const rec = {
      [klass.primaryKey ?? 'id']: id,
      related(_n: string) {
        return new StubQuery(commentRows.filter(r => r['commentableId'] === id && r['commentableType'] === (klass.morphAlias ?? klass.name)))
      },
    }
    Object.setPrototypeOf(rec, { constructor: klass })
    return rec
  }

  const PostClass  = { name: 'Post',  primaryKey: 'id' }
  const VideoClass = { name: 'Video', primaryKey: 'id' }

  const PostModel: ModelLike = {
    async find(id) {
      if (String(id) === 'p1') return makeParentRecord(PostClass, 'p1')
      return null
    },
    async create() { throw new Error('not used') },
    async update() { throw new Error('not used') },
    async delete() { /* no-op */ },
    query(): ModelQuery { return findAdapter((this as ModelLike).find as (id: string) => Promise<unknown>) },
  }
  Object.assign(PostModel as object, {
    relations: { comments: { type: 'morphMany', model: () => CommentModel, morphName: 'commentable' } },
  })

  const VideoModel: ModelLike = {
    async find(id) {
      if (String(id) === 'v1') return makeParentRecord(VideoClass, 'v1')
      return null
    },
    async create() { throw new Error('not used') },
    async update() { throw new Error('not used') },
    async delete() { /* no-op */ },
    query(): ModelQuery { return findAdapter((this as ModelLike).find as (id: string) => Promise<unknown>) },
  }
  Object.assign(VideoModel as object, {
    relations: { comments: { type: 'morphMany', model: () => CommentModel, morphName: 'commentable' } },
  })

  class CommentResource extends Resource {
    static override label         = 'Comments'
    static override labelSingular = 'Comment'
    static override slug          = 'comments'
    static override get model() { return CommentModel }
    static override form(form: Form): Form { return form.schema([TextField.make('body').required()]) }
  }
  class CommentsManager extends RelationManager {
    static override relationship = 'comments'
    static override table(t: Table): Table { return t.columns([Column.make('body')]) }
    static override form(f: Form): Form  { return f.schema([TextField.make('body').required()]) }
  }
  class PostResource extends Resource {
    static override label = 'Posts'
    static override slug  = 'posts'
    static override get model() { return PostModel }
    static override relations() { return [CommentsManager] }
  }
  class VideoResource extends Resource {
    static override label = 'Videos'
    static override slug  = 'videos'
    static override get model() { return VideoModel }
    static override relations() { return [CommentsManager] }
  }

  const panel = Pilotiq.make('T').path('/admin').resources([PostResource, VideoResource, CommentResource])
  return { panel, PostResource, VideoResource, CommentResource, CommentsManager, commentRows }
}

describe('relation routes — polymorphic morphMany', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('auto-injects commentableId / commentableType on create POST', async () => {
    const { panel, commentRows } = buildMorphWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/create' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'p1' }, body: { body: 'Polymorphic child' } }),
    )
    assert.equal(res.redirectedTo?.code, 303)
    const created = commentRows.find(r => r['body'] === 'Polymorphic child')
    assert.ok(created, 'expected the new comment to be persisted')
    assert.equal(created['commentableId'],   'p1')
    assert.equal(created['commentableType'], 'Post')
  })

  it('uses the parent class.name (Video) as the discriminator for the second parent', async () => {
    const { panel, commentRows } = buildMorphWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/videos/:id/comments/create' && r.method === 'POST')!
    await callHandler(
      route.handler,
      fakeReq({ params: { id: 'v1' }, body: { body: 'On a video' } }),
    )
    const created = commentRows.find(r => r['body'] === 'On a video')
    assert.ok(created)
    assert.equal(created['commentableId'],   'v1')
    assert.equal(created['commentableType'], 'Video')
  })

  it('overwrites tampered commentableId / commentableType in the body (anti-tamper)', async () => {
    const { panel, commentRows } = buildMorphWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/create' && r.method === 'POST')!
    await callHandler(
      route.handler,
      fakeReq({
        params: { id: 'p1' },
        // Attacker tries to redirect ownership to v1/Video.
        body: { body: 'Hijacked', commentableId: 'v1', commentableType: 'Video' },
      }),
    )
    const created = commentRows.find(r => r['body'] === 'Hijacked')
    assert.ok(created)
    // Framework wins — child still owned by the URL-scoped parent.
    assert.equal(created['commentableId'],   'p1')
    assert.equal(created['commentableType'], 'Post')
  })

  it('composes with a user-supplied mutateDataBeforeCreate (user runs first, framework wins last)', async () => {
    const { panel, commentRows } = buildMorphWorld()
    // Mutate the registered manager's form to add a default body via user hook.
    const M = panel.getConfig().resources[0]!.relations()[0]!
    ;(M as unknown as { form: (f: Form) => Form }).form = (f: Form) =>
      f.schema([TextField.make('body').required()])
       .mutateDataBeforeCreate(async (data) => ({ ...data, audited: true, commentableType: 'Tampered' }))

    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/create' && r.method === 'POST')!
    await callHandler(
      route.handler,
      fakeReq({ params: { id: 'p1' }, body: { body: 'Composed' } }),
    )
    const created = commentRows.find(r => r['body'] === 'Composed')
    assert.ok(created)
    // User hook ran (audited stamped) AND framework morph injection won
    // for the morph columns themselves.
    assert.equal(created['audited'],         true)
    assert.equal(created['commentableId'],   'p1')
    assert.equal(created['commentableType'], 'Post')
  })

  it('honors parent.constructor.morphAlias when set', async () => {
    const { panel, commentRows } = buildMorphWorld()
    // Replace PostModel.find to return a record whose ctor exposes morphAlias.
    const PostR = panel.getConfig().resources[0]!
    const PostM = PostR.model!
    const original = PostM.find.bind(PostM)
    ;(PostM as unknown as { find: (id: unknown) => Promise<unknown> }).find = async (id: unknown) => {
      const rec = await original(id as string)
      if (!rec) return rec
      const klass = { name: 'Post', morphAlias: 'post', primaryKey: 'id' }
      Object.setPrototypeOf(rec as object, { constructor: klass })
      return rec
    }

    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/create' && r.method === 'POST')!
    await callHandler(
      route.handler,
      fakeReq({ params: { id: 'p1' }, body: { body: 'Aliased' } }),
    )
    const created = commentRows.find(r => r['body'] === 'Aliased')
    assert.ok(created)
    assert.equal(created['commentableType'], 'post')   // alias, not class name
  })

  it('re-stamps morph columns on edit POST so a tampered body cannot reassign ownership', async () => {
    const { panel, commentRows } = buildMorphWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/:childId/edit' && r.method === 'POST')!
    await callHandler(
      route.handler,
      fakeReq({
        params: { id: 'p1', childId: 'c1' },
        body:   { body: 'Edited', commentableId: 'v1', commentableType: 'Video' },
      }),
    )
    const c1 = commentRows.find(r => r['id'] === 'c1')!
    assert.equal(c1['body'],            'Edited')
    assert.equal(c1['commentableId'],   'p1')
    assert.equal(c1['commentableType'], 'Post')
  })
})
