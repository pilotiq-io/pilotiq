import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Page } from './Page.js'
import { Resource } from './Resource.js'
import { Heading } from './schema/Heading.js'

describe('Page (extension hooks)', () => {
  it('default getResource returns undefined and getMode returns custom', () => {
    class MyPage extends Page {}
    assert.equal(MyPage.getResource(), undefined)
    assert.equal(MyPage.getMode(), 'custom')
  })

  it('toMeta includes the mode discriminator', () => {
    class MyPage extends Page {}
    const meta = MyPage.toMeta()
    assert.equal(meta.mode, 'custom')
    assert.equal(typeof meta.slug, 'string')
    assert.equal(typeof meta.label, 'string')
  })

  it('subclass can override getResource and getMode', () => {
    class ArticleResource extends Resource {
      static override label = 'Articles'
    }
    class CreateArticle extends Page {
      static override slug  = 'articles/create'
      static override label = 'Create Article'
      static override getResource() { return ArticleResource }
      static override getMode() { return 'create' as const }
      static override schema() { return [Heading.make('Create Article')] }
    }

    assert.equal(CreateArticle.getResource(), ArticleResource)
    assert.equal(CreateArticle.getMode(), 'create')
    assert.equal(CreateArticle.toMeta().mode, 'create')
    assert.equal(CreateArticle.toMeta().slug, 'articles/create')
  })

  it('plain Pages without a Resource still serialize cleanly', () => {
    class Analytics extends Page {
      static override slug  = 'analytics'
      static override label = 'Analytics'
    }
    const meta = Analytics.toMeta()
    assert.equal(meta.slug, 'analytics')
    assert.equal(meta.mode, 'custom')
  })
})
