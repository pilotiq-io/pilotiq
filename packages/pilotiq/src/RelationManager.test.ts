import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  RelationManager,
  RESERVED_RELATIONSHIP_TOKENS,
  safeManagerPolicy,
  type RelationManagerContext,
} from './RelationManager.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { TextField } from './fields/TextField.js'

/** Stub manager-context for tests that don't care about URL templating. */
const stubCtx: RelationManagerContext = {
  basePath:     '/admin',
  parentSlug:   'users',
  parentId:     '1',
  relationship: 'posts',
  parentRecord: { id: '1' },
  mode:         'hasMany',
}

describe('RelationManager (static API)', () => {
  it('default form/table/detail are no-ops', () => {
    class M extends RelationManager {
      static override relationship = 'posts'
    }
    const f = M.form(Form.make(), stubCtx)
    const t = M.table(Table.make(), stubCtx)
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

    // Subclass overrides may drop trailing parameters they don't need —
    // TypeScript narrows the call signature to the override's, so callers
    // through the subclass type pass only `(form)` / `(table)`. The
    // framework calls via `typeof RelationManager`, which sees the base
    // signature including `ctx`.
    const f = PostsManager.form(Form.make())
    const t = PostsManager.table(Table.make())
    assert.equal(f.getChildren()?.length, 1)
    assert.equal(t.getChildren()?.length, 1)
  })

  it('subclass overrides may consume the context to configure the builder', () => {
    let capturedCtx: RelationManagerContext | undefined

    class PostsManager extends RelationManager {
      static override relationship = 'posts'

      static override table(table: Table, ctx: RelationManagerContext): Table {
        capturedCtx = ctx
        return table.columns([Column.make('title').sortable()])
      }
    }

    PostsManager.table(Table.make(), stubCtx)
    assert.equal(capturedCtx?.basePath,     '/admin')
    assert.equal(capturedCtx?.parentSlug,   'users')
    assert.equal(capturedCtx?.parentId,     '1')
    assert.equal(capturedCtx?.relationship, 'posts')
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

    it('reserves the M2M tokens', () => {
      assert.equal(RESERVED_RELATIONSHIP_TOKENS.has('_attach'),      true)
      assert.equal(RESERVED_RELATIONSHIP_TOKENS.has('_detach'),      true)
      assert.equal(RESERVED_RELATIONSHIP_TOKENS.has('_bulk-detach'), true)
    })
  })

  describe('M2M predicates', () => {
    it('canAttach + canDetach default to true', async () => {
      class M extends RelationManager { static override relationship = 'tags' }
      const parent = { id: 1 }
      const child  = { id: 9 }
      assert.equal(await M.canAttach(null, parent),         true)
      assert.equal(await M.canDetach(null, child, parent),  true)
    })

    it('canAttach override flows through', async () => {
      class M extends RelationManager {
        static override relationship = 'tags'
        static override async canAttach(_user: unknown, parent: unknown): Promise<boolean> {
          return (parent as { canManageTags?: boolean }).canManageTags === true
        }
      }
      assert.equal(await M.canAttach(null, { canManageTags: true }),  true)
      assert.equal(await M.canAttach(null, { canManageTags: false }), false)
    })
  })

  describe('safeManagerPolicy — M2M short-circuit', () => {
    it('canAttach does NOT fall through to the related Resource', async () => {
      class M extends RelationManager { static override relationship = 'tags' }
      const Related = {
        // If fall-through happened, this would be consulted; we want it ignored.
        canCreate: async () => false,
      }
      // Manager hasn't overridden canAttach (default true). With the
      // managerOnly short-circuit, we should see `true` even though
      // Related.canCreate returns false.
      assert.equal(
        await safeManagerPolicy(M, 'canAttach', Related as never, null, { id: 1 }),
        true,
      )
    })

    it('canDetach does NOT fall through to the related Resource', async () => {
      class M extends RelationManager { static override relationship = 'tags' }
      const Related = { canDelete: async () => false }
      assert.equal(
        await safeManagerPolicy(M, 'canDetach', Related as never, null, { id: 1 }, { id: 9 }),
        true,
      )
    })

    it('canAttach manager override is honored over the default-true', async () => {
      class M extends RelationManager {
        static override relationship = 'tags'
        static override async canAttach(): Promise<boolean> { return false }
      }
      assert.equal(
        await safeManagerPolicy(M, 'canAttach', undefined, null, { id: 1 }),
        false,
      )
    })

    it('throwing canDetach predicate fails closed', async () => {
      class M extends RelationManager {
        static override relationship = 'tags'
        static override async canDetach(): Promise<boolean> { throw new Error('boom') }
      }
      assert.equal(
        await safeManagerPolicy(M, 'canDetach', undefined, null, { id: 1 }, { id: 9 }),
        false,
      )
    })
  })
})
