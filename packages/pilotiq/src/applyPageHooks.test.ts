import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { ElementMeta } from './schema/Element.js'
import { applyPageHooks, pageHooksFor } from './applyPageHooks.js'
import { Pilotiq } from './Pilotiq.js'
import { Resource } from './Resource.js'
import { Form } from './elements/Form.js'
import { TextField } from './fields/TextField.js'
import { Heading } from './schema/Heading.js'
import { Alert } from './schema/Alert.js'
import { resourceIndexData, resourceCreateData, resourceViewData, customPageData } from './pageData.js'
import { Page } from './Page.js'

const heading = (content: string): ElementMeta => ({ type: 'heading', content })
const table   = (rows = 0): ElementMeta => ({ type: 'table', rows })
const form    = (id = 'f'): ElementMeta => ({ type: 'form', formId: id })
const tabs    = (children: ElementMeta[] = []): ElementMeta => ({ type: 'listTabs', children })

describe('pageHooksFor()', () => {
  it('returns universal page bounds for non-resource roles', () => {
    assert.deepEqual(pageHooksFor('dashboard'), ['panels::page.start', 'panels::page.end'])
    assert.deepEqual(pageHooksFor('page'),      ['panels::page.start', 'panels::page.end'])
    assert.deepEqual(pageHooksFor('relation-list'), ['panels::page.start', 'panels::page.end'])
  })

  it('extends with table.before/.after/.tabs.end for list role', () => {
    const names = pageHooksFor('list')
    assert.ok(names.includes('panels::resource.pages.list-records.table.before'))
    assert.ok(names.includes('panels::resource.pages.list-records.table.after'))
    assert.ok(names.includes('panels::resource.pages.list-records.tabs.end'))
  })

  it('extends with form.before/.after for create role', () => {
    const names = pageHooksFor('create')
    assert.ok(names.includes('panels::resource.pages.create-record.form.before'))
    assert.ok(names.includes('panels::resource.pages.create-record.form.after'))
  })
})

describe('applyPageHooks()', () => {
  it('returns input unchanged when hooks are empty', () => {
    const input: ElementMeta[] = [heading('A')]
    const out = applyPageHooks(input, {}, 'list')
    assert.deepEqual(out, input)
    assert.notEqual(out, input, 'returns a copy')
  })

  it('wraps with panels::page.start / panels::page.end on every role', () => {
    const out = applyPageHooks(
      [heading('content')],
      {
        'panels::page.start': [heading('top')],
        'panels::page.end':   [heading('bottom')],
      },
      'dashboard',
    )
    assert.equal(out.length, 3)
    assert.equal(out[0]?.['content'], 'top')
    assert.equal(out[1]?.['content'], 'content')
    assert.equal(out[2]?.['content'], 'bottom')
  })

  it('splices list-records.table.before/.after around the first table', () => {
    const out = applyPageHooks(
      [heading('intro'), table(), heading('outro')],
      {
        'panels::resource.pages.list-records.table.before': [heading('pre-table')],
        'panels::resource.pages.list-records.table.after':  [heading('post-table')],
      },
      'list',
    )
    const types = out.map(m => `${m.type}:${m['content'] ?? ''}`)
    assert.deepEqual(types, [
      'heading:intro',
      'heading:pre-table',
      'table:',
      'heading:post-table',
      'heading:outro',
    ])
  })

  it('splices around only the FIRST table, not subsequent ones', () => {
    const out = applyPageHooks(
      [table(1), table(2)],
      { 'panels::resource.pages.list-records.table.before': [heading('once')] },
      'list',
    )
    assert.equal(out.length, 3)
    assert.equal(out[0]?.['content'], 'once')
    assert.equal((out[1] as { rows?: number })['rows'], 1)
    assert.equal((out[2] as { rows?: number })['rows'], 2)
  })

  it('drops table-around hooks silently when no table is present', () => {
    const out = applyPageHooks(
      [heading('only')],
      { 'panels::resource.pages.list-records.table.before': [heading('lost')] },
      'list',
    )
    assert.equal(out.length, 1)
    assert.equal(out[0]?.['content'], 'only')
  })

  it('appends list-records.tabs.end into ListTabs._children', () => {
    const out = applyPageHooks(
      [tabs([heading('Tab1')])],
      { 'panels::resource.pages.list-records.tabs.end': [heading('Trailing')] },
      'list',
    )
    const updated = out[0] as ElementMeta
    assert.equal(updated.type, 'listTabs')
    assert.equal(updated.children?.length, 2)
    assert.equal(updated.children?.[1]?.['content'], 'Trailing')
  })

  it('splices create-record.form.before/.after around the form', () => {
    const out = applyPageHooks(
      [form()],
      {
        'panels::resource.pages.create-record.form.before': [heading('pre-form')],
        'panels::resource.pages.create-record.form.after':  [heading('post-form')],
      },
      'create',
    )
    assert.equal(out.length, 3)
    assert.equal(out[0]?.['content'], 'pre-form')
    assert.equal(out[1]?.type, 'form')
    assert.equal(out[2]?.['content'], 'post-form')
  })

  it('splices edit-record.form.before/.after around the form', () => {
    const out = applyPageHooks(
      [form()],
      {
        'panels::resource.pages.edit-record.form.before': [heading('edit-pre')],
        'panels::resource.pages.edit-record.form.after':  [heading('edit-post')],
      },
      'edit',
    )
    assert.equal(out.length, 3)
    assert.equal(out[0]?.['content'], 'edit-pre')
    assert.equal(out[2]?.['content'], 'edit-post')
  })

  it('wraps view-record.start/.end around schemaData', () => {
    const out = applyPageHooks(
      [heading('detail')],
      {
        'panels::resource.pages.view-record.start': [heading('view-top')],
        'panels::resource.pages.view-record.end':   [heading('view-bottom')],
      },
      'view',
    )
    assert.equal(out.length, 3)
    assert.equal(out[0]?.['content'], 'view-top')
    assert.equal(out[2]?.['content'], 'view-bottom')
  })

  it('wraps page.start outside view-record.start (page wins outermost)', () => {
    const out = applyPageHooks(
      [heading('detail')],
      {
        'panels::page.start':                         [heading('outer-top')],
        'panels::resource.pages.view-record.start':   [heading('inner-top')],
        'panels::resource.pages.view-record.end':     [heading('inner-bottom')],
        'panels::page.end':                           [heading('outer-bottom')],
      },
      'view',
    )
    const contents = out.map(m => m['content'])
    assert.deepEqual(contents, ['outer-top', 'inner-top', 'detail', 'inner-bottom', 'outer-bottom'])
  })

  it('does not splice list-records.* on a non-list role', () => {
    const out = applyPageHooks(
      [table()],
      { 'panels::resource.pages.list-records.table.before': [heading('lost')] },
      'create',
    )
    assert.equal(out.length, 1)
    assert.equal(out[0]?.type, 'table')
  })

  it('returns immutable result — input array unchanged', () => {
    const input: ElementMeta[] = [table()]
    const before = [...input]
    applyPageHooks(input, {
      'panels::resource.pages.list-records.table.before': [heading('x')],
    }, 'list')
    assert.deepEqual(input, before)
  })
})

class Articles extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override slug          = 'articles'
  static override form(form: Form): Form {
    return form.schema([TextField.make('title')])
  }
}

class HelpPage extends Page {
  static override slug   = 'help'
  static override label  = 'Help'
  static override schema() { return [Heading.make('Help body')] }
}

describe('Per-builder render-hook integration', () => {
  it('resourceIndexData splices list-records.table.before above the Table', async () => {
    const panel = Pilotiq.make('admin')
      .path('/admin')
      .resources([Articles])
      .renderHook(
        'panels::resource.pages.list-records.table.before',
        () => [Alert.make('Bulk import note').info()],
      )
    const data = await resourceIndexData(panel, 'articles')
    const schema = data?.['schemaData'] as ElementMeta[]
    const tableIdx = schema.findIndex(m => m.type === 'table')
    assert.ok(tableIdx >= 0, 'expected a table')
    // Alert should appear immediately before the table.
    assert.equal(schema[tableIdx - 1]?.type, 'alert')
  })

  it('resourceIndexData fires panels::page.start above breadcrumbs (top-most)', async () => {
    const panel = Pilotiq.make('admin')
      .path('/admin')
      .resources([Articles])
      .renderHook('panels::page.start', () => [Heading.make('TopBanner')])
    const data = await resourceIndexData(panel, 'articles')
    const schema = data?.['schemaData'] as ElementMeta[]
    assert.equal(schema[0]?.type, 'heading')
    assert.equal(schema[0]?.['content'], 'TopBanner')
  })

  it('resourceCreateData splices create-record.form.before above the Form', async () => {
    const panel = Pilotiq.make('admin')
      .path('/admin')
      .resources([Articles])
      .renderHook(
        'panels::resource.pages.create-record.form.before',
        () => [Heading.make('Pre-form notes')],
      )
    const data = await resourceCreateData(panel, 'articles')
    const schema = data?.['schemaData'] as ElementMeta[]
    const formIdx = schema.findIndex(m => m.type === 'form')
    assert.ok(formIdx >= 0)
    assert.equal(schema[formIdx - 1]?.['content'], 'Pre-form notes')
  })

  it('only matching role fires — list-records hook absent on resourceViewData', async () => {
    const panel = Pilotiq.make('admin')
      .path('/admin')
      .resources([Articles])
      .renderHook(
        'panels::resource.pages.list-records.table.before',
        () => [Heading.make('Lost')],
      )
    const data = await resourceViewData(panel, 'articles', 'rec-1')
    const schema = (data?.['schemaData'] ?? []) as ElementMeta[]
    const found = schema.find(m => m.type === 'heading' && m['content'] === 'Lost')
    assert.equal(found, undefined)
  })

  it('customPageData fires panels::page.start/.end on the page role', async () => {
    const panel = Pilotiq.make('admin')
      .path('/admin')
      .pages([HelpPage])
      .renderHook('panels::page.start', () => [Heading.make('Page banner')])
    const data = await customPageData(panel, 'help')
    const schema = data?.['schemaData'] as ElementMeta[]
    assert.equal(schema[0]?.['content'], 'Page banner')
  })

  it('scoped hook only fires when the matching resource is active', async () => {
    class OtherResource extends Resource {
      static override label = 'Other'
      static override slug  = 'other'
      static override form(form: Form): Form { return form.schema([TextField.make('name')]) }
    }
    const panel = Pilotiq.make('admin')
      .path('/admin')
      .resources([Articles, OtherResource])
      .renderHook(
        'panels::resource.pages.list-records.table.before',
        () => [Heading.make('ArticlesOnly')],
        { resource: Articles },
      )
    const onArticles = await resourceIndexData(panel, 'articles')
    const onOther    = await resourceIndexData(panel, 'other')
    const aSchema = onArticles?.['schemaData'] as ElementMeta[]
    const oSchema = onOther?.['schemaData']    as ElementMeta[]
    assert.ok(aSchema.find(m => m.type === 'heading' && m['content'] === 'ArticlesOnly'))
    assert.equal(oSchema.find(m => m.type === 'heading' && m['content'] === 'ArticlesOnly'), undefined)
  })
})
