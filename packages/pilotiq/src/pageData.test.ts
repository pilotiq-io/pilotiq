import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Form } from './elements/Form.js'
import { ListTab } from './Tab.js'
import { ListTabs } from './elements/ListTabs.js'
import {
  applyFillPipeline,
  formStateData,
  panelInfo,
  resolveActiveTab,
  tagFormStateUrls,
  tagTableReorderUrls,
} from './pageData.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { Pilotiq } from './Pilotiq.js'
import { Resource } from './Resource.js'
import { Global } from './Global.js'
import { Page } from './Page.js'
import { TextField } from './fields/TextField.js'
import { ToggleField } from './fields/ToggleField.js'
import { Section } from './schema/Section.js'

describe('applyFillPipeline', () => {
  it('defaults to a shallow record copy when nothing is configured', async () => {
    const form = Form.make()
    const record = { id: 1, title: 'Hello' }
    const values = await applyFillPipeline(form, record)
    assert.deepEqual(values, { id: 1, title: 'Hello' })
    assert.notEqual(values, record)
  })

  it('runs mutateFormDataBeforeFill before fillFromRecord', async () => {
    const order: string[] = []
    const form = Form.make<{ id: number; tags: string[] }>()
      .mutateFormDataBeforeFill(v => { order.push('before'); return { ...v, tagsCsv: '' } })
      .fillFromRecord(r => { order.push('fill'); return { id: r.id, tagsCsv: r.tags.join(',') } })

    const values = await applyFillPipeline(form, { id: 1, tags: ['a', 'b'] })
    assert.deepEqual(order, ['before', 'fill'])
    assert.deepEqual(values, { id: 1, tagsCsv: 'a,b' })
  })

  it('runs mutateFormDataAfterFill after fillFromRecord', async () => {
    const form = Form.make<{ id: number; title: string }>()
      .fillFromRecord(r => ({ id: r.id, title: r.title }))
      .mutateFormDataAfterFill(v => ({ ...v, title: String(v['title']).toUpperCase() }))

    const values = await applyFillPipeline(form, { id: 1, title: 'hello' })
    assert.deepEqual(values, { id: 1, title: 'HELLO' })
  })

  it('passes the loaded record on ctx.record to both mutators', async () => {
    const seen: { before?: unknown; after?: unknown } = {}
    const form = Form.make<{ id: number; secret: string }>()
      .mutateFormDataBeforeFill((v, ctx) => { seen.before = ctx.record; return v })
      .mutateFormDataAfterFill((v, ctx)  => { seen.after  = ctx.record; return v })

    const record = { id: 1, secret: 'hidden' }
    await applyFillPipeline(form, record)
    assert.equal(seen.before, record)
    assert.equal(seen.after, record)
  })

  it('supports async mutators', async () => {
    const form = Form.make<{ id: number }>()
      .mutateFormDataAfterFill(async v => ({ ...v, async: true }))
    const values = await applyFillPipeline(form, { id: 1 })
    assert.deepEqual(values, { id: 1, async: true })
  })
})

describe('resolveActiveTab', () => {
  it('is a no-op when the schema has no ListTabs', async () => {
    // Just shouldn't throw; nothing to assert besides the absence of side effects.
    await resolveActiveTab([Form.make()], {}, '/admin/articles')
  })

  it('marks the first tab active when ?tab= is absent and no tab is .default()', async () => {
    const all     = ListTab.make('all').label('All')
    const drafts  = ListTab.make('drafts').label('Drafts')
    const tabs    = ListTabs.make().tabs([all, drafts])

    await resolveActiveTab([tabs], {}, '/admin/articles')
    assert.equal(all.isActive(),    true)
    assert.equal(drafts.isActive(), false)
  })

  it('honors .default() over the first-tab fallback', async () => {
    const all     = ListTab.make('all').label('All')
    const drafts  = ListTab.make('drafts').label('Drafts').default()
    const tabs    = ListTabs.make().tabs([all, drafts])

    await resolveActiveTab([tabs], {}, '/admin/articles')
    assert.equal(all.isActive(),    false)
    assert.equal(drafts.isActive(), true)
  })

  it('resolves the URL-supplied ?tab=name to the matching tab', async () => {
    const all     = ListTab.make('all').default()
    const drafts  = ListTab.make('drafts')
    const tabs    = ListTabs.make().tabs([all, drafts])

    await resolveActiveTab([tabs], { tab: 'drafts' }, '/admin/articles')
    assert.equal(all.isActive(),    false)
    assert.equal(drafts.isActive(), true)
  })

  it('falls through to default when ?tab= names a non-existent tab', async () => {
    const all     = ListTab.make('all').default()
    const drafts  = ListTab.make('drafts')
    const tabs    = ListTabs.make().tabs([all, drafts])

    await resolveActiveTab([tabs], { tab: 'bogus' }, '/admin/articles')
    assert.equal(all.isActive(),    true)
    assert.equal(drafts.isActive(), false)
  })

  it('stamps per-tab URLs that carry forward search/sort/filters but reset page', async () => {
    const all     = ListTab.make('all')
    const drafts  = ListTab.make('drafts')
    const tabs    = ListTabs.make().tabs([all, drafts])

    await resolveActiveTab(
      [tabs],
      { search: 'hi', sort: 'title:desc', page: '3', status: 'published' },
      '/admin/articles',
    )

    const allUrl    = all.toMeta().url
    const draftsUrl = drafts.toMeta().url
    // Tab name + carry-forward params, no `page`.
    for (const url of [allUrl, draftsUrl]) {
      assert.ok(url.startsWith('/admin/articles?'), `${url} should be absolute under the index path`)
      assert.ok(url.includes('search=hi'),          'search carries forward')
      assert.ok(url.includes('sort=title%3Adesc') || url.includes('sort=title:desc'), 'sort carries forward')
      assert.ok(url.includes('status=published'),   'filter values carry forward')
      assert.ok(!url.includes('page='),             'page resets on tab change')
    }
    // `all` is the implicit default tab (first, none marked `.default()`)
    // — its canonical URL omits `?tab=`. Non-default tabs include it.
    assert.ok(!allUrl.includes('tab='),         'default tab URL omits ?tab=')
    assert.ok(draftsUrl.includes('tab=drafts'), 'non-default tab URL includes ?tab=')
  })

  it('default tab URL is the bare path when no other params are present', async () => {
    const all    = ListTab.make('all')
    const drafts = ListTab.make('drafts')
    const tabs   = ListTabs.make().tabs([all, drafts])

    await resolveActiveTab([tabs], {}, '/admin/articles')

    // Default tab → no query string at all.
    assert.equal(all.toMeta().url, '/admin/articles')
    // Non-default still names itself.
    assert.equal(drafts.toMeta().url, '/admin/articles?tab=drafts')
  })

  it('explicitly-marked .default() tab gets the paramless URL even when not first', async () => {
    const all     = ListTab.make('all')
    const drafts  = ListTab.make('drafts').default()
    const tabs    = ListTabs.make().tabs([all, drafts])

    await resolveActiveTab([tabs], {}, '/admin/articles')

    assert.equal(drafts.toMeta().url, '/admin/articles', 'marked-default tab → bare path')
    assert.equal(all.toMeta().url,    '/admin/articles?tab=all')
  })

  it('resolves badge handlers in parallel and stamps the result on each tab', async () => {
    const order: string[] = []
    const a = ListTab.make('a').badge(async () => {
      order.push('a-start')
      await new Promise(r => setTimeout(r, 10))
      order.push('a-end')
      return 1
    })
    const b = ListTab.make('b').badge(async () => {
      order.push('b-start')
      await new Promise(r => setTimeout(r, 5))
      order.push('b-end')
      return 2
    })
    const tabs = ListTabs.make().tabs([a, b])

    await resolveActiveTab([tabs], {}, '/admin/articles')
    assert.equal(a.toMeta().badge, '1')
    assert.equal(b.toMeta().badge, '2')
    // Both started before either finished — confirms Promise.all parallelism.
    assert.equal(order.indexOf('a-start') < order.indexOf('b-end'), true)
    assert.equal(order.indexOf('b-start') < order.indexOf('a-end'), true)
  })

  it('swallows errors thrown by badge handlers', async () => {
    const broken = ListTab.make('broken').badge(async () => { throw new Error('oops') })
    const tabs   = ListTabs.make().tabs([broken])
    await resolveActiveTab([tabs], {}, '/admin/articles')
    // No badge stamped; meta has no `badge` key.
    assert.equal(broken.toMeta().badge, undefined)
  })

  it('badge handler returning undefined leaves the badge unset', async () => {
    const tab = ListTab.make('drafts').badge(async () => undefined)
    const tabs = ListTabs.make().tabs([tab])
    await resolveActiveTab([tabs], {}, '/admin/articles')
    assert.equal(tab.toMeta().badge, undefined)
  })

  it('static badge survives unchanged when no handler is set', async () => {
    const tab = ListTab.make('drafts').badge('5')
    const tabs = ListTabs.make().tabs([tab])
    await resolveActiveTab([tabs], {}, '/admin/articles')
    assert.equal(tab.toMeta().badge, '5')
  })
})

describe('panelInfo — icon serialization', () => {
  it('ships string-typed Resource.icon as-is', async () => {
    class StringIconResource extends Resource {
      static override label = 'Things'
      static override icon  = 'newspaper'
    }
    const panel = Pilotiq.make('T').path('/admin').resources([StringIconResource])
    const info  = await panelInfo(panel)
    const r     = info.navigation[0]!
    assert.equal(r.icon, 'newspaper')
    assert.equal(r.name, 'StringIconResource')
  })

  it('ships component-typed Resource.icon as { class: ownerName }', async () => {
    const FakeIcon = () => null
    class CmpIconResource extends Resource {
      static override label = 'Things'
      static override icon  = FakeIcon as unknown as string
    }
    const panel = Pilotiq.make('T').path('/admin').resources([CmpIconResource])
    const info  = await panelInfo(panel)
    const r     = info.navigation[0]!
    assert.deepEqual(r.icon, { class: 'CmpIconResource' })
    assert.equal(r.name, 'CmpIconResource')
  })

  it('serializes Global.icon and Page.icon the same way', async () => {
    const FakeIcon = () => null
    class CmpIconGlobal extends Global {
      static override label = 'Settings'
      static override icon  = FakeIcon as unknown as string
    }
    const panel = Pilotiq.make('T').path('/admin').globals([CmpIconGlobal])
    const info  = await panelInfo(panel)
    assert.deepEqual(info.navigation[0]!.icon, { class: 'CmpIconGlobal' })
  })
})

describe('panelInfo — navigation tree (Plan #9)', () => {
  it('builds a flat tree when no group / sort / parent metadata is set', async () => {
    class Articles extends Resource { static override label = 'Articles' }
    class Users    extends Resource { static override label = 'Users' }
    const panel = Pilotiq.make('T').path('/admin').resources([Articles, Users])
    const info  = await panelInfo(panel)
    assert.equal(info.navigation.length, 2)
    assert.equal(info.navigation[0]!.name, 'Articles')
    assert.equal(info.navigation[0]!.url,  '/admin/articles')
    assert.equal(info.navigation[0]!.group, undefined)
    assert.equal(info.navigation[0]!.children, undefined)
    assert.equal(info.navigation[1]!.name, 'Users')
  })

  it('uses navigationLabel + navigationIcon when set, otherwise label + icon', async () => {
    const Pencil = () => null
    class Posts extends Resource {
      static override label            = 'Articles'
      static override icon             = 'newspaper'
      static override navigationLabel  = 'Posts'
      static override navigationIcon   = Pencil as unknown as string
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([Posts]))
    assert.equal(info.navigation[0]!.label, 'Posts')
    assert.deepEqual(info.navigation[0]!.icon, { class: 'Posts' })
  })

  it('Globals default navigationGroup to "Settings"; explicit null opts out', async () => {
    class Brand extends Global { static override label = 'Brand' }
    class Site  extends Global {
      static override label = 'Site'
      static override navigationGroup = null
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').globals([Brand, Site]))
    const brand = info.navigation.find(n => n.name === 'Brand')!
    const site  = info.navigation.find(n => n.name === 'Site')!
    assert.equal(brand.group, 'Settings')
    assert.equal(site.group,  undefined)
  })

  it('preserves group order based on first appearance in registration', async () => {
    class A extends Resource { static override label = 'A'; static override navigationGroup = 'Beta' }
    class B extends Resource { static override label = 'B'; static override navigationGroup = 'Alpha' }
    class C extends Resource { static override label = 'C'; static override navigationGroup = 'Beta' }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([A, B, C]))
    // Items live flat on the tree carrying `group`; later code groups by it.
    // Order is A (Beta), B (Alpha), C (Beta) — Beta appeared first.
    assert.deepEqual(info.navigation.map(n => n.group), ['Beta', 'Alpha', 'Beta'])
  })

  it('sorts within siblings by navigationSort (asc), then registration order; sorted before unsorted', async () => {
    class A extends Resource { static override label = 'A'; static override navigationSort = 30 }
    class B extends Resource { static override label = 'B'; static override navigationSort = 10 }
    class C extends Resource { static override label = 'C' /* no sort */ }
    class D extends Resource { static override label = 'D'; static override navigationSort = 20 }
    class E extends Resource { static override label = 'E' /* no sort, comes after C */ }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([A, B, C, D, E]))
    assert.deepEqual(info.navigation.map(n => n.name), ['B', 'D', 'A', 'C', 'E'])
  })

  it('nests under navigationParentItem (class-name reference)', async () => {
    class Parent extends Resource { static override label = 'Parent' }
    class Child  extends Resource {
      static override label = 'Child'
      static override navigationParentItem = 'Parent'
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([Parent, Child]))
    assert.equal(info.navigation.length, 1)
    assert.equal(info.navigation[0]!.name, 'Parent')
    assert.equal(info.navigation[0]!.children?.length, 1)
    assert.equal(info.navigation[0]!.children![0]!.name, 'Child')
  })

  it('renders dangling parent references at top level (no console error)', async () => {
    class Orphan extends Resource {
      static override label = 'Orphan'
      static override navigationParentItem = 'DoesNotExist'
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([Orphan]))
    assert.equal(info.navigation.length, 1)
    assert.equal(info.navigation[0]!.name, 'Orphan')
    assert.equal(info.navigation[0]!.children, undefined)
  })

  it('breaks parent cycles: A → B → A both render at top level', async () => {
    class A extends Resource { static override label = 'A'; static override navigationParentItem = 'B' }
    class B extends Resource { static override label = 'B'; static override navigationParentItem = 'A' }
    // Suppress the dev warning.
    const origWarn = console.warn
    console.warn = () => {}
    try {
      const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([A, B]))
      const names = info.navigation.map(n => n.name).sort()
      assert.deepEqual(names, ['A', 'B'])
    } finally {
      console.warn = origWarn
    }
  })

  it('resolves navigationBadge handlers in parallel and stamps the result', async () => {
    const order: string[] = []
    class Slow extends Resource {
      static override label = 'Slow'
      static override navigationBadge = async () => {
        order.push('slow-start')
        await new Promise(r => setTimeout(r, 10))
        order.push('slow-end')
        return 1
      }
    }
    class Fast extends Resource {
      static override label = 'Fast'
      static override navigationBadge = async () => {
        order.push('fast-start')
        await new Promise(r => setTimeout(r, 5))
        order.push('fast-end')
        return 2
      }
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([Slow, Fast]))
    const slow = info.navigation.find(n => n.name === 'Slow')!
    const fast = info.navigation.find(n => n.name === 'Fast')!
    assert.equal(slow.badge, '1')
    assert.equal(fast.badge, '2')
    // Both started before either finished — confirms Promise.all parallelism.
    assert.equal(order.indexOf('slow-start') < order.indexOf('fast-end'), true)
    assert.equal(order.indexOf('fast-start') < order.indexOf('slow-end'), true)
  })

  it('swallows badge handler errors so the page still renders', async () => {
    class Broken extends Resource {
      static override label = 'Broken'
      static override navigationBadge = async () => { throw new Error('boom') }
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([Broken]))
    assert.equal(info.navigation[0]!.badge, undefined)
  })

  it('omits badge when handler returns undefined or null', async () => {
    class Empty extends Resource {
      static override label = 'Empty'
      static override navigationBadge = async () => undefined
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([Empty]))
    assert.equal(info.navigation[0]!.badge, undefined)
  })

  it('exposes navigationBadgeColor when not "default"', async () => {
    class Drafty extends Resource {
      static override label                = 'Drafty'
      static override navigationBadge      = () => 3
      static override navigationBadgeColor = 'warning' as const
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([Drafty]))
    assert.equal(info.navigation[0]!.badge,      '3')
    assert.equal(info.navigation[0]!.badgeColor, 'warning')
  })
})

describe('tagFormStateUrls (Plan #5)', () => {
  it('stamps stateUrl on forms that have at least one live() field', () => {
    const form = Form.make().formId('f1').schema([
      TextField.make('a'),
      TextField.make('b').live(),
    ])
    tagFormStateUrls([form], (id) => `/admin/x/_form/${id}/state`)
    assert.equal(form.getStateUrl(), '/admin/x/_form/f1/state')
  })

  it('skips forms whose descendants are not live', () => {
    const form = Form.make().formId('f2').schema([TextField.make('a')])
    tagFormStateUrls([form], (id) => `/admin/x/_form/${id}/state`)
    assert.equal(form.getStateUrl(), undefined)
  })

  it('walks nested containers to detect live fields', () => {
    const form = Form.make().formId('f3').schema([
      Section.make('s').schema([ToggleField.make('flag').live()]),
    ])
    tagFormStateUrls([form], (id) => `/admin/x/_form/${id}/state`)
    assert.equal(form.getStateUrl(), '/admin/x/_form/f3/state')
  })

  it('handles multiple forms independently', () => {
    const live   = Form.make().formId('live').schema([TextField.make('a').live()])
    const inert  = Form.make().formId('inert').schema([TextField.make('b')])
    tagFormStateUrls([live, inert], (id) => `/x/${id}`)
    assert.equal(live.getStateUrl(),  '/x/live')
    assert.equal(inert.getStateUrl(), undefined)
  })
})

describe('tagTableReorderUrls (reorderable rows)', () => {
  it('stamps reorderUrl on tables with reorderable() opted in', () => {
    const t = Table.make().reorderable('sort').columns([Column.make('id')])
    tagTableReorderUrls([t], '/admin/posts/_reorder')
    assert.equal(t.getReorderUrl(), '/admin/posts/_reorder')
  })

  it('skips tables without reorderable()', () => {
    const t = Table.make().columns([Column.make('id')])
    tagTableReorderUrls([t], '/admin/posts/_reorder')
    assert.equal(t.getReorderUrl(), undefined)
  })

  it('preserves a previously stamped URL (idempotent)', () => {
    const t = Table.make().reorderable('sort').withReorderUrl('/x/_reorder')
    tagTableReorderUrls([t], '/y/_reorder')
    assert.equal(t.getReorderUrl(), '/x/_reorder')
  })
})

describe('formStateData (Plan #5)', () => {
  it('returns null when the page-scope is unknown', async () => {
    class Articles extends Resource {
      static override label = 'Articles'
    }
    const panel = Pilotiq.make('T').path('/admin').resources([Articles])
    const result = await formStateData(panel, { kind: 'resource-edit', slug: 'missing', recordId: '1' }, { formId: 'f', changed: 'x', values: {} })
    assert.equal(result, null)
  })

  it('returns 404 when the form id misses on a multi-form page', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [
          Form.make().formId('one').schema([TextField.make('x').live()]),
          Form.make().formId('two').schema([TextField.make('y').live()]),
        ]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])
    const result = await formStateData(panel, { kind: 'page', pageSlug: 'demo' }, { formId: 'wrong-id', changed: 'x', values: { x: 'v' } })
    assert.notEqual(result, null)
    assert.equal((result as { ok: false; status: number }).ok, false)
    assert.equal((result as { ok: false; status: number }).status, 404)
  })

  it('falls back to the only form when the formId misses on a single-form page', async () => {
    // Removes the auto-counter desync footgun for reactive demos —
    // see selectFormById in elements/dispatchForm.ts.
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([TextField.make('x').live()])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])
    const result = await formStateData(panel, { kind: 'page', pageSlug: 'demo' }, { formId: 'mismatched-counter', changed: 'x', values: { x: 'v' } })
    assert.notEqual(result, null)
    assert.equal((result as { ok: true }).ok, true)
  })

  it('returns 422 when the changed field does not exist on the form', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([TextField.make('x').live()])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])
    const result = await formStateData(panel, { kind: 'page', pageSlug: 'demo' }, { formId: 'the-form', changed: 'missing', values: {} })
    assert.notEqual(result, null)
    assert.equal((result as { ok: false; status: number }).ok, false)
    assert.equal((result as { ok: false; status: number }).status, 422)
  })

  it('runs afterStateUpdated and returns the resolved form meta', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([
          TextField.make('title').live().afterStateUpdated((value, { $set }) => {
            $set('slug', String(value).toLowerCase().replace(/\s+/g, '-'))
          }),
          TextField.make('slug'),
        ])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])
    const result = await formStateData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', changed: 'title', values: { title: 'Hello World', slug: 'old' } },
    )
    assert.notEqual(result, null)
    if (result === null || !result.ok) throw new Error('expected ok result')
    assert.deepEqual(result.dirty.sort(), ['slug', 'title'])
    const formMeta = result.form as { values?: Record<string, unknown> }
    assert.equal(formMeta.values?.['slug'], 'hello-world')
  })
})
