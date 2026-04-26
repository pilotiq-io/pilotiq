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

function fakeReq(overrides: Partial<{ params: Record<string, string> }> = {}): any {
  return { params: overrides.params ?? {} }
}

async function callHandler(handler: (...args: any[]) => unknown, req: any = fakeReq()) {
  return await handler(req, {} as any)
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
    assert.equal(tableChildren.length, 1)
    assert.equal(tableChildren[0]!.type, 'column')
    assert.equal(tableChildren[0]!.name, 'title')
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
    const formChildren = schemaData[1]!.children as Array<{ name?: string }>
    assert.equal(formChildren.length, 1)
    assert.equal(formChildren[0]!.name, 'public')
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
