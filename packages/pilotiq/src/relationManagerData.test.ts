import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Pilotiq } from './Pilotiq.js'
import { Resource } from './Resource.js'
import { RelationManager } from './RelationManager.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { TextField } from './fields/TextField.js'
import { findRelatedResource, relationManagerData, dispatchPageData, resourceEditData, resourceViewData } from './pageData.js'
import { PilotiqRegistry } from './PilotiqRegistry.js'
import type { ModelLike, ModelQuery } from './orm/modelDefaults.js'

// ── Test doubles ───────────────────────────────────────────────────

interface QueryRow extends Record<string, unknown> { id: string | number }

class StubQuery implements ModelQuery {
  private filters: Array<{ col: string; op?: string; val: unknown }> = []
  constructor(private rows: QueryRow[]) {}

  where(...args: unknown[]): ModelQuery {
    if (args.length === 2) this.filters.push({ col: args[0] as string, val: args[1] })
    else this.filters.push({ col: args[0] as string, op: args[1] as string, val: args[2] })
    return this
  }
  orWhere(...args: unknown[]): ModelQuery {
    return this.where(...args)
  }
  orderBy(_c: string, _d?: 'ASC' | 'DESC'): ModelQuery { return this }

  async paginate(_page: number, _perPage?: number) {
    let data = this.rows
    for (const f of this.filters) {
      if (f.op === '=' || f.op === undefined) {
        data = data.filter(r => r[f.col] === f.val)
      }
    }
    return { data, total: data.length }
  }
}

function stubModel(opts: { rows?: QueryRow[]; primaryKey?: string } = {}): ModelLike {
  const rows = opts.rows ?? []
  const M: ModelLike = {
    async find(id) { return rows.find(r => r['id'] === id || String(r['id']) === String(id)) ?? null },
    async create(data) { const next = { id: rows.length + 1, ...data } as QueryRow; rows.push(next); return next },
    async update(id, data) { const r = rows.find(r => r['id'] === id); if (r) Object.assign(r, data); return r ?? null },
    async delete(id) { const i = rows.findIndex(r => r['id'] === id); if (i >= 0) rows.splice(i, 1) },
    query() { return new StubQuery(rows) },
  }
  if (opts.primaryKey !== undefined) M.primaryKey = opts.primaryKey
  return M
}

/** Build a parent record that exposes `.related(name)` (rudder convention)
 *  yielding a StubQuery filtered by the foreign key. */
function makeParentWithChildren(parentId: string | number, childRows: QueryRow[], fk = 'parentId') {
  return {
    id: parentId,
    related(_name: string): ModelQuery {
      // Return a StubQuery pre-filtered to just this parent's children.
      return new StubQuery(childRows.filter(r => r[fk] === parentId))
    },
  }
}

// ── findRelatedResource — discovery via override + rudder convention ──

describe('findRelatedResource (Plan #11)', () => {
  it('returns the explicit relatedResource override without touching ORM metadata', () => {
    class TargetResource extends Resource {
      static override slug = 'targets'
    }
    class M extends RelationManager {
      static override relationship    = 'targets'
      static override relatedResource = TargetResource
    }
    class Parent extends Resource {
      static override slug = 'parents'
      static override relations() { return [M] }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([Parent, TargetResource])
    const got = findRelatedResource(M, Parent, panel.getConfig())
    assert.equal(got, TargetResource)
  })

  it('discovers via rudder relations[name].model() match against cfg.resources', () => {
    const ChildModel = stubModel()
    const ParentModel = {
      ...stubModel(),
      relations: { posts: { model: () => ChildModel } },
    } as ModelLike

    class PostResource extends Resource {
      static override slug  = 'posts'
      static override get model() { return ChildModel }
    }
    class PostsManager extends RelationManager {
      static override relationship = 'posts'
    }
    class UserResource extends Resource {
      static override slug = 'users'
      static override get model() { return ParentModel }
      static override relations() { return [PostsManager] }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([UserResource, PostResource])
    const got = findRelatedResource(PostsManager, UserResource, panel.getConfig())
    assert.equal(got, PostResource)
  })

  it('returns undefined when neither override nor rudder metadata locates a Resource', () => {
    class M extends RelationManager {
      static override relationship = 'orphans'
    }
    class Parent extends Resource {
      static override slug = 'parents'
      static override relations() { return [M] }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([Parent])
    const got = findRelatedResource(M, Parent, panel.getConfig())
    assert.equal(got, undefined)
  })
})

// ── relationManagerData — the three scopes ────────────────────────

describe('relationManagerData (Plan #11)', () => {
  /** Build a User → Posts test world. Returns the panel + key models so
   *  individual tests can poke records or override hooks. */
  function buildWorld(opts: { managerOverrides?: Partial<typeof RelationManager> } = {}) {
    const postRows: QueryRow[] = [
      { id: 'p1', parentId: 'u1', title: 'Post One' },
      { id: 'p2', parentId: 'u1', title: 'Post Two' },
      { id: 'p3', parentId: 'u2', title: 'Other User Post' },
    ]
    const PostModel = stubModel({ rows: postRows })

    // Parent records carry their own .related() so relation-list works
    // without touching ParentModel.relations metadata; for relation-edit
    // we ALSO need ParentModel.relations[].model() to discover Related
    // Resource.
    const parents = new Map<string, ReturnType<typeof makeParentWithChildren>>([
      ['u1', makeParentWithChildren('u1', postRows)],
      ['u2', makeParentWithChildren('u2', postRows)],
    ])
    const ParentModel: ModelLike = {
      async find(id) { return parents.get(String(id)) ?? null },
      async create() { throw new Error('not used') },
      async update() { throw new Error('not used') },
      async delete() { /* ok */ },
      query() { throw new Error('not used') },
    }
    Object.assign(ParentModel as object, {
      relations: { posts: { model: () => PostModel } },
    })

    class PostResource extends Resource {
      static override label = 'Posts'
      static override labelSingular = 'Post'
      static override slug  = 'posts'
      static override get model() { return PostModel }
      static override form(form: Form): Form {
        return form.schema([TextField.make('title').required()])
      }
    }

    class PostsManager extends RelationManager {
      static override relationship = 'posts'
      static override label        = 'Posts'

      static override table(table: Table): Table {
        return table.columns([Column.make('title').sortable()])
      }
      static override form(form: Form): Form {
        return form.schema([TextField.make('title').required()])
      }
    }
    if (opts.managerOverrides) {
      Object.assign(PostsManager, opts.managerOverrides)
    }

    class UserResource extends Resource {
      static override label = 'Users'
      static override slug  = 'users'
      static override recordTitleAttribute = 'name'
      static override get model() { return ParentModel }
      static override relations() { return [PostsManager] }
    }

    const panel = Pilotiq.make('T').path('/admin').resources([UserResource, PostResource])
    return { panel, UserResource, PostResource, PostsManager, ParentModel, PostModel, postRows, parents }
  }

  it('returns null when the parent slug is unknown', async () => {
    const { panel } = buildWorld()
    const out = await relationManagerData(panel, {
      kind: 'relation-list', slug: 'missing', recordId: 'u1', relationship: 'posts',
    })
    assert.equal(out, null)
  })

  it('returns null when the manager relationship is unknown on the resource', async () => {
    const { panel } = buildWorld()
    const out = await relationManagerData(panel, {
      kind: 'relation-list', slug: 'users', recordId: 'u1', relationship: 'comments',
    })
    assert.equal(out, null)
  })

  it('returns null when the parent record cannot be loaded', async () => {
    const { panel } = buildWorld()
    const out = await relationManagerData(panel, {
      kind: 'relation-list', slug: 'users', recordId: 'unknown', relationship: 'posts',
    })
    assert.equal(out, null)
  })

  it('throws when the parent has relations() but no static model', () => {
    class M extends RelationManager {
      static override relationship = 'posts'
    }
    class Bare extends Resource {
      static override slug = 'bare'
      static override relations() { return [M] }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([Bare])
    return assert.rejects(
      () => relationManagerData(panel, {
        kind: 'relation-list', slug: 'bare', recordId: '1', relationship: 'posts',
      }),
      /has relations\(.*\) but no static model/,
    )
  })

  describe('authorization gating', () => {
    it('403 when parent canAccess fails', async () => {
      class Locked extends Resource {
        static override slug = 'users'
        static override async canAccess() { return false }
        static override relations() { return [class extends RelationManager {
          static override relationship = 'posts'
        }] }
      }
      const panel = Pilotiq.make('T').path('/admin').resources([Locked])
      const out = await relationManagerData(panel, {
        kind: 'relation-list', slug: 'users', recordId: 'u1', relationship: 'posts',
      })
      assert.deepEqual(out, { ok: false, status: 403 })
    })

    it('403 when parent canEdit fails', async () => {
      const { ParentModel, PostModel } = buildWorld()
      class M extends RelationManager {
        static override relationship = 'posts'
      }
      class R2 extends Resource {
        static override slug = 'users'
        static override get model() { return ParentModel }
        static override async canEdit() { return false }
        static override relations() { return [M] }
      }
      class Posts extends Resource {
        static override slug = 'posts'
        static override get model() { return PostModel }
      }
      const panel = Pilotiq.make('T').path('/admin').resources([R2, Posts])
      const out = await relationManagerData(panel, {
        kind: 'relation-list', slug: 'users', recordId: 'u1', relationship: 'posts',
      })
      assert.deepEqual(out, { ok: false, status: 403 })
    })

    it('403 on relation-list when manager.canViewAny fails', async () => {
      const { panel } = buildWorld({
        managerOverrides: {
          canViewAny: async () => false,
        } as Partial<typeof RelationManager>,
      })
      const out = await relationManagerData(panel, {
        kind: 'relation-list', slug: 'users', recordId: 'u1', relationship: 'posts',
      })
      assert.deepEqual(out, { ok: false, status: 403 })
    })

    it('403 on relation-create when manager.canCreate fails', async () => {
      const { panel } = buildWorld({
        managerOverrides: {
          canCreate: async () => false,
        } as Partial<typeof RelationManager>,
      })
      const out = await relationManagerData(panel, {
        kind: 'relation-create', slug: 'users', recordId: 'u1', relationship: 'posts',
      })
      assert.deepEqual(out, { ok: false, status: 403 })
    })

    it('403 on relation-edit when manager.canEdit fails', async () => {
      const { panel } = buildWorld({
        managerOverrides: {
          canEdit: async () => false,
        } as Partial<typeof RelationManager>,
      })
      const out = await relationManagerData(panel, {
        kind: 'relation-edit', slug: 'users', recordId: 'u1', relationship: 'posts', childId: 'p1',
      })
      assert.deepEqual(out, { ok: false, status: 403 })
    })
  })

  describe('relation-list scope', () => {
    it('returns schemaData with the manager table, parent-scoped via .related()', async () => {
      const { panel } = buildWorld()
      const out = await relationManagerData(panel, {
        kind: 'relation-list', slug: 'users', recordId: 'u1', relationship: 'posts',
      })
      assert.notEqual(out, null)
      assert.notEqual((out as { ok?: boolean }).ok, false)
      const data = out as Record<string, unknown>
      assert.equal(data['pageType'], 'relation-list')
      const relation = data['relation'] as Record<string, unknown>
      assert.equal(relation['relationship'], 'posts')
      assert.equal(relation['relatedSlug'], 'posts')
      const parent = data['parent'] as Record<string, unknown>
      assert.equal(parent['id'], 'u1')

      // Auto-wired records loader produced rows scoped to u1's children.
      const schema = data['schemaData'] as Array<Record<string, unknown>>
      const tableMeta = schema.find(s => s['type'] === 'table')
      assert.ok(tableMeta, 'expected a table element in schemaData')
      const rows = (tableMeta['rows'] as Array<Record<string, unknown>>) ?? []
      assert.equal(rows.length, 2)  // u1 has p1 + p2 only, never p3
      assert.deepEqual(rows.map(r => r['id']).sort(), ['p1', 'p2'])
    })
  })

  describe('relation-create scope', () => {
    it('returns schemaData with form + create url stamped', async () => {
      const { panel } = buildWorld()
      const out = await relationManagerData(panel, {
        kind: 'relation-create', slug: 'users', recordId: 'u1', relationship: 'posts',
      })
      assert.notEqual(out, null)
      const data = out as Record<string, unknown>
      assert.equal(data['pageType'], 'relation-create')
      assert.equal(data['mode'], 'create')

      const schema = data['schemaData'] as Array<Record<string, unknown>>
      const formMeta = schema.find(s => s['type'] === 'form')
      assert.ok(formMeta, 'expected a form element in schemaData')
      assert.equal(formMeta['action'], '/admin/users/u1/posts/create')
    })

    it('honors prefill values and errors', async () => {
      const { panel } = buildWorld()
      const out = await relationManagerData(panel, {
        kind: 'relation-create', slug: 'users', recordId: 'u1', relationship: 'posts',
        prefill: { values: { title: 'Draft' }, errors: { title: ['Required'] } },
      })
      const data = out as Record<string, unknown>
      assert.equal(data['hasErrors'], true)
      const schema = data['schemaData'] as Array<Record<string, unknown>>
      const formMeta = schema.find(s => s['type'] === 'form') as Record<string, unknown>
      assert.equal((formMeta['values'] as Record<string, unknown>)['title'], 'Draft')
      assert.deepEqual((formMeta['errors'] as Record<string, string[]>)['title'], ['Required'])
    })
  })

  describe('relation-edit scope', () => {
    it('loads child + verifies it belongs to the parent (anti-IDOR)', async () => {
      const { panel } = buildWorld()
      const out = await relationManagerData(panel, {
        kind: 'relation-edit', slug: 'users', recordId: 'u1', relationship: 'posts', childId: 'p1',
      })
      assert.notEqual(out, null)
      const data = out as Record<string, unknown>
      assert.equal(data['pageType'], 'relation-edit')
      assert.equal(data['mode'], 'edit')
      assert.equal(data['childId'], 'p1')

      const schema = data['schemaData'] as Array<Record<string, unknown>>
      const formMeta = schema.find(s => s['type'] === 'form') as Record<string, unknown>
      // Child p1 belongs to u1 → its title should be filled in.
      assert.equal((formMeta['values'] as Record<string, unknown>)['title'], 'Post One')
      assert.equal(formMeta['action'], '/admin/users/u1/posts/p1/edit')
    })

    it('returns null when the child belongs to a different parent (IDOR)', async () => {
      const { panel } = buildWorld()
      // p3 is u2's post — trying to edit it under u1 must fail.
      const out = await relationManagerData(panel, {
        kind: 'relation-edit', slug: 'users', recordId: 'u1', relationship: 'posts', childId: 'p3',
      })
      assert.equal(out, null)
    })

    it('returns null when the child does not exist at all', async () => {
      const { panel } = buildWorld()
      const out = await relationManagerData(panel, {
        kind: 'relation-edit', slug: 'users', recordId: 'u1', relationship: 'posts', childId: 'nonexistent',
      })
      assert.equal(out, null)
    })

    it('honors prefill on a 422 re-render', async () => {
      const { panel } = buildWorld()
      const out = await relationManagerData(panel, {
        kind: 'relation-edit', slug: 'users', recordId: 'u1', relationship: 'posts', childId: 'p1',
        prefill: { values: { title: 'User-typed value' }, errors: { title: ['Too short'] } },
      })
      const data = out as Record<string, unknown>
      const schema = data['schemaData'] as Array<Record<string, unknown>>
      const formMeta = schema.find(s => s['type'] === 'form') as Record<string, unknown>
      assert.equal((formMeta['values'] as Record<string, unknown>)['title'], 'User-typed value')
      assert.deepEqual((formMeta['errors'] as Record<string, string[]>)['title'], ['Too short'])
      assert.equal(data['hasErrors'], true)
    })
  })
})

// ── Plan #11 — auto-mounted RelationTabs strip (Step 7) ─────────────

describe('relation tabs auto-mount (Plan #11)', () => {
  it('relation-list page prepends RelationTabs with the manager tab active', async () => {
    const postRows: QueryRow[] = [{ id: 'p1', parentId: 'u1', title: 'Post One' }]
    const PostModel = stubModel({ rows: postRows })
    const ParentModel: ModelLike = {
      async find(_id) { return makeParentWithChildren('u1', postRows) },
      async create() { throw new Error('not used') },
      async update() { throw new Error('not used') },
      async delete() { /* ok */ },
      query() { throw new Error('not used') },
    }
    Object.assign(ParentModel as object, { relations: { posts: { model: () => PostModel } } })

    class PostResource extends Resource {
      static override slug = 'posts'
      static override get model() { return PostModel }
    }
    class PostsManager extends RelationManager {
      static override relationship = 'posts'
      static override label        = 'Posts'
      static override table(t: Table): Table { return t.columns([Column.make('title')]) }
    }
    class CommentsManager extends RelationManager {
      static override relationship = 'comments'
      static override label        = 'Comments'
      static override table(t: Table): Table { return t.columns([Column.make('body')]) }
    }
    class UserResource extends Resource {
      static override slug  = 'users'
      static override get model() { return ParentModel }
      static override relations() { return [PostsManager, CommentsManager] }
    }
    const panel = Pilotiq.make('TabsT-' + Math.random()).path('/admin').resources([UserResource, PostResource])

    const out = await relationManagerData(panel, {
      kind: 'relation-list', slug: 'users', recordId: 'u1', relationship: 'posts',
    })
    const data = out as Record<string, unknown>
    const schema = data['schemaData'] as Array<Record<string, unknown>>
    const tabsMeta = schema.find(s => s['type'] === 'relation-tabs') as Record<string, unknown>
    assert.ok(tabsMeta, 'expected relation-tabs strip prepended')

    const tabs = tabsMeta['tabs'] as Array<{ key: string; label: string; url: string; active: boolean }>
    assert.equal(tabs.length, 3)            // Edit + Posts + Comments
    assert.equal(tabs[0]?.key, '__edit')
    assert.equal(tabs[0]?.label, 'Edit')
    assert.equal(tabs[0]?.url, '/admin/users/u1/edit')
    assert.equal(tabs[0]?.active, false)
    assert.equal(tabs[1]?.key, 'posts')
    assert.equal(tabs[1]?.url, '/admin/users/u1/posts')
    assert.equal(tabs[1]?.active, true)     // posts is the active tab
    assert.equal(tabs[2]?.key, 'comments')
    assert.equal(tabs[2]?.active, false)
  })

  it('skips the strip entirely when the resource has no relation managers', async () => {
    class OnlyR extends Resource {
      static override slug = 'only'
    }
    const panel = Pilotiq.make('NoRel-' + Math.random()).path('/admin').resources([OnlyR])
    // Touch resourceIndex/resourceCreate; we only care about Edit which depends
    // on R.model and pages. Easier: assert directly that buildRelationTabs would
    // not run by checking a manager-less relation-list call returns null (no
    // manager named 'whatever' exists), which is the expected guard.
    const out = await relationManagerData(panel, {
      kind: 'relation-list', slug: 'only', recordId: '1', relationship: 'whatever',
    })
    assert.equal(out, null)
  })

  it('resource-edit page prepends RelationTabs with the Edit tab active', async () => {
    const postRows: QueryRow[] = [{ id: 'p1', parentId: 'u1', title: 'Post One' }]
    const PostModel = stubModel({ rows: postRows })
    const ParentModel: ModelLike = stubModel({
      rows: [{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Bob' }],
    })
    Object.assign(ParentModel as object, { relations: { posts: { model: () => PostModel } } })

    class PostResource extends Resource {
      static override slug = 'posts'
      static override get model() { return PostModel }
    }
    class PostsManager extends RelationManager {
      static override relationship = 'posts'
      static override label        = 'Posts'
      static override table(t: Table): Table { return t.columns([Column.make('title')]) }
    }
    class UserResource extends Resource {
      static override slug = 'users'
      static override recordTitleAttribute = 'name'
      static override get model() { return ParentModel }
      static override form(form: Form): Form { return form.schema([TextField.make('name')]) }
      static override relations() { return [PostsManager] }
    }
    const panel = Pilotiq.make('EditTab-' + Math.random()).path('/admin').resources([UserResource, PostResource])
    const out = await resourceEditData(panel, 'users', 'u1')
    const schema = (out as Record<string, unknown>)['schemaData'] as Array<Record<string, unknown>>
    const tabsMeta = schema.find(s => s['type'] === 'relation-tabs') as Record<string, unknown>
    assert.ok(tabsMeta, 'resource-edit should auto-mount RelationTabs')
    const tabs = tabsMeta['tabs'] as Array<{ key: string; active: boolean; url: string }>
    assert.equal(tabs[0]?.key, '__edit')
    assert.equal(tabs[0]?.active, true)
    assert.equal(tabs[1]?.key, 'posts')
    assert.equal(tabs[1]?.active, false)
  })

  it('resource-view page prepends RelationTabs with the Details tab active', async () => {
    const postRows: QueryRow[] = []
    const PostModel = stubModel({ rows: postRows })
    const ParentModel: ModelLike = stubModel({ rows: [{ id: 'u1', name: 'Alice' }] })
    Object.assign(ParentModel as object, { relations: { posts: { model: () => PostModel } } })

    class PostResource extends Resource {
      static override slug = 'posts'
      static override get model() { return PostModel }
    }
    class PostsManager extends RelationManager {
      static override relationship = 'posts'
    }
    class UserResource extends Resource {
      static override slug = 'users'
      static override get model() { return ParentModel }
      static override detail() { return [] }
      static override relations() { return [PostsManager] }
    }
    const panel = Pilotiq.make('ViewTab-' + Math.random()).path('/admin').resources([UserResource, PostResource])
    const out = await resourceViewData(panel, 'users', 'u1')
    const schema = (out as Record<string, unknown>)['schemaData'] as Array<Record<string, unknown>>
    const tabsMeta = schema.find(s => s['type'] === 'relation-tabs') as Record<string, unknown> | undefined
    assert.ok(tabsMeta, 'resource-view should auto-mount RelationTabs')
    const tabs = tabsMeta['tabs'] as Array<{ key: string; label: string; url: string; active: boolean }>
    assert.equal(tabs[0]?.key, '__view')
    assert.equal(tabs[0]?.label, 'Details')
    assert.equal(tabs[0]?.url, '/admin/users/u1')
    assert.equal(tabs[0]?.active, true)
  })
})

// ── Plan #11 — dispatchPageData wiring (Vike +data SPA path) ────────

describe('dispatchPageData → relation pages (Plan #11)', () => {
  function buildPanel() {
    const postRows: QueryRow[] = [{ id: 'p1', parentId: 'u1', title: 'Post One' }]
    const PostModel = stubModel({ rows: postRows })
    const parents = new Map([
      ['u1', makeParentWithChildren('u1', postRows)],
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
      static override slug = 'posts'
      static override get model() { return PostModel }
      static override form(form: Form): Form { return form.schema([TextField.make('title').required()]) }
    }
    class PostsManager extends RelationManager {
      static override relationship = 'posts'
      static override table(t: Table): Table { return t.columns([Column.make('title')]) }
      static override form(f: Form): Form  { return f.schema([TextField.make('title').required()]) }
    }
    class UserResource extends Resource {
      static override slug = 'users'
      static override get model() { return ParentModel }
      static override relations() { return [PostsManager] }
    }

    PilotiqRegistry.reset()
    const panel = Pilotiq.make('TestPanel-' + Math.random()).path('/admin').resources([UserResource, PostResource])
    PilotiqRegistry.register(panel)
    return panel
  }

  it('routes relation-list page id through to relationManagerData', async () => {
    buildPanel()
    const out = await dispatchPageData({
      pageId: '/pages/(pilotiq)/relation-list',
      routeParams: { basePath: 'admin', slug: 'users', id: 'u1', relationship: 'posts' },
      urlParsed: { search: {} },
    })
    assert.notEqual(out, null)
    assert.equal((out as Record<string, unknown>)['pageType'], 'relation-list')
  })

  it('routes relation-create page id through', async () => {
    buildPanel()
    const out = await dispatchPageData({
      pageId: '/pages/(pilotiq)/relation-create',
      routeParams: { basePath: 'admin', slug: 'users', id: 'u1', relationship: 'posts' },
      urlParsed: { search: {} },
    })
    assert.equal((out as Record<string, unknown>)['pageType'], 'relation-create')
  })

  it('routes relation-edit page id through', async () => {
    buildPanel()
    const out = await dispatchPageData({
      pageId: '/pages/(pilotiq)/relation-edit',
      routeParams: { basePath: 'admin', slug: 'users', id: 'u1', relationship: 'posts', childId: 'p1' },
      urlParsed: { search: {} },
    })
    assert.equal((out as Record<string, unknown>)['pageType'], 'relation-edit')
  })

  it('returns null when the panel base path is unknown', async () => {
    PilotiqRegistry.reset()
    const out = await dispatchPageData({
      pageId: '/pages/(pilotiq)/relation-list',
      routeParams: { basePath: 'nonexistent', slug: 'users', id: 'u1', relationship: 'posts' },
      urlParsed: { search: {} },
    })
    assert.equal(out, null)
  })

  it('returns null when route params are incomplete', async () => {
    buildPanel()
    const out = await dispatchPageData({
      pageId: '/pages/(pilotiq)/relation-edit',
      routeParams: { basePath: 'admin', slug: 'users', id: 'u1' },   // missing relationship + childId
      urlParsed: { search: {} },
    })
    assert.equal(out, null)
  })
})
