import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Pilotiq } from './Pilotiq.js'
import { Resource } from './Resource.js'
import { Global }   from './Global.js'
import { Page }     from './Page.js'
import { Form }     from './elements/Form.js'
import { Cluster }  from './Cluster.js'
import { TextField } from './fields/TextField.js'
import { Heading }   from './schema/Heading.js'
import { defaultGlobalViewPage } from './defaultGlobalPages.js'
import {
  resourceIndexData,
  resourceCreateData,
  resourceEditData,
  resourceViewData,
  globalEditData,
  globalViewData,
  customPageData,
} from './pageData.js'

interface BreadcrumbItem { label: string; url?: string }
interface BreadcrumbMeta { type: string; items: BreadcrumbItem[] }

function findBreadcrumbs(schema: Array<Record<string, unknown>>): BreadcrumbItem[] {
  const meta = schema.find(s => s['type'] === 'breadcrumbs') as BreadcrumbMeta | undefined
  assert.ok(meta, 'expected a breadcrumbs element on the page')
  return meta!.items
}

class Articles extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override slug          = 'articles'
  // No record loader → resourceEditData / View fall back to the recordId
  // for the title; that's still valid copy and exercises the unloaded
  // path. (Loader-backed paths are covered separately.)
  static override form(form: Form): Form {
    return form.schema([TextField.make('title')])
  }
}

describe('Phase C breadcrumbs — resource pages', () => {
  it('list page emits Home / Articles with the trailing item unlinked', async () => {
    const panel = Pilotiq.make('My Panel').path('/admin').resources([Articles])
    const data = await resourceIndexData(panel, 'articles')
    const items = findBreadcrumbs(data!['schemaData'] as Array<Record<string, unknown>>)
    assert.deepEqual(items, [
      { label: 'My Panel', url: '/admin' },
      { label: 'Articles' },
    ])
  })

  it('create page appends a "Create" trailing item', async () => {
    const panel = Pilotiq.make('My Panel').path('/admin').resources([Articles])
    const data = await resourceCreateData(panel, 'articles')
    const items = findBreadcrumbs(data!['schemaData'] as Array<Record<string, unknown>>)
    assert.deepEqual(items, [
      { label: 'My Panel', url: '/admin' },
      { label: 'Articles', url: '/admin/articles' },
      { label: 'Create' },
    ])
  })

  it('view page renders the record title as the trailing item', async () => {
    class Loaded extends Articles {
      static override form(form: Form): Form {
        return form
          .schema([TextField.make('title')])
          .loadRecord(async (id) => ({ id, title: `Loaded ${id}` }))
      }
    }
    const panel = Pilotiq.make('My Panel').path('/admin').resources([Loaded])
    const data = await resourceViewData(panel, 'articles', '7')
    const items = findBreadcrumbs(data!['schemaData'] as Array<Record<string, unknown>>)
    // ViewPage doesn't run loadRecord (only edit pages do); without an
    // R.model the resourceViewData record is undefined → falls back to
    // the recordId.
    assert.deepEqual(items, [
      { label: 'My Panel', url: '/admin' },
      { label: 'Articles', url: '/admin/articles' },
      { label: '7' },
    ])
  })

  it('edit page links the title to the view page when registered', async () => {
    class Loaded extends Articles {
      static override form(form: Form): Form {
        return form
          .schema([TextField.make('title')])
          .loadRecord(async (id) => ({ id, title: `Loaded ${id}` }))
      }
    }
    const panel = Pilotiq.make('My Panel').path('/admin').resources([Loaded])
    const data = await resourceEditData(panel, 'articles', '7')
    const items = findBreadcrumbs(data!['schemaData'] as Array<Record<string, unknown>>)
    assert.deepEqual(items, [
      { label: 'My Panel', url: '/admin' },
      { label: 'Articles', url: '/admin/articles' },
      { label: 'Loaded 7', url: '/admin/articles/7' },
      { label: 'Edit' },
    ])
  })

  it('edit page leaves the title unlinked when the resource has no view page', async () => {
    class NoView extends Articles {
      static override pages() { return { view: undefined as never } }
      static override form(form: Form): Form {
        return form
          .schema([TextField.make('title')])
          .loadRecord(async (id) => ({ id, title: `Loaded ${id}` }))
      }
    }
    const panel = Pilotiq.make('My Panel').path('/admin').resources([NoView])
    const data = await resourceEditData(panel, 'articles', '7')
    const items = findBreadcrumbs(data!['schemaData'] as Array<Record<string, unknown>>)
    // Title rung carries no `url` — pruned ViewPage means no link.
    const titleRung = items[items.length - 2]!
    assert.equal(titleRung.label, 'Loaded 7')
    assert.equal(titleRung.url, undefined)
    assert.equal(items[items.length - 1]!.label, 'Edit')
  })

  it('inserts the cluster rung between Home and the resource', async () => {
    class ContentCluster extends Cluster {
      static override label = 'Content'
      static override slug  = 'content'
    }
    class Clustered extends Articles {
      static override cluster = ContentCluster
    }
    const panel = Pilotiq.make('My Panel').path('/admin').resources([Clustered])
    const data = await resourceIndexData(panel, 'articles')
    const items = findBreadcrumbs(data!['schemaData'] as Array<Record<string, unknown>>)
    assert.deepEqual(items, [
      { label: 'My Panel',  url: '/admin' },
      { label: 'Content',   url: '/admin/content' },
      { label: 'Articles' },
    ])
  })
})

describe('Phase C breadcrumbs — global pages', () => {
  class SiteSettings extends Global {
    static override label         = 'Site Settings'
    static override labelSingular = 'Site Settings'
    static override slug          = 'site-settings'
    static override form(form: Form): Form {
      return form.schema([TextField.make('siteName')])
    }
  }

  it('emits Home / <Global label> on the edit page', async () => {
    const panel = Pilotiq.make('My Panel').path('/admin').globals([SiteSettings])
    const data = await globalEditData(panel, 'site-settings')
    const items = findBreadcrumbs(data!['schemaData'] as Array<Record<string, unknown>>)
    assert.deepEqual(items, [
      { label: 'My Panel', url: '/admin' },
      { label: 'Site Settings' },
    ])
  })

  it('emits the same chain on the view page', async () => {
    class WithView extends SiteSettings {
      static override pages() {
        return { view: defaultGlobalViewPage(this as unknown as typeof Global) }
      }
    }
    const panel = Pilotiq.make('My Panel').path('/admin').globals([WithView])
    const data = await globalViewData(panel, 'site-settings')
    const items = findBreadcrumbs(data!['schemaData'] as Array<Record<string, unknown>>)
    assert.deepEqual(items, [
      { label: 'My Panel', url: '/admin' },
      { label: 'Site Settings' },
    ])
  })
})

describe('Phase C breadcrumbs — custom pages', () => {
  it('emits Home / <Page label>', async () => {
    class Reports extends Page {
      static override slug  = 'reports'
      static override label = 'Reports'
      static override schema() { return [Heading.make('Reports')] }
    }
    const panel = Pilotiq.make('My Panel').path('/admin').pages([Reports])
    const data = await customPageData(panel, 'reports')
    const items = findBreadcrumbs(data!['schemaData'] as Array<Record<string, unknown>>)
    assert.deepEqual(items, [
      { label: 'My Panel', url: '/admin' },
      { label: 'Reports' },
    ])
  })

  it('a single-rung chain (only Home) is suppressed entirely', async () => {
    // Constructing a panel with only the dashboard page never triggers
    // breadcrumbs at all (we don't prepend on the dashboard). Used as
    // sanity that a "Home" rung alone doesn't render.
    const panel = Pilotiq.make('My Panel').path('/admin').schema([Heading.make('Hi')])
    const data = await import('./pageData.js').then(m => m.dashboardData(panel))
    const schema = data['schemaData'] as Array<Record<string, unknown>>
    const meta = schema.find(s => s['type'] === 'breadcrumbs')
    assert.equal(meta, undefined, 'dashboard page should never carry breadcrumbs')
  })
})

describe('Phase C breadcrumbs — branding fallback', () => {
  it('uses branding.title when set', async () => {
    const panel = Pilotiq.make('My Panel')
      .path('/admin')
      .branding({ title: 'Acme Admin' })
      .resources([Articles])
    const data = await resourceIndexData(panel, 'articles')
    const items = findBreadcrumbs(data!['schemaData'] as Array<Record<string, unknown>>)
    assert.equal(items[0]!.label, 'Acme Admin')
    assert.equal(items[0]!.url, '/admin')
  })
})
