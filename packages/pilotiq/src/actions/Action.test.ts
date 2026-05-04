import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Action } from './Action.js'
import { resolveSchema, _resetResolverRegistry } from '../schema/resolveSchema.js'
import { Card } from '../schema/Card.js'
import { RelationManager, type RelationManagerContext } from '../RelationManager.js'

beforeEach(() => _resetResolverRegistry())

describe('Action.toMeta', () => {
  it('emits required fields with sensible defaults', () => {
    const meta = Action.make('publish').toMeta()
    assert.equal(meta.type,        'action')
    assert.equal(meta.name,        'publish')
    assert.equal(meta.label,       'Publish') // auto-derived from name
    assert.equal(meta.placement,   'inline')
    assert.equal(meta.destructive, false)
    assert.equal(meta.icon,        undefined)
    assert.equal(meta.confirm,     undefined)
  })

  it('label() overrides the auto-derived label', () => {
    const meta = Action.make('publish').label('Publish Now').toMeta()
    assert.equal(meta.label, 'Publish Now')
  })

  it('icon() emits the icon string', () => {
    const meta = Action.make('save').icon('check').toMeta()
    assert.equal(meta.icon, 'check')
  })

  it('destructive() flips the flag', () => {
    const meta = Action.make('delete').destructive().toMeta()
    assert.equal(meta.destructive, true)
  })

  describe('placement', () => {
    it('placement(p) sets it directly', () => {
      assert.equal(Action.make('a').placement('row').toMeta().placement,    'row')
      assert.equal(Action.make('a').placement('bulk').toMeta().placement,   'bulk')
      assert.equal(Action.make('a').placement('header').toMeta().placement, 'header')
    })

    it('shorthand setters .row() / .bulk() / .header() / .inline()', () => {
      assert.equal(Action.make('a').row().toMeta().placement,    'row')
      assert.equal(Action.make('a').bulk().toMeta().placement,   'bulk')
      assert.equal(Action.make('a').header().toMeta().placement, 'header')
      assert.equal(Action.make('a').row().inline().toMeta().placement, 'inline')
    })
  })

  describe('confirm', () => {
    it('string shorthand becomes { message }', () => {
      const meta = Action.make('delete').confirm('Are you sure?').toMeta()
      assert.deepEqual(meta.confirm, { message: 'Are you sure?' })
    })

    it('object form preserves all keys', () => {
      const meta = Action.make('delete').confirm({
        title:        'Delete user',
        message:      'This action cannot be undone.',
        confirmLabel: 'Yes, delete',
      }).toMeta()
      assert.deepEqual(meta.confirm, {
        title:        'Delete user',
        message:      'This action cannot be undone.',
        confirmLabel: 'Yes, delete',
      })
    })

    it('omitted when not set', () => {
      assert.equal('confirm' in Action.make('save').toMeta(), false)
    })
  })

  describe('handler', () => {
    it('is stored but does not appear in serialized meta', () => {
      const fn = async () => {}
      const a = Action.make('publish').handler(fn)
      assert.equal(a.getHandler(), fn)
      assert.equal('handler' in a.toMeta(), false)
    })
  })
})

describe('Action in the schema tree', () => {
  it('resolves with type=action via the unified resolver', async () => {
    const result = await resolveSchema([Action.make('save').icon('check')])
    assert.equal(result[0]!.type, 'action')
    assert.equal(result[0]!['name'], 'save')
    assert.equal(result[0]!['icon'], 'check')
  })

  it('appears as a child inside a container Element', async () => {
    const tree = [
      Card.make('Header').schema([
        Action.make('export').header(),
        Action.make('delete').row().destructive().confirm('Sure?'),
      ]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.children?.length, 2)
    assert.equal(result[0]!.children![0]!.type,        'action')
    assert.equal(result[0]!.children![0]!['placement'], 'header')
    assert.equal(result[0]!.children![1]!['placement'], 'row')
    assert.deepEqual(result[0]!.children![1]!['confirm'], { message: 'Sure?' })
  })
})

describe('Action variants & cosmetics', () => {
  it('color() sets the visual color', () => {
    assert.equal(Action.make('a').color('success').toMeta().color, 'success')
    assert.equal(Action.make('a').color('warning').toMeta().color, 'warning')
    assert.equal(Action.make('a').color('ghost').toMeta().color,   'ghost')
  })

  it('destructive() implies color="destructive" when no explicit color', () => {
    const meta = Action.make('delete').destructive().toMeta()
    assert.equal(meta.destructive, true)
    assert.equal(meta.color, 'destructive')
  })

  it('explicit color() wins over destructive() flag', () => {
    const meta = Action.make('warn').destructive().color('warning').toMeta()
    assert.equal(meta.destructive, true)
    assert.equal(meta.color, 'warning')
  })

  it('size() sets the size preset', () => {
    assert.equal(Action.make('a').size('sm').toMeta().size, 'sm')
    assert.equal(Action.make('a').size('lg').toMeta().size, 'lg')
  })

  it('tooltip() round-trips', () => {
    const meta = Action.make('save').tooltip('Save changes').toMeta()
    assert.equal(meta.tooltip, 'Save changes')
  })

  it('outlined() emits the flag only when set', () => {
    assert.equal(Action.make('a').toMeta().outlined, undefined)
    assert.equal(Action.make('a').outlined().toMeta().outlined, true)
  })

  it('iconButton() emits iconOnly: true', () => {
    const meta = Action.make('refresh').icon('refresh').iconButton().toMeta()
    assert.equal(meta.iconOnly, true)
  })

  it('badge() / badgeColor() round-trip', () => {
    const meta = Action.make('inbox').badge(7).badgeColor('bg-red-500').toMeta()
    assert.equal(meta.badge, 7)
    assert.equal(meta.badgeColor, 'bg-red-500')
  })

  it('cosmetic builders are absent from meta when not called', () => {
    const meta = Action.make('plain').toMeta()
    assert.equal(meta.color, undefined)
    assert.equal(meta.size, undefined)
    assert.equal(meta.tooltip, undefined)
    assert.equal(meta.outlined, undefined)
    assert.equal(meta.iconOnly, undefined)
    assert.equal(meta.badge, undefined)
  })
})

describe('Action visibility evaluation', () => {
  it('default — no rules → visible:true, disabled:false', async () => {
    const a = Action.make('a')
    assert.deepEqual(await a.evaluate(), { visible: true, disabled: false })
    assert.equal(a.hasVisibilityRules(), false)
  })

  it('visible(false) hides the action', async () => {
    assert.equal((await Action.make('a').visible(false).evaluate()).visible, false)
  })

  it('hidden(true) hides the action', async () => {
    assert.equal((await Action.make('a').hidden(true).evaluate()).visible, false)
  })

  it('visible(fn) receives the context', async () => {
    const a = Action.make('a').visible(({ record }) => Boolean((record as { active?: boolean })?.active))
    assert.equal((await a.evaluate({ record: { active: true } })).visible, true)
    assert.equal((await a.evaluate({ record: { active: false } })).visible, false)
    assert.equal((await a.evaluate({ record: undefined })).visible, false)
  })

  it('disabled(fn) receives the context', async () => {
    const a = Action.make('a').disabled(({ record }) => Boolean((record as { locked?: boolean })?.locked))
    assert.equal((await a.evaluate({ record: { locked: true } })).disabled, true)
    assert.equal((await a.evaluate({ record: { locked: false } })).disabled, false)
  })

  it('combines visible and hidden via AND (visible && !hidden)', async () => {
    const a = Action.make('a').visible(true).hidden(({ record }) => (record as { trashed?: boolean })?.trashed === true)
    assert.equal((await a.evaluate({ record: { trashed: false } })).visible, true)
    assert.equal((await a.evaluate({ record: { trashed: true  } })).visible, false)
  })

  it('authorize() is an alias for visible()', async () => {
    const a = Action.make('a').authorize(({ user }) => Boolean((user as { admin?: boolean })?.admin))
    assert.equal((await a.evaluate({ user: { admin: true  } })).visible, true)
    assert.equal((await a.evaluate({ user: { admin: false } })).visible, false)
  })

  it('async visibility rule resolves a Promise<boolean>', async () => {
    const a = Action.make('a').visible(async ({ user }) => Boolean((user as { admin?: boolean })?.admin))
    assert.equal((await a.evaluate({ user: { admin: true  } })).visible, true)
    assert.equal((await a.evaluate({ user: { admin: false } })).visible, false)
  })

  it('throwing visibility rule fails closed (not visible)', async () => {
    const a = Action.make('a').visible(() => { throw new Error('boom') })
    assert.equal((await a.evaluate()).visible, false)
  })

  it('hasVisibilityRules returns true when any rule is set', () => {
    assert.equal(Action.make('a').visible(true).hasVisibilityRules(), true)
    assert.equal(Action.make('a').hidden(false).hasVisibilityRules(), true)
    assert.equal(Action.make('a').disabled(false).hasVisibilityRules(), true)
    assert.equal(Action.make('a').authorize(true).hasVisibilityRules(), true)
  })

  it('toMeta emits conditional:true when rules exist', () => {
    assert.equal(Action.make('a').toMeta().conditional, undefined)
    assert.equal(Action.make('a').visible(true).toMeta().conditional, true)
  })
})

describe('Action.relation* factories (Plan #11 polish)', () => {
  /** Bare manager + ctx pair shared across the tests below. */
  class Posts extends RelationManager {
    static override relationship  = 'posts'
    static override label         = 'Posts'
    static override labelSingular = 'Post'
  }

  const ctx: RelationManagerContext = {
    basePath:     '/admin',
    parentSlug:   'users',
    parentId:     '42',
    relationship: 'posts',
    parentRecord: { id: '42' },
    mode:         'hasMany',
  }

  describe('relationCreate', () => {
    it('builds the create URL under the parent record', () => {
      const meta = Action.relationCreate(Posts, ctx).toMeta()
      assert.equal(meta.href, '/admin/users/42/posts/create')
      assert.equal(meta.label, 'New Post')
      assert.equal(meta.method, undefined)  // link-style, not form-post
    })

    it('label uses the manager singular fallback when not pinned', () => {
      class Comments extends RelationManager { static override relationship = 'comments' }
      const meta = Action.relationCreate(Comments, { ...ctx, relationship: 'comments' }).toMeta()
      assert.equal(meta.label, 'New Comment')
    })

    it('visibility delegates to manager.canCreate when overridden', async () => {
      class Forbidden extends RelationManager {
        static override relationship = 'posts'
        static override async canCreate(): Promise<boolean> { return false }
      }
      const result = await Action.relationCreate(Forbidden, ctx).evaluate({})
      assert.equal(result.visible, false)
    })

    it('falls through to related Resource canCreate when manager unset', async () => {
      const Related = { canCreate: async () => false } as unknown as RelationManagerContext['related']
      const result = await Action.relationCreate(Posts, { ...ctx, related: Related }).evaluate({})
      assert.equal(result.visible, false)
    })

    it('allows when neither manager nor related Resource opts in', async () => {
      const result = await Action.relationCreate(Posts, ctx).evaluate({})
      assert.equal(result.visible, true)
    })

    it('auto-hides under belongsToMany mode (no per-pivot create)', async () => {
      const m2mCtx = { ...ctx, mode: 'belongsToMany' as const }
      const result = await Action.relationCreate(Posts, m2mCtx).evaluate({})
      assert.equal(result.visible, false)
    })
  })

  describe('relationEdit', () => {
    it('builds the edit URL with :id template for row context', () => {
      const meta = Action.relationEdit(Posts, ctx).toMeta()
      assert.equal(meta.href, '/admin/users/42/posts/:id/edit')
      assert.equal(meta.label, 'Edit')
    })

    it('bakes in an explicit recordId when provided', () => {
      const meta = Action.relationEdit(Posts, ctx, '7').toMeta()
      assert.equal(meta.href, '/admin/users/42/posts/7/edit')
    })

    it('visibility receives both the row record and the parentRecord via ctx', async () => {
      let seenChild: unknown
      let seenParent: unknown
      class WithEdit extends RelationManager {
        static override relationship = 'posts'
        static override async canEdit(_user: unknown, child: unknown, parent: unknown): Promise<boolean> {
          seenChild = child
          seenParent = parent
          return true
        }
      }
      const a = Action.relationEdit(WithEdit, ctx)
      await a.evaluate({ record: { id: '7', title: 'A' } })
      assert.deepEqual(seenChild, { id: '7', title: 'A' })
      assert.deepEqual(seenParent, { id: '42' })
    })

    it('auto-hides under belongsToMany mode (no per-pivot edit)', async () => {
      const m2mCtx = { ...ctx, mode: 'belongsToMany' as const }
      const result = await Action.relationEdit(Posts, m2mCtx).evaluate({ record: { id: '9' } })
      assert.equal(result.visible, false)
    })
  })

  describe('relationDelete', () => {
    it('builds a destructive POST to the delete URL with confirm prompt', () => {
      const meta = Action.relationDelete(Posts, ctx).toMeta()
      assert.equal(meta.method, 'post')
      assert.equal(meta.action, '/admin/users/42/posts/:id/delete')
      assert.equal(meta.destructive, true)
      assert.match(meta.confirm?.message ?? '', /post/)
    })

    it('honors an explicit recordId at config time', () => {
      const meta = Action.relationDelete(Posts, ctx, '7').toMeta()
      assert.equal(meta.action, '/admin/users/42/posts/7/delete')
    })

    it('visibility absorbs predicate throws as false (fail-closed)', async () => {
      class Throwing extends RelationManager {
        static override relationship = 'posts'
        static override async canDelete(): Promise<boolean> { throw new Error('boom') }
      }
      const result = await Action.relationDelete(Throwing, ctx).evaluate({ record: { id: '7' } })
      assert.equal(result.visible, false)
    })

    it('hides on already-trashed rows when related Resource has softDeletes=true', async () => {
      const Related = { softDeletes: true } as unknown as RelationManagerContext['related']
      const a = Action.relationDelete(Posts, { ...ctx, related: Related })
      assert.equal((await a.evaluate({ record: { id: '7', deletedAt: '2026-01-01' } })).visible, false)
    })

    it('still shows on live rows when related Resource has softDeletes=true', async () => {
      const Related = { softDeletes: true } as unknown as RelationManagerContext['related']
      const a = Action.relationDelete(Posts, { ...ctx, related: Related })
      assert.equal((await a.evaluate({ record: { id: '7' } })).visible, true)
    })

    it('honors a custom deletedAtColumn from the related Resource', async () => {
      const Related = { softDeletes: true, deletedAtColumn: 'archivedAt' } as unknown as RelationManagerContext['related']
      const a = Action.relationDelete(Posts, { ...ctx, related: Related })
      assert.equal((await a.evaluate({ record: { archivedAt: '2026-01-01' } })).visible, false)
      assert.equal((await a.evaluate({ record: { archivedAt: null } })).visible, true)
    })

    it('auto-hides under belongsToMany mode (use relationDetach instead)', async () => {
      const m2mCtx = { ...ctx, mode: 'belongsToMany' as const }
      const result = await Action.relationDelete(Posts, m2mCtx).evaluate({ record: { id: '9' } })
      assert.equal(result.visible, false)
    })
  })

  // ── Plan #13 polish — relationRestore / relationForceDelete ────

  describe('relationRestore', () => {
    const Related = { softDeletes: true } as unknown as RelationManagerContext['related']
    const softCtx: RelationManagerContext = { ...ctx, related: Related }

    it('builds the restore URL under the parent record with success color', () => {
      const meta = Action.relationRestore(Posts, softCtx).toMeta()
      assert.equal(meta.method, 'post')
      assert.equal(meta.action, '/admin/users/42/posts/:id/restore')
      assert.equal(meta.label, 'Restore')
      assert.equal(meta.color, 'success')
    })

    it('honors an explicit recordId at config time', () => {
      const meta = Action.relationRestore(Posts, softCtx, '7').toMeta()
      assert.equal(meta.action, '/admin/users/42/posts/7/restore')
    })

    it('hides on live (non-trashed) rows', async () => {
      const a = Action.relationRestore(Posts, softCtx)
      assert.equal((await a.evaluate({ record: { id: '7' } })).visible, false)
    })

    it('shows on trashed rows by default (manager default canRestore = true)', async () => {
      const a = Action.relationRestore(Posts, softCtx)
      assert.equal((await a.evaluate({ record: { deletedAt: '2026-01-01' } })).visible, true)
    })

    it('hides entirely when the related Resource does not opt into softDeletes', async () => {
      const NonSoft = { softDeletes: false } as unknown as RelationManagerContext['related']
      const a = Action.relationRestore(Posts, { ...ctx, related: NonSoft })
      assert.equal((await a.evaluate({ record: { deletedAt: '2026-01-01' } })).visible, false)
    })

    it('respects the manager canRestore override', async () => {
      class Locked extends RelationManager {
        static override relationship = 'posts'
        static override async canRestore(): Promise<boolean> { return false }
      }
      const a = Action.relationRestore(Locked, softCtx)
      assert.equal((await a.evaluate({ record: { deletedAt: '2026-01-01' } })).visible, false)
    })

    it('falls through to related Resource canRestore when manager unset', async () => {
      const RelatedDeny = {
        softDeletes: true,
        canRestore: async () => false,
      } as unknown as RelationManagerContext['related']
      const a = Action.relationRestore(Posts, { ...ctx, related: RelatedDeny })
      assert.equal((await a.evaluate({ record: { deletedAt: '2026-01-01' } })).visible, false)
    })
  })

  describe('relationForceDelete', () => {
    const Related = { softDeletes: true } as unknown as RelationManagerContext['related']
    const softCtx: RelationManagerContext = { ...ctx, related: Related }

    it('builds a destructive POST to the force-delete URL with permanence confirm', () => {
      const meta = Action.relationForceDelete(Posts, softCtx).toMeta()
      assert.equal(meta.method, 'post')
      assert.equal(meta.action, '/admin/users/42/posts/:id/force-delete')
      assert.equal(meta.label, 'Delete forever')
      assert.equal(meta.destructive, true)
      assert.match(meta.confirm?.message ?? '', /cannot be undone/i)
    })

    it('honors an explicit recordId at config time', () => {
      const meta = Action.relationForceDelete(Posts, softCtx, '7').toMeta()
      assert.equal(meta.action, '/admin/users/42/posts/7/force-delete')
    })

    it('hides on live (non-trashed) rows', async () => {
      const a = Action.relationForceDelete(Posts, softCtx)
      assert.equal((await a.evaluate({ record: { id: '7' } })).visible, false)
    })

    it('shows on trashed rows by default (canForceDelete inherits canDelete = true)', async () => {
      const a = Action.relationForceDelete(Posts, softCtx)
      assert.equal((await a.evaluate({ record: { deletedAt: '2026-01-01' } })).visible, true)
    })

    it('hides when the related Resource does not opt into softDeletes', async () => {
      const NonSoft = { softDeletes: false } as unknown as RelationManagerContext['related']
      const a = Action.relationForceDelete(Posts, { ...ctx, related: NonSoft })
      assert.equal((await a.evaluate({ record: { deletedAt: '2026-01-01' } })).visible, false)
    })

    it('inherits canDelete denial when canForceDelete is not overridden', async () => {
      class Locked extends RelationManager {
        static override relationship = 'posts'
        static override async canDelete(): Promise<boolean> { return false }
        // canForceDelete inherits its default which delegates to canDelete
      }
      const a = Action.relationForceDelete(Locked, softCtx)
      assert.equal((await a.evaluate({ record: { deletedAt: '2026-01-01' } })).visible, false)
    })

    it('respects an explicit canForceDelete override stricter than canDelete', async () => {
      class Stricter extends RelationManager {
        static override relationship = 'posts'
        // canDelete defaults to true (inherited)
        static override async canForceDelete(): Promise<boolean> { return false }
      }
      const a = Action.relationForceDelete(Stricter, softCtx)
      assert.equal((await a.evaluate({ record: { deletedAt: '2026-01-01' } })).visible, false)
    })
  })

  describe('M2M factories — relationAttach', () => {
    class Tags extends RelationManager {
      static override relationship  = 'tags'
      static override label         = 'Tags'
      static override labelSingular = 'Tag'
    }

    const m2mCtx: RelationManagerContext = {
      basePath:     '/admin',
      parentSlug:   'articles',
      parentId:     '5',
      relationship: 'tags',
      parentRecord: { id: '5' },
      mode:         'belongsToMany',
    }

    it('renders as a header action with an Attach label', () => {
      const meta = Action.relationAttach(Tags, m2mCtx).toMeta()
      assert.equal(meta.label,     'Attach Tag')
      assert.equal(meta.placement, 'header')
    })

    it('builds a modal-form schema only when M2M + Related.model are set', () => {
      // No related Resource → schema stays empty (action would still
      // mount but the modal has nothing to pick from). `.getSchema()`
      // returns the raw Element[] before resolver-side serialization;
      // `toMeta().children` is populated by the schema walker, not by
      // the action itself, so we check the unresolved tree directly.
      const noRelated = Action.relationAttach(Tags, m2mCtx)
      assert.equal(noRelated.getSchema().length, 0)

      // With a stub related model present, the schema gains a SelectField.
      const Related = {
        model: { query: () => ({ paginate: async () => ({ data: [], total: 0 }) }) },
      } as unknown as RelationManagerContext['related']
      const withRelated = Action.relationAttach(Tags, { ...m2mCtx, related: Related })
      assert.equal(withRelated.getSchema().length, 1)
    })

    it('auto-hides under hasMany mode (drop-in safety)', async () => {
      const hasManyCtx = { ...m2mCtx, mode: 'hasMany' as const }
      const result = await Action.relationAttach(Tags, hasManyCtx).evaluate({})
      assert.equal(result.visible, false)
    })

    it('visible when canAttach defaults true under M2M mode', async () => {
      const result = await Action.relationAttach(Tags, m2mCtx).evaluate({})
      assert.equal(result.visible, true)
    })

    it('manager canAttach=false hides the action even under M2M', async () => {
      class Locked extends RelationManager {
        static override relationship = 'tags'
        static override async canAttach(): Promise<boolean> { return false }
      }
      const result = await Action.relationAttach(Locked, m2mCtx).evaluate({})
      assert.equal(result.visible, false)
    })
  })

  describe('M2M factories — relationDetach', () => {
    class Tags extends RelationManager {
      static override relationship  = 'tags'
      static override label         = 'Tags'
      static override labelSingular = 'Tag'
    }

    const m2mCtx: RelationManagerContext = {
      basePath:     '/admin',
      parentSlug:   'articles',
      parentId:     '5',
      relationship: 'tags',
      parentRecord: { id: '5' },
      mode:         'belongsToMany',
    }

    it('builds the detach URL with :id template for row context', () => {
      const meta = Action.relationDetach(Tags, m2mCtx).toMeta()
      assert.equal(meta.action, '/admin/articles/5/tags/:id/_detach')
      assert.equal(meta.method, 'post')
      assert.equal(meta.label,  'Detach')
    })

    it('bakes in an explicit recordId when provided', () => {
      const meta = Action.relationDetach(Tags, m2mCtx, '9').toMeta()
      assert.equal(meta.action, '/admin/articles/5/tags/9/_detach')
    })

    it('auto-hides under hasMany mode', async () => {
      const hasManyCtx = { ...m2mCtx, mode: 'hasMany' as const }
      const result = await Action.relationDetach(Tags, hasManyCtx).evaluate({ record: { id: 9 } })
      assert.equal(result.visible, false)
    })

    it('visible when canDetach defaults true under M2M mode', async () => {
      const result = await Action.relationDetach(Tags, m2mCtx).evaluate({ record: { id: 9 } })
      assert.equal(result.visible, true)
    })

    it('confirm message frames the operation as detach (not delete)', () => {
      const meta = Action.relationDetach(Tags, m2mCtx).toMeta() as { confirm?: { message: string } }
      assert.match(meta.confirm?.message ?? '', /Detach/)
      assert.match(meta.confirm?.message ?? '', /stays in place/)
    })
  })

  describe('M2M factories — relationBulkDetach', () => {
    class Tags extends RelationManager {
      static override relationship  = 'tags'
      static override label         = 'Tags'
      static override labelSingular = 'Tag'
    }

    const m2mCtx: RelationManagerContext = {
      basePath:     '/admin',
      parentSlug:   'articles',
      parentId:     '5',
      relationship: 'tags',
      parentRecord: { id: '5' },
      mode:         'belongsToMany',
    }

    it('renders as a bulk action with destructive styling', () => {
      const meta = Action.relationBulkDetach(Tags, m2mCtx).toMeta()
      assert.equal(meta.placement, 'bulk')
      assert.equal(meta.color,     'destructive')
    })

    it('auto-hides under hasMany mode', async () => {
      const hasManyCtx = { ...m2mCtx, mode: 'hasMany' as const }
      const result = await Action.relationBulkDetach(Tags, hasManyCtx).evaluate({})
      assert.equal(result.visible, false)
    })

    it('visible when canAttach defaults true under M2M mode (bulk uses canAttach as gate)', async () => {
      const result = await Action.relationBulkDetach(Tags, m2mCtx).evaluate({})
      assert.equal(result.visible, true)
    })
  })

  // ─── Polymorphic M2M follow-up — morphToMany / morphedByMany ──────
  //
  // morphToMany (owning polymorphic side, e.g. `Post.tags()`) and
  // morphedByMany (inverse polymorphic side, e.g. `Tag.posts()`) share
  // the `belongsToMany` pivot-mutation shape. The three M2M factories
  // (`relationAttach / Detach / BulkDetach`) and the three "no per-pivot
  // surface" auto-hides on `relationCreate / Edit / Delete` should treat
  // all three modes identically.

  describe('M2M factories — morphToMany (owning polymorphic side)', () => {
    class Tags extends RelationManager {
      static override relationship  = 'tags'
      static override label         = 'Tags'
      static override labelSingular = 'Tag'
    }

    const morphToManyCtx: RelationManagerContext = {
      basePath:     '/admin',
      parentSlug:   'posts',
      parentId:     '5',
      relationship: 'tags',
      parentRecord: { id: '5' },
      mode:         'morphToMany',
    }

    it('relationAttach renders as header action under morphToMany mode', () => {
      const meta = Action.relationAttach(Tags, morphToManyCtx).toMeta()
      assert.equal(meta.label,     'Attach Tag')
      assert.equal(meta.placement, 'header')
    })

    it('relationAttach builds modal-form schema under morphToMany when Related.model is set', () => {
      const Related = {
        model: { query: () => ({ paginate: async () => ({ data: [], total: 0 }) }) },
      } as unknown as RelationManagerContext['related']
      const a = Action.relationAttach(Tags, { ...morphToManyCtx, related: Related })
      assert.equal(a.getSchema().length, 1)
    })

    it('relationAttach visible when canAttach defaults true under morphToMany mode', async () => {
      const result = await Action.relationAttach(Tags, morphToManyCtx).evaluate({})
      assert.equal(result.visible, true)
    })

    it('relationDetach builds detach URL under morphToMany mode', () => {
      const meta = Action.relationDetach(Tags, morphToManyCtx).toMeta()
      assert.equal(meta.action, '/admin/posts/5/tags/:id/_detach')
      assert.equal(meta.method, 'post')
    })

    it('relationDetach visible when canDetach defaults true under morphToMany mode', async () => {
      const result = await Action.relationDetach(Tags, morphToManyCtx).evaluate({ record: { id: 9 } })
      assert.equal(result.visible, true)
    })

    it('relationBulkDetach visible under morphToMany mode', async () => {
      const result = await Action.relationBulkDetach(Tags, morphToManyCtx).evaluate({})
      assert.equal(result.visible, true)
    })

    it('relationCreate auto-hides under morphToMany (no per-pivot create surface)', async () => {
      const result = await Action.relationCreate(Tags, morphToManyCtx).evaluate({})
      assert.equal(result.visible, false)
    })

    it('relationEdit auto-hides under morphToMany (no per-pivot edit surface)', async () => {
      const result = await Action.relationEdit(Tags, morphToManyCtx).evaluate({ record: { id: '9' } })
      assert.equal(result.visible, false)
    })

    it('relationDelete auto-hides under morphToMany (use relationDetach instead)', async () => {
      const result = await Action.relationDelete(Tags, morphToManyCtx).evaluate({ record: { id: '9' } })
      assert.equal(result.visible, false)
    })
  })

  describe('M2M factories — morphedByMany (inverse polymorphic side)', () => {
    class Posts extends RelationManager {
      static override relationship  = 'posts'
      static override label         = 'Posts'
      static override labelSingular = 'Post'
    }

    const morphedByManyCtx: RelationManagerContext = {
      basePath:     '/admin',
      parentSlug:   'tags',
      parentId:     '5',
      relationship: 'posts',
      parentRecord: { id: '5' },
      mode:         'morphedByMany',
    }

    it('relationAttach renders as header action under morphedByMany mode', () => {
      const meta = Action.relationAttach(Posts, morphedByManyCtx).toMeta()
      assert.equal(meta.label,     'Attach Post')
      assert.equal(meta.placement, 'header')
    })

    it('relationAttach builds modal-form schema under morphedByMany when Related.model is set', () => {
      const Related = {
        model: { query: () => ({ paginate: async () => ({ data: [], total: 0 }) }) },
      } as unknown as RelationManagerContext['related']
      const a = Action.relationAttach(Posts, { ...morphedByManyCtx, related: Related })
      assert.equal(a.getSchema().length, 1)
    })

    it('relationAttach visible when canAttach defaults true under morphedByMany mode', async () => {
      const result = await Action.relationAttach(Posts, morphedByManyCtx).evaluate({})
      assert.equal(result.visible, true)
    })

    it('relationDetach builds detach URL under morphedByMany mode', () => {
      const meta = Action.relationDetach(Posts, morphedByManyCtx).toMeta()
      assert.equal(meta.action, '/admin/tags/5/posts/:id/_detach')
      assert.equal(meta.method, 'post')
    })

    it('relationDetach visible when canDetach defaults true under morphedByMany mode', async () => {
      const result = await Action.relationDetach(Posts, morphedByManyCtx).evaluate({ record: { id: 9 } })
      assert.equal(result.visible, true)
    })

    it('relationBulkDetach visible under morphedByMany mode', async () => {
      const result = await Action.relationBulkDetach(Posts, morphedByManyCtx).evaluate({})
      assert.equal(result.visible, true)
    })

    it('relationCreate auto-hides under morphedByMany (no per-pivot create surface)', async () => {
      const result = await Action.relationCreate(Posts, morphedByManyCtx).evaluate({})
      assert.equal(result.visible, false)
    })

    it('relationEdit auto-hides under morphedByMany (no per-pivot edit surface)', async () => {
      const result = await Action.relationEdit(Posts, morphedByManyCtx).evaluate({ record: { id: '9' } })
      assert.equal(result.visible, false)
    })

    it('relationDelete auto-hides under morphedByMany (use relationDetach instead)', async () => {
      const result = await Action.relationDelete(Posts, morphedByManyCtx).evaluate({ record: { id: '9' } })
      assert.equal(result.visible, false)
    })
  })
})

describe('Action soft-delete factories (Plan #13)', () => {
  /** Minimal ResourceLike satisfying the Action factories. */
  function makeR(over: Partial<{
    softDeletes: boolean
    deletedAtColumn: string
    canDelete: (...args: unknown[]) => boolean | Promise<boolean>
    canRestore: (...args: unknown[]) => boolean | Promise<boolean>
    canForceDelete: (...args: unknown[]) => boolean | Promise<boolean>
  }> = {}) {
    return {
      labelSingular: 'Post',
      getSlug:       () => 'posts',
      ...(over.softDeletes !== undefined ? { softDeletes: over.softDeletes } : {}),
      ...(over.deletedAtColumn !== undefined ? { deletedAtColumn: over.deletedAtColumn } : {}),
      ...(over.canDelete       ? { canDelete:       over.canDelete       } : {}),
      ...(over.canRestore      ? { canRestore:      over.canRestore      } : {}),
      ...(over.canForceDelete  ? { canForceDelete:  over.canForceDelete  } : {}),
    }
  }

  describe('Action.delete trashed-row visibility', () => {
    it('hides on already-trashed rows when softDeletes=true', async () => {
      const R = makeR({ softDeletes: true })
      const a = Action.delete(R, '/admin')
      const r1 = await a.evaluate({ record: { id: '7', deletedAt: '2026-01-01' } })
      assert.equal(r1.visible, false)
    })

    it('shows on live rows when softDeletes=true and canDelete allows', async () => {
      const R = makeR({ softDeletes: true })
      const a = Action.delete(R, '/admin')
      const r1 = await a.evaluate({ record: { id: '7' } })
      assert.equal(r1.visible, true)
    })

    it('ignores deletedAt entirely when softDeletes is not set', async () => {
      const R = makeR()
      const a = Action.delete(R, '/admin')
      // Even with deletedAt set, the regular delete should show — non-soft-delete
      // resources don't gate on the column.
      const r1 = await a.evaluate({ record: { id: '7', deletedAt: '2026-01-01' } })
      assert.equal(r1.visible, true)
    })

    it('honors a custom deletedAtColumn', async () => {
      const R = makeR({ softDeletes: true, deletedAtColumn: 'archivedAt' })
      const a = Action.delete(R, '/admin')
      assert.equal((await a.evaluate({ record: { archivedAt: '2026-01-01' } })).visible, false)
      assert.equal((await a.evaluate({ record: { archivedAt: null } })).visible, true)
    })
  })

  describe('Action.restore', () => {
    it('builds the restore URL with :id template', () => {
      const meta = Action.restore(makeR({ softDeletes: true }), '/admin').toMeta()
      assert.equal(meta.method, 'post')
      assert.equal(meta.action, '/admin/posts/:id/restore')
      assert.equal(meta.label, 'Restore')
      assert.equal(meta.color, 'success')
    })

    it('hides on live rows', async () => {
      const a = Action.restore(makeR({ softDeletes: true }), '/admin')
      assert.equal((await a.evaluate({ record: { id: '7' } })).visible, false)
    })

    it('shows on trashed rows when canRestore allows', async () => {
      const a = Action.restore(makeR({ softDeletes: true }), '/admin')
      assert.equal((await a.evaluate({ record: { deletedAt: '2026-01-01' } })).visible, true)
    })

    it('hides on trashed rows when canRestore denies', async () => {
      const a = Action.restore(makeR({ softDeletes: true, canRestore: async () => false }), '/admin')
      assert.equal((await a.evaluate({ record: { deletedAt: '2026-01-01' } })).visible, false)
    })

    it('honors explicit recordId at config time', () => {
      const meta = Action.restore(makeR({ softDeletes: true }), '/admin', '7').toMeta()
      assert.equal(meta.action, '/admin/posts/7/restore')
    })
  })

  describe('Action.forceDelete', () => {
    it('builds the force-delete URL with destructive style + permanence confirm', () => {
      const meta = Action.forceDelete(makeR({ softDeletes: true }), '/admin').toMeta()
      assert.equal(meta.method, 'post')
      assert.equal(meta.action, '/admin/posts/:id/force-delete')
      assert.equal(meta.destructive, true)
      assert.match(meta.confirm?.message ?? '', /cannot be undone/i)
    })

    it('hides on live rows', async () => {
      const a = Action.forceDelete(makeR({ softDeletes: true }), '/admin')
      assert.equal((await a.evaluate({ record: { id: '7' } })).visible, false)
    })

    it('shows on trashed rows when canForceDelete allows', async () => {
      const a = Action.forceDelete(makeR({ softDeletes: true }), '/admin')
      assert.equal((await a.evaluate({ record: { deletedAt: '2026-01-01' } })).visible, true)
    })

    it('hides on trashed rows when canForceDelete denies', async () => {
      const a = Action.forceDelete(makeR({ softDeletes: true, canForceDelete: async () => false }), '/admin')
      assert.equal((await a.evaluate({ record: { deletedAt: '2026-01-01' } })).visible, false)
    })

    it('label is "Delete forever" — distinguishes from regular delete', () => {
      assert.equal(Action.forceDelete(makeR({ softDeletes: true }), '/admin').toMeta().label, 'Delete forever')
    })
  })
})

describe('Action bulk soft-delete factories (Plan #13)', () => {
  it('bulkDelete iterates records and calls deleteRecord, returns count notification', async () => {
    const deleted: string[] = []
    const R = {
      labelSingular:  'Post',
      getSlug:        () => 'posts',
      softDeletes:    true,
      deletedAtColumn: 'deletedAt',
      async deleteRecord(id: string) { deleted.push(id) },
    } as never
    const a = Action.bulkDelete(R, '/admin')
    const meta = a.toMeta()
    assert.equal(meta.placement, 'bulk')
    assert.equal(meta.destructive, true)

    const handler = a.getHandler()!
    const result = await handler({
      records: [{ id: '1' }, { id: '2' }, { id: '3' }],
      user:    null,
    })
    assert.deepEqual(deleted.sort(), ['1', '2', '3'])
    const notify = (result as { notify: { title: string } }).notify
    assert.match(notify.title, /3 posts moved to trash/i)
  })

  it('bulkDelete uses "deleted" verb for non-soft-delete resources', async () => {
    const R = {
      labelSingular: 'Post',
      getSlug:       () => 'posts',
      // softDeletes: false
      async deleteRecord() { /* no-op */ },
    } as never
    const handler = Action.bulkDelete(R, '/admin').getHandler()!
    const result = await handler({ records: [{ id: '1' }], user: null })
    // Count-aware singular: 1 → labelSingular, not the naive plural.
    assert.match((result as { notify: { title: string } }).notify.title, /1 post deleted/)
  })

  it('bulkDelete uses the count-aware singular form when n=1', async () => {
    const R = {
      labelSingular: 'Article',
      label:         'Articles',  // explicit plural
      getSlug:       () => 'articles',
      softDeletes:   true,
      async deleteRecord() { /* no-op */ },
    } as never
    const handler = Action.bulkDelete(R, '/admin').getHandler()!
    const r1 = await handler({ records: [{ id: '1' }], user: null })
    assert.match((r1 as { notify: { title: string } }).notify.title, /^1 article moved to trash$/)
    const r5 = await handler({ records: Array.from({ length: 5 }, (_, i) => ({ id: String(i) })), user: null })
    assert.match((r5 as { notify: { title: string } }).notify.title, /^5 articles moved to trash$/)
  })

  it('bulkDelete falls back to naive ${labelSingular}s when no plural label is set', async () => {
    const R = {
      labelSingular: 'Post',
      // No `label` set — uses fallback.
      getSlug:       () => 'posts',
      softDeletes:   true,
      async deleteRecord() { /* no-op */ },
    } as never
    const handler = Action.bulkDelete(R, '/admin').getHandler()!
    const r5 = await handler({ records: Array.from({ length: 5 }, (_, i) => ({ id: String(i) })), user: null })
    assert.match((r5 as { notify: { title: string } }).notify.title, /5 posts moved to trash/)
  })

  it('bulkDelete skips rows whose canDelete returns false', async () => {
    const deleted: string[] = []
    const R = {
      labelSingular:  'Post',
      getSlug:        () => 'posts',
      async canDelete(_user: unknown, record: unknown) {
        return (record as { id: string }).id !== '2'  // deny id 2
      },
      async deleteRecord(id: string) { deleted.push(id) },
    } as never
    const handler = Action.bulkDelete(R, '/admin').getHandler()!
    const result = await handler({
      records: [{ id: '1' }, { id: '2' }, { id: '3' }],
      user:    null,
    })
    assert.deepEqual(deleted.sort(), ['1', '3'])
    assert.match((result as { notify: { title: string } }).notify.title, /2 posts/)
  })

  it('bulkRestore calls model.restore on each row', async () => {
    const restored: string[] = []
    const R = {
      labelSingular:   'Post',
      getSlug:         () => 'posts',
      softDeletes:     true,
      deletedAtColumn: 'deletedAt',
      model: {
        async restore(id: string | number) { restored.push(String(id)); return {} },
      },
    } as never
    const handler = Action.bulkRestore(R, '/admin').getHandler()!
    const result = await handler({ records: [{ id: '1' }, { id: '2' }], user: null })
    assert.deepEqual(restored.sort(), ['1', '2'])
    assert.match((result as { notify: { title: string } }).notify.title, /2 posts restored/i)
  })

  it('bulkRestore returns an error notify when model.restore is missing', async () => {
    const R = {
      labelSingular: 'Post',
      getSlug:       () => 'posts',
      softDeletes:   true,
      model:         {},
    } as never
    const handler = Action.bulkRestore(R, '/admin').getHandler()!
    const result = await handler({ records: [{ id: '1' }], user: null })
    const notify = (result as { notify: { title: string; type: string } }).notify
    assert.match(notify.title, /not configured/i)
    assert.equal(notify.type, 'error')
  })

  it('bulkForceDelete calls model.forceDelete on each row', async () => {
    const purged: string[] = []
    const R = {
      labelSingular:   'Post',
      getSlug:         () => 'posts',
      softDeletes:     true,
      deletedAtColumn: 'deletedAt',
      model: {
        async forceDelete(id: string | number) { purged.push(String(id)) },
      },
    } as never
    const handler = Action.bulkForceDelete(R, '/admin').getHandler()!
    const result = await handler({ records: [{ id: '1' }, { id: '2' }], user: null })
    assert.deepEqual(purged.sort(), ['1', '2'])
    assert.match((result as { notify: { title: string } }).notify.title, /2 posts permanently deleted/i)
  })

  it('all three bulk factories ship the correct placement + destructive flags', () => {
    const R = { labelSingular: 'Post', getSlug: () => 'posts' } as never
    const del      = Action.bulkDelete(R, '/admin').toMeta()
    const restore  = Action.bulkRestore(R, '/admin').toMeta()
    const fdelete  = Action.bulkForceDelete(R, '/admin').toMeta()

    assert.equal(del.placement,     'bulk')
    assert.equal(restore.placement, 'bulk')
    assert.equal(fdelete.placement, 'bulk')

    assert.equal(del.destructive,     true)
    assert.equal(restore.destructive, false)
    assert.equal(fdelete.destructive, true)

    assert.equal(restore.color, 'success')
  })
})

describe('Action visibility through resolveSchema (non-row placements)', () => {
  it('drops a header action when visible() returns false', async () => {
    const tree = [
      Action.make('hidden').header().visible(false),
      Action.make('shown').header(),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result.length, 1)
    assert.equal(result[0]!['name'], 'shown')
  })

  it('keeps row-placement actions in the tree even when hidden — per-row eval handles them', async () => {
    const tree = [Action.make('rowAction').row().visible(false)]
    const result = await resolveSchema(tree)
    assert.equal(result.length, 1, 'row actions are always serialized; per-row eval filters at render time')
    assert.equal(result[0]!['conditional'], true, 'conditional flag tells the row renderer to consult the lookup')
  })

  it('stamps disabled:true on header action when disabled(true) is set', async () => {
    const result = await resolveSchema([Action.make('a').header().disabled(true)])
    assert.equal(result[0]!['disabled'], true)
  })
})

describe('Action.export factory', () => {
  /** Lazily-resolved Column class — Column module imports Action, so a
   *  top-level static import would tighten the cycle. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ColumnClass: any
  beforeEach(async () => {
    if (!ColumnClass) ColumnClass = (await import('../Column.js')).Column
  })

  /** Build a minimal Resource-like object with an opt-in `table()`
   *  configurator and visibility predicate. */
  function makeR(over: {
    canViewAny?: (user: unknown) => boolean | Promise<boolean>
    rows?:       Record<string, unknown>[]
    perPageHint?: number
    columns?:    Array<string>
  } = {}) {
    const rows = over.rows ?? [
      { id: 1, name: 'Ada',   email: 'ada@example.com' },
      { id: 2, name: 'Grace', email: 'grace@example.com' },
    ]
    const colNames = over.columns ?? ['id', 'name', 'email']

    return {
      labelSingular: 'User',
      label:         'Users',
      getSlug:       () => 'users',
      ...(over.canViewAny ? { canViewAny: over.canViewAny } : {}),
      // R.table is called inside the export handler with an empty Table.
      // We mutate the passed table in-place, mirroring how user code does
      // it via the fluent builder. Returning the same `t` matches the
      // contract of `static table(t)`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table(t: any) {
        const cols = colNames.map(n => ColumnClass.make(n))
        // Records handler — pages 1..N where N covers all rows. Honors
        // the `perPage` we ask for (so chunking exits cleanly).
        t.columns(cols)
        t.records(({ page = 1, perPage = 1000 }: { page?: number; perPage?: number }) => {
          const start = (page - 1) * perPage
          return { rows: rows.slice(start, start + perPage), total: rows.length }
        })
        return t
      },
    }
  }

  it('returns a CSV download envelope with default filename / contentType', async () => {
    const a = Action.export(makeR(), '/admin')
    const result = await a.getHandler()!({ values: {} })
    const env = (result as { download?: { filename: string; contentType: string; body: string } }).download
    assert.ok(env, 'expected download envelope')
    assert.match(env!.filename, /^users-\d{4}-\d{2}-\d{2}\.csv$/)
    assert.equal(env!.contentType, 'text/csv; charset=utf-8')
    // Default label is Column.getLabel() which title-cases the key
    // (`id` → `Id`, `email` → `Email`). Tests pin the title-cased shape
    // so a Column.getLabel() change here is intentional.
    assert.equal(env!.body.split('\r\n')[0], 'Id,Name,Email')
    assert.ok(env!.body.includes('1,Ada,ada@example.com'))
    assert.ok(env!.body.includes('2,Grace,grace@example.com'))
  })

  it('honors explicit columns option (string + object form)', async () => {
    const a = Action.export(makeR(), '/admin', {
      columns: ['id', { key: 'name', label: 'Full name' }],
    })
    const result = await a.getHandler()!({ values: {} })
    const body = (result as { download: { body: string } }).download.body
    assert.equal(body.split('\r\n')[0], 'id,Full name')
    assert.ok(body.includes('1,Ada'))
    assert.ok(!body.includes('email'))
  })

  it('column.format(value, record) maps the cell before write', async () => {
    const a = Action.export(makeR(), '/admin', {
      columns: [
        { key: 'id' },
        { key: 'name', format: (v) => `<<${v}>>` },
      ],
    })
    const body = ((await a.getHandler()!({ values: {} })) as { download: { body: string } }).download.body
    assert.ok(body.includes('1,<<Ada>>'))
  })

  it('honors filename option as string and as function', async () => {
    const a1 = Action.export(makeR(), '/admin', { filename: 'fixed.csv' })
    const env1 = ((await a1.getHandler()!({ values: {} })) as { download: { filename: string } }).download
    assert.equal(env1.filename, 'fixed.csv')

    const a2 = Action.export(makeR(), '/admin', {
      filename: (ctx) => `dynamic-${(ctx.values as { v?: string }).v}.csv`,
    })
    const env2 = ((await a2.getHandler()!({ values: { v: '42' } })) as { download: { filename: string } }).download
    assert.equal(env2.filename, 'dynamic-42.csv')
  })

  it('format: "json" returns JSON body + JSON content-type', async () => {
    const a = Action.export(makeR(), '/admin', { format: 'json' })
    const env = ((await a.getHandler()!({ values: {} })) as { download: { body: string; contentType: string; filename: string } }).download
    assert.equal(env.contentType, 'application/json')
    assert.match(env.filename, /\.json$/)
    const parsed = JSON.parse(env.body)
    assert.equal(parsed.length, 2)
    assert.equal(parsed[0].name, 'Ada')
  })

  it('emits an error notification when maxRows is exceeded', async () => {
    const big: Record<string, unknown>[] = Array.from({ length: 5 }, (_, i) => ({ id: i, name: `n${i}` }))
    const a = Action.export(makeR({ rows: big, columns: ['id', 'name'] }), '/admin', { maxRows: 3, chunkSize: 2 })
    const r = await a.getHandler()!({ values: {} })
    const notify = (r as { notify?: { type: string; title: string } }).notify
    assert.equal(notify?.type, 'error')
    assert.match(notify!.title, /exceeded 3/)
  })

  it('emits an error notification when the resource has no table()', async () => {
    const R = { labelSingular: 'X', getSlug: () => 'x' }
    const a = Action.export(R, '/admin')
    const r = await a.getHandler()!({ values: {} })
    const notify = (r as { notify?: { type: string; title: string } }).notify
    assert.equal(notify?.type, 'error')
    assert.match(notify!.title, /not configured/)
  })

  it('emits an error notification when columns resolve to none', async () => {
    const R = makeR({ columns: [] })
    const a = Action.export(R, '/admin')
    const r = await a.getHandler()!({ values: {} })
    const notify = (r as { notify?: { type: string; title: string } }).notify
    assert.equal(notify?.type, 'error')
    assert.match(notify!.title, /no columns/)
  })

  it('visibility delegates to R.canViewAny — denies hide the action', async () => {
    const a = Action.export(makeR({ canViewAny: async () => false }), '/admin')
    const ev = await a.evaluate({ user: { id: 'u' } })
    assert.equal(ev.visible, false)
  })

  it('visibility allows when canViewAny is unset (predicate defaults to true)', async () => {
    const a = Action.export(makeR(), '/admin')
    const ev = await a.evaluate({ user: { id: 'u' } })
    assert.equal(ev.visible, true)
  })
})

describe('Action.bulkExport factory', () => {
  function makeR(canViewAny?: (user: unknown) => boolean | Promise<boolean>) {
    return {
      labelSingular: 'User',
      label:         'Users',
      getSlug:       () => 'users',
      ...(canViewAny ? { canViewAny } : {}),
    }
  }

  it('exports ctx.records with default columns from the records themselves', async () => {
    const a = Action.bulkExport(makeR(), '/admin', {
      columns: ['id', 'name'],
    })
    const r = await a.getHandler()!({
      values:  {},
      records: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }],
    })
    const env = (r as { download: { filename: string; body: string; contentType: string } }).download
    assert.equal(env.contentType, 'text/csv; charset=utf-8')
    assert.equal(env.body.split('\r\n')[0], 'id,name')
    assert.ok(env.body.includes('1,Ada'))
    assert.ok(env.body.includes('2,Grace'))
  })

  it('marks placement as bulk', () => {
    const a = Action.bulkExport(makeR(), '/admin', { columns: ['id'] })
    assert.equal(a.toMeta().placement, 'bulk')
  })

  it('exceeds maxRows → error notification', async () => {
    const a = Action.bulkExport(makeR(), '/admin', {
      columns: ['id'],
      maxRows: 1,
    })
    const r = await a.getHandler()!({
      values:  {},
      records: [{ id: 1 }, { id: 2 }],
    })
    const notify = (r as { notify?: { type: string; title: string } }).notify
    assert.equal(notify?.type, 'error')
    assert.match(notify!.title, /exceeded 1/)
  })

  it('format: "json" works for bulk too', async () => {
    const a = Action.bulkExport(makeR(), '/admin', { columns: ['id'], format: 'json' })
    const r = await a.getHandler()!({
      values:  {},
      records: [{ id: 1 }],
    })
    const env = (r as { download: { body: string } }).download
    assert.deepEqual(JSON.parse(env.body), [{ id: 1 }])
  })

  it('honors empty records (still emits a header-only CSV)', async () => {
    const a = Action.bulkExport(makeR(), '/admin', { columns: ['id', 'name'] })
    const r = await a.getHandler()!({ values: {}, records: [] })
    const env = (r as { download: { body: string } }).download
    assert.equal(env.body, 'id,name')
  })
})

describe('Action.import factory', () => {
  /** Build a stand-in `R.model` that records calls and lets tests
   *  control whether `query().where().paginate()` finds an existing
   *  row. */
  function makeModel(over: { existingByKey?: Record<string, Record<string, unknown>> } = {}) {
    const created: Array<Record<string, unknown>> = []
    const updated: Array<{ id: string; payload: Record<string, unknown> }> = []
    return {
      created,
      updated,
      async create(payload: Record<string, unknown>) {
        created.push(payload)
        return { id: String(created.length), ...payload }
      },
      async update(id: string, payload: Record<string, unknown>) {
        updated.push({ id, payload })
        return { id, ...payload }
      },
      query() {
        return {
          where(col: string, val: unknown) {
            return {
              async paginate() {
                const lookup = over.existingByKey ?? {}
                const key = `${col}=${String(val)}`
                const found = lookup[key]
                return { data: found ? [found] : [] }
              },
            }
          },
        }
      },
    }
  }

  function makeR(over: {
    canCreate?: (user: unknown) => boolean | Promise<boolean>
    model?:     ReturnType<typeof makeModel>
  } = {}) {
    return {
      labelSingular: 'User',
      label:         'Users',
      getSlug:       () => 'users',
      ...(over.canCreate ? { canCreate: over.canCreate } : {}),
      model:         over.model ?? makeModel(),
    }
  }

  /** Stub `globalThis.fetch` to return a static body, restore after the test. */
  function withFetch(text: string, fn: () => Promise<void>): Promise<void> {
    const original = globalThis.fetch
    globalThis.fetch = (async () => ({
      ok:   true,
      text: async () => text,
    })) as unknown as typeof fetch
    return fn().finally(() => { globalThis.fetch = original })
  }

  it('auto-builds the modal schema with a FileUpload child by default', () => {
    const a = Action.import(makeR(), '/admin')
    assert.equal(a.toMeta().confirm, undefined, 'import is form-modal, not a confirm prompt')
    const schema = a.getSchema()
    assert.equal(schema.length, 1, 'default modal: just the FileUpload')
    assert.equal((schema[0] as { name?: unknown }).name, 'file')
  })

  it('appends a Mode select when upsertBy is set', async () => {
    const a = Action.import(makeR(), '/admin', { upsertBy: 'email' })
    // Modal heading preserved
    const modal = (a.toMeta() as unknown as { modal?: { heading?: string } }).modal
    assert.equal(modal?.heading, 'Import Users')
    // Schema is set via .schema() — read it via the same mechanism dispatchAction uses.
    const schema = a.getSchema()
    const names = schema.map(el => (el as { name?: unknown }).name)
    assert.deepEqual(names, ['file', 'mode'])
  })

  it('CSV happy-path → all rows create through R.model.create', async () => {
    const model = makeModel()
    const R = makeR({ model })
    const a = Action.import(R, '/admin')
    await withFetch('name,email\r\nAda,ada@x\r\nGrace,grace@x\r\n', async () => {
      const r = await a.getHandler()!({
        values: { file: 'http://localhost/uploads/1.csv' },
      })
      assert.equal(model.created.length, 2)
      assert.deepEqual(model.created[0], { name: 'Ada', email: 'ada@x' })
      assert.deepEqual(model.created[1], { name: 'Grace', email: 'grace@x' })
      const notify = (r as { notify?: { type: string; title: string } }).notify
      assert.equal(notify?.type, 'success')
      assert.match(notify!.title, /2 created/)
    })
  })

  it('upsertBy + matching row → R.model.update; non-matching → R.model.create', async () => {
    const model = makeModel({
      existingByKey: { 'email=ada@x': { id: '7', name: 'Old', email: 'ada@x' } },
    })
    const R = makeR({ model })
    const a = Action.import(R, '/admin', { upsertBy: 'email' })
    await withFetch('name,email\r\nAda,ada@x\r\nGrace,grace@x\r\n', async () => {
      const r = await a.getHandler()!({
        values: { file: 'http://localhost/uploads/1.csv', mode: 'upsert' },
      })
      assert.equal(model.updated.length, 1, 'one match → one update')
      assert.equal(model.updated[0]!.id, '7')
      assert.equal(model.created.length, 1, 'non-match → create')
      const notify = (r as { notify?: { title: string } }).notify
      assert.match(notify!.title, /1 created.*1 updated/)
    })
  })

  it('upsertBy with mode=create → never updates, always creates', async () => {
    const model = makeModel({
      existingByKey: { 'email=ada@x': { id: '7', name: 'Old', email: 'ada@x' } },
    })
    const R = makeR({ model })
    const a = Action.import(R, '/admin', { upsertBy: 'email' })
    await withFetch('name,email\r\nAda,ada@x\r\n', async () => {
      await a.getHandler()!({
        values: { file: 'http://localhost/uploads/1.csv', mode: 'create' },
      })
      assert.equal(model.updated.length, 0)
      assert.equal(model.created.length, 1)
    })
  })

  it('per-row validate() returning a string skips the row + accumulates as error', async () => {
    const model = makeModel()
    const R = makeR({ model })
    const a = Action.import(R, '/admin', {
      validate: (row) => (row['name'] === 'Ada' ? 'ada is reserved' : null),
    })
    await withFetch('name,email\r\nAda,ada@x\r\nGrace,grace@x\r\n', async () => {
      const r = await a.getHandler()!({
        values: { file: 'http://localhost/uploads/1.csv' },
      })
      assert.equal(model.created.length, 1, 'only Grace makes it through')
      const notify = (r as { notify?: { type: string; title: string; body?: string } }).notify
      assert.equal(notify?.type, 'warning')
      assert.match(notify!.title, /1 created/)
      assert.match(notify!.title, /1 skipped/)
      assert.match(notify!.body ?? '', /Row 1: ada is reserved/)
    })
  })

  it('thrown error during create → row counted as skipped + surfaced in notification body', async () => {
    const failing = {
      created: [] as Record<string, unknown>[],
      async create() { throw new Error('db down') },
      query() { return { where() { return { async paginate() { return { data: [] } } } } } },
    }
    const R = makeR({ model: failing as unknown as ReturnType<typeof makeModel> })
    const a = Action.import(R, '/admin')
    await withFetch('name\r\nAda\r\n', async () => {
      const r = await a.getHandler()!({
        values: { file: 'http://localhost/uploads/1.csv' },
      })
      const notify = (r as { notify?: { type: string; body?: string } }).notify
      assert.equal(notify?.type, 'warning')
      assert.match(notify!.body ?? '', /Row 1: db down/)
    })
  })

  it('opts.columns remap CSV headers to model attribute keys', async () => {
    const model = makeModel()
    const R = makeR({ model })
    const a = Action.import(R, '/admin', {
      columns: { 'Full Name': 'name', 'Email Address': 'email' },
    })
    await withFetch('Full Name,Email Address\r\nAda,ada@x\r\n', async () => {
      await a.getHandler()!({
        values: { file: 'http://localhost/uploads/1.csv' },
      })
      assert.deepEqual(model.created[0], { name: 'Ada', email: 'ada@x' })
    })
  })

  it('beforeCreate hook can mutate the row payload', async () => {
    const model = makeModel()
    const R = makeR({ model })
    const a = Action.import(R, '/admin', {
      beforeCreate: (row) => ({ ...row, source: 'csv-import' }),
    })
    await withFetch('name\r\nAda\r\n', async () => {
      await a.getHandler()!({
        values: { file: 'http://localhost/uploads/1.csv' },
      })
      assert.deepEqual(model.created[0], { name: 'Ada', source: 'csv-import' })
    })
  })

  it('emits an error notification when no file is uploaded', async () => {
    const a = Action.import(makeR(), '/admin')
    const r = await a.getHandler()!({ values: {} })
    const notify = (r as { notify?: { type: string; title: string } }).notify
    assert.equal(notify?.type, 'error')
    assert.match(notify!.title, /No file uploaded/)
  })

  it('emits an error notification when R.model.create is missing', async () => {
    const R = { labelSingular: 'X', getSlug: () => 'x', model: {} }
    const a = Action.import(R, '/admin')
    const r = await a.getHandler()!({ values: { file: 'http://localhost/uploads/1.csv' } })
    const notify = (r as { notify?: { type: string; title: string } }).notify
    assert.equal(notify?.type, 'error')
    assert.match(notify!.title, /no model.create/)
  })

  it('emits an error notification when row count exceeds maxRows', async () => {
    const model = makeModel()
    const R = makeR({ model })
    const a = Action.import(R, '/admin', { maxRows: 1 })
    await withFetch('name\r\nA\r\nB\r\n', async () => {
      const r = await a.getHandler()!({
        values: { file: 'http://localhost/uploads/1.csv' },
      })
      const notify = (r as { notify?: { type: string; title: string } }).notify
      assert.equal(notify?.type, 'error')
      assert.match(notify!.title, /too large \(2 > 1\)/)
      assert.equal(model.created.length, 0, 'no rows written when cap exceeded')
    })
  })

  it('JSON format imports parse arrays and single objects', async () => {
    const model = makeModel()
    const R = makeR({ model })
    const a = Action.import(R, '/admin', { format: 'json' })
    await withFetch('[{"name":"Ada"},{"name":"Grace"}]', async () => {
      await a.getHandler()!({
        values: { file: 'http://localhost/uploads/1.json' },
      })
      assert.equal(model.created.length, 2)
    })
  })

  it('format auto-detects from filename extension when not set', async () => {
    const model = makeModel()
    const R = makeR({ model })
    const a = Action.import(R, '/admin')
    await withFetch('{"name":"Ada"}', async () => {
      await a.getHandler()!({
        values: { file: 'http://localhost/uploads/x.json' },
      })
      assert.equal(model.created.length, 1)
      assert.equal(model.created[0]!['name'], 'Ada')
    })
  })

  it('onComplete hook fires once after the import loop with the summary', async () => {
    const seen: unknown[] = []
    const a = Action.import(makeR(), '/admin', {
      onComplete: (s) => { seen.push(s) },
    })
    await withFetch('name\r\nA\r\nB\r\n', async () => {
      await a.getHandler()!({
        values: { file: 'http://localhost/uploads/1.csv' },
      })
    })
    assert.equal(seen.length, 1)
    assert.equal((seen[0] as { created: number }).created, 2)
  })

  it('visibility delegates to R.canCreate — denials hide the action', async () => {
    const a = Action.import(makeR({ canCreate: async () => false }), '/admin')
    const ev = await a.evaluate({ user: { id: 'u' } })
    assert.equal(ev.visible, false)
  })
})
