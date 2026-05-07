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

  it('default edit page schema is [Heading-with-save-action, Form] with the configured fields', () => {
    const Edit = defaultGlobalEditPage(SiteSettings)
    const elements = Edit.schema() as Array<{ getType(): string; getChildren(): unknown[] | undefined }>
    assert.equal(elements.length, 2)
    assert.equal(elements[0]!.getType(), 'heading')
    assert.equal(elements[1]!.getType(), 'form')
    const form = elements[1] as Form
    // Form children: just the user field — save action lives in the heading.
    const formChildren = form.getChildren() ?? []
    assert.equal(formChildren.length, 1)
    // Heading carries the submit action.
    const headingChildren = elements[0]!.getChildren() ?? []
    assert.equal(headingChildren.length, 1)
    assert.equal((headingChildren[0] as { getType(): string }).getType(), 'action')
  })

  // ─── Plan #9: navigation metadata ──────────────────────────

  it('navigationGroup defaults to "Settings"', () => {
    class Anon extends Global { static override label = 'X' }
    assert.equal(Anon.navigationGroup, 'Settings')
  })

  it('navigationGroup honors explicit null as opt-out', () => {
    class Anon extends Global {
      static override label = 'X'
      static override navigationGroup = null
    }
    assert.equal(Anon.navigationGroup, null)
  })

  it('getNavigationLabel/Icon fall through to label/icon when overrides are unset', () => {
    class Anon extends Global {
      static override label = 'Brand Config'
      static override icon  = 'palette'
    }
    assert.equal(Anon.getNavigationLabel(), 'Brand Config')
    assert.equal(Anon.getNavigationIcon(),  'palette')
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

// ─── Singular-record auto-wiring ─────────────────────────────────────
//
// `Global.model` widened from a vestigial string identifier to a real
// `ModelLike`. When set, the default edit page auto-wires `Form.loadRecord`
// (via `loadSingularRecord(M)`) + `Form.save` (via `modelSave(M)`) so
// users don't need to hand-roll upsert against a `panelGlobal` blob —
// they just point `static model = M` and submit.

describe('Global — singular-record auto-wiring (static model)', () => {
  // Minimal in-memory ModelLike stub. Stores a single row; query() returns
  // a tiny query interface that just supports paginate(1, 1).
  type Row = { id: number; siteName: string }
  function makeStubModel(initial?: Row) {
    let nextId = 1
    let row: Row | null = initial ?? null
    const M = {
      primaryKey: 'id',
      async find(id: string | number) { return row && row.id === Number(id) ? row : null },
      async create(data: Record<string, unknown>) {
        row = { id: nextId++, siteName: '', ...(data as Record<string, unknown>) } as Row
        return row
      },
      async update(id: string | number, data: Record<string, unknown>) {
        if (!row || row.id !== Number(id)) throw new Error('not found')
        row = { ...row, ...(data as Record<string, unknown>) } as Row
        return row
      },
      async delete(_id: string | number) { row = null },
      query() {
        const chain: any = {
          _where: [] as Array<[string, unknown, unknown]>,
          where(col: string, opOrVal: unknown, maybeVal?: unknown) {
            const value = maybeVal === undefined ? opOrVal : maybeVal
            chain._where.push([col, '=', value])
            return chain
          },
          orWhere() { return chain },
          orderBy() { return chain },
          async paginate() {
            // Honor a single where filter for findSingular tests.
            if (chain._where.length > 0) {
              const matching = row && chain._where.every(([col, , val]: [string, unknown, unknown]) =>
                (row as Record<string, unknown>)[col] === val) ? [row] : []
              return { data: matching, total: matching.length }
            }
            return { data: row ? [row] : [], total: row ? 1 : 0 }
          },
        }
        return chain
      },
      _peek() { return row },
    }
    return M as any
  }

  it('without a model configured, no auto-wire fires', () => {
    class NoModel extends Global {
      static override label = 'NM'
      static override labelSingular = 'NM'
      static override slug  = 'nm'
      static override form(form: Form) { return form.schema([TextField.make('x')]) }
    }
    const Edit = defaultGlobalEditPage(NoModel)
    const elements = Edit.schema() as Array<{ getType(): string }>
    const form = elements[1] as Form
    assert.equal(form.getLoadRecord(), undefined)
    // Save falls through to the sentinel — throws when invoked.
    assert.throws(() => (form.getSave() as () => unknown)())
  })

  it('with a model configured, auto-wires loadRecord + save', async () => {
    const M = makeStubModel({ id: 1, siteName: 'Hello' })
    class Settings extends Global {
      static override label         = 'Settings'
      static override labelSingular = 'Settings'
      static override slug          = 'settings'
      static override model         = M
      static override form(form: Form) { return form.schema([TextField.make('siteName')]) }
    }
    const Edit = defaultGlobalEditPage(Settings)
    const elements = Edit.schema() as Array<{ getType(): string }>
    const form = elements[1] as Form

    const loader = form.getLoadRecord()
    assert.ok(loader, 'loadRecord auto-wired')
    const loaded = await loader!('', { values: {} })
    assert.deepEqual(loaded, { id: 1, siteName: 'Hello' })

    const save = form.getSave()
    assert.ok(save, 'save auto-wired')
  })

  it('save handler creates on first submit when no record exists', async () => {
    const M = makeStubModel(null as any)
    class FreshSettings extends Global {
      static override label         = 'Fresh'
      static override labelSingular = 'Fresh'
      static override slug          = 'fresh'
      static override model         = M
      static override form(form: Form) { return form.schema([TextField.make('siteName')]) }
    }
    const Edit = defaultGlobalEditPage(FreshSettings)
    const elements = Edit.schema() as Array<{ getType(): string }>
    const form = elements[1] as Form

    const save = form.getSave()!
    // First save: no ctx.record → create.
    const created = await save({ siteName: 'Initial' }, { values: {} } as any)
    assert.ok(M._peek(), 'row created')
    assert.equal((created as Row).siteName, 'Initial')

    // Second save: ctx.record present → update path.
    const updated = await save({ siteName: 'Updated' }, { values: {}, record: M._peek() } as any)
    assert.equal((updated as Row).siteName, 'Updated')
    assert.equal((M._peek() as Row).siteName, 'Updated')
  })

  it('hand-wired loadRecord / save still win over auto-wire', () => {
    const M = makeStubModel({ id: 1, siteName: 'A' })
    const customLoader = async () => ({ siteName: 'CUSTOM' })
    const customSave   = async (d: Record<string, unknown>) => d
    class Hybrid extends Global {
      static override label         = 'H'
      static override labelSingular = 'H'
      static override slug          = 'h'
      static override model         = M
      static override form(form: Form) {
        return form
          .schema([TextField.make('siteName')])
          .loadRecord(customLoader)
          .save(customSave)
      }
    }
    const Edit = defaultGlobalEditPage(Hybrid)
    const elements = Edit.schema() as Array<{ getType(): string }>
    const form = elements[1] as Form
    assert.equal(form.getLoadRecord(), customLoader)
    assert.equal(form.getSave(),       customSave)
  })

  it('findSingular shapes the query (e.g. WHERE key=…)', async () => {
    const M = makeStubModel({ id: 7, siteName: 'tagged' })
    ;(M._peek() as Record<string, unknown>)['key'] = 'site'
    class Keyed extends Global {
      static override label         = 'K'
      static override labelSingular = 'K'
      static override slug          = 'k'
      static override model         = M
      static override findSingular  = (q: any) => q.where('key', '=', 'site')
      static override form(form: Form) { return form.schema([TextField.make('siteName')]) }
    }
    const Edit = defaultGlobalEditPage(Keyed)
    const elements = Edit.schema() as Array<{ getType(): string }>
    const form = elements[1] as Form
    const loaded = await form.getLoadRecord()!('', { values: {} }) as Row | null
    assert.ok(loaded)
    assert.equal(loaded!.siteName, 'tagged')

    // Mismatched filter returns null (auto-create-on-first-save kicks in).
    class Wrong extends Keyed {
      static override findSingular = (q: any) => q.where('key', '=', 'never-matches')
    }
    const Edit2 = defaultGlobalEditPage(Wrong)
    const elements2 = Edit2.schema() as Array<{ getType(): string }>
    const form2 = elements2[1] as Form
    const loaded2 = await form2.getLoadRecord()!('', { values: {} })
    assert.equal(loaded2, null)
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
    const formMeta = schemaData.find(s => s.type === 'form')
    assert.ok(formMeta, 'expected a form element')
    assert.deepEqual(formMeta!.values, { siteName: 'My Site' })
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
    const formMeta = schemaData.find(s => s.type === 'form')
    assert.ok(formMeta, 'expected a form element')
    assert.ok(formMeta!.errors!['siteName']!.length > 0)
  })
})
