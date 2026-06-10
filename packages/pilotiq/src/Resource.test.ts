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

  describe('soft-delete opt-in (Plan #13)', () => {
    it('softDeletes defaults to false', () => {
      class R extends Resource { static override label = 'Things' }
      assert.equal(R.softDeletes, false)
    })

    it('deletedAtColumn defaults to "deletedAt"', () => {
      class R extends Resource { static override label = 'Things' }
      assert.equal(R.deletedAtColumn, 'deletedAt')
    })

    it('subclass can opt in by setting softDeletes = true', () => {
      class R extends Resource {
        static override label = 'Posts'
        static override softDeletes = true
      }
      assert.equal(R.softDeletes, true)
    })

    it('subclass can override the column name', () => {
      class R extends Resource {
        static override label = 'Posts'
        static override softDeletes = true
        static override deletedAtColumn = 'archivedAt'
      }
      assert.equal(R.deletedAtColumn, 'archivedAt')
    })
  })

  describe('canRestore / canForceDelete predicates (Plan #13)', () => {
    it('canRestore defaults to true', async () => {
      class R extends Resource { static override label = 'Posts' }
      assert.equal(await R.canRestore(null, { id: 1 }), true)
    })

    it('canForceDelete inherits from canDelete by default', async () => {
      class R extends Resource {
        static override label = 'Posts'
        static override async canDelete(_user: unknown, _record: unknown): Promise<boolean> { return false }
      }
      assert.equal(await R.canForceDelete(null, { id: 1 }), false,
        'force-delete should fall through to canDelete when not overridden')
    })

    it('canForceDelete override wins independently of canDelete', async () => {
      class R extends Resource {
        static override label = 'Posts'
        static override async canDelete(_user: unknown, _record: unknown): Promise<boolean> { return true }
        static override async canForceDelete(_user: unknown, _record: unknown): Promise<boolean> { return false }
      }
      assert.equal(await R.canForceDelete(null, { id: 1 }), false)
      assert.equal(await R.canDelete(null, { id: 1 }), true)
    })

    it('canRestore override wins', async () => {
      class R extends Resource {
        static override label = 'Posts'
        static override async canRestore(_user: unknown, record: unknown): Promise<boolean> {
          return (record as { ownedBy?: string }).ownedBy === 'me'
        }
      }
      assert.equal(await R.canRestore(null, { ownedBy: 'me' }), true)
      assert.equal(await R.canRestore(null, { ownedBy: 'other' }), false)
    })
  })

  describe('collab opt-in', () => {
    it('omitted static collab → getResolvedCollabConfig returns null', () => {
      class R extends Resource {}
      assert.equal(R.getResolvedCollabConfig(), null)
    })

    it('static collab = false → null (explicit opt-out)', () => {
      class R extends Resource {
        static override collab = false as const
      }
      assert.equal(R.getResolvedCollabConfig(), null)
    })

    it('static collab = true → defaults to { pages: [edit], presence: true }', () => {
      class R extends Resource {
        static override collab = true as const
      }
      assert.deepEqual(R.getResolvedCollabConfig(), {
        pages:    ['edit'],
        presence: true,
      })
    })

    it('object form merges with defaults', () => {
      class R extends Resource {
        static override collab = { pages: ['edit', 'view'] as const }
      }
      assert.deepEqual(R.getResolvedCollabConfig(), {
        pages:    ['edit', 'view'],
        presence: true,   // default preserved
      })
    })

    it('object form can suppress presence', () => {
      class R extends Resource {
        static override collab = { presence: false }
      }
      assert.deepEqual(R.getResolvedCollabConfig(), {
        pages:    ['edit'],   // default preserved
        presence: false,
      })
    })

    it('guests is tri-state — omitted from the resolved config unless set', () => {
      class Inherit extends Resource {
        static override collab = true as const
      }
      assert.equal('guests' in (Inherit.getResolvedCollabConfig() ?? {}), false)

      class Open extends Resource {
        static override collab = { guests: true }
      }
      assert.deepEqual(Open.getResolvedCollabConfig(), {
        pages:    ['edit'],
        presence: true,
        guests:   true,
      })

      class Closed extends Resource {
        static override collab = { guests: false }
      }
      assert.equal(Closed.getResolvedCollabConfig()?.guests, false)
    })
  })
})
