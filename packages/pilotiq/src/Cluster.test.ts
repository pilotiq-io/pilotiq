import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Router } from '@rudderjs/router'

import { Cluster } from './Cluster.js'
import { Pilotiq } from './Pilotiq.js'
import { Resource } from './Resource.js'
import { Global } from './Global.js'
import { Page } from './Page.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Heading } from './schema/Heading.js'
import { resourceBasePath, globalBasePath, pageBasePath, clusterBasePath } from './clusterPaths.js'
import { panelInfo } from './pageData.js'
import { registerPilotiqRoutes } from './routes.js'

class ContentCluster extends Cluster {
  static override label = 'Content'
  static override slug  = 'content'
  static override icon  = 'folder'
}

class SettingsCluster extends Cluster {
  static override label = 'Settings'
  static override slug  = 'settings'
}

class ArticleResource extends Resource {
  static override label = 'Articles'
  static override slug  = 'articles'
  static override cluster = ContentCluster

  static override form(form: Form): Form { return form }
  static override table(table: Table): Table { return table }
}

class TopLevelCategoryResource extends Resource {
  static override label = 'Categories'
  static override slug  = 'categories'

  static override form(form: Form): Form { return form }
  static override table(table: Table): Table { return table }
}

class BrandingGlobal extends Global {
  static override label = 'Branding'
  static override slug  = 'branding'
  static override cluster = SettingsCluster
}

class AnalyticsPage extends Page {
  static override slug  = 'analytics'
  static override label = 'Analytics'
  static override cluster = ContentCluster
  static override schema() { return [Heading.make('Analytics')] }
}

describe('Cluster — class basics', () => {
  it('default slug derives from label, kebab-cased', () => {
    class TwoWordCluster extends Cluster {
      static override label = 'My Cluster'
    }
    assert.equal(TwoWordCluster.getSlug(), 'my-cluster')
  })

  it('explicit slug wins over derived', () => {
    assert.equal(ContentCluster.getSlug(), 'content')
  })

  it('navigationLabel falls through to label when unset', () => {
    assert.equal(ContentCluster.getNavigationLabel(), 'Content')
  })

  it('navigationIcon falls through to icon when unset', () => {
    assert.equal(ContentCluster.getNavigationIcon(), 'folder')
  })

  it('canAccess defaults to true', async () => {
    assert.equal(await ContentCluster.canAccess(null), true)
  })
})

describe('Cluster — URL helpers', () => {
  it('resourceBasePath prefixes with cluster slug when set', () => {
    assert.equal(resourceBasePath('/admin', ArticleResource), '/admin/content/articles')
  })

  it('resourceBasePath skips prefix for top-level resources', () => {
    assert.equal(resourceBasePath('/admin', TopLevelCategoryResource), '/admin/categories')
  })

  it('globalBasePath prefixes with cluster slug when set', () => {
    assert.equal(globalBasePath('/admin', BrandingGlobal), '/admin/settings/branding')
  })

  it('pageBasePath prefixes with cluster slug when set', () => {
    assert.equal(pageBasePath('/admin', AnalyticsPage), '/admin/content/analytics')
  })

  it('clusterBasePath stays panel-base + cluster slug', () => {
    assert.equal(clusterBasePath('/admin', ContentCluster), '/admin/content')
  })
})

describe('Cluster — boot validation', () => {
  let router: Router
  beforeEach(() => { router = new Router() })

  it('throws when a resource references an unregistered cluster', () => {
    class OrphanCluster extends Cluster {
      static override label = 'Orphan'
      static override slug  = 'orphan'
    }
    class OrphanedResource extends Resource {
      static override label = 'Orphans'
      static override slug  = 'orphans'
      static override cluster = OrphanCluster
    }
    const panel = Pilotiq.make('boot-orphan').path('/admin')
      .resources([OrphanedResource])
      // no .clusters() — OrphanCluster never registered

    assert.throws(
      () => registerPilotiqRoutes(router, panel),
      /OrphanCluster.*not registered/,
    )
  })

  it('throws on duplicate cluster slugs', () => {
    class A extends Cluster { static override label = 'A'; static override slug = 'shared' }
    class B extends Cluster { static override label = 'B'; static override slug = 'shared' }
    const panel = Pilotiq.make('boot-dup').path('/admin').clusters([A, B])
    assert.throws(
      () => registerPilotiqRoutes(router, panel),
      /share slug "shared"/,
    )
  })

  it('throws on reserved cluster slugs', () => {
    class BadCluster extends Cluster { static override label = '_x'; static override slug = '_secret' }
    const panel = Pilotiq.make('boot-reserved').path('/admin').clusters([BadCluster])
    assert.throws(
      () => registerPilotiqRoutes(router, panel),
      /reserved slug/,
    )
  })

  it('throws when a top-level resource slug collides with a cluster slug', () => {
    class ClashResource extends Resource {
      static override label = 'Content'   // slug derives to 'content'
    }
    const panel = Pilotiq.make('boot-clash').path('/admin')
      .clusters([ContentCluster])
      .resources([ClashResource])
    assert.throws(
      () => registerPilotiqRoutes(router, panel),
      /collides with a registered cluster slug/,
    )
  })

  it('passes when wiring is consistent', () => {
    const panel = Pilotiq.make('boot-ok').path('/admin')
      .clusters([ContentCluster])
      .resources([ArticleResource])
    assert.doesNotThrow(() => registerPilotiqRoutes(router, panel))
  })
})

describe('Cluster — route registration', () => {
  it('mounts resource routes under the cluster prefix', () => {
    const router = new Router()
    const panel = Pilotiq.make('routes-cluster').path('/admin')
      .clusters([ContentCluster])
      .resources([ArticleResource])
    registerPilotiqRoutes(router, panel)
    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(paths.includes('GET /admin/content/articles'))
    assert.ok(paths.includes('GET /admin/content/articles/create'))
    assert.ok(paths.includes('GET /admin/content/articles/:id'))
    assert.ok(paths.includes('GET /admin/content/articles/:id/edit'))
    assert.ok(paths.includes('POST /admin/content/articles/:id/delete'))
  })

  it('top-level resources stay unprefixed', () => {
    const router = new Router()
    const panel = Pilotiq.make('routes-mixed').path('/admin')
      .clusters([ContentCluster])
      .resources([ArticleResource, TopLevelCategoryResource])
    registerPilotiqRoutes(router, panel)
    const paths = router.list().map(r => `${r.method} ${r.path}`)
    assert.ok(paths.includes('GET /admin/categories'))   // top-level
    assert.ok(paths.includes('GET /admin/content/articles'))
  })
})

describe('Cluster — panelInfo navigation tree', () => {
  it('nests children under the cluster as a parent nav item', async () => {
    const panel = Pilotiq.make('nav-cluster').path('/admin')
      .clusters([ContentCluster])
      .resources([ArticleResource])
    const info = await panelInfo(panel)
    const nav = info.navigation
    const cluster = nav.find(n => n.name === 'ContentCluster')
    assert.ok(cluster, 'cluster nav item should exist')
    assert.equal(cluster!.label, 'Content')
    assert.equal(cluster!.url, '/admin/content/articles')   // first child URL
    assert.deepEqual(cluster!.children?.map(c => c.name), ['ArticleResource'])
    // No top-level ArticleResource — it's nested under the cluster.
    assert.equal(nav.find(n => n.name === 'ArticleResource'), undefined)
  })

  it('drops a cluster whose every child is gated by canAccess', async () => {
    class HiddenResource extends Resource {
      static override label = 'Hidden'
      static override slug  = 'hidden'
      static override cluster = ContentCluster
      static override async canAccess() { return false }
    }
    const panel = Pilotiq.make('nav-empty-cluster').path('/admin')
      .clusters([ContentCluster])
      .resources([HiddenResource])
    const info = await panelInfo(panel)
    assert.equal(info.navigation.find(n => n.name === 'ContentCluster'), undefined)
  })

  it('cluster.canAccess(false) hides the cluster + every child', async () => {
    class GatedCluster extends Cluster {
      static override label = 'Gated'
      static override slug  = 'gated'
      static override async canAccess() { return false }
    }
    class GatedArticleResource extends Resource {
      static override label = 'Articles'
      static override slug  = 'gated-articles'
      static override cluster = GatedCluster
    }
    const panel = Pilotiq.make('nav-gated').path('/admin')
      .clusters([GatedCluster])
      .resources([GatedArticleResource])
    const info = await panelInfo(panel)
    assert.equal(info.navigation.find(n => n.name === 'GatedCluster'), undefined)
    assert.equal(info.navigation.find(n => n.name === 'GatedArticleResource'), undefined)
  })

  it('uses landingPage URL when set', async () => {
    class HomePage extends Page {
      static override slug    = 'home'
      static override label   = 'Home'
      static override cluster = ContentCluster
      static override schema() { return [Heading.make('Home')] }
    }
    class CC extends ContentCluster {
      static override landingPage = HomePage
    }
    class CCArticleResource extends Resource {
      static override label   = 'Articles'
      static override slug    = 'cc-articles'
      static override cluster = CC
    }
    const panel = Pilotiq.make('nav-landing').path('/admin')
      .clusters([CC])
      .resources([CCArticleResource])
      .pages([HomePage])
    const info = await panelInfo(panel)
    const cluster = info.navigation.find(n => n.name === 'CC')
    assert.ok(cluster)
    assert.equal(cluster!.url, '/admin/content/home')   // landingPage wins over first-child
  })
})

describe('Cluster — global search URL', () => {
  it('Resource.getGlobalSearchResultUrl threads cluster prefix', () => {
    assert.equal(
      ArticleResource.getGlobalSearchResultUrl({ id: '42' }, '/admin'),
      '/admin/content/articles/42',
    )
    assert.equal(
      TopLevelCategoryResource.getGlobalSearchResultUrl({ id: '7' }, '/admin'),
      '/admin/categories/7',
    )
  })
})
