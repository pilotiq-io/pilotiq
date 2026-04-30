import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Router } from '@rudderjs/router'

import { Pilotiq } from './Pilotiq.js'
import { Page } from './Page.js'
import { Resource } from './Resource.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { TextField } from './fields/TextField.js'
import { Heading } from './schema/Heading.js'
import { registerPilotiqRoutes } from './routes.js'

class ArticleResource extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override slug          = 'articles'
  static override icon          = 'file-text'

  static override form(form: Form): Form {
    return form.schema([TextField.make('title').required()])
  }
  static override table(table: Table): Table {
    return table.columns([Column.make('title').sortable()])
  }
}

class CategoryResource extends Resource {
  static override label         = 'Categories'
  static override labelSingular = 'Category'
  static override slug          = 'categories'
}

function fakeReq(overrides: Partial<{
  params: Record<string, string>
  body:   unknown
  query:  Record<string, string>
}> = {}): any {
  return {
    params: overrides.params ?? {},
    body:   overrides.body ?? null,
    query:  overrides.query ?? {},
    raw:    {},
  }
}

interface FakeRes {
  statusCode:    number
  redirectedTo?: { url: string; code: number }
  sentBody?:     unknown
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
  return await handler(req, res)
}

async function callHandlerCapturing(handler: (...args: any[]) => unknown, req: any = fakeReq()) {
  const res = fakeRes()
  const result = await handler(req, res)
  return { result, res }
}

describe('registerPilotiqRoutes — route registration', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('registers dashboard + index/create/edit for each resource', () => {
    const panel = Pilotiq.make('Test Panel')
      .path('/admin')
      .resources([ArticleResource, CategoryResource])

    registerPilotiqRoutes(router, panel)

    const paths = router.list().map(r => `${r.method} ${r.path}`)

    // Dashboard
    assert.ok(paths.includes('GET /admin'))

    // Articles routes
    assert.ok(paths.includes('GET /admin/articles'))
    assert.ok(paths.includes('GET /admin/articles/create'))
    assert.ok(paths.includes('GET /admin/articles/:id/edit'))

    // Categories routes
    assert.ok(paths.includes('GET /admin/categories'))
    assert.ok(paths.includes('GET /admin/categories/create'))
    assert.ok(paths.includes('GET /admin/categories/:id/edit'))
  })

  it('registers custom page routes', () => {
    class AnalyticsPage extends Page {
      static override slug  = 'analytics'
      static override label = 'Analytics'
      static override schema() { return [Heading.make('Analytics')] }
    }

    const panel = Pilotiq.make('Custom Panel')
      .path('/p')
      .pages([AnalyticsPage])

    registerPilotiqRoutes(router, panel)

    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(paths.includes('GET /p/analytics'))
  })

  it('honors user pages() overrides (custom Page replaces default)', async () => {
    class CustomCreate extends Page {
      static override getMode() { return 'create' as const }
      static override schema() { return [Heading.make('Custom create page')] }
    }
    class CustomArticle extends ArticleResource {
      static override pages() { return { create: CustomCreate } }
    }

    const panel = Pilotiq.make('Override Panel')
      .path('/admin')
      .resources([CustomArticle])

    registerPilotiqRoutes(router, panel)

    const createRoute = router.list().find(r => r.path === '/admin/articles/create')
    assert.ok(createRoute)

    const result = await callHandler(createRoute!.handler) as { id: string; props: Record<string, unknown> }
    assert.equal(result.id, 'pilotiq.resource-create')
    const schemaData = result.props['schemaData'] as Array<{ type: string; content?: string }>
    assert.equal(schemaData.length, 1)
    assert.equal(schemaData[0]!.type, 'heading')
    assert.equal(schemaData[0]!.content, 'Custom create page')
  })
})

describe('registerPilotiqRoutes — handler → schema round-trip', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('index handler returns a ViewResponse with resolved schemaData', async () => {
    const panel = Pilotiq.make('Test')
      .path('/admin')
      .resources([ArticleResource])

    registerPilotiqRoutes(router, panel)

    const indexRoute = router.list().find(r => r.path === '/admin/articles')!
    const response = await callHandler(indexRoute.handler) as { id: string; props: Record<string, unknown> }

    assert.equal(response.id, 'pilotiq.slug')
    assert.equal(response.props['pageType'], 'resource')
    assert.equal(response.props['basePath'], '/admin')

    const schemaData = response.props['schemaData'] as Array<{ type: string; children?: unknown[] }>
    assert.equal(schemaData.length, 2)
    assert.equal(schemaData[0]!.type, 'heading')
    assert.equal(schemaData[1]!.type, 'table')
    const tableChildren = schemaData[1]!.children as Array<{ type: string; name?: string }>
    const cols    = tableChildren.filter(c => c.type === 'column')
    const actions = tableChildren.filter(c => c.type === 'action')
    assert.equal(cols.length, 1)
    assert.equal(cols[0]!.name, 'title')
    // ListPage injects default Create header + Edit/Delete row actions.
    assert.deepEqual(actions.map(a => a.name).sort(), ['create', 'delete', 'edit'])
  })

  it('create handler resolves a Form schema with mode=create', async () => {
    const panel = Pilotiq.make('Test')
      .path('/admin')
      .resources([ArticleResource])

    registerPilotiqRoutes(router, panel)

    const route = router.list().find(r => r.path === '/admin/articles/create')!
    const response = await callHandler(route.handler) as { id: string; props: Record<string, unknown> }

    assert.equal(response.id, 'pilotiq.resource-create')
    assert.equal(response.props['mode'], 'create')

    const schemaData = response.props['schemaData'] as Array<{ type: string; children?: unknown[] }>
    assert.equal(schemaData[1]!.type, 'form')
    const formChildren = schemaData[1]!.children as Array<{ type: string; name?: string }>
    assert.equal(formChildren[0]!.type, 'field')
    assert.equal(formChildren[0]!.name, 'title')
  })

  it('edit handler picks up :id route param and forwards to ctx', async () => {
    const panel = Pilotiq.make('Test')
      .path('/admin')
      .resources([ArticleResource])

    registerPilotiqRoutes(router, panel)

    const route = router.list().find(r => r.path === '/admin/articles/:id/edit')!
    const response = await callHandler(route.handler, fakeReq({ params: { id: '42' } })) as {
      id: string
      props: Record<string, unknown>
    }

    assert.equal(response.id, 'pilotiq.resource-edit')
    assert.equal(response.props['recordId'], '42')
    assert.equal(response.props['mode'], 'edit')
  })

  it('field visibility is honored per render mode', async () => {
    class HiddenFieldResource extends Resource {
      static override label = 'X'
      static override labelSingular = 'X'
      static override slug = 'x'
      static override form(form: Form): Form {
        return form.schema([
          TextField.make('public'),
          TextField.make('secret').hideFromCreate(),
        ])
      }
    }

    const panel = Pilotiq.make('Test')
      .path('/admin')
      .resources([HiddenFieldResource])

    registerPilotiqRoutes(router, panel)

    const route = router.list().find(r => r.path === '/admin/x/create')!
    const response = await callHandler(route.handler) as { props: Record<string, unknown> }
    const schemaData = response.props['schemaData'] as Array<{ type: string; children?: unknown[] }>
    // Form children = visible fields + default submit action.
    const formChildren = schemaData[1]!.children as Array<{ type: string; name?: string }>
    const fields = formChildren.filter(c => c.type === 'field')
    assert.equal(fields.length, 1)
    assert.equal(fields[0]!.name, 'public')
  })

  it('panelInfo includes resources and pages summary', async () => {
    class AnalyticsPage extends Page {
      static override slug  = 'analytics'
      static override label = 'Analytics'
      static override schema() { return [Heading.make('Analytics')] }
    }

    const panel = Pilotiq.make('Test')
      .path('/admin')
      .resources([ArticleResource])
      .pages([AnalyticsPage])

    registerPilotiqRoutes(router, panel)

    const indexRoute = router.list().find(r => r.path === '/admin/articles')!
    const response = await callHandler(indexRoute.handler) as { props: Record<string, unknown> }
    const panelData = response.props['panel'] as { resources: unknown[]; pages: unknown[] }

    assert.equal(panelData.resources.length, 1)
    assert.equal(panelData.pages.length, 1)
  })
})

describe('registerPilotiqRoutes — POST submit lifecycle', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  function panelWith(SaveR: any) {
    return Pilotiq.make('T').path('/admin').resources([SaveR])
  }

  it('registers POST /admin/articles/create and POST /admin/articles/:id/edit', () => {
    registerPilotiqRoutes(router, panelWith(ArticleResource))
    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(paths.includes('POST /admin/articles/create'))
    assert.ok(paths.includes('POST /admin/articles/:id/edit'))
  })

  it('registers GET /admin/articles/:id (view) and POST /admin/articles/:id/delete', () => {
    registerPilotiqRoutes(router, panelWith(ArticleResource))
    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(paths.includes('GET /admin/articles/:id'))
    assert.ok(paths.includes('POST /admin/articles/:id/delete'))
  })

  it('view handler runs Resource.detail(record) and ships schemaData', async () => {
    class ViewableResource extends ArticleResource {
      static override form(form: Form): Form {
        return form
          .schema([TextField.make('title')])
          .loadRecord(async (id) => ({ id, title: `Article ${id}` }))
      }
      static override detail(record: unknown) {
        const r = record as { title?: string }
        return [Heading.make(`Detail: ${r.title}`).level(2)]
      }
    }
    registerPilotiqRoutes(router, panelWith(ViewableResource))

    const route = router.list().find(r => r.method === 'GET' && r.path === '/admin/articles/:id')!
    const result = await callHandler(route.handler, fakeReq({ params: { id: '7' } })) as {
      id: string
      props: Record<string, unknown>
    }
    assert.equal(result.id, 'pilotiq.resource-view')
    assert.equal(result.props['recordId'], '7')

    const schemaData = result.props['schemaData'] as Array<{ type: string; content?: string }>
    // [page-heading, edit-action, delete-action, detail-heading]
    assert.equal(schemaData.length, 4)
    assert.equal(schemaData[0]!.type, 'heading')           // labelSingular heading
    assert.equal(schemaData[1]!.type, 'action')
    assert.equal(schemaData[2]!.type, 'action')
    assert.equal(schemaData[3]!.content, 'Detail: Article 7') // detail() heading
  })

  it('delete POST calls Resource.deleteRecord and 303-redirects to list', async () => {
    let deletedId: string | null = null
    class Deletable extends ArticleResource {
      static override async deleteRecord(id: string) { deletedId = id }
    }
    registerPilotiqRoutes(router, panelWith(Deletable))

    const route = router.list().find(r => r.method === 'POST' && r.path === '/admin/articles/:id/delete')!
    const { res } = await callHandlerCapturing(route.handler, fakeReq({ params: { id: 'abc' } }))
    assert.equal(deletedId, 'abc')
    assert.deepEqual(res.redirectedTo, { url: '/admin/articles', code: 303 })
  })

  it('delete POST returns 500 when deleteRecord throws (default)', async () => {
    registerPilotiqRoutes(router, panelWith(ArticleResource))
    const route = router.list().find(r => r.method === 'POST' && r.path === '/admin/articles/:id/delete')!
    const { res } = await callHandlerCapturing(route.handler, fakeReq({ params: { id: 'abc' } }))
    assert.equal(res.statusCode, 500)
  })

  it('happy path: validates, runs save, redirects 303 to edit URL', async () => {
    let savedWith: unknown = null
    class Saver extends ArticleResource {
      static override form(form: Form): Form {
        return form
          .schema([TextField.make('title').required()])
          .save(async (data) => { savedWith = data; return { id: 'r42' } })
      }
    }
    registerPilotiqRoutes(router, panelWith(Saver))

    const post = router.list().find(r => r.method === 'POST' && r.path === '/admin/articles/create')!
    const { res } = await callHandlerCapturing(post.handler, fakeReq({ body: { title: 'Hello' } }))

    assert.deepEqual(res.redirectedTo, { url: '/admin/articles/r42/edit', code: 303 })
    assert.deepEqual(savedWith, { title: 'Hello' })
  })

  it('validation failure re-renders the create view with errors + values, status 422', async () => {
    class Saver extends ArticleResource {
      static override form(form: Form): Form {
        return form
          .schema([TextField.make('title').required()])
          .save(async () => ({ id: '1' }))
      }
    }
    registerPilotiqRoutes(router, panelWith(Saver))

    const post = router.list().find(r => r.method === 'POST' && r.path === '/admin/articles/create')!
    const { result, res } = await callHandlerCapturing(post.handler, fakeReq({ body: { title: '' } }))

    assert.equal(res.statusCode, 422)
    assert.equal(res.redirectedTo, undefined)
    const view = result as { id: string; props: Record<string, unknown> }
    assert.equal(view.id, 'pilotiq.resource-create')
    assert.equal(view.props['hasErrors'], true)

    const schemaData = view.props['schemaData'] as Array<{ type: string; values?: unknown; errors?: unknown }>
    const formMeta = schemaData[1]!
    assert.equal(formMeta.type, 'form')
    assert.deepEqual(formMeta.values, { title: '' })
    assert.deepEqual((formMeta.errors as Record<string, string[]>)['title']?.length! > 0, true)
  })

  it('discriminates by submitted _formId on a multi-form page', async () => {
    let calledForm: string | null = null

    class TwoFormsPage extends Page {
      static override getMode() { return 'create' as const }
      static override schema() {
        const a = Form.make().formId('alpha')
          .schema([TextField.make('a')])
          .save(async () => { calledForm = 'alpha'; return { id: 'a1' } })
        const b = Form.make().formId('beta')
          .schema([TextField.make('b')])
          .save(async () => { calledForm = 'beta'; return { id: 'b1' } })
        return [a, b]
      }
    }
    class TwoFormsResource extends Resource {
      static override label = 'Two'
      static override labelSingular = 'Two'
      static override slug = 'two'
      static override pages() { return { create: TwoFormsPage } }
    }
    registerPilotiqRoutes(router, panelWith(TwoFormsResource))

    const post = router.list().find(r => r.method === 'POST' && r.path === '/admin/two/create')!
    await callHandlerCapturing(post.handler, fakeReq({ body: { _formId: 'beta', b: 'value' } }))
    assert.equal(calledForm, 'beta')
  })

  it('GET edit calls loadRecord and pre-fills form values', async () => {
    class Loader extends ArticleResource {
      static override form(form: Form): Form {
        return form
          .schema([TextField.make('title')])
          .loadRecord(async (id) => ({ id, title: `Loaded ${id}` }))
          .save(async (d) => ({ id: '1', ...d }))
      }
    }
    registerPilotiqRoutes(router, panelWith(Loader))

    const get = router.list().find(r => r.method === 'GET' && r.path === '/admin/articles/:id/edit')!
    const result = await callHandler(get.handler, fakeReq({ params: { id: '99' } })) as {
      props: Record<string, unknown>
    }
    const schemaData = result.props['schemaData'] as Array<{ type: string; values?: Record<string, unknown> }>
    const formMeta = schemaData[1]!
    assert.equal(formMeta.type, 'form')
    assert.deepEqual(formMeta.values, { id: '99', title: 'Loaded 99' })
  })

  it('POST edit redirects back to the edit URL by default', async () => {
    class EditSaver extends ArticleResource {
      static override form(form: Form): Form {
        return form
          .schema([TextField.make('title')])
          .save(async (d) => ({ id: '7', ...d }))
      }
    }
    registerPilotiqRoutes(router, panelWith(EditSaver))

    const post = router.list().find(r => r.method === 'POST' && r.path === '/admin/articles/:id/edit')!
    const { res } = await callHandlerCapturing(post.handler, fakeReq({
      params: { id: '7' },
      body:   { title: 'Updated' },
    }))
    assert.deepEqual(res.redirectedTo, { url: '/admin/articles/7/edit', code: 303 })
  })

  it('index route passes ?sort/?search/?page through to Table.records()', async () => {
    let seen: Record<string, unknown> | null = null
    class TableR extends Resource {
      static override label = 'Items'
      static override labelSingular = 'Item'
      static override slug = 'items'
      static override table(table: Table): Table {
        return table
          .columns([Column.make('title').sortable().searchable()])
          .records(async (ctx) => {
            seen = { ...ctx }
            return { rows: [{ title: 'a' }, { title: 'b' }], total: 17 }
          })
          .paginate(5)
      }
    }
    registerPilotiqRoutes(router, Pilotiq.make('T').path('/admin').resources([TableR]))

    const indexRoute = router.list().find(r => r.method === 'GET' && r.path === '/admin/items')!
    const result = await callHandler(indexRoute.handler, fakeReq({
      query: { sort: 'title:desc', search: 'foo', page: '3' },
    })) as { props: Record<string, unknown> }

    assert.deepEqual(seen, {
      sort:    { column: 'title', direction: 'desc' },
      search:  'foo',
      page:    3,
      perPage: 5,
    } satisfies Record<string, unknown>)

    const schemaData = result.props['schemaData'] as Array<{ type: string; rows?: unknown[]; total?: number; currentSort?: unknown; search?: unknown; currentPage?: unknown }>
    const tableMeta = schemaData[1]!
    assert.equal(tableMeta.type, 'table')
    assert.equal(tableMeta.rows!.length, 2)
    assert.equal(tableMeta.total, 17)
    assert.deepEqual(tableMeta.currentSort, { column: 'title', direction: 'desc' })
    assert.equal(tableMeta.search, 'foo')
    assert.equal(tableMeta.currentPage, 3)
  })

  it('honors Form.redirectAfterSave when supplied', async () => {
    class CustomRedirect extends ArticleResource {
      static override form(form: Form): Form {
        return form
          .schema([TextField.make('title')])
          .save(async () => ({ id: '99' }))
          .redirectAfterSave(() => '/elsewhere')
      }
    }
    registerPilotiqRoutes(router, panelWith(CustomRedirect))

    const post = router.list().find(r => r.method === 'POST' && r.path === '/admin/articles/create')!
    const { res } = await callHandlerCapturing(post.handler, fakeReq({ body: { title: 'x' } }))
    assert.equal(res.redirectedTo?.url, '/elsewhere')
  })
})

describe('registerPilotiqRoutes — Action handler dispatch', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  function panelWith(R: any) {
    return Pilotiq.make('T').path('/admin').resources([R])
  }

  it('registers POST /admin/{slug}/_action/:actionName for resources', () => {
    registerPilotiqRoutes(router, panelWith(ArticleResource))
    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(paths.includes('POST /admin/articles/_action/:actionName'))
  })

  it('runs the named action handler and 303-redirects to the index by default', async () => {
    let called = false
    const { Action } = await import('./actions/Action.js')
    class WithAction extends ArticleResource {
      static override table(t: Table): Table {
        return t.columns([Column.make('title')]).actions([
          Action.make('refresh').handler(() => { called = true }),
        ])
      }
    }
    registerPilotiqRoutes(router, panelWith(WithAction))

    const post = router.list().find(r =>
      r.method === 'POST' && r.path === '/admin/articles/_action/:actionName',
    )!
    const { res } = await callHandlerCapturing(
      post.handler,
      fakeReq({ params: { actionName: 'refresh' }, body: {} }),
    )
    assert.equal(called, true)
    assert.deepEqual(res.redirectedTo, { url: '/admin/articles', code: 303 })
  })

  it('passes ids through to the handler as ctx.records (bulk)', async () => {
    let captured: unknown
    const { Action } = await import('./actions/Action.js')
    class WithBulk extends ArticleResource {
      static override table(t: Table): Table {
        return t.columns([Column.make('title')]).actions([
          Action.make('archive').bulk().handler((ctx) => { captured = ctx.records }),
        ])
      }
    }
    registerPilotiqRoutes(router, panelWith(WithBulk))

    const post = router.list().find(r =>
      r.method === 'POST' && r.path === '/admin/articles/_action/:actionName',
    )!
    await callHandlerCapturing(
      post.handler,
      fakeReq({ params: { actionName: 'archive' }, body: { ids: ['1', '2', '3'] } }),
    )
    assert.deepEqual(captured, [{ id: '1' }, { id: '2' }, { id: '3' }])
  })

  it('returns 404 when the action name does not exist on the page', async () => {
    registerPilotiqRoutes(router, panelWith(ArticleResource))
    const post = router.list().find(r =>
      r.method === 'POST' && r.path === '/admin/articles/_action/:actionName',
    )!
    const { res } = await callHandlerCapturing(
      post.handler,
      fakeReq({ params: { actionName: 'ghost' }, body: {} }),
    )
    assert.equal(res.statusCode, 404)
  })

  it('returns 500 with the error message when the handler throws', async () => {
    const { Action } = await import('./actions/Action.js')
    class Boom extends ArticleResource {
      static override table(t: Table): Table {
        return t.columns([Column.make('title')]).actions([
          Action.make('explode').handler(() => { throw new Error('boom') }),
        ])
      }
    }
    registerPilotiqRoutes(router, panelWith(Boom))
    const post = router.list().find(r =>
      r.method === 'POST' && r.path === '/admin/articles/_action/:actionName',
    )!
    const { res } = await callHandlerCapturing(
      post.handler,
      fakeReq({ params: { actionName: 'explode' }, body: {} }),
    )
    assert.equal(res.statusCode, 500)
    assert.equal(res.sentBody, 'boom')
  })

  it('honors a redirect returned by the handler', async () => {
    const { Action } = await import('./actions/Action.js')
    class Redir extends ArticleResource {
      static override table(t: Table): Table {
        return t.columns([Column.make('title')]).actions([
          Action.make('go').handler(() => ({ redirect: '/somewhere' })),
        ])
      }
    }
    registerPilotiqRoutes(router, panelWith(Redir))
    const post = router.list().find(r =>
      r.method === 'POST' && r.path === '/admin/articles/_action/:actionName',
    )!
    const { res } = await callHandlerCapturing(
      post.handler,
      fakeReq({ params: { actionName: 'go' }, body: {} }),
    )
    assert.deepEqual(res.redirectedTo, { url: '/somewhere', code: 303 })
  })
})

describe('registerPilotiqRoutes — flash notifications across the 303 path', () => {
  /**
   * Stand-in for a real `SessionInstance`. Mirrors `flash` / `getFlash`
   * so flash.ts duck-types onto it. `advance()` simulates the browser
   * following the redirect (next request's `prev` becomes this request's
   * `next`).
   */
  function makeSession() {
    let prev: Record<string, unknown> = {}
    let next: Record<string, unknown> = {}
    return {
      flash(key: string, value: unknown) { next[key] = value },
      getFlash<T>(key: string, fallback?: T): T | undefined {
        return (key in prev ? prev[key] : fallback) as T | undefined
      },
      advance() { prev = next; next = {} },
    }
  }

  let router: Router
  beforeEach(() => { router = new Router() })

  it('POST create flashes resolved notification; subsequent GET on the redirect target reads it', async () => {
    class Saver extends ArticleResource {
      static override form(form: Form): Form {
        return form
          .schema([TextField.make('title').required()])
          .save(async () => ({ id: 'r1' }))
          .savedNotification('Article created')
      }
    }
    registerPilotiqRoutes(router, Pilotiq.make('Admin').path('/admin').resources([Saver]))

    const session = makeSession()
    const post = router.list().find(r => r.method === 'POST' && r.path === '/admin/articles/create')!
    const { res } = await callHandlerCapturing(
      post.handler,
      fakeReq({ body: { title: 'Hi' } } ) as any,
    )
    // Manually inject session before redirect to mirror the rudder runtime.
    // (callHandlerCapturing fires synchronously; the helper above didn't
    // include a session — we test wire-up by calling flash() directly via
    // the request shape.)
    void res

    const reqWithSession: any = { ...fakeReq({ body: { title: 'Hi' } }), session }
    const resWithSession  = fakeRes()
    await (post.handler as any)(reqWithSession, resWithSession)
    assert.deepEqual(resWithSession.redirectedTo, { url: '/admin/articles/r1/edit', code: 303 })

    // Simulate the browser following the redirect.
    session.advance()

    const get = router.list().find(r => r.method === 'GET' && r.path === '/admin/articles/:id/edit')!
    const reqGet: any = { ...fakeReq({ params: { id: 'r1' } }), session }
    const result = await callHandler(get.handler, reqGet) as {
      props: Record<string, unknown>
    }
    const flashed = result.props['notifications'] as Array<{ title: string }>
    assert.equal(flashed.length, 1)
    assert.equal(flashed[0]!.title, 'Article created')
  })

  it('without session installed: POST redirects normally and GET emits empty notifications', async () => {
    class Saver extends ArticleResource {
      static override form(form: Form): Form {
        return form
          .schema([TextField.make('title')])
          .save(async () => ({ id: 'r1' }))
          .savedNotification('Saved')
      }
    }
    registerPilotiqRoutes(router, Pilotiq.make('Admin').path('/admin').resources([Saver]))

    const post = router.list().find(r => r.method === 'POST' && r.path === '/admin/articles/create')!
    const { res } = await callHandlerCapturing(post.handler, fakeReq({ body: { title: 'Hi' } }))
    assert.deepEqual(res.redirectedTo, { url: '/admin/articles/r1/edit', code: 303 })

    const get = router.list().find(r => r.method === 'GET' && r.path === '/admin/articles/:id/edit')!
    const result = await callHandler(get.handler, fakeReq({ params: { id: 'r1' } })) as {
      props: Record<string, unknown>
    }
    assert.deepEqual(result.props['notifications'], [])
  })

  it('action handler 303 path flashes notifications from a notify result', async () => {
    const { Action } = await import('./actions/Action.js')
    const { Notification } = await import('./notifications/Notification.js')
    class WithAction extends ArticleResource {
      static override table(t: Table): Table {
        return t.columns([Column.make('title')]).actions([
          Action.make('feature').handler(() => ({
            notify: Notification.make('Featured').success(),
          })),
        ])
      }
    }
    registerPilotiqRoutes(router, Pilotiq.make('Admin').path('/admin').resources([WithAction]))

    const session = makeSession()
    const post = router.list().find(r =>
      r.method === 'POST' && r.path === '/admin/articles/_action/:actionName',
    )!
    const reqPost: any = { ...fakeReq({ params: { actionName: 'feature' }, body: { ids: ['r1'] } }), session }
    const resPost = fakeRes()
    await (post.handler as any)(reqPost, resPost)
    assert.equal(resPost.redirectedTo?.code, 303)

    session.advance()

    const get = router.list().find(r => r.method === 'GET' && r.path === '/admin/articles')!
    const reqGet: any = { ...fakeReq(), session }
    const result = await callHandler(get.handler, reqGet) as { props: Record<string, unknown> }
    const flashed = result.props['notifications'] as Array<{ title: string }>
    assert.equal(flashed.length, 1)
    assert.equal(flashed[0]!.title, 'Featured')
  })
})
