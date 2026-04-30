import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Form } from './elements/Form.js'
import { ListTab } from './Tab.js'
import { ListTabs } from './elements/ListTabs.js'
import { applyFillPipeline, resolveActiveTab } from './pageData.js'

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
    assert.ok(allUrl.includes('tab=all'))
    assert.ok(draftsUrl.includes('tab=drafts'))
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
