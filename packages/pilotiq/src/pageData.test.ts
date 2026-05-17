import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Form } from './elements/Form.js'
import { ListTab } from './Tab.js'
import { ListTabs } from './elements/ListTabs.js'
import {
  applyEditPageHydrators,
  applyFillPipeline,
  formCreateOptionData,
  formStateData,
  formWizardData,
  mentionResolveData,
  panelInfo,
  resolveActiveTab,
  tagFormStateUrls,
  tagRichTextMentionUrls,
  tagSelectCreateOptionUrls,
  tagTableReorderUrls,
  tagCellEditUrls,
} from './pageData.js'
import { Element } from './schema/Element.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { TextInputColumn, ToggleColumn } from './columns/index.js'
import { Pilotiq } from './Pilotiq.js'
import { Resource } from './Resource.js'
import { Global } from './Global.js'
import { Page } from './Page.js'
import { TextField } from './fields/TextField.js'
import { SelectField } from './fields/SelectField.js'
import { ToggleField } from './fields/ToggleField.js'
import { Section } from './schema/Section.js'
import { Wizard, Step } from './schema/Wizard.js'
import { Repeater } from './fields/RepeaterField.js'
import { Builder } from './fields/BuilderField.js'
import { Block } from './schema/Block.js'

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

  it('parses JSON-string values on Repeater slots into arrays', async () => {
    const form = Form.make().schema([
      TextField.make('title'),
      Repeater.make('metadata').schema([TextField.make('heading')]),
    ])
    const record = {
      id: 1,
      title: 'Hello',
      metadata: '[{"__id":"row-1","heading":"a"},{"__id":"row-2","heading":"b"}]',
    }
    const values = await applyFillPipeline(form, record)
    assert.deepEqual(values['metadata'], [
      { __id: 'row-1', heading: 'a' },
      { __id: 'row-2', heading: 'b' },
    ])
    assert.equal(values['title'], 'Hello')
  })

  it('parses JSON-string values on Builder slots into arrays', async () => {
    const form = Form.make().schema([
      Builder.make('content').blocks([
        Block.make('heading').schema([TextField.make('text')]),
      ]),
    ])
    const record = {
      content: '[{"__id":"row-1","type":"heading","data":{"text":"hi"}}]',
    }
    const values = await applyFillPipeline(form, record)
    assert.deepEqual(values['content'], [
      { __id: 'row-1', type: 'heading', data: { text: 'hi' } },
    ])
  })

  it('leaves non-JSON strings on array-field slots untouched', async () => {
    const form = Form.make().schema([
      Repeater.make('tags').schema([TextField.make('label')]),
    ])
    const record = { tags: 'not-json' }
    const values = await applyFillPipeline(form, record)
    assert.equal(values['tags'], 'not-json')
  })

  it('leaves JSON strings that deserialize to non-arrays untouched', async () => {
    const form = Form.make().schema([
      Repeater.make('tags').schema([TextField.make('label')]),
    ])
    const record = { tags: '{"not":"an-array"}' }
    const values = await applyFillPipeline(form, record)
    assert.equal(values['tags'], '{"not":"an-array"}')
  })

  it('passes through already-parsed arrays unchanged', async () => {
    const form = Form.make().schema([
      Repeater.make('metadata').schema([TextField.make('heading')]),
    ])
    const rows = [{ __id: 'row-1', heading: 'a' }]
    const values = await applyFillPipeline(form, { metadata: rows })
    assert.equal(values['metadata'], rows)
  })

  it('ignores top-level non-array fields whose value happens to be a JSON-string', async () => {
    const form = Form.make().schema([TextField.make('title')])
    const record = { title: '[1,2,3]' }
    const values = await applyFillPipeline(form, record)
    assert.equal(values['title'], '[1,2,3]')
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

  it('also stamps stateUrl on forms with afterStateUpdatedJs but no live()', () => {
    // JS-only forms still need FormStateProvider mounted (so $get/$set
    // can read + write the values map). The endpoint URL is unused for
    // these — the client never POSTs unless a field is `live()`.
    const form = Form.make().formId('js').schema([
      TextField.make('title').afterStateUpdatedJs(`$set('slug', $state)`),
    ])
    tagFormStateUrls([form], (id) => `/admin/x/_form/${id}/state`)
    assert.equal(form.getStateUrl(), '/admin/x/_form/js/state')
  })
})

describe('tagSelectCreateOptionUrls (audit row 2026-05-07 cont\'d⁸)', () => {
  it('stamps url on SelectFields configured with createOptionForm', () => {
    const sel = SelectField.make('categoryId').options([])
      .createOptionForm([TextField.make('name')])
      .createOptionUsing(async () => ({ value: '1', label: 'x' }))
    const form = Form.make().formId('post-create').schema([sel])

    tagSelectCreateOptionUrls(
      [form],
      (formId, fieldName) => `/admin/posts/_form/${formId}/create-option/${fieldName}`,
    )
    assert.equal(sel.getCreateOptionUrl(), '/admin/posts/_form/post-create/create-option/categoryId')
  })

  it('skips bare SelectFields with no createOptionForm', () => {
    const sel = SelectField.make('status').options([{ value: 'a', label: 'A' }])
    const form = Form.make().formId('f').schema([sel])
    tagSelectCreateOptionUrls([form], (id, name) => `/x/${id}/${name}`)
    assert.equal(sel.getCreateOptionUrl(), undefined)
  })

  it('walks nested layout containers', () => {
    const sel = SelectField.make('tagId').options([])
      .createOptionForm([TextField.make('name')])
      .createOptionUsing(async () => ({ value: '1', label: 'x' }))
    const form = Form.make().formId('nest').schema([
      Section.make('Meta').schema([sel]),
    ])
    tagSelectCreateOptionUrls(
      [form],
      (id, name) => `/p/_form/${id}/create-option/${name}`,
    )
    assert.equal(sel.getCreateOptionUrl(), '/p/_form/nest/create-option/tagId')
  })

  it('does not overwrite an already-stamped url', () => {
    const sel = SelectField.make('a').options([])
      .createOptionForm([TextField.make('name')])
      .createOptionUsing(async () => ({ value: '1', label: 'x' }))
      .withCreateOptionUrl('/preset')
    const form = Form.make().formId('f').schema([sel])
    tagSelectCreateOptionUrls([form], () => '/clobber')
    assert.equal(sel.getCreateOptionUrl(), '/preset')
  })

  it('stamps url on multiple selects independently', () => {
    const a = SelectField.make('a').options([])
      .createOptionForm([TextField.make('n')])
      .createOptionUsing(async () => ({ value: '1', label: 'x' }))
    const b = SelectField.make('b').options([])
      .createOptionForm([TextField.make('n')])
      .createOptionUsing(async () => ({ value: '2', label: 'y' }))
    const form = Form.make().formId('multi').schema([a, b])
    tagSelectCreateOptionUrls(
      [form],
      (id, name) => `/p/${id}/${name}`,
    )
    assert.equal(a.getCreateOptionUrl(), '/p/multi/a')
    assert.equal(b.getCreateOptionUrl(), '/p/multi/b')
  })

  it('stops at Repeater boundaries — inside-row SelectFields are not stamped', () => {
    const innerSel = SelectField.make('childCat').options([])
      .createOptionForm([TextField.make('n')])
      .createOptionUsing(async () => ({ value: '1', label: 'x' }))
    const outerSel = SelectField.make('rootCat').options([])
      .createOptionForm([TextField.make('n')])
      .createOptionUsing(async () => ({ value: '1', label: 'x' }))
    const form = Form.make().formId('rep').schema([
      outerSel,
      Repeater.make('rows').schema([innerSel]),
    ])
    tagSelectCreateOptionUrls([form], (id, name) => `/p/${id}/${name}`)
    assert.equal(outerSel.getCreateOptionUrl(), '/p/rep/rootCat')
    assert.equal(innerSel.getCreateOptionUrl(), undefined)
  })
})

describe('formCreateOptionData (audit row 2026-05-07 cont\'d⁸)', () => {
  function makePanelWithCreateOption(opts?: {
    handler?: (values: Record<string, unknown>) => Promise<{ value: string; label: string }>
    authorize?: import('./actions/Action.js').VisibilityRule
    createForm?: Element[]
  }) {
    const handler    = opts?.handler    ?? (async (v: Record<string, unknown>) => ({ value: 'new-id', label: String(v['name']) }))
    const createForm = opts?.createForm ?? [TextField.make('name')]

    class DemoPage extends Page {
      static override slug = 'demo'
      static override async schema() {
        const sel = SelectField.make('categoryId').options([])
          .createOptionForm(createForm)
          .createOptionUsing(handler)
        if (opts?.authorize !== undefined) sel.createOptionAuthorize(opts.authorize)
        // Two forms on the page so `selectFormById` doesn't fall back to
        // the only form (single-form fallback is intentional for SPA
        // edge cases — strict-match tests need 2+ forms).
        return [
          Form.make().formId('the-form').schema([sel]),
          Form.make().formId('other-form').schema([TextField.make('decoy')]),
        ]
      }
    }
    return Pilotiq.make('T').path('/admin').pages([DemoPage])
  }

  it('returns null when route prefix does not resolve', async () => {
    const panel = Pilotiq.make('T').path('/admin')
    const result = await formCreateOptionData(
      panel,
      { kind: 'page', pageSlug: 'no-such-page' },
      { formId: 'x', fieldName: 'y', values: {} },
    )
    assert.equal(result, null)
  })

  it('returns 404 when form is not found on page', async () => {
    const panel = makePanelWithCreateOption()
    const result = await formCreateOptionData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'wrong-form', fieldName: 'categoryId', values: { name: 'X' } },
    )
    assert.deepEqual(result, { ok: false, status: 404, error: 'Form "wrong-form" not found on page' })
  })

  it('returns 404 when SelectField is not found on form', async () => {
    const panel = makePanelWithCreateOption()
    const result = await formCreateOptionData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', fieldName: 'unknownField', values: {} },
    )
    const r = result as { ok: false; status: number; error: string }
    assert.equal(r.ok, false)
    assert.equal(r.status, 404)
    assert.match(r.error, /not found on form/)
  })

  it('returns 403 when authorize rule rejects', async () => {
    const panel = makePanelWithCreateOption({ authorize: false })
    const result = await formCreateOptionData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', fieldName: 'categoryId', values: { name: 'X' } },
    )
    assert.deepEqual(result, { ok: false, status: 403, error: 'createOptionAuthorize denied' })
  })

  it('returns 422 when validation fails', async () => {
    const panel = makePanelWithCreateOption({
      createForm: [TextField.make('name').required()],
    })
    const result = await formCreateOptionData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', fieldName: 'categoryId', values: { name: '' } },
    )
    const r = result as { ok: false; status: number; errors: Record<string, string[]> }
    assert.equal(r.ok, false)
    assert.equal(r.status, 422)
    assert.ok(r.errors['name'])
  })

  it('returns 200 + option on happy path', async () => {
    const panel = makePanelWithCreateOption()
    const result = await formCreateOptionData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', fieldName: 'categoryId', values: { name: 'Tech' } },
    )
    assert.deepEqual(result, { ok: true, option: { value: 'new-id', label: 'Tech' } })
  })

  it('returns 500 when handler throws', async () => {
    const panel = makePanelWithCreateOption({
      handler: async () => { throw new Error('boom') },
    })
    const result = await formCreateOptionData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', fieldName: 'categoryId', values: { name: 'X' } },
    )
    assert.deepEqual(result, { ok: false, status: 500, error: 'boom' })
  })

  it('returns 500 when handler returns malformed shape', async () => {
    const panel = makePanelWithCreateOption({
      // @ts-expect-error testing runtime shape guard
      handler: async () => ({ value: 'x' /* missing label */ }),
    })
    const result = await formCreateOptionData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', fieldName: 'categoryId', values: { name: 'X' } },
    )
    const r = result as { ok: false; status: number; error: string }
    assert.equal(r.ok, false)
    assert.equal(r.status, 500)
    assert.match(r.error, /\{ value: string, label: string \}/)
  })
})

/**
 * Minimal duck-typed RichTextField stand-in. The walker uses
 * `getType() === 'richtext'` + `hasAsyncMentions` + `withMentionsUrl` —
 * matching the same shape `@pilotiq/tiptap`'s real `RichTextField`
 * exposes. Pilotiq core never imports the adapter; the walker contract
 * has to be testable with a plain `Element` subclass.
 */
class FakeRichTextField extends Element {
  readonly name: string
  private readonly _hasAsync: boolean
  public stamped: string | undefined = undefined

  constructor(name: string, hasAsync: boolean) {
    super()
    this.name = name
    this._hasAsync = hasAsync
  }
  override getType(): string { return 'richtext' }
  override toMeta(): Record<string, unknown> {
    return {
      type: 'field', fieldType: 'richtext', name: this.name,
      ...(this.stamped !== undefined ? { mentionsUrl: this.stamped } : {}),
    }
  }
  hasAsyncMentions(): boolean { return this._hasAsync }
  withMentionsUrl(url: string): this { this.stamped = url; return this }
  async resolveMention(
    trigger: string,
    query:   string,
    _ctx:    Record<string, unknown>,
  ): Promise<Array<{ id: string; label: string }> | null> {
    if (trigger === '@') return [{ id: query, label: `User:${query}` }]
    return null
  }
}

describe('tagRichTextMentionUrls (async mention items)', () => {
  it('stamps mentionsUrl on RichTextFields with async providers', () => {
    const f = new FakeRichTextField('body', true)
    const form = Form.make().formId('art').schema([f])
    tagRichTextMentionUrls([form], (id) => `/admin/articles/_form/${id}/mentions`)
    assert.equal(f.stamped, '/admin/articles/_form/art/mentions')
  })

  it('skips RichTextFields with only static providers', () => {
    const staticField = new FakeRichTextField('body', false)
    const form = Form.make().formId('art').schema([staticField])
    tagRichTextMentionUrls([form], (id) => `/x/${id}`)
    assert.equal(staticField.stamped, undefined)
  })

  it('walks nested containers to find rich-text fields', () => {
    const inner = new FakeRichTextField('body', true)
    const form = Form.make().formId('art').schema([
      Section.make('s').schema([inner]),
    ])
    tagRichTextMentionUrls([form], (id) => `/admin/_form/${id}/mentions`)
    assert.equal(inner.stamped, '/admin/_form/art/mentions')
  })

  it('handles multiple forms — each gets its own URL', () => {
    const a = new FakeRichTextField('body', true)
    const b = new FakeRichTextField('body', true)
    const formA = Form.make().formId('a').schema([a])
    const formB = Form.make().formId('b').schema([b])
    tagRichTextMentionUrls([formA, formB], (id) => `/x/_form/${id}/mentions`)
    assert.equal(a.stamped, '/x/_form/a/mentions')
    assert.equal(b.stamped, '/x/_form/b/mentions')
  })

  it('skips non-richtext elements that share method names by accident', () => {
    // The fast filter `getType() === 'richtext'` keeps a coincidental
    // duck-type collision (e.g. someone naming a custom element with
    // `withMentionsUrl`) from being mistakenly stamped.
    class WrongType extends Element {
      stamped: string | undefined = undefined
      override getType(): string { return 'custom' }
      override toMeta(): Record<string, unknown> { return { type: 'custom' } }
      hasAsyncMentions(): boolean { return true }
      withMentionsUrl(url: string): this { this.stamped = url; return this }
    }
    const wrong = new WrongType()
    const form = Form.make().formId('f').schema([wrong as unknown as Element])
    tagRichTextMentionUrls([form], (id) => `/x/${id}`)
    assert.equal(wrong.stamped, undefined)
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

describe('tagCellEditUrls (editable columns)', () => {
  it('stamps _cellEditUrls only on rows that already carry _cellEditable', () => {
    const t = Table.make<Record<string, unknown>>()
      .columns([Column.make('id'), TextInputColumn.make('title')])
      .withRows([
        { id: '1', _cellEditable: { title: true } },
        { id: '2' /* canEdit was false — no editable map */ },
      ], 2)

    tagCellEditUrls([t], '/admin/posts')
    const rows = t.getRows() as Array<Record<string, unknown>>
    assert.deepEqual(rows[0]!['_cellEditUrls'], { title: '/admin/posts/1/_cell/title' })
    assert.equal(rows[1]!['_cellEditUrls'], undefined)
  })

  it('skips tables that have no editable columns', () => {
    const t = Table.make<Record<string, unknown>>()
      .columns([Column.make('id')])
      .withRows([{ id: '1' }], 1)

    tagCellEditUrls([t], '/admin/posts')
    const rows = t.getRows() as Array<Record<string, unknown>>
    assert.equal(rows[0]!['_cellEditUrls'], undefined)
  })

  it('builds a URL per editable column on the row', () => {
    const t = Table.make<Record<string, unknown>>()
      .columns([
        Column.make('id'),
        TextInputColumn.make('title'),
        ToggleColumn.make('featured'),
      ])
      .withRows([
        { id: '7', _cellEditable: { title: true, featured: true } },
      ], 1)

    tagCellEditUrls([t], '/admin/posts')
    const rows = t.getRows() as Array<Record<string, unknown>>
    assert.deepEqual(rows[0]!['_cellEditUrls'], {
      title:    '/admin/posts/7/_cell/title',
      featured: '/admin/posts/7/_cell/featured',
    })
  })

  it('encodes the row id and column name', () => {
    const t = Table.make<Record<string, unknown>>()
      .columns([Column.make('id'), TextInputColumn.make('weird name')])
      .withRows([
        { id: 'a/b', _cellEditable: { 'weird name': true } },
      ], 1)

    tagCellEditUrls([t], '/admin/posts')
    const rows = t.getRows() as Array<Record<string, unknown>>
    assert.deepEqual(rows[0]!['_cellEditUrls'], {
      'weird name': '/admin/posts/a%2Fb/_cell/weird%20name',
    })
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

  // Regression lock — reactive `itemHidden` end-to-end. Server-side resolve
  // alone is covered in `RepeaterField.test.ts` / `BuilderField.test.ts`, and
  // the client-side row-gate sync is covered in `syncRowGates.test.ts`. This
  // covers the wire between them: applyStateUpdate of a row-leaf dotted
  // path, then full resolveSchema, with the `itemHidden` rule reading the
  // updated row value. If this regresses, peer A typing into a `live()`
  // inner field would never flip the row's chrome on a real form.

  it('re-evaluates Repeater itemHidden after a live() inner-leaf cycle', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([
          Repeater.make('items')
            .schema([
              TextField.make('mode').live(),
              TextField.make('label'),
            ])
            .itemHidden(({ values }) => (values as Record<string, unknown>)['mode'] === 'hidden'),
        ])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])

    // Before: row is visible.
    const visible = await formStateData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', changed: 'items.0.mode', values: { items: [{ mode: 'visible', label: 'one' }] } },
    )
    if (visible === null || !visible.ok) throw new Error('expected ok result')
    const visibleMeta = visible.form as { children: Array<{ rows: Array<{ id: string; hidden?: boolean }> }> }
    assert.equal(visibleMeta.children[0]?.rows[0]?.hidden, undefined)

    // After: same row, `mode` flipped to `'hidden'` — itemHidden re-evaluates.
    const hidden = await formStateData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', changed: 'items.0.mode', values: { items: [{ mode: 'hidden', label: 'one' }] } },
    )
    if (hidden === null || !hidden.ok) throw new Error('expected ok result')
    const hiddenMeta = hidden.form as { children: Array<{ rows: Array<{ id: string; hidden?: boolean }> }> }
    assert.equal(hiddenMeta.children[0]?.rows[0]?.hidden, true)
    // Row id stays stable across the cycle — syncRowGates on the client
    // matches on `id`, so an unstable id would silently skip the hidden
    // flip.
    assert.equal(hiddenMeta.children[0]?.rows[0]?.id, visibleMeta.children[0]?.rows[0]?.id)
  })

  it('re-evaluates Builder itemHidden after a live() block-leaf cycle', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([
          Builder.make('content')
            .blocks([
              Block.make('heading').schema([
                TextField.make('text').live(),
                TextField.make('anchor'),
              ]),
            ])
            .itemHidden(({ values }) => (values as Record<string, unknown>)['text'] === 'skip'),
        ])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])

    const keep = await formStateData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      {
        formId:  'the-form',
        changed: 'content.0.data.text',
        values:  { content: [{ type: 'heading', data: { text: 'keep', anchor: '' } }] },
      },
    )
    if (keep === null || !keep.ok) throw new Error('expected ok result')
    const keepMeta = keep.form as { children: Array<{ rows: Array<{ id: string; hidden?: boolean }> }> }
    assert.equal(keepMeta.children[0]?.rows[0]?.hidden, undefined)

    const skip = await formStateData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      {
        formId:  'the-form',
        changed: 'content.0.data.text',
        values:  { content: [{ type: 'heading', data: { text: 'skip', anchor: '' } }] },
      },
    )
    if (skip === null || !skip.ok) throw new Error('expected ok result')
    const skipMeta = skip.form as { children: Array<{ rows: Array<{ id: string; hidden?: boolean }> }> }
    assert.equal(skipMeta.children[0]?.rows[0]?.hidden, true)
    assert.equal(skipMeta.children[0]?.rows[0]?.id, keepMeta.children[0]?.rows[0]?.id)
  })
})

describe('mentionResolveData (async mention items)', () => {
  it('returns null when the page scope misses', async () => {
    class Articles extends Resource {
      static override label = 'Articles'
    }
    const panel = Pilotiq.make('T').path('/admin').resources([Articles])
    const result = await mentionResolveData(
      panel,
      { kind: 'resource-edit', slug: 'missing', recordId: '1' },
      { formId: 'f', field: 'body', trigger: '@', query: 'a' },
    )
    assert.equal(result, null)
  })

  it('returns 404 when the form id misses on a multi-form page', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [
          Form.make().formId('one').schema([new FakeRichTextField('body', true)]),
          Form.make().formId('two').schema([TextField.make('a')]),
        ]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])
    const result = await mentionResolveData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'wrong', field: 'body', trigger: '@', query: 'a' },
    )
    assert.notEqual(result, null)
    if (result === null) throw new Error('expected non-null result')
    assert.equal((result as { ok: false; status: number }).ok, false)
    assert.equal((result as { ok: false; status: number }).status, 404)
  })

  it('returns 404 when the field is not on the form', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([new FakeRichTextField('intro', true)])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])
    const result = await mentionResolveData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', field: 'body', trigger: '@', query: 'a' },
    )
    assert.notEqual(result, null)
    assert.equal((result as { ok: false; status: number }).ok, false)
    assert.equal((result as { ok: false; status: number }).status, 404)
  })

  it('returns 404 when the trigger has no provider', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([new FakeRichTextField('body', true)])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])
    const result = await mentionResolveData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', field: 'body', trigger: '!', query: 'a' },
    )
    assert.notEqual(result, null)
    if (result === null) throw new Error('expected non-null result')
    assert.equal((result as { ok: false; status: number }).ok, false)
    assert.equal((result as { ok: false; status: number }).status, 404)
  })

  it('returns the resolved items for a known trigger', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([new FakeRichTextField('body', true)])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])
    const result = await mentionResolveData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', field: 'body', trigger: '@', query: 'sleman' },
    )
    assert.notEqual(result, null)
    if (result === null || !result.ok) throw new Error('expected ok result')
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0]!.id,    'sleman')
    assert.equal(result.items[0]!.label, 'User:sleman')
  })

  it('resolves a RichTextField nested inside a Repeater row via dotted path', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([
          Repeater.make('items').schema([new FakeRichTextField('body', true)]),
        ])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])
    const result = await mentionResolveData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', field: 'items.0.body', trigger: '@', query: 'sleman' },
    )
    assert.notEqual(result, null)
    if (result === null || !result.ok) throw new Error('expected ok result')
    assert.equal(result.items[0]!.id, 'sleman')
  })

  it('resolves a RichTextField nested inside a Builder block via dotted path', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([
          Builder.make('blocks').blocks([
            Block.make('callout').schema([new FakeRichTextField('body', true)]),
          ]),
        ])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])
    const result = await mentionResolveData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', field: 'blocks.0.data.body', trigger: '@', query: 'sleman' },
    )
    assert.notEqual(result, null)
    if (result === null || !result.ok) throw new Error('expected ok result')
    assert.equal(result.items[0]!.id, 'sleman')
  })

  it('returns 404 when a Repeater dotted path does not match any inner field', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([
          Repeater.make('items').schema([new FakeRichTextField('body', true)]),
        ])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])
    const result = await mentionResolveData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', field: 'items.0.missing', trigger: '@', query: 'a' },
    )
    assert.notEqual(result, null)
    assert.equal((result as { ok: false; status: number }).ok, false)
    assert.equal((result as { ok: false; status: number }).status, 404)
  })

  it('returns 404 for a Builder path missing the literal `data` segment', async () => {
    class TestPage extends Page {
      static override slug   = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([
          Builder.make('blocks').blocks([
            Block.make('callout').schema([new FakeRichTextField('body', true)]),
          ]),
        ])]
      }
    }
    const panel = Pilotiq.make('T').path('/admin').pages([TestPage])
    // Repeater-shaped path doesn't reach a Builder leaf.
    const result = await mentionResolveData(
      panel,
      { kind: 'page', pageSlug: 'demo' },
      { formId: 'the-form', field: 'blocks.0.body', trigger: '@', query: 'a' },
    )
    assert.notEqual(result, null)
    assert.equal((result as { ok: false; status: number }).ok, false)
    assert.equal((result as { ok: false; status: number }).status, 404)
  })
})

describe('formWizardData — Step.beforeValidation / afterValidation hooks', () => {
  function panelWithWizard(steps: Step[]) {
    class TestPage extends Page {
      static override slug = 'demo'
      static override schema() {
        return [Form.make().formId('the-form').schema([Wizard.make().steps(steps)])]
      }
    }
    return Pilotiq.make('T').path('/admin').pages([TestPage])
  }

  const dispatch = (panel: ReturnType<typeof Pilotiq.make>, body: { formId: string; step: number; values: Record<string, unknown> }) =>
    formWizardData(panel, { kind: 'page', pageSlug: 'demo' }, body)

  it('returns ok:true when no hooks are set and validation passes', async () => {
    const panel = panelWithWizard([Step.make('a').schema([TextField.make('x')])])
    const result = await dispatch(panel, { formId: 'the-form', step: 0, values: { x: 'v' } })
    assert.deepEqual(result, { ok: true })
  })

  it('runs beforeValidation before validators and lets it mutate values in place', async () => {
    const seen: string[] = []
    const panel = panelWithWizard([
      Step.make('a').schema([TextField.make('email').required()])
        .beforeValidation((values) => {
          seen.push('before')
          values['email'] = 'auto@example.com'
        }),
    ])
    const result = await dispatch(panel, { formId: 'the-form', step: 0, values: {} })
    assert.deepEqual(result, { ok: true })
    assert.deepEqual(seen, ['before'])
  })

  it('throwing from beforeValidation halts with 422 under the _step key', async () => {
    const panel = panelWithWizard([
      Step.make('a').schema([TextField.make('x')])
        .beforeValidation(async () => { throw new Error('email already in use') }),
    ])
    const result = await dispatch(panel, { formId: 'the-form', step: 0, values: { x: 'v' } })
    assert.equal((result as { ok: false; status: number }).ok, false)
    assert.equal((result as { ok: false; status: number }).status, 422)
    assert.deepEqual((result as { errors: Record<string, string[]> }).errors, { _step: ['email already in use'] })
  })

  it('runs afterValidation only when validators pass', async () => {
    let afterRan = false
    const panel = panelWithWizard([
      Step.make('a').schema([TextField.make('x').required()])
        .afterValidation(() => { afterRan = true }),
    ])
    // Failing field validators short-circuit before afterValidation fires.
    const failed = await dispatch(panel, { formId: 'the-form', step: 0, values: { x: '' } })
    assert.equal((failed as { ok: false }).ok, false)
    assert.equal(afterRan, false)
    // Passing values let afterValidation run.
    const passed = await dispatch(panel, { formId: 'the-form', step: 0, values: { x: 'v' } })
    assert.deepEqual(passed, { ok: true })
    assert.equal(afterRan, true)
  })

  it('throwing from afterValidation halts with 422 under the _step key', async () => {
    const panel = panelWithWizard([
      Step.make('a').schema([TextField.make('x')])
        .afterValidation(() => { throw new Error('cross-field invariant failed') }),
    ])
    const result = await dispatch(panel, { formId: 'the-form', step: 0, values: { x: 'v' } })
    assert.equal((result as { ok: false; status: number }).status, 422)
    assert.deepEqual((result as { errors: Record<string, string[]> }).errors, { _step: ['cross-field invariant failed'] })
  })

  it('non-Error throws still produce a usable message', async () => {
    const panel = panelWithWizard([
      Step.make('a').schema([TextField.make('x')])
        .beforeValidation(() => { throw 'plain string failure' as unknown as Error }),
    ])
    const result = await dispatch(panel, { formId: 'the-form', step: 0, values: { x: 'v' } })
    assert.deepEqual((result as { errors: Record<string, string[]> }).errors, { _step: ['plain string failure'] })
  })
})

describe('tagRichTextMentionUrls — nested Repeater + Builder rows', () => {
  it('stamps a Repeater template field via the form-level URL', () => {
    const inner = new FakeRichTextField('body', true)
    const form = Form.make().formId('art').schema([
      Repeater.make('items').schema([inner]),
    ])
    tagRichTextMentionUrls([form], (id) => `/admin/_form/${id}/mentions`)
    assert.equal(inner.stamped, '/admin/_form/art/mentions')
  })

  it('stamps a Builder block leaf even though Builder.getChildren() is undefined', () => {
    const inner = new FakeRichTextField('body', true)
    const form = Form.make().formId('art').schema([
      Builder.make('blocks').blocks([
        Block.make('callout').schema([inner]),
      ]),
    ])
    tagRichTextMentionUrls([form], (id) => `/admin/_form/${id}/mentions`)
    assert.equal(inner.stamped, '/admin/_form/art/mentions')
  })
})

describe('applyEditPageHydrators (Pilotiq.editPageHydrator)', () => {
  class Posts extends Resource { static override label = 'Posts' }
  const ctx = (currentValues: Record<string, unknown> = {}) => ({
    resource:      Posts,
    recordId:      '42',
    currentValues,
  })

  it('empty hydrators array → empty overlay', async () => {
    const overlay = await applyEditPageHydrators([], ctx())
    assert.deepEqual(overlay, {})
  })

  it('hydrator returning null → empty overlay', async () => {
    const overlay = await applyEditPageHydrators([
      async () => null,
    ], ctx())
    assert.deepEqual(overlay, {})
  })

  it('hydrator returning a partial → overlay carries the keys', async () => {
    const overlay = await applyEditPageHydrators([
      async () => ({ title: 'Y-Title', body: 'Y-Body' }),
    ], ctx({ title: 'DB-Title', body: 'DB-Body', author: 'DB-Author' }))
    assert.deepEqual(overlay, { title: 'Y-Title', body: 'Y-Body' })
  })

  it('two hydrators merge in registration order (later wins on conflict)', async () => {
    const overlay = await applyEditPageHydrators([
      async () => ({ title: 'first',  shared: 'first-shared' }),
      async () => ({ body:  'second', shared: 'second-shared' }),
    ], ctx())
    assert.deepEqual(overlay, {
      title:  'first',
      body:   'second',
      shared: 'second-shared',
    })
  })

  it('hydrator that throws is swallowed; siblings still contribute', async () => {
    // Stub console.warn so the test output stays clean; restore after.
    const originalWarn = console.warn
    let warned = false
    console.warn = (..._args: unknown[]) => { warned = true }
    try {
      const overlay = await applyEditPageHydrators([
        async () => { throw new Error('boom') },
        async () => ({ title: 'sibling-survived' }),
      ], ctx())
      assert.deepEqual(overlay, { title: 'sibling-survived' })
      assert.equal(warned, true, 'console.warn should fire for thrown hydrators')
    } finally {
      console.warn = originalWarn
    }
  })

  it('hydrator returning a non-object is skipped', async () => {
    const overlay = await applyEditPageHydrators([
      // @ts-expect-error — deliberately exercising the runtime guard
      async () => 'not-an-object',
      async () => ({ title: 'real-result' }),
    ], ctx())
    assert.deepEqual(overlay, { title: 'real-result' })
  })

  it('hydrator receives current fill-pipeline values via ctx.currentValues', async () => {
    let seen: Record<string, unknown> | undefined
    await applyEditPageHydrators([
      async (ctx) => { seen = ctx.currentValues; return null },
    ], ctx({ title: 'DB-Title', body: 'DB-Body' }))
    assert.deepEqual(seen, { title: 'DB-Title', body: 'DB-Body' })
  })

  it('hydrator receives resource class + recordId in ctx', async () => {
    let seenResource: unknown
    let seenRecordId: unknown
    await applyEditPageHydrators([
      async (ctx) => { seenResource = ctx.resource; seenRecordId = ctx.recordId; return null },
    ], ctx())
    assert.equal(seenResource, Posts)
    assert.equal(seenRecordId, '42')
  })
})

describe('Pilotiq.editPageHydrator builder method', () => {
  it('stores hydrators on the config in registration order', () => {
    const fn1 = async () => ({ a: 1 })
    const fn2 = async () => ({ b: 2 })
    const panel = Pilotiq.make('Admin')
      .editPageHydrator(fn1)
      .editPageHydrator(fn2)
    assert.deepEqual(panel.getConfig().editPageHydrators, [fn1, fn2])
  })

  it('absent when no hydrator registered', () => {
    const panel = Pilotiq.make('Admin')
    assert.equal(panel.getConfig().editPageHydrators, undefined)
  })
})

describe('panelInfo — recordCollab map (resource collab opt-in)', () => {
  it('absent when no resource opts in', async () => {
    class Posts extends Resource { static override label = 'Posts' }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([Posts]))
    assert.equal((info as { recordCollab?: unknown }).recordCollab, undefined)
  })

  it('emits an entry for each opted-in resource keyed by URL slug', async () => {
    class Posts extends Resource {
      static override label  = 'Posts'
      static override collab = true as const
    }
    class Users extends Resource {
      static override label  = 'Users'
      // No collab — should NOT appear in the map.
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([Posts, Users]))
    const map = (info as { recordCollab?: Record<string, unknown> }).recordCollab
    assert.deepEqual(map, {
      posts: { pages: ['edit'], presence: true },
    })
  })

  it('honors object form of static collab (pages + presence override defaults)', async () => {
    class Posts extends Resource {
      static override label  = 'Posts'
      static override collab = { pages: ['edit', 'view'] as const, presence: false }
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').resources([Posts]))
    const map = (info as { recordCollab?: Record<string, unknown> }).recordCollab
    assert.deepEqual(map, {
      posts: { pages: ['edit', 'view'], presence: false },
    })
  })
})

describe('panelInfo — pageCollab map (custom-page collab opt-in)', () => {
  it('absent when no page opts in', async () => {
    class Analytics extends Page {
      static override slug  = 'analytics'
      static override label = 'Analytics'
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').pages([Analytics]))
    assert.equal((info as { pageCollab?: unknown }).pageCollab, undefined)
  })

  it('emits an entry per opted-in custom page keyed by URL slug', async () => {
    class Settings extends Page {
      static override slug   = 'settings'
      static override label  = 'Settings'
      static override collab = { room: 'settings-general' }
    }
    class Analytics extends Page {
      static override slug  = 'analytics'
      static override label = 'Analytics'
      // No collab — should NOT appear in the map.
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').pages([Settings, Analytics]))
    const map = (info as { pageCollab?: Record<string, unknown> }).pageCollab
    assert.deepEqual(map, {
      settings: { room: 'settings-general', presence: true },
    })
  })

  it('object form can suppress presence', async () => {
    class Settings extends Page {
      static override slug   = 'settings'
      static override label  = 'Settings'
      static override collab = { room: 'settings', presence: false }
    }
    const info = await panelInfo(Pilotiq.make('T').path('/admin').pages([Settings]))
    const map = (info as { pageCollab?: Record<string, unknown> }).pageCollab
    assert.deepEqual(map, {
      settings: { room: 'settings', presence: false },
    })
  })
})
