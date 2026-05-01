import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { RelationManager, RESERVED_RELATIONSHIP_TOKENS } from './RelationManager.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { TextField } from './fields/TextField.js'

describe('RelationManager (static API)', () => {
  it('default form/table/detail are no-ops', () => {
    class M extends RelationManager {
      static override relationship = 'posts'
    }
    const f = M.form(Form.make())
    const t = M.table(Table.make())
    assert.equal(f.getChildren(), undefined)
    assert.equal(t.getChildren(), undefined)
    assert.deepEqual(M.detail({}, {}), [])
  })

  it('subclass overrides receive the builder and configure it', () => {
    class PostsManager extends RelationManager {
      static override relationship = 'posts'
      static override label        = 'Posts'

      static override form(form: Form): Form {
        return form.schema([TextField.make('title').required()])
      }
      static override table(table: Table): Table {
        return table.columns([Column.make('title').sortable()])
      }
    }

    const f = PostsManager.form(Form.make())
    const t = PostsManager.table(Table.make())
    assert.equal(f.getChildren()?.length, 1)
    assert.equal(t.getChildren()?.length, 1)
  })

  it('getRelationship throws when the subclass forgot to set it', () => {
    class Forgot extends RelationManager {}
    assert.throws(
      () => Forgot.getRelationship(),
      /static relationship must be set/,
    )
  })

  it('getRelationship returns the configured key', () => {
    class M extends RelationManager {
      static override relationship = 'comments'
    }
    assert.equal(M.getRelationship(), 'comments')
  })

  it('getLabel falls back to a sentence-cased relationship name', () => {
    class M extends RelationManager {
      static override relationship = 'posts'
    }
    assert.equal(M.getLabel(), 'Posts')
  })

  it('getLabel uses the explicit override when set', () => {
    class M extends RelationManager {
      static override relationship = 'lineItems'
      static override label        = 'Line items'
    }
    assert.equal(M.getLabel(), 'Line items')
  })

  it('getLabelSingular naively strips a trailing s when label not set', () => {
    class Posts extends RelationManager { static override relationship = 'posts' }
    class Categories extends RelationManager { static override relationship = 'categories' }

    assert.equal(Posts.getLabelSingular(), 'Post')
    // Naive — irregular plurals get the wrong answer; users override.
    assert.equal(Categories.getLabelSingular(), 'Categorie')
  })

  it('getLabelSingular uses the explicit override when set', () => {
    class M extends RelationManager {
      static override relationship   = 'children'
      static override labelSingular  = 'Child'
    }
    assert.equal(M.getLabelSingular(), 'Child')
  })

  it('getIcon and getRecordTitleAttribute return undefined by default', () => {
    class M extends RelationManager { static override relationship = 'posts' }
    assert.equal(M.getIcon(), undefined)
    assert.equal(M.getRecordTitleAttribute(), undefined)
  })

  it('getIcon and getRecordTitleAttribute pass through configured values', () => {
    class M extends RelationManager {
      static override relationship          = 'posts'
      static override icon                  = 'newspaper'
      static override recordTitleAttribute  = 'title'
    }
    assert.equal(M.getIcon(), 'newspaper')
    assert.equal(M.getRecordTitleAttribute(), 'title')
  })

  describe('authorization predicates', () => {
    it('every can* defaults to true', async () => {
      class M extends RelationManager { static override relationship = 'posts' }
      const parent = { id: 1 }
      const child  = { id: 9 }

      assert.equal(await M.canViewAny(null, parent), true)
      assert.equal(await M.canView(null, child, parent),    true)
      assert.equal(await M.canCreate(null, parent),         true)
      assert.equal(await M.canEdit(null, child, parent),    true)
      assert.equal(await M.canDelete(null, child, parent),  true)
    })

    it('subclass overrides flow through', async () => {
      class M extends RelationManager {
        static override relationship = 'posts'
        static override async canCreate(_user: unknown, parent: unknown): Promise<boolean> {
          return (parent as { canPost?: boolean }).canPost === true
        }
      }
      assert.equal(await M.canCreate(null, { canPost: true }),  true)
      assert.equal(await M.canCreate(null, { canPost: false }), false)
      assert.equal(await M.canCreate(null, {}),                 false)
    })
  })

  describe('reserved-token set', () => {
    it('blocks the URL tokens that collide with action / form routes', () => {
      // Sanity: the route table reserves these — managers can't claim them.
      assert.equal(RESERVED_RELATIONSHIP_TOKENS.has('edit'),     true)
      assert.equal(RESERVED_RELATIONSHIP_TOKENS.has('delete'),   true)
      assert.equal(RESERVED_RELATIONSHIP_TOKENS.has('_form'),    true)
      assert.equal(RESERVED_RELATIONSHIP_TOKENS.has('_action'),  true)
      assert.equal(RESERVED_RELATIONSHIP_TOKENS.has('_search'),  true)
      assert.equal(RESERVED_RELATIONSHIP_TOKENS.has('_uploads'), true)
    })

    it('allows ordinary relationship names', () => {
      assert.equal(RESERVED_RELATIONSHIP_TOKENS.has('posts'),    false)
      assert.equal(RESERVED_RELATIONSHIP_TOKENS.has('comments'), false)
      assert.equal(RESERVED_RELATIONSHIP_TOKENS.has('tags'),     false)
    })
  })
})
