import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Router } from '@rudderjs/router'

import { Pilotiq } from './Pilotiq.js'
import { Global } from './Global.js'
import { Page } from './Page.js'
import { Form } from './elements/Form.js'
import { TextField } from './fields/TextField.js'
import { defaultGlobalPages, defaultGlobalEditPage } from './defaultGlobalPages.js'
import { registerPilotiqRoutes } from './routes.js'

class SiteSettings extends Global {
  static override label         = 'Site Settings'
  static override labelSingular = 'Site Settings'
  static override slug          = 'site-settings'
  static override icon          = 'settings'

  static override form(form: Form): Form {
    return form
      .schema([TextField.make('siteName').required()])
      .loadRecord(async () => ({ siteName: 'My Site' }))
      .save(async (data) => ({ ...data }))
  }
}

describe('Global (singleton resource)', () => {
  it('getSlug derives from label when slug is unset', () => {
    class Anon extends Global {
      static override label = 'Brand Config'
      static override labelSingular = 'Brand Config'
    }
    assert.equal(Anon.getSlug(), 'brand-config')
  })

  it('default pages map is { edit } only — no list/create/view', () => {
    const pages = defaultGlobalPages(SiteSettings)
    assert.ok(typeof pages.edit === 'function')
    assert.equal((pages as Record<string, unknown>)['view'], undefined)
    assert.equal((pages as Record<string, unknown>)['index'], undefined)
    assert.equal((pages as Record<string, unknown>)['create'], undefined)
  })

  it('resolvePages merges user view override over defaults', () => {
    class WithView extends SiteSettings {
      static override pages() {
        const View = class extends Page {
          static override getMode() { return 'view' as const }
        }
        return { view: View }
      }
    }
    const resolved = WithView.resolvePages()
    assert.ok(resolved.edit)            // default
    assert.ok(resolved.view)            // user-supplied
    assert.equal(resolved.view!.getMode(), 'view')
  })

  it('default edit page schema is [Heading, Form] with the configured fields', () => {
    const Edit = defaultGlobalEditPage(SiteSettings)
    const elements = Edit.schema() as Array<{ getType(): string }>
    assert.equal(elements.length, 2)
    assert.equal(elements[0]!.getType(), 'heading')
    assert.equal(elements[1]!.getType(), 'form')
    const form = elements[1] as Form
    assert.equal((form.getChildren() ?? []).length, 1)
  })

  it('sentinel save fires when the user did not configure one', () => {
    class NoSave extends Global {
      static override label = 'X'
      static override labelSingular = 'X'
      static override slug = 'x'
      static override form(form: Form) { return form.schema([TextField.make('x')]) }
    }
    const Edit = defaultGlobalEditPage(NoSave)
    const elements = Edit.schema() as Array<{ getType(): string }>
    const form = elements[1] as Form
    assert.throws(() => (form.getSave() as () => unknown)())
  })
})

describe('Global routes', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('registers GET and POST at the singleton URL (no /:id)', () => {
    const panel = Pilotiq.make('T').path('/admin').globals([SiteSettings])
    registerPilotiqRoutes(router, panel)

    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(paths.includes('GET /admin/site-settings'))
    assert.ok(paths.includes('POST /admin/site-settings'))
    // No list/create/edit-by-id/delete URLs for a Global
    assert.ok(!paths.includes('GET /admin/site-settings/create'))
    assert.ok(!paths.includes('POST /admin/site-settings/:id/delete'))
  })

  it('GET pre-fills form values from loadRecord (no id)', async () => {
    const panel = Pilotiq.make('T').path('/admin').globals([SiteSettings])
    registerPilotiqRoutes(router, panel)

    const route = router.list().find(r => r.method === 'GET' && r.path === '/admin/site-settings')!
    const result = await route.handler({} as any, {} as any) as { props: Record<string, unknown> }
    const schemaData = result.props['schemaData'] as Array<{ type: string; values?: unknown }>
    assert.equal(schemaData[1]!.type, 'form')
    assert.deepEqual(schemaData[1]!.values, { siteName: 'My Site' })
  })

  it('POST happy path runs save and 303-redirects back to the same URL', async () => {
    let saved: unknown = null
    class Saver extends Global {
      static override label = 'Brand'
      static override labelSingular = 'Brand'
      static override slug = 'brand'
      static override form(form: Form) {
        return form
          .schema([TextField.make('name').required()])
          .save(async (data) => { saved = data; return data })
      }
    }
    const panel = Pilotiq.make('T').path('/admin').globals([Saver])
    registerPilotiqRoutes(router, panel)

    const route = router.list().find(r => r.method === 'POST' && r.path === '/admin/brand')!
    let redirect: { url: string; code: number } | undefined
    const fakeRes: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this },
      send(body: unknown)  { return body },
      json(body: unknown)  { return body },
      redirect(url: string, code = 302) { redirect = { url, code }; return this },
    }
    await route.handler(
      { params: {}, body: { name: 'Acme' }, query: {}, raw: {} } as any,
      fakeRes,
    )
    assert.deepEqual(saved, { name: 'Acme' })
    assert.deepEqual(redirect, { url: '/admin/brand', code: 303 })
  })

  it('POST validation failure re-renders with errors and 422', async () => {
    const panel = Pilotiq.make('T').path('/admin').globals([SiteSettings])
    registerPilotiqRoutes(router, panel)

    const route = router.list().find(r => r.method === 'POST' && r.path === '/admin/site-settings')!
    const fakeRes: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this },
      send(body: unknown)  { return body },
      json(body: unknown)  { return body },
      redirect() { return this },
    }
    const result = await route.handler(
      { params: {}, body: { siteName: '' }, query: {}, raw: {} } as any,
      fakeRes,
    ) as { props: Record<string, unknown> }
    assert.equal(fakeRes.statusCode, 422)
    assert.equal(result.props['hasErrors'], true)
    const schemaData = result.props['schemaData'] as Array<{ type: string; errors?: Record<string, string[]> }>
    assert.ok(schemaData[1]!.errors!['siteName']!.length > 0)
  })
})
