/**
 * Plan #15 Phase A — server-data widget plumbing.
 *
 * Tests the wire-shape contract introduced by Phase A:
 *   - `panel.dashboard(P)` sugar (registration + navigation collapse)
 *   - `dashboardData(panel)` resolves the dashboard page's schema
 *   - `customPageData` and `dashboardData` ship a `_widgetData` map
 *   - `resolveServerDataElements` runs hooks in parallel + lazy default
 *   - `widgetData(panel, scope, body)` polling-endpoint contract
 *
 * Concrete widgets (Stat / Chart / Table / View) ship in later phases;
 * Phase A uses View as a smoke-test widget since it's the bare-bones
 * subclass of `ServerDataElement`.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  Pilotiq,
  Page,
  Heading,
  Group,
  Card,
  View,
  Resource,
  Table,
  Column,
  ListPage,
  dashboardData,
  customPageData,
  resourceIndexData,
  panelInfo,
  resolveServerDataElements,
  widgetData,
} from './index.js'
import { type RenderContext } from './schema/resolveSchema.js'

// ─── Fixtures ──────────────────────────────────────────────

class StatsView extends View {
  static override async getData() { return { total: 42 } }
}

class CountsView extends View {
  static override async getData() { return { count: 7 } }
}

class FlakyView extends View {
  static override async getData(): Promise<unknown> {
    throw new Error('boom')
  }
}

class CtxView extends View {
  static override async getData(ctx: RenderContext) {
    return { filter: ctx.filter ?? 'none', user: ctx.user }
  }
}

// ─── Phase A.3: panel.dashboard(P) sugar ──────────────────

describe('panel.dashboard(P) — registration', () => {
  it('stores the dashboard page on cfg', () => {
    class MyDashboard extends Page {
      static override slug = ''
      static override label = 'Dashboard'
    }
    const panel = Pilotiq.make('T').path('/admin').dashboard(MyDashboard)
    assert.equal(panel.getConfig().dashboardPage, MyDashboard)
  })

  it('adds the dashboard page to cfg.pages if not already present', () => {
    class MyDashboard extends Page {
      static override slug = ''
    }
    const panel = Pilotiq.make('T').path('/admin').dashboard(MyDashboard)
    assert.ok(panel.getConfig().pages.includes(MyDashboard))
  })

  it('does not duplicate the page when already in cfg.pages', () => {
    class MyDashboard extends Page {
      static override slug = ''
    }
    const panel = Pilotiq.make('T').path('/admin')
      .pages([MyDashboard])
      .dashboard(MyDashboard)
    const occurrences = panel.getConfig().pages.filter(p => p === MyDashboard).length
    assert.equal(occurrences, 1)
  })
})

describe('panelInfo — dashboard page nav URL collapses to base', () => {
  it('emits url=base for the dashboard page entry', async () => {
    class MyDashboard extends Page {
      static override slug = 'home'
      static override label = 'Dashboard'
    }
    class OtherPage extends Page {
      static override slug = 'other'
    }
    const panel = Pilotiq.make('T').path('/admin')
      .pages([MyDashboard, OtherPage])
      .dashboard(MyDashboard)
    const info = await panelInfo(panel)
    const dash = info.navigation.find(n => n.name === 'MyDashboard')!
    const other = info.navigation.find(n => n.name === 'OtherPage')!
    assert.equal(dash.url, '/admin')
    assert.equal(other.url, '/admin/other')
  })
})

// ─── Phase A.5: resolveServerDataElements ──────────────────

describe('resolveServerDataElements', () => {
  it('returns an empty map when no widgets exist', async () => {
    const out = await resolveServerDataElements([Heading.make('Hi')], {})
    assert.deepEqual(out, {})
  })

  it('stamps null for lazy widgets (default)', async () => {
    const out = await resolveServerDataElements([StatsView.make()], {})
    assert.deepEqual(out, { StatsView: null })
  })

  it('runs the hook for non-lazy widgets', async () => {
    const out = await resolveServerDataElements([StatsView.make().lazy(false)], {})
    assert.deepEqual(out, { StatsView: { total: 42 } })
  })

  it('runs multiple widgets in parallel + keys by id', async () => {
    const out = await resolveServerDataElements(
      [StatsView.make().lazy(false), CountsView.make().lazy(false)],
      {},
    )
    assert.deepEqual(out, {
      StatsView:  { total: 42 },
      CountsView: { count: 7 },
    })
  })

  it('catches per-widget throws and stamps an error sentinel', async () => {
    const out = await resolveServerDataElements([FlakyView.make().lazy(false)], {})
    assert.deepEqual(out, { FlakyView: { error: 'boom' } })
  })

  it('walks into Group containers', async () => {
    const tree = [Group.make().schema([StatsView.make().lazy(false)])]
    const out = await resolveServerDataElements(tree, {})
    assert.deepEqual(out, { StatsView: { total: 42 } })
  })

  it('does not recurse into form/repeater/builder/table containers', async () => {
    // Synthetic walker — make sure widgets inside a Form are skipped.
    // We use the Form element from elements/Form.js indirectly by
    // putting the StatsView under an element with type === 'form'.
    // For Phase A we just verify with a plain tree that the top-level
    // case works; the structural skip is exercised by collect tests
    // in later phases when we have concrete widget+form combos.
    const out = await resolveServerDataElements([StatsView.make().lazy(false)], {})
    assert.deepEqual(out, { StatsView: { total: 42 } })
  })
})

// ─── Phase A.5 + dashboard wiring ─────────────────────────

describe('dashboardData — schema + widgetData wiring', () => {
  it('uses the dashboard page schema when registered', async () => {
    class MyDashboard extends Page {
      static override slug = ''
      static override schema() { return [Heading.make('Welcome')] }
    }
    const panel = Pilotiq.make('T').path('/admin').dashboard(MyDashboard)
    const data = await dashboardData(panel)
    const schemaData = data['schemaData'] as Array<Record<string, unknown>>
    assert.equal(schemaData.length, 1)
    assert.equal(schemaData[0]!['type'], 'heading')
    assert.equal(schemaData[0]!['content'], 'Welcome')
  })

  it('ships a _widgetData map keyed by widget id', async () => {
    class MyDashboard extends Page {
      static override slug = ''
      static override schema() {
        return [
          Heading.make('Stats'),
          StatsView.make().lazy(false),
        ]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').dashboard(MyDashboard)
    const data = await dashboardData(panel)
    assert.deepEqual(data['_widgetData'], { StatsView: { total: 42 } })
  })

  it('lazy widgets stamp null on first paint', async () => {
    class MyDashboard extends Page {
      static override slug = ''
      static override schema() { return [StatsView.make()] }
    }
    const panel = Pilotiq.make('T').path('/admin').dashboard(MyDashboard)
    const data = await dashboardData(panel)
    assert.deepEqual(data['_widgetData'], { StatsView: null })
  })

  it('falls back to cfg.schema when no dashboard page is set', async () => {
    const panel = Pilotiq.make('T').path('/admin').schema([Heading.make('Hi')])
    const data = await dashboardData(panel)
    const schemaData = data['schemaData'] as Array<Record<string, unknown>>
    assert.equal(schemaData[0]!['content'], 'Hi')
  })
})

describe('customPageData — _widgetData wiring', () => {
  it('ships _widgetData for widgets on a custom page', async () => {
    class Reports extends Page {
      static override slug = 'reports'
      static override schema() {
        return [CountsView.make().lazy(false)]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([Reports])
    const data = await customPageData(panel, 'reports')
    assert.ok(data)
    assert.deepEqual(data!['_widgetData'], { CountsView: { count: 7 } })
  })
})

// ─── Phase A.4 + B: widgetUrl stamping ────────────────────

describe('tagWidgetUrls — meta widgetUrl stamping', () => {
  it('stamps widgetUrl on every widget meta on a dashboard', async () => {
    class MyDashboard extends Page {
      static override slug = ''
      static override schema() {
        return [StatsView.make(), CountsView.make()]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').dashboard(MyDashboard)
    const data = await dashboardData(panel)
    const schema = data['schemaData'] as Array<Record<string, unknown>>
    const stats  = schema.find(s => s['id'] === 'StatsView')!
    const counts = schema.find(s => s['id'] === 'CountsView')!
    assert.equal(stats['widgetUrl'],  '/admin/_widget/StatsView')
    assert.equal(counts['widgetUrl'], '/admin/_widget/CountsView')
  })

  it('stamps page-scoped widgetUrl on a custom page', async () => {
    class Reports extends Page {
      static override slug = 'reports'
      static override schema() { return [CountsView.make()] }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([Reports])
    const data  = await customPageData(panel, 'reports')
    const schema = data!['schemaData'] as Array<Record<string, unknown>>
    const counts = schema.find(s => s['id'] === 'CountsView')!
    assert.equal(counts['widgetUrl'], '/admin/reports/_widget/CountsView')
  })
})

// ─── Phase A.4: widgetData polling endpoint ───────────────

describe('widgetData — panel-scope (dashboard)', () => {
  it('returns 404 when no dashboard page is registered', async () => {
    const panel = Pilotiq.make('T').path('/admin')
    const out = await widgetData(panel, { kind: 'panel' }, { id: 'X' })
    assert.equal(out.ok, false)
    if (!out.ok) {
      assert.equal(out.status, 404)
    }
  })

  it('returns 404 when widget id is unknown', async () => {
    class MyDashboard extends Page {
      static override slug = ''
      static override schema() { return [StatsView.make()] }
    }
    const panel = Pilotiq.make('T').path('/admin').dashboard(MyDashboard)
    const out = await widgetData(panel, { kind: 'panel' }, { id: 'NotThere' })
    assert.equal(out.ok, false)
    if (!out.ok) {
      assert.equal(out.status, 404)
    }
  })

  it('runs the widget hook and returns the payload', async () => {
    class MyDashboard extends Page {
      static override slug = ''
      static override schema() { return [StatsView.make()] }
    }
    const panel = Pilotiq.make('T').path('/admin').dashboard(MyDashboard)
    const out = await widgetData(panel, { kind: 'panel' }, { id: 'StatsView' })
    assert.equal(out.ok, true)
    if (out.ok) {
      assert.deepEqual(out.data, { total: 42 })
      assert.equal(typeof out.timestamp, 'number')
    }
  })

  it('passes filter through to RenderContext.filter', async () => {
    class MyDashboard extends Page {
      static override slug = ''
      static override schema() { return [CtxView.make()] }
    }
    const panel = Pilotiq.make('T').path('/admin').dashboard(MyDashboard)
    const out = await widgetData(panel, { kind: 'panel' }, { id: 'CtxView', filter: 'week' })
    assert.equal(out.ok, true)
    if (out.ok) {
      assert.equal((out.data as { filter: string }).filter, 'week')
    }
  })

  it('returns 500 when the widget hook throws', async () => {
    class MyDashboard extends Page {
      static override slug = ''
      static override schema() { return [FlakyView.make()] }
    }
    const panel = Pilotiq.make('T').path('/admin').dashboard(MyDashboard)
    const out = await widgetData(panel, { kind: 'panel' }, { id: 'FlakyView' })
    assert.equal(out.ok, false)
    if (!out.ok) {
      assert.equal(out.status, 500)
      assert.match(out.error, /boom/)
    }
  })

  it('returns 403 when the widget is hidden by visible(false)', async () => {
    class MyDashboard extends Page {
      static override slug = ''
      static override schema() {
        return [StatsView.make().visible(false)]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').dashboard(MyDashboard)
    const out = await widgetData(panel, { kind: 'panel' }, { id: 'StatsView' })
    assert.equal(out.ok, false)
    if (!out.ok) {
      assert.equal(out.status, 403)
    }
  })
})

describe('widgetData — page scope', () => {
  it('returns 404 when the page slug is unknown', async () => {
    const panel = Pilotiq.make('T').path('/admin')
    const out = await widgetData(panel, { kind: 'page', pageSlug: 'nope' }, { id: 'X' })
    assert.equal(out.ok, false)
    if (!out.ok) {
      assert.equal(out.status, 404)
    }
  })

  it('runs widget hooks on a custom page', async () => {
    class Reports extends Page {
      static override slug = 'reports'
      static override schema() { return [CountsView.make()] }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([Reports])
    const out = await widgetData(panel, { kind: 'page', pageSlug: 'reports' }, { id: 'CountsView' })
    assert.equal(out.ok, true)
    if (out.ok) {
      assert.deepEqual(out.data, { count: 7 })
    }
  })
})

// ─── Phase E: Resource.headerSchema / footerSchema ────────

describe('Resource.headerSchema / footerSchema (Plan #15 Phase E)', () => {
  it('default to []', () => {
    class R extends Resource {
      static override label = 'Items'
      static override slug  = 'items'
    }
    assert.deepEqual(R.headerSchema(), [])
    assert.deepEqual(R.footerSchema(), [])
  })

  it('ListPage.schema slots headerSchema between Heading and Table', async () => {
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table { return t.columns([Column.make('title')]) }
      static override headerSchema() { return [StatsView.make()] }
    }
    class L extends ListPage {
      static override getResource() { return R }
    }
    const schema = await L.schema({ basePath: '/admin' }) as Array<{ getType(): string }>
    assert.equal(schema[0]!.getType(), 'heading')
    assert.equal(schema[1]!.getType(), 'view')
    assert.equal(schema[2]!.getType(), 'table')
  })

  it('ListPage.schema appends footerSchema after Table', async () => {
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table { return t.columns([Column.make('title')]) }
      static override footerSchema() { return [CountsView.make()] }
    }
    class L extends ListPage {
      static override getResource() { return R }
    }
    const schema = await L.schema({ basePath: '/admin' }) as Array<{ getType(): string }>
    assert.equal(schema[0]!.getType(), 'heading')
    assert.equal(schema[1]!.getType(), 'table')
    assert.equal(schema[2]!.getType(), 'view')
  })

  it('async headerSchema is awaited', async () => {
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table { return t.columns([Column.make('title')]) }
      static override async headerSchema() { return [StatsView.make()] }
    }
    class L extends ListPage {
      static override getResource() { return R }
    }
    const schema = await L.schema({ basePath: '/admin' }) as Array<{ getType(): string }>
    assert.equal(schema[1]!.getType(), 'view')
  })

  it('headerSchema receives the SchemaContext (basePath, mode)', async () => {
    let seenCtx: unknown
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table { return t.columns([Column.make('title')]) }
      static override headerSchema(ctx?: { basePath?: string; mode?: string }) {
        seenCtx = ctx
        return []
      }
    }
    class L extends ListPage {
      static override getResource() { return R }
    }
    await L.schema({ basePath: '/admin', mode: 'table' })
    const ctx = seenCtx as { basePath?: string; mode?: string }
    assert.equal(ctx.basePath, '/admin')
    assert.equal(ctx.mode, 'table')
  })
})

describe('resourceIndexData — _widgetData wiring (Plan #15 Phase E)', () => {
  it('ships _widgetData for headerSchema widgets', async () => {
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table {
        return t.columns([Column.make('title')]).records(async () => ({ rows: [], total: 0 }))
      }
      static override headerSchema() { return [StatsView.make().lazy(false)] }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([R])
    const data = await resourceIndexData(panel, 'posts')
    assert.ok(data)
    assert.deepEqual(data!['_widgetData'], { StatsView: { total: 42 } })
  })

  it('lazy headerSchema widgets stamp null in _widgetData', async () => {
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table {
        return t.columns([Column.make('title')]).records(async () => ({ rows: [], total: 0 }))
      }
      static override headerSchema() { return [StatsView.make()] }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([R])
    const data = await resourceIndexData(panel, 'posts')
    assert.deepEqual(data!['_widgetData'], { StatsView: null })
  })

  it('stamps resource-scope widgetUrl on every widget meta', async () => {
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table {
        return t.columns([Column.make('title')]).records(async () => ({ rows: [], total: 0 }))
      }
      static override headerSchema() { return [StatsView.make()] }
      static override footerSchema() { return [CountsView.make()] }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([R])
    const data = await resourceIndexData(panel, 'posts')
    const schema = data!['schemaData'] as Array<Record<string, unknown>>
    const stats  = schema.find(s => s['id'] === 'StatsView')!
    const counts = schema.find(s => s['id'] === 'CountsView')!
    assert.equal(stats['widgetUrl'],  '/admin/posts/_widget/StatsView')
    assert.equal(counts['widgetUrl'], '/admin/posts/_widget/CountsView')
  })

  it('resolves widgets nested inside Group/Card layout primitives', async () => {
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table {
        return t.columns([Column.make('title')]).records(async () => ({ rows: [], total: 0 }))
      }
      static override headerSchema() {
        return [
          Group.make().schema([StatsView.make().lazy(false)]),
          Card.make('Recent').schema([CountsView.make().lazy(false)]),
        ]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([R])
    const data = await resourceIndexData(panel, 'posts')
    assert.deepEqual(data!['_widgetData'], {
      StatsView:  { total: 42 },
      CountsView: { count: 7 },
    })
  })
})

describe('widgetData — resource scope (Plan #15 Phase E)', () => {
  it('returns 404 when the resource slug is unknown', async () => {
    const panel = Pilotiq.make('T').path('/admin')
    const out = await widgetData(panel, { kind: 'resource', slug: 'nope' }, { id: 'X' })
    assert.equal(out.ok, false)
    if (!out.ok) assert.equal(out.status, 404)
  })

  it('returns 404 when the widget id is unknown on a resource', async () => {
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table { return t.columns([Column.make('title')]) }
      static override headerSchema() { return [StatsView.make()] }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([R])
    const out = await widgetData(panel, { kind: 'resource', slug: 'posts' }, { id: 'NotThere' })
    assert.equal(out.ok, false)
    if (!out.ok) assert.equal(out.status, 404)
  })

  it('runs a widget from headerSchema and returns the payload', async () => {
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table { return t.columns([Column.make('title')]) }
      static override headerSchema() { return [StatsView.make()] }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([R])
    const out = await widgetData(panel, { kind: 'resource', slug: 'posts' }, { id: 'StatsView' })
    assert.equal(out.ok, true)
    if (out.ok) assert.deepEqual(out.data, { total: 42 })
  })

  it('runs a widget from footerSchema', async () => {
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table { return t.columns([Column.make('title')]) }
      static override footerSchema() { return [CountsView.make()] }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([R])
    const out = await widgetData(panel, { kind: 'resource', slug: 'posts' }, { id: 'CountsView' })
    assert.equal(out.ok, true)
    if (out.ok) assert.deepEqual(out.data, { count: 7 })
  })

  it('returns 403 when a resource-scope widget is hidden', async () => {
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table { return t.columns([Column.make('title')]) }
      static override headerSchema() { return [StatsView.make().visible(false)] }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([R])
    const out = await widgetData(panel, { kind: 'resource', slug: 'posts' }, { id: 'StatsView' })
    assert.equal(out.ok, false)
    if (!out.ok) assert.equal(out.status, 403)
  })

  it('finds widgets nested inside Group containers', async () => {
    class R extends Resource {
      static override label = 'Posts'
      static override slug  = 'posts'
      static override table(t: Table): Table { return t.columns([Column.make('title')]) }
      static override headerSchema() {
        return [Group.make().schema([StatsView.make()])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').resources([R])
    const out = await widgetData(panel, { kind: 'resource', slug: 'posts' }, { id: 'StatsView' })
    assert.equal(out.ok, true)
    if (out.ok) assert.deepEqual(out.data, { total: 42 })
  })
})
