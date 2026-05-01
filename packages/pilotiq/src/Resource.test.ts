import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Resource } from './Resource.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { TextField } from './fields/TextField.js'

describe('Resource (static API)', () => {
  it('default form/table/detail are no-ops', () => {
    class EmptyResource extends Resource {}
    const f = EmptyResource.form(Form.make())
    const t = EmptyResource.table(Table.make())
    assert.equal(f.getChildren(), undefined)
    assert.equal(t.getChildren(), undefined)
    assert.deepEqual(EmptyResource.detail({}), [])
    assert.deepEqual(EmptyResource.pages(), {})
    assert.deepEqual(EmptyResource.relations(), [])
  })

  it('subclass overrides receive the builder and configure it', () => {
    class ArticleResource extends Resource {
      static override label = 'Articles'

      static override form(form: Form): Form {
        return form.schema([TextField.make('title').required()])
      }
      static override table(table: Table): Table {
        return table.columns([Column.make('title').sortable()])
      }
    }

    const form = ArticleResource.form(Form.make())
    assert.equal((form.getChildren() ?? []).length, 1)

    const table = ArticleResource.table(Table.make())
    assert.equal(table.getColumns().length, 1)
    assert.equal(table.getColumns()[0]!.name, 'title')
  })

  it('getSlug derives from label when slug is unset', () => {
    class ArticleResource extends Resource {
      static override label = 'Article Drafts'
    }
    assert.equal(ArticleResource.getSlug(), 'article-drafts')
  })

  it('getSlug honors explicit slug', () => {
    class ArticleResource extends Resource {
      static override slug = 'articles'
      static override label = 'Articles'
    }
    assert.equal(ArticleResource.getSlug(), 'articles')
  })

  // ─── Plan #9: navigation metadata ──────────────────────────

  it('navigation fields default sanely', () => {
    class R extends Resource { static override label = 'Things' }
    assert.equal(R.navigationGroup,        undefined)
    assert.equal(R.navigationSort,         undefined)
    assert.equal(R.navigationLabel,        undefined)
    assert.equal(R.navigationIcon,         undefined)
    assert.equal(R.navigationBadge,        undefined)
    assert.equal(R.navigationBadgeColor,   'default')
    assert.equal(R.navigationParentItem,   undefined)
    assert.equal(R.recordTitleAttribute,   undefined)
  })

  it('getNavigationLabel falls through to label when override is unset', () => {
    class R extends Resource { static override label = 'Articles' }
    assert.equal(R.getNavigationLabel(), 'Articles')
  })

  it('getNavigationLabel returns the override when set', () => {
    class R extends Resource {
      static override label = 'Articles'
      static override navigationLabel = 'Posts'
    }
    assert.equal(R.getNavigationLabel(), 'Posts')
  })

  it('getNavigationIcon falls through to icon when override is unset', () => {
    class R extends Resource {
      static override label = 'Articles'
      static override icon  = 'newspaper'
    }
    assert.equal(R.getNavigationIcon(), 'newspaper')
  })

  it('getNavigationIcon returns the override when set', () => {
    class R extends Resource {
      static override label          = 'Articles'
      static override icon           = 'newspaper'
      static override navigationIcon = 'pencil'
    }
    assert.equal(R.getNavigationIcon(), 'pencil')
  })

  // ─── Plan #12: global search ───────────────────────────────

  it('globalSearch defaults to false (opt-in)', () => {
    class R extends Resource { static override label = 'Articles' }
    assert.equal(R.globalSearch, false)
  })

  it('globallySearchableAttributes() defaults to recordTitleAttribute + searchable columns', () => {
    class R extends Resource {
      static override label                = 'Articles'
      static override recordTitleAttribute = 'title'
      static override table(table: Table): Table {
        return table.columns([
          Column.make('title').searchable(),
          Column.make('excerpt').searchable(),
          Column.make('createdAt'),
        ])
      }
    }
    const attrs = R.globallySearchableAttributes()
    assert.deepEqual([...attrs].sort(), ['excerpt', 'title'])
  })

  it('globallySearchableAttributes() returns [] when no recordTitle and no searchable columns', () => {
    class R extends Resource { static override label = 'Things' }
    assert.deepEqual(R.globallySearchableAttributes(), [])
  })

  it('globallySearchableAttributes() honors override', () => {
    class R extends Resource {
      static override label = 'Things'
      static override globallySearchableAttributes(): string[] {
        return ['custom_search_index']
      }
    }
    assert.deepEqual(R.globallySearchableAttributes(), ['custom_search_index'])
  })

  it('getGlobalSearchResultTitle resolves through recordTitleAttribute → name → title → id', () => {
    class R1 extends Resource {
      static override label                = 'Articles'
      static override recordTitleAttribute = 'headline'
    }
    assert.equal(R1.getGlobalSearchResultTitle({ headline: 'Hello', name: 'fallback' }), 'Hello')

    class R2 extends Resource { static override label = 'Things' }
    assert.equal(R2.getGlobalSearchResultTitle({ name: 'Bob' }),  'Bob')
    assert.equal(R2.getGlobalSearchResultTitle({ title: 'Doc' }), 'Doc')
    assert.equal(R2.getGlobalSearchResultTitle({ id: 42 }),       '42')
    assert.equal(R2.getGlobalSearchResultTitle({}),               '')
    assert.equal(R2.getGlobalSearchResultTitle(null),             '')
  })

  it('getGlobalSearchResultSubtitle defaults to undefined', () => {
    class R extends Resource { static override label = 'Things' }
    assert.equal(R.getGlobalSearchResultSubtitle({ status: 'draft' }), undefined)
  })

  it('getGlobalSearchResultUrl defaults to ${base}/${slug}/${id}', () => {
    class R extends Resource {
      static override label = 'Articles'
      static override slug  = 'articles'
    }
    assert.equal(R.getGlobalSearchResultUrl({ id: '42' }, '/admin'), '/admin/articles/42')
    assert.equal(R.getGlobalSearchResultUrl({ id: 42 },   '/admin'), '/admin/articles/42')
    assert.equal(R.getGlobalSearchResultUrl({},           '/admin'), '/admin/articles')
    assert.equal(R.getGlobalSearchResultUrl(null,         '/admin'), '/admin/articles')
  })

  it('getGlobalSearchQuery defaults to undefined (use built-in LIKE chain)', () => {
    class R extends Resource { static override label = 'Things' }
    assert.equal(R.getGlobalSearchQuery('alice'), undefined)
  })
})
