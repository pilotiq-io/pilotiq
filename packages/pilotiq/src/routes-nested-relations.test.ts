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
import { Heading } from './schema/Heading.js'
import { registerPilotiqRoutes } from './routes.js'
import type { ModelLike, ModelQuery } from './orm/modelDefaults.js'

// ── Test doubles (parallel to routes-relations.test.ts) ──────────

interface Row extends Record<string, unknown> { id: string | number }

class StubQuery implements ModelQuery {
  // `with` / `withCount` are required on ModelQuery (eager-load surface);
  // stubs no-op them.
  with(): ModelQuery { return this }
  withCount(): ModelQuery { return this }
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

function findAdapter(find: (id: string) => Promise<unknown>): ModelQuery {
  let captured: unknown
  const q: ModelQuery = {
    with: () => q,
    withCount: () => q,
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

// ── Post → Comment → Reply world ─────────────────────────────────

function buildNestedWorld() {
  const replyRows: Row[] = [
    { id: 'r1', commentId: 'c1', body: 'reply A' },
    { id: 'r2', commentId: 'c1', body: 'reply B' },
    { id: 'r3', commentId: 'c2', body: 'reply on other comment' },
  ]
  const ReplyModel: ModelLike = {
    async find(id) { return replyRows.find(r => String(r['id']) === String(id)) ?? null },
    async create(data) { const n: Row = { id: `r${replyRows.length + 1}`, ...data }; replyRows.push(n); return n },
    async update(id, data) { const r = replyRows.find(r => String(r['id']) === String(id)); if (r) Object.assign(r, data); return r ?? null },
    async delete(id) { const i = replyRows.findIndex(r => String(r['id']) === String(id)); if (i >= 0) replyRows.splice(i, 1) },
    query() { return new StubQuery(replyRows) },
  }

  const commentRows: Row[] = [
    { id: 'c1', postId: 'po1', body: 'comment one' },
    { id: 'c2', postId: 'po1', body: 'comment two' },
    { id: 'c3', postId: 'po2', body: 'other-post comment' },
  ]
  function commentRecord(id: string) {
    const row = commentRows.find(r => String(r['id']) === id)
    if (!row) return undefined
    return {
      ...row,
      related(name: string): ModelQuery {
        if (name !== 'replies') return new StubQuery([])
        return new StubQuery(replyRows.filter(r => r['commentId'] === id))
      },
    }
  }
  const CommentModel: ModelLike = {
    async find(id) { return commentRecord(String(id)) ?? null },
    async create(data) { const n: Row = { id: `c${commentRows.length + 1}`, ...data }; commentRows.push(n); return n },
    async update(id, data) { const r = commentRows.find(r => String(r['id']) === String(id)); if (r) Object.assign(r, data); return r ?? null },
    async delete(id) { const i = commentRows.findIndex(r => String(r['id']) === String(id)); if (i >= 0) commentRows.splice(i, 1) },
    query(): ModelQuery { return findAdapter((this as ModelLike).find as (id: string) => Promise<unknown>) },
  }
  Object.assign(CommentModel as object, {
    relations: { replies: { model: () => ReplyModel, foreignKey: 'commentId' } },
  })

  const postRows: Row[] = [
    { id: 'po1', title: 'Post one' },
    { id: 'po2', title: 'Post two' },
  ]
  function postRecord(id: string) {
    const row = postRows.find(r => String(r['id']) === id)
    if (!row) return undefined
    return {
      ...row,
      related(name: string): ModelQuery {
        if (name !== 'comments') return new StubQuery([])
        const filtered = commentRows.filter(r => r['postId'] === id)
        return new StubQuery(filtered.map(r => commentRecord(String(r['id'])) as Row))
      },
    }
  }
  const PostModel: ModelLike = {
    async find(id) { return postRecord(String(id)) ?? null },
    async create() { throw new Error('not used') },
    async update() { throw new Error('not used') },
    async delete() { /* no-op */ },
    query(): ModelQuery { return findAdapter((this as ModelLike).find as (id: string) => Promise<unknown>) },
  }
  Object.assign(PostModel as object, {
    relations: { comments: { model: () => CommentModel, foreignKey: 'postId' } },
  })

  class ReplyResource extends Resource {
    static override label = 'Replies'
    static override labelSingular = 'Reply'
    static override slug  = 'replies'
    static override get model() { return ReplyModel }
    static override form(form: Form): Form { return form.schema([TextField.make('body').required()]) }
    static override detail() { return [Heading.make('Reply view')] }
  }
  class CommentResource extends Resource {
    static override slug = 'comments'
    static override get model() { return CommentModel }
    static override detail() { return [Heading.make('Comment view')] }
  }
  class CommentRepliesManager extends RelationManager {
    static override relationship = 'replies'
    static override label        = 'Replies'
    static override table(t: Table): Table { return t.columns([Column.make('body')]) }
    static override form(f: Form): Form  { return f.schema([TextField.make('body').required()]) }
    static override detail()              { return [Heading.make('Reply detail under comment')] }
  }
  class PostsCommentsManager extends RelationManager {
    static override relationship = 'comments'
    static override label        = 'Comments'
    static override table(t: Table): Table { return t.columns([Column.make('body')]) }
    static override form(f: Form): Form  { return f.schema([TextField.make('body').required()]) }
    static override relations()            { return [CommentRepliesManager] }
  }
  class PostResource extends Resource {
    static override label = 'Posts'
    static override slug  = 'posts'
    static override get model() { return PostModel }
    static override relations()            { return [PostsCommentsManager] }
  }

  const panel = Pilotiq.make('NRT-' + Math.random().toString(36).slice(2)).path('/admin')
    .resources([PostResource, CommentResource, ReplyResource])

  return { panel, PostsCommentsManager, CommentRepliesManager, postRows, commentRows, replyRows }
}

// ── Registration ─────────────────────────────────────────────────

describe('nested relation routes — registration (Phase B)', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('mounts list / create / view / edit / delete per (Resource, M, N) tuple', () => {
    const { panel } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const paths = router.list().map(r => `${r.method} ${r.path}`)

    assert.ok(paths.includes('GET /admin/posts/:id/comments/:childId/replies'),                       'list')
    assert.ok(paths.includes('GET /admin/posts/:id/comments/:childId/replies/create'),                'create-get')
    assert.ok(paths.includes('POST /admin/posts/:id/comments/:childId/replies/create'),               'create-post')
    assert.ok(paths.includes('GET /admin/posts/:id/comments/:childId/replies/:childId2'),             'view')
    assert.ok(paths.includes('GET /admin/posts/:id/comments/:childId/replies/:childId2/edit'),        'edit-get')
    assert.ok(paths.includes('POST /admin/posts/:id/comments/:childId/replies/:childId2/edit'),       'edit-post')
    assert.ok(paths.includes('POST /admin/posts/:id/comments/:childId/replies/:childId2/delete'),     'delete')
  })

  it('throws at boot when a nested manager declares its own relations() (depth-3 cap)', () => {
    class DeepM extends RelationManager {
      static override relationship = 'deep'
    }
    class NestedM extends RelationManager {
      static override relationship = 'replies'
      static override relations() { return [DeepM] }
    }
    class ParentM extends RelationManager {
      static override relationship = 'comments'
      static override relations() { return [NestedM] }
    }
    class WithDepth3 extends Resource {
      static override slug = 'posts'
      static override relations() { return [ParentM] }
    }
    const panel = Pilotiq.make('D3-' + Math.random()).path('/admin').resources([WithDepth3])
    assert.throws(
      () => registerPilotiqRoutes(new Router(), panel),
      /Phase B caps nesting at depth 2/,
    )
  })

  it('throws at boot when a nested manager uses a reserved relationship token', () => {
    class BadNested extends RelationManager {
      static override relationship = '_attach'
    }
    class ParentM extends RelationManager {
      static override relationship = 'comments'
      static override relations() { return [BadNested] }
    }
    class WithBad extends Resource {
      static override slug = 'posts'
      static override relations() { return [ParentM] }
    }
    const panel = Pilotiq.make('NRB-' + Math.random()).path('/admin').resources([WithBad])
    assert.throws(
      () => registerPilotiqRoutes(new Router(), panel),
      /Nested RelationManager .* uses reserved relationship "_attach"/,
    )
  })
})

// ── List handler ─────────────────────────────────────────────────

describe('nested relation routes — list (Phase B)', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('returns nested-relation-list with the right schema + chain rows', async () => {
    const { panel } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/:childId/replies' && r.method === 'GET')!
    const { result, res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1' } }),
    )
    assert.equal(res.statusCode, 200)
    const view = result as { id: string; props: Record<string, unknown> }
    assert.equal(view.id, 'pilotiq.nested-relation-list')
    const schema = view.props['schemaData'] as Array<Record<string, unknown>>
    const tableMeta = schema.find(s => s['type'] === 'table') as Record<string, unknown>
    const rows = tableMeta['rows'] as Array<Record<string, unknown>>
    assert.deepEqual(rows.map(r => r['id']).sort(), ['r1', 'r2'])
  })

  it('404s when chain[1] (child1) does NOT belong to chain[0] (post) — IDOR layer 1', async () => {
    const { panel } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/:childId/replies' && r.method === 'GET')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c3' } }),    // c3 belongs to po2
    )
    assert.equal(res.statusCode, 404)
  })
})

// ── View + IDOR layer 2 ──────────────────────────────────────────

describe('nested relation routes — view (Phase B)', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('returns nested-relation-view for a leaf record under the correct chain', async () => {
    const { panel } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/:childId/replies/:childId2' && r.method === 'GET')!
    const { result, res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1', childId2: 'r1' } }),
    )
    assert.equal(res.statusCode, 200)
    const view = result as { id: string; props: Record<string, unknown> }
    assert.equal(view.id, 'pilotiq.nested-relation-view')
    assert.equal(view.props['childId'], 'r1')
  })

  it('404s when the leaf record is on a different middle-layer parent (IDOR layer 2)', async () => {
    const { panel } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/:childId/replies/:childId2' && r.method === 'GET')!
    const { res } = await callHandler(
      route.handler,
      // r3 belongs to c2, not c1 — chain integrity must reject.
      fakeReq({ params: { id: 'po1', childId: 'c1', childId2: 'r3' } }),
    )
    assert.equal(res.statusCode, 404)
  })

  it('404s when leaf childId is the literal "create" reserved token', async () => {
    const { panel } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/:childId/replies/:childId2' && r.method === 'GET')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1', childId2: 'create' } }),
    )
    assert.equal(res.statusCode, 404)
  })
})

// ── Mutations ────────────────────────────────────────────────────

describe('nested relation routes — mutations (Phase B)', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('create POST persists a new leaf row pinned under the correct chain[1] parent', async () => {
    const { panel, replyRows } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/:childId/replies/create' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1' }, body: { body: 'Fresh reply' } }),
    )
    assert.equal(res.redirectedTo?.url, '/admin/posts/po1/comments/c1/replies')
    assert.equal(res.redirectedTo?.code, 303)
    assert.ok(replyRows.some(r => r['body'] === 'Fresh reply'))
  })

  it('edit POST updates a leaf row when the chain checks out', async () => {
    const { panel, replyRows } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/:childId/replies/:childId2/edit' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1', childId2: 'r1' }, body: { body: 'Renamed' } }),
    )
    assert.equal(res.redirectedTo?.code, 303)
    assert.equal(replyRows.find(r => r['id'] === 'r1')!['body'], 'Renamed')
  })

  it('edit POST 404s when the leaf belongs to a different middle parent', async () => {
    const { panel } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/:childId/replies/:childId2/edit' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1', childId2: 'r3' }, body: { body: 'Hacked' } }),
    )
    assert.equal(res.statusCode, 404)
  })

  it('delete POST removes the leaf record', async () => {
    const { panel, replyRows } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/posts/:id/comments/:childId/replies/:childId2/delete' && r.method === 'POST')!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1', childId2: 'r1' } }),
    )
    assert.equal(res.redirectedTo?.code, 303)
    assert.ok(!replyRows.some(r => r['id'] === 'r1'))
  })
})

// ── Phase B follow-up: nested action / detach / soft-delete ─────────

import { Action } from './actions/Action.js'

describe('nested relation routes — _action + _detach registration', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('mounts action + detach routes per (R, M, N) tuple unconditionally', () => {
    const { panel } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(
      paths.includes('POST /admin/posts/:id/comments/:childId/replies/_action/:actionName'),
      'nested _action route should mount even on hasMany managers',
    )
    assert.ok(
      paths.includes('POST /admin/posts/:id/comments/:childId/replies/:childId2/_detach'),
      'nested _detach route should mount unconditionally',
    )
  })

  it('does NOT mount restore / force-delete on a non-soft-delete world', () => {
    const { panel } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(!paths.includes('POST /admin/posts/:id/comments/:childId/replies/:childId2/restore'))
    assert.ok(!paths.includes('POST /admin/posts/:id/comments/:childId/replies/:childId2/force-delete'))
  })
})

describe('nested relation routes — _action behavior', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('dispatches a nested handler-style action with ctx.relation stamped', async () => {
    const { panel } = buildNestedWorld()
    // Splice a handler action into N's table so we have something to fire.
    const M = panel.getConfig().resources[0]!.relations()[0]!
    const N = M.relations()[0]!
    let dispatched: Partial<{ parentId: string; relationship: string }> = {}
    const originalTable = N.table.bind(N)
    ;(N as unknown as { table: typeof N.table }).table = (t, ctx) => {
      const out = originalTable(t, ctx) as Table
      out.actions([
        Action.make('ping')
          .label('Ping')
          .handler(async (input) => {
            const rel = (input as { relation?: { parentId: string; relationship: string } }).relation
            if (rel) dispatched = { parentId: rel.parentId, relationship: rel.relationship }
          }),
      ])
      return out
    }

    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r =>
      r.path === '/admin/posts/:id/comments/:childId/replies/_action/:actionName'
      && r.method === 'POST'
    )!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1', actionName: 'ping' } }),
    )
    assert.equal(res.redirectedTo?.code, 303)
    assert.equal(dispatched.parentId,     'c1')        // immediate parent of N
    assert.equal(dispatched.relationship, 'replies')   // nested rel key
  })

  it('404s when the action name is unknown', async () => {
    const { panel } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r =>
      r.path === '/admin/posts/:id/comments/:childId/replies/_action/:actionName'
      && r.method === 'POST'
    )!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1', actionName: 'nope' } }),
    )
    assert.equal(res.statusCode, 404)
  })
})

describe('nested relation routes — _detach behavior', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('404s on non-M2M nested managers (hasMany)', async () => {
    const { panel } = buildNestedWorld()
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r =>
      r.path === '/admin/posts/:id/comments/:childId/replies/:childId2/_detach'
      && r.method === 'POST'
    )!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1', childId2: 'r1' } }),
    )
    assert.equal(res.statusCode, 404)
    assert.match(String(res.sentBody), /belongsToMany/)
  })
})

// ── Soft-delete world: Comment → Replies, Reply has softDeletes ─────

function buildNestedSoftDeleteWorld() {
  const replyRows: Array<Row & { deletedAt?: string | null }> = [
    { id: 'r1', commentId: 'c1', body: 'reply A', deletedAt: null },
    { id: 'r2', commentId: 'c1', body: 'reply B (trashed)', deletedAt: '2026-01-01' },
  ]
  let restored: string | null = null
  let forced:   string | null = null
  const ReplyModel: ModelLike & { softDeletes?: boolean } = {
    softDeletes: true,
    async find(id) { return replyRows.find(r => String(r['id']) === String(id)) ?? null },
    async create() { throw new Error('not used') },
    async update() { throw new Error('not used') },
    async delete() { /* no-op */ },
    async restore(id: string) { restored = id; const r = replyRows.find(r => String(r['id']) === id); if (r) r.deletedAt = null },
    async forceDelete(id: string) { forced = id; const i = replyRows.findIndex(r => String(r['id']) === id); if (i >= 0) replyRows.splice(i, 1) },
    query() { return new StubQuery(replyRows) },
  }

  const commentRows: Row[] = [{ id: 'c1', postId: 'po1', body: 'comment one' }]
  function commentRecord(id: string) {
    const row = commentRows.find(r => String(r['id']) === id)
    if (!row) return undefined
    return {
      ...row,
      related(name: string): ModelQuery & { withTrashed?: () => ModelQuery } {
        if (name !== 'replies') return new StubQuery([]) as ModelQuery
        // Default scope hides trashed; withTrashed includes them.
        const visible = replyRows.filter(r => r.deletedAt == null)
        const all     = replyRows.slice()
        const q = new StubQuery(visible) as ModelQuery & { withTrashed?: () => ModelQuery }
        q.withTrashed = () => new StubQuery(all) as ModelQuery
        return q
      },
    }
  }
  const CommentModel: ModelLike = {
    async find(id) { return commentRecord(String(id)) ?? null },
    async create() { throw new Error('not used') },
    async update() { throw new Error('not used') },
    async delete() { /* no-op */ },
    query(): ModelQuery { return findAdapter((this as ModelLike).find as (id: string) => Promise<unknown>) },
  }
  Object.assign(CommentModel as object, {
    relations: { replies: { model: () => ReplyModel, foreignKey: 'commentId' } },
  })

  const postRows: Row[] = [{ id: 'po1', title: 'Post one' }]
  function postRecord(id: string) {
    const row = postRows.find(r => String(r['id']) === id)
    if (!row) return undefined
    return {
      ...row,
      related(name: string): ModelQuery {
        if (name !== 'comments') return new StubQuery([])
        return new StubQuery(commentRows.filter(r => r['postId'] === id).map(r => commentRecord(String(r['id'])) as Row))
      },
    }
  }
  const PostModel: ModelLike = {
    async find(id) { return postRecord(String(id)) ?? null },
    async create() { throw new Error('not used') },
    async update() { throw new Error('not used') },
    async delete() { /* no-op */ },
    query(): ModelQuery { return findAdapter((this as ModelLike).find as (id: string) => Promise<unknown>) },
  }
  Object.assign(PostModel as object, {
    relations: { comments: { model: () => CommentModel, foreignKey: 'postId' } },
  })

  class ReplyResource extends Resource {
    static override label = 'Replies'
    static override labelSingular = 'Reply'
    static override slug  = 'replies'
    static override softDeletes = true
    static override get model() { return ReplyModel }
    static override form(form: Form): Form { return form.schema([TextField.make('body').required()]) }
  }
  class CommentResource extends Resource {
    static override slug = 'comments'
    static override get model() { return CommentModel }
  }
  class CommentRepliesManager extends RelationManager {
    static override relationship = 'replies'
    static override label        = 'Replies'
    static override table(t: Table): Table { return t.columns([Column.make('body')]) }
    static override form(f: Form): Form  { return f.schema([TextField.make('body').required()]) }
  }
  class PostsCommentsManager extends RelationManager {
    static override relationship = 'comments'
    static override label        = 'Comments'
    static override table(t: Table): Table { return t.columns([Column.make('body')]) }
    static override form(f: Form): Form  { return f.schema([TextField.make('body').required()]) }
    static override relations()            { return [CommentRepliesManager] }
  }
  class PostResource extends Resource {
    static override label = 'Posts'
    static override slug  = 'posts'
    static override get model() { return PostModel }
    static override relations()            { return [PostsCommentsManager] }
  }

  const panel = Pilotiq.make('NRSD-' + Math.random().toString(36).slice(2)).path('/admin')
    .resources([PostResource, CommentResource, ReplyResource])

  return { panel, restore: () => restored, force: () => forced, replyRows }
}

describe('nested relation routes — soft-delete (restore + force-delete)', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('mounts restore + force-delete routes when Related2 has softDeletes', () => {
    const { panel } = buildNestedSoftDeleteWorld()
    registerPilotiqRoutes(router, panel)
    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(paths.includes('POST /admin/posts/:id/comments/:childId/replies/:childId2/restore'))
    assert.ok(paths.includes('POST /admin/posts/:id/comments/:childId/replies/:childId2/force-delete'))
  })

  it('restore POST calls model.restore on a trashed grandchild', async () => {
    const world = buildNestedSoftDeleteWorld()
    registerPilotiqRoutes(router, world.panel)
    const route = router.list().find(r =>
      r.path === '/admin/posts/:id/comments/:childId/replies/:childId2/restore'
      && r.method === 'POST'
    )!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1', childId2: 'r2' } }),
    )
    assert.equal(res.redirectedTo?.code, 303)
    assert.equal(world.restore(), 'r2')
  })

  it('force-delete POST removes the grandchild permanently', async () => {
    const world = buildNestedSoftDeleteWorld()
    registerPilotiqRoutes(router, world.panel)
    const route = router.list().find(r =>
      r.path === '/admin/posts/:id/comments/:childId/replies/:childId2/force-delete'
      && r.method === 'POST'
    )!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1', childId2: 'r2' } }),
    )
    assert.equal(res.redirectedTo?.code, 303)
    assert.equal(world.force(), 'r2')
    assert.ok(!world.replyRows.some(r => r['id'] === 'r2'))
  })

  it('restore 404s when the grandchild does not belong to the chain[1] parent', async () => {
    const world = buildNestedSoftDeleteWorld()
    registerPilotiqRoutes(router, world.panel)
    const route = router.list().find(r =>
      r.path === '/admin/posts/:id/comments/:childId/replies/:childId2/restore'
      && r.method === 'POST'
    )!
    const { res } = await callHandler(
      route.handler,
      fakeReq({ params: { id: 'po1', childId: 'c1', childId2: 'nope' } }),
    )
    assert.equal(res.statusCode, 404)
    assert.equal(world.restore(), null)
  })
})
