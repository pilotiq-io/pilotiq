import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Pilotiq } from './Pilotiq.js'
import { Resource } from './Resource.js'
import { RelationManager } from './RelationManager.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { TextField } from './fields/TextField.js'
import { Heading } from './schema/Heading.js'
import { relationManagerData, dispatchPageData } from './pageData.js'
import { PilotiqRegistry } from './PilotiqRegistry.js'
import type { ModelLike, ModelQuery } from './orm/modelDefaults.js'

// ── Test doubles (parallel to the depth-1 fixture in
//    relationManagerData.test.ts) ─────────────────────────────────

interface QueryRow extends Record<string, unknown> { id: string | number }

class StubQuery implements ModelQuery {
  // `with` / `withCount` are required on ModelQuery (eager-load surface);
  // stubs no-op them.
  with(): ModelQuery { return this }
  withCount(): ModelQuery { return this }
  private filters: Array<{ col: string; val: unknown }> = []
  constructor(private rows: QueryRow[]) {}
  where(col: string, ...rest: unknown[]): ModelQuery {
    const val = rest.length === 1 ? rest[0] : rest[1]
    this.filters.push({ col, val })
    return this
  }
  orWhere(...args: unknown[]): ModelQuery { return this.where(args[0] as string, ...args.slice(1)) }
  orderBy(_c: string, _d?: 'ASC' | 'DESC'): ModelQuery { return this }
  async paginate(_p: number, _pp?: number) {
    let data = this.rows
    for (const f of this.filters) data = data.filter(r => r[f.col] === f.val)
    return { data, total: data.length }
  }
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

// Build a Post → Comment → Reply test world. Three layers of records
// + relationship metadata covering hasMany on every hop. Stubs are kept
// minimal — just enough to drive the chain walker, IDOR checks, and
// per-layer policy evaluation.
function buildNestedWorld(opts: {
  managerOverrides?: Partial<typeof RelationManager>
  nestedOverrides?:  Partial<typeof RelationManager>
  resourceOverrides?: Partial<typeof Resource>
} = {}) {
  const replyRows: QueryRow[] = [
    { id: 'r1', commentId: 'c1', body: 'reply A' },
    { id: 'r2', commentId: 'c1', body: 'reply B' },
    { id: 'r3', commentId: 'c2', body: 'reply on other comment' },
  ]
  const ReplyModel: ModelLike = {
    async find(id) { return replyRows.find(r => String(r['id']) === String(id)) ?? null },
    async create(data) { const n: QueryRow = { id: `r${replyRows.length + 1}`, ...data }; replyRows.push(n); return n },
    async update(id, data) { const r = replyRows.find(r => String(r['id']) === String(id)); if (r) Object.assign(r, data); return r ?? null },
    async delete(id)   { const i = replyRows.findIndex(r => String(r['id']) === String(id)); if (i >= 0) replyRows.splice(i, 1) },
    query() { return new StubQuery(replyRows) },
  }

  const commentRows: QueryRow[] = [
    { id: 'c1', postId: 'po1', body: 'comment one' },
    { id: 'c2', postId: 'po1', body: 'comment two' },
    { id: 'c3', postId: 'po2', body: 'other-post comment' },
  ]
  // Comments need `.related('replies')` for the chain walker's
  // childBelongsToParent + the inner Table records loader.
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
    async create(data) {
      const n: QueryRow = { id: `c${commentRows.length + 1}`, ...data }
      commentRows.push(n)
      return n
    },
    async update(id, data) { const r = commentRows.find(r => String(r['id']) === String(id)); if (r) Object.assign(r, data); return r ?? null },
    async delete(id)   { const i = commentRows.findIndex(r => String(r['id']) === String(id)); if (i >= 0) commentRows.splice(i, 1) },
    // Use findAdapter so `findRecord(R, id, ctx)` (the path used by
    // pageData to load parents) returns the augmented record with
    // `.related()` attached — bare commentRows lack that.
    query(): ModelQuery { return findAdapter((this as ModelLike).find as (id: string) => Promise<unknown>) },
  }
  Object.assign(CommentModel as object, {
    relations: { replies: { model: () => ReplyModel, foreignKey: 'commentId' } },
  })

  const postRows: QueryRow[] = [
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
        // Re-stamp the comment rows with `.related()` so the data
        // builder can drill straight in via `parent.related('comments')`
        // → that comment's row → `comment.related('replies')`.
        const filtered = commentRows.filter(r => r['postId'] === id)
        return new StubQuery(filtered.map(r => commentRecord(String(r['id'])) as QueryRow))
      },
    }
  }
  const PostModel: ModelLike = {
    async find(id) { return postRecord(String(id)) ?? null },
    async create() { throw new Error('not used') },
    async update() { throw new Error('not used') },
    async delete()   { /* no-op */ },
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
    static override label = 'Comments'
    static override labelSingular = 'Comment'
    static override slug  = 'comments'
    static override recordTitleAttribute = 'body'
    static override get model() { return CommentModel }
    static override form(form: Form): Form { return form.schema([TextField.make('body').required()]) }
    static override detail() { return [Heading.make('Comment view')] }
  }

  class CommentRepliesManager extends RelationManager {
    static override relationship = 'replies'
    static override label        = 'Replies'
    static override table(t: Table): Table { return t.columns([Column.make('body')]) }
    static override form(f: Form): Form  { return f.schema([TextField.make('body').required()]) }
    static override detail()              { return [Heading.make('Reply detail under comment')] }
  }
  if (opts.nestedOverrides) Object.assign(CommentRepliesManager, opts.nestedOverrides)

  class PostsCommentsManager extends RelationManager {
    static override relationship = 'comments'
    static override label        = 'Comments'
    static override table(t: Table): Table { return t.columns([Column.make('body')]) }
    static override form(f: Form): Form  { return f.schema([TextField.make('body').required()]) }
    static override detail()              { return [Heading.make('Comment detail under post')] }
    static override relations()            { return [CommentRepliesManager] }
  }
  if (opts.managerOverrides) Object.assign(PostsCommentsManager, opts.managerOverrides)

  class PostResource extends Resource {
    static override label = 'Posts'
    static override slug  = 'posts'
    static override get model() { return PostModel }
    static override relations()            { return [PostsCommentsManager] }
  }
  if (opts.resourceOverrides) Object.assign(PostResource, opts.resourceOverrides)

  const panel = Pilotiq.make('NTW-' + Math.random().toString(36).slice(2)).path('/admin')
    .resources([PostResource, CommentResource, ReplyResource])

  return {
    panel, PostResource, CommentResource, ReplyResource,
    PostsCommentsManager, CommentRepliesManager,
    postRows, commentRows, replyRows,
  }
}

const baseChain = [
  { recordId: 'po1', relationship: 'comments' },
  { recordId: 'c1',  relationship: 'replies'  },
] as const

// ── nestedRelationManagerData — happy paths + auth + IDOR ────────

describe('nestedRelationManagerData (Phase B) — list', () => {
  it('returns a resolved relation-list payload with chain context', async () => {
    const { panel } = buildNestedWorld()
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-list', slug: 'posts',
      chain: [{ recordId: 'po1', relationship: 'comments' }, { recordId: 'c1', relationship: 'replies' }],
    })
    const data = out as Record<string, unknown>
    assert.equal(data['pageType'], 'nested-relation-list')
    const relation = data['relation'] as Record<string, unknown>
    assert.equal(relation['relationship'], 'replies')
    assert.equal(relation['relatedSlug'],  'replies')
    const parentRelation = data['parentRelation'] as Record<string, unknown>
    assert.equal(parentRelation['relationship'], 'comments')
    const parent = data['parent'] as Record<string, unknown>
    assert.equal(parent['id'], 'po1')
    const parentChild = data['parentChild'] as Record<string, unknown>
    assert.equal(parentChild['id'], 'c1')
  })

  it('list resolves a Table that lists rows scoped to the leaf parent only', async () => {
    const { panel } = buildNestedWorld()
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-list', slug: 'posts',
      chain: [{ recordId: 'po1', relationship: 'comments' }, { recordId: 'c1', relationship: 'replies' }],
    })
    const schema = (out as Record<string, unknown>)['schemaData'] as Array<Record<string, unknown>>
    const table = schema.find(s => s['type'] === 'table') as Record<string, unknown>
    const rows = table['rows'] as Array<Record<string, unknown>>
    // c1 owns r1 + r2 — r3 is on c2 and must NOT bleed in via the
    // un-scoped manager table.
    assert.deepEqual(rows.map(r => r['id']).sort(), ['r1', 'r2'])
  })
})

describe('nestedRelationManagerData (Phase B) — chain failure modes', () => {
  it('returns null when the top-level slug is unknown', async () => {
    const { panel } = buildNestedWorld()
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-list', slug: 'missing',
      chain: [...baseChain],
    })
    assert.equal(out, null)
  })

  it('returns null when chain[0].relationship is unknown on the parent resource', async () => {
    const { panel } = buildNestedWorld()
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-list', slug: 'posts',
      chain: [{ recordId: 'po1', relationship: 'tags' }, { recordId: 'c1', relationship: 'replies' }],
    })
    assert.equal(out, null)
  })

  it('returns null when chain[1].relationship is unknown on the inner manager', async () => {
    const { panel } = buildNestedWorld()
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-list', slug: 'posts',
      chain: [{ recordId: 'po1', relationship: 'comments' }, { recordId: 'c1', relationship: 'reactions' }],
    })
    assert.equal(out, null)
  })

  it('returns null when chain[1].recordId does not belong to chain[0].recordId (IDOR layer 1)', async () => {
    const { panel } = buildNestedWorld()
    // c3 belongs to po2, not po1 — chain walker must reject.
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-list', slug: 'posts',
      chain: [{ recordId: 'po1', relationship: 'comments' }, { recordId: 'c3', relationship: 'replies' }],
    })
    assert.equal(out, null)
  })

  it('returns null when the chain[0] parent record cannot be loaded', async () => {
    const { panel } = buildNestedWorld()
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-list', slug: 'posts',
      chain: [{ recordId: 'unknown', relationship: 'comments' }, { recordId: 'c1', relationship: 'replies' }],
    })
    assert.equal(out, null)
  })
})

describe('nestedRelationManagerData (Phase B) — three-layer auth', () => {
  it('403 when the parent Resource canAccess fails', async () => {
    const { panel } = buildNestedWorld({
      resourceOverrides: { canAccess: async () => false } as Partial<typeof Resource>,
    })
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-list', slug: 'posts',
      chain: [...baseChain],
    })
    assert.deepEqual(out, { ok: false, status: 403 })
  })

  it('403 when the parent Resource canEdit fails', async () => {
    const { panel } = buildNestedWorld({
      resourceOverrides: { canEdit: async () => false } as Partial<typeof Resource>,
    })
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-list', slug: 'posts',
      chain: [...baseChain],
    })
    assert.deepEqual(out, { ok: false, status: 403 })
  })

  it('403 when the OUTER manager canView denies (gates drilling into child1)', async () => {
    const { panel } = buildNestedWorld({
      managerOverrides: { canView: async () => false } as Partial<typeof RelationManager>,
    })
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-list', slug: 'posts',
      chain: [...baseChain],
    })
    assert.deepEqual(out, { ok: false, status: 403 })
  })

  it('403 when the LEAF manager canViewAny denies on list', async () => {
    const { panel } = buildNestedWorld({
      nestedOverrides: { canViewAny: async () => false } as Partial<typeof RelationManager>,
    })
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-list', slug: 'posts',
      chain: [...baseChain],
    })
    assert.deepEqual(out, { ok: false, status: 403 })
  })

  it('403 when the LEAF manager canCreate denies on create', async () => {
    const { panel } = buildNestedWorld({
      nestedOverrides: { canCreate: async () => false } as Partial<typeof RelationManager>,
    })
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-create', slug: 'posts',
      chain: [...baseChain],
    })
    assert.deepEqual(out, { ok: false, status: 403 })
  })

  it('403 when the LEAF manager canEdit denies on edit', async () => {
    const { panel } = buildNestedWorld({
      nestedOverrides: { canEdit: async () => false } as Partial<typeof RelationManager>,
    })
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-edit', slug: 'posts',
      chain: [...baseChain],
      childId: 'r1',
    })
    assert.deepEqual(out, { ok: false, status: 403 })
  })
})

describe('nestedRelationManagerData (Phase B) — view scope', () => {
  it('view loads the leaf record + emits the manager.detail() schema', async () => {
    const { panel } = buildNestedWorld()
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-view', slug: 'posts',
      chain: [...baseChain],
      childId: 'r1',
    })
    const data = out as Record<string, unknown>
    assert.equal(data['pageType'], 'nested-relation-view')
    assert.equal(data['childId'],   'r1')
    const schema = data['schemaData'] as Array<Record<string, unknown>>
    const heading = schema.find(s => s['type'] === 'heading') as Record<string, unknown>
    assert.equal(heading['content'], 'Reply detail under comment')
  })

  it('view returns null when the leaf record does not belong to chain[1] (IDOR layer 2)', async () => {
    const { panel } = buildNestedWorld()
    // r3 belongs to c2 (different comment), so accessing it via c1 must
    // 404, even though r3 exists in the model.
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-view', slug: 'posts',
      chain: [...baseChain],
      childId: 'r3',
    })
    assert.equal(out, null)
  })

  it('view returns null when the leaf record id does not exist at all', async () => {
    const { panel } = buildNestedWorld()
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-view', slug: 'posts',
      chain: [...baseChain],
      childId: 'nope',
    })
    assert.equal(out, null)
  })
})

describe('Phase A relation-view — surfaces nested-manager tabs (Phase B polish)', () => {
  it('emits a second RelationTabs strip listing siblings under M.relations(), with __view active', async () => {
    const { panel } = buildNestedWorld()
    const out = await relationManagerData(panel, {
      kind: 'relation-view', slug: 'posts',
      recordId:    'po1',
      relationship:'comments',
      childId:     'c1',
    })
    const schema = (out as Record<string, unknown>)['schemaData'] as Array<Record<string, unknown>>
    // Exactly two `relation-tabs` strips at the top — the existing
    // post-scoped one (Phase A) plus the new comment-scoped one
    // (Phase B polish).
    const strips = schema.filter(s => s['type'] === 'relation-tabs') as Array<Record<string, unknown>>
    assert.equal(strips.length, 2, 'expected post-scope + comment-scope strips')

    // Post-scoped strip is unshifted last → index 0.
    const postScope = strips[0]!
    const postTabs = (postScope['tabs'] as Array<Record<string, unknown>>) ?? []
    assert.ok(postTabs.some(t => t['key'] === 'comments' && t['active'] === true),
      'post-scope strip should mark "comments" as active')

    // Comment-scoped strip is at index 1.
    const commentScope = strips[1]!
    const commentTabs = (commentScope['tabs'] as Array<Record<string, unknown>>) ?? []
    // Should carry the __view tab (active) + one tab per nested manager.
    const view = commentTabs.find(t => t['key'] === '__view')
    assert.ok(view, '__view tab missing on comment-scope strip')
    assert.equal(view!['active'], true)
    const replies = commentTabs.find(t => t['key'] === 'replies')
    assert.ok(replies, 'replies tab missing on comment-scope strip')
    assert.equal(replies!['active'], false)
    assert.equal(replies!['url'], '/admin/posts/po1/comments/c1/replies')
  })

  it('does not emit the comment-scope strip when M declares no nested relations', async () => {
    // Build a world without nested managers: drop CommentRepliesManager
    // by overriding PostsCommentsManager.relations() back to [].
    const { panel } = buildNestedWorld({ managerOverrides: { relations: () => [] } as Partial<typeof RelationManager> })
    const out = await relationManagerData(panel, {
      kind: 'relation-view', slug: 'posts',
      recordId:    'po1',
      relationship:'comments',
      childId:     'c1',
    })
    const schema = (out as Record<string, unknown>)['schemaData'] as Array<Record<string, unknown>>
    const strips = schema.filter(s => s['type'] === 'relation-tabs')
    assert.equal(strips.length, 1, 'expected only the post-scope strip; the comment-scope strip should be absent')
  })

  it('hides a nested sibling tab when N.canViewAny returns false', async () => {
    const { panel } = buildNestedWorld({
      nestedOverrides: {
        async canViewAny() { return false },
      } as unknown as Partial<typeof RelationManager>,
    })
    const out = await relationManagerData(panel, {
      kind: 'relation-view', slug: 'posts',
      recordId:    'po1',
      relationship:'comments',
      childId:     'c1',
    })
    const schema = (out as Record<string, unknown>)['schemaData'] as Array<Record<string, unknown>>
    const strips = schema.filter(s => s['type'] === 'relation-tabs') as Array<Record<string, unknown>>
    // Post-scope strip still here; comment-scope strip is gone because
    // the only nested manager (CommentRepliesManager) was gated away,
    // collapsing the strip to just the back-link `__view` — under the
    // empty-strip drop threshold.
    assert.equal(strips.length, 1, 'expected only the post-scope strip after sibling gating')
  })
})

describe('nestedRelationManagerData (Phase B) — RelationTabs strip', () => {
  it('list emits a RelationTabs strip with the leaf manager active', async () => {
    const { panel } = buildNestedWorld()
    const out = await relationManagerData(panel, {
      kind: 'nested-relation-list', slug: 'posts',
      chain: [...baseChain],
    })
    const schema = (out as Record<string, unknown>)['schemaData'] as Array<Record<string, unknown>>
    const tabs = schema.find(s => s['type'] === 'relation-tabs') as Record<string, unknown> | undefined
    assert.ok(tabs, 'expected a RelationTabs strip on the nested-list page')
    const list = (tabs!['tabs'] as Array<Record<string, unknown>>) ?? []
    // Strip carries (a) the leaf-parent's view tab + (b) one tab per
    // sibling nested manager. With a single nested manager, expect 2.
    assert.equal(list.length, 2)
    const repliesTab = list.find(t => t['key'] === 'replies')
    assert.ok(repliesTab, 'replies tab missing')
    assert.equal(repliesTab!['active'], true)
  })
})

// ── dispatchPageData wiring — the four nested page roles ─────────

describe('dispatchPageData — nested-relation-* page roles', () => {
  it('routes nested-relation-list page id through with chain', async () => {
    PilotiqRegistry.reset()
    const { panel } = buildNestedWorld()
    PilotiqRegistry.register(panel)
    const out = await dispatchPageData({
      pageId:   '/pages/(pilotiq)/nested-relation-list',
      routeParams: {
        basePath: 'admin', slug: 'posts',
        id: 'po1', relationship: 'comments',
        childId1: 'c1', relationship2: 'replies',
      },
      urlParsed: { search: {} },
    })
    const data = out as Record<string, unknown>
    assert.equal(data['pageType'], 'nested-relation-list')
  })

  it('routes nested-relation-view page id through with childId param', async () => {
    PilotiqRegistry.reset()
    const { panel } = buildNestedWorld()
    PilotiqRegistry.register(panel)
    const out = await dispatchPageData({
      pageId:   '/pages/(pilotiq)/nested-relation-view',
      routeParams: {
        basePath: 'admin', slug: 'posts',
        id: 'po1', relationship: 'comments',
        childId1: 'c1', relationship2: 'replies', childId2: 'r1',
      },
      urlParsed: { search: {} },
    })
    const data = out as Record<string, unknown>
    assert.equal(data['pageType'], 'nested-relation-view')
    assert.equal(data['childId'], 'r1')
  })

  it('routes nested-relation-edit page id through with childId param', async () => {
    PilotiqRegistry.reset()
    const { panel } = buildNestedWorld()
    PilotiqRegistry.register(panel)
    const out = await dispatchPageData({
      pageId:   '/pages/(pilotiq)/nested-relation-edit',
      routeParams: {
        basePath: 'admin', slug: 'posts',
        id: 'po1', relationship: 'comments',
        childId1: 'c1', relationship2: 'replies', childId2: 'r1',
      },
      urlParsed: { search: {} },
    })
    const data = out as Record<string, unknown>
    assert.equal(data['pageType'], 'nested-relation-edit')
    assert.equal(data['childId'], 'r1')
  })
})
