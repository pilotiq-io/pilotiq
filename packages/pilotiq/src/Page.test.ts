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

  describe('collab opt-in', () => {
    it('omitted static collab → getResolvedCollabConfig returns null', () => {
      class MyPage extends Page {}
      assert.equal(MyPage.getResolvedCollabConfig(), null)
    })

    it('static collab = null → null (explicit opt-out)', () => {
      class MyPage extends Page {
        static override collab = null
      }
      assert.equal(MyPage.getResolvedCollabConfig(), null)
    })

    it('static collab = { room } → defaults presence to true', () => {
      class Settings extends Page {
        static override collab = { room: 'settings-general' }
      }
      assert.deepEqual(Settings.getResolvedCollabConfig(), {
        room:     'settings-general',
        presence: true,
      })
    })

    it('object form can suppress presence', () => {
      class Settings extends Page {
        static override collab = { room: 'settings', presence: false }
      }
      assert.deepEqual(Settings.getResolvedCollabConfig(), {
        room:     'settings',
        presence: false,
      })
    })

    it('returns null when room is empty or missing', () => {
      // Defensive runtime checks — TS rejects `room: ''` and missing-`room`
      // at config time; force the bad shapes through `as never` so the
      // resolver path is still covered.
      class A extends Page {
        static override collab = { room: '' } as never
      }
      class B extends Page {
        static override collab = {} as never
      }
      assert.equal(A.getResolvedCollabConfig(), null)
      assert.equal(B.getResolvedCollabConfig(), null)
    })

    it('resource-bound default pages ignore collab even when set', () => {
      class ArticleResource extends Resource {
        static override label = 'Articles'
      }
      class EditArticle extends Page {
        static override slug  = 'articles/edit'
        static override label = 'Edit Article'
        static override collab = { room: 'should-be-ignored' }
        static override getResource() { return ArticleResource }
        static override getMode() { return 'edit' as const }
      }
      // Resource-bound pages must route collab through Resource.collab,
      // not Page.collab — otherwise both gates would fire on the same URL.
      assert.equal(EditArticle.getResolvedCollabConfig(), null)
    })
  })
})
