import type { Element } from './schema/Element.js'
import type { Form } from './elements/Form.js'
import type { Table } from './elements/Table.js'
import type { IconValue } from './icons/types.js'
import type { ResourceClass } from './Resource.js'

/**
 * Plan #11 polish — context handed to a manager's `static table()` /
 * `static form()` at config time so user code can template URLs to the
 * manager's own routes without threading basePath / parentId by hand.
 *
 * The page-data builder constructs this once per request (after the
 * parent record has loaded and the related Resource has been
 * discovered) and pipes it into the configurators. Use it to wire
 * `Action.relationCreate / relationEdit / relationDelete` factories
 * inside `static table()` so embedded tables get proper row actions.
 */
export interface RelationManagerContext {
  /** Panel base path, e.g. `'/admin'`. */
  basePath:     string
  /** Slug of the parent Resource (the one that registered this
   *  manager). For Phase B nested managers, this is still the
   *  top-level Resource — the URL prefix shifts via `chain` instead. */
  parentSlug:   string
  /** Stringified primary key of the immediate parent record being
   *  viewed. For depth-1 managers, this is the top-level record's id;
   *  for nested managers, it's the chain's leaf parent (the record the
   *  leaf manager hangs off — e.g. comment 456 for `posts/123/comments/456/replies`). */
  parentId:     string
  /** Relationship key (matches `M.relationship` and the URL segment).
   *  For nested managers, this is the leaf manager's relationship; the
   *  earlier hops live on `chain`. */
  relationship: string
  /** The hydrated parent record. Useful for visibility predicates that
   *  scope by parent state. For nested managers, this is the leaf
   *  parent (the record the leaf manager hangs off — same as `parentId`
   *  resolves). */
  parentRecord: unknown
  /** Related Resource, when discovered. Undefined when the manager
   *  isn't backed by a registered Resource (rare — usually you'd
   *  register one). Action visibility predicates fall through to the
   *  related Resource's policy when the manager hasn't overridden. */
  related?:     ResourceClass | undefined
  /**
   * Phase B nested resources — the parent chain *above* this manager,
   * outermost-first. Empty (or absent) on a depth-1 manager. For a
   * nested manager (e.g. `Replies` under `PostsCommentsManager`), one
   * entry: `[{ slug: 'posts', recordId: '123', relationship: 'comments' }]`
   * — read by `Action.relation*` factories so generated URLs include
   * the nested prefix. */
  chain?:       readonly RelationChainContextEntry[]
  /**
   * Auto-detected from the parent model's `static relations[name].type`
   * via `normalizeRelationMode`. Drives default action injection:
   * - `'hasMany'`         → standard create / edit / delete row actions
   * - `'belongsToMany'`   → attach / detach / bulk-detach instead
   *                         (`relationCreate / Edit / Delete` factories
   *                         auto-hide; pivot ops aren't record ops)
   * - `'morphMany'`       → standard create / edit / delete; the
   *                         relation-create POST handler auto-injects
   *                         `{ <morphName>Id, <morphName>Type }` so
   *                         user code doesn't need `Model.morph(...)`
   * - `'morphTo'`         → child-side polymorphic; no auto-actions
   *                         (related class is dynamic — set
   *                         `static relatedResource` explicitly)
   * - `'morphToMany'`     → polymorphic many-to-many, owning side
   *                         (e.g. `Post.tags()`). Same pivot-mutation
   *                         shape as `belongsToMany`; the ORM stamps +
   *                         filters the `<morphName>Type` discriminator
   *                         on every attach / detach / sync, so pilotiq
   *                         doesn't need to know about it directly.
   * - `'morphedByMany'`   → polymorphic many-to-many, inverse side
   *                         (e.g. `Tag.posts()`). One declaration per
   *                         concrete inverse target — same pivot-mutation
   *                         shape as `belongsToMany`.
   *
   * Defaults to `'hasMany'` when the relations map doesn't expose a
   * type field.
   */
  mode:         RelationMode
}

/** Phase B — one parent layer in a nested-resources URL chain. The
 *  `slug` distinguishes from the route-side `RelationChainStep`
 *  (slug-less) — context-side consumers (Action factories) need the
 *  slug because they're building URLs back to the top-level Resource. */
export interface RelationChainContextEntry {
  slug:         string
  recordId:     string
  relationship: string
}

/** Six relation shapes the page-data builder distinguishes. `hasOne`
 *  is treated identically to `hasMany` for action defaults (one-row
 *  table is still a table) and `morphOne` similarly folds into
 *  `'morphMany'`. `belongsToMany` is the M2M variant; `morphMany` is the
 *  parent-side polymorphic equivalent (auto-injects morph columns on
 *  create instead of attaching pivot rows); `morphTo` is the child-side
 *  polymorphic — auto-discovery of the related Resource is impossible
 *  there (target class is dynamic), so users must set
 *  `static relatedResource` explicitly on the manager.
 *
 *  `belongsTo` runs through the same path as `hasMany` for now —
 *  managers on the inverse side are uncommon. `morphToMany` (owning
 *  side) and `morphedByMany` (inverse side) share the `belongsToMany`
 *  pivot-mutation shape — `attach` / `detach` / `sync` flow through the
 *  same accessor surface; the ORM stamps + filters the polymorphic
 *  discriminator on the shared pivot table automatically. */
export type RelationMode =
  | 'hasMany'
  | 'belongsToMany'
  | 'morphMany'
  | 'morphTo'
  | 'morphToMany'
  | 'morphedByMany'

/**
 * Map a raw `parentModel.relations[name].type` string to the
 * `RelationMode` the manager plumbing dispatches on. Centralizes the
 * fall-through rules so `routes.ts`, `pageData.ts`, and any future
 * call sites stay in lockstep:
 *
 * - `belongsToMany`             → `'belongsToMany'`
 * - `morphMany | morphOne`      → `'morphMany'`  (one-row morph still
 *                                 a many-shape; UI surface identical)
 * - `morphTo`                   → `'morphTo'`
 * - `morphToMany`               → `'morphToMany'`   (owning polymorphic
 *                                 M2M side; pivot-mutation shape)
 * - `morphedByMany`             → `'morphedByMany'` (inverse polymorphic
 *                                 M2M side; pivot-mutation shape)
 * - anything else (hasMany /
 *   hasOne / belongsTo / unset) → `'hasMany'`    (safe default — no
 *                                 special action injection)
 */
export function normalizeRelationMode(relationType: string): RelationMode {
  if (relationType === 'belongsToMany')                     return 'belongsToMany'
  if (relationType === 'morphMany' || relationType === 'morphOne') return 'morphMany'
  if (relationType === 'morphTo')                           return 'morphTo'
  if (relationType === 'morphToMany')                       return 'morphToMany'
  if (relationType === 'morphedByMany')                     return 'morphedByMany'
  return 'hasMany'
}

/**
 * Plan #11 — RelationManager abstract base class.
 *
 * A RelationManager is a parent-scoped projection of a related resource:
 * given a parent record (e.g. a User) and a relationship key (e.g.
 * `'posts'`), it renders an embedded table of the related records on
 * the parent's Edit/View page, with create/edit/delete actions routed
 * under `${base}/${parentSlug}/:id/${relationship}`.
 *
 * Like `Resource`, **all methods are static** — managers are registered
 * by class via `Resource.relations()`, never instantiated. They mirror
 * the `Resource` static shape minus URL ownership: a manager has no
 * `slug` (the relationship name doubles as the URL segment) and no
 * `pages()` override (the list/create/edit pattern is fixed).
 *
 * Authorization runs in two layers per route:
 * 1. The parent's `R.canEdit(user, parentRecord)` — gates access to
 *    *any* manager view under that record. ("Can you edit the user?
 *    Then you can manage their relations.")
 * 2. The manager's own `M.canViewAny / canView / canCreate / canEdit
 *    / canDelete` — gates the specific action. Defaults all return
 *    `true`; the page-data builder additionally defers to the related
 *    Resource's policy when a Resource is registered for the same
 *    `M.relationship` model and the manager hasn't overridden the
 *    predicate.
 *
 * Scope (Plan #11): `hasOne`, `hasMany`, `belongsTo` (matches what
 * `@rudderjs/orm` supports today). `belongsToMany` shipped 2026-05-03
 * via the M2M follow-up. `morphMany` / `morphOne` / `morphTo` shipped
 * via the polymorphic follow-up — `morphMany` auto-injects morph
 * columns on create, `morphTo` requires `static relatedResource` (no
 * single related model to discover). `morphToMany` (owning side) and
 * `morphedByMany` (inverse side) shipped 2026-05-04 via the polymorphic
 * M2M follow-up — both share the `belongsToMany` pivot-mutation shape
 * (`attach` / `detach` / `sync`); the ORM stamps + filters the
 * polymorphic discriminator on the shared pivot table automatically.
 */
export abstract class RelationManager {
  /**
   * Required. The key on the parent's `static relations` map (rudder
   * ORM convention) that points at the related model. Doubles as the
   * URL segment under the parent record:
   * `${base}/${parentSlug}/:id/${relationship}`.
   *
   * Reserved tokens that cannot be used: `edit`, `delete`, `_form`,
   * `_action`, `_search`. Validated at panel boot.
   */
  static relationship: string = ''

  /** Human-readable plural label for the manager's tab. Falls through
   * to the related resource's `label`, then to a sentence-cased
   * relationship name (`'posts' → 'Posts'`). */
  static label?: string

  /** Singular label, e.g. `'Post'`. Falls through to the related
   * resource's `labelSingular`. */
  static labelSingular?: string

  /** Tab icon. Falls through to the related resource's `icon`. */
  static icon?: IconValue

  /** Attribute used to title each row in the manager's table when no
   * explicit override is supplied. Falls through to the related
   * resource's `recordTitleAttribute`, then to the same fallback chain
   * the resource uses (`name → title → id`). */
  static recordTitleAttribute?: string

  /**
   * Explicit pointer to the related resource class. Optional — when
   * unset, pilotiq discovers the related resource via the rudder ORM
   * convention (`parentModel.relations[relationship].model()` matched
   * against `cfg.resources[i].model`). Override here when:
   *   - the parent's ORM doesn't follow the rudder relations convention
   *   - multiple resources share the same model (e.g. `BlogPostResource`
   *     and `DraftResource` both backed by `Post`) and auto-discovery
   *     would be ambiguous
   *   - the manager projects onto a model that's not registered as a
   *     standalone Resource (rare — usually you'd just register one)
   */
  static relatedResource?: ResourceClass

  /**
   * Configure the form used by the manager's create + edit pages.
   * Receives a fresh `Form` instance; return the configured form.
   * Mirrors `Resource.form(form)`. Lifecycle hooks
   * (mutateDataBeforeCreate, beforeSave, afterSave, etc.) are set on
   * the returned `Form` via its builder methods — the page-data
   * builder stamps the parent context onto the `FormContext` before
   * invoking dispatch, so user hooks can read `ctx.parent`,
   * `ctx.parentRecord`, and `ctx.relationship`.
   *
   * `ctx` carries the live basePath / parentId / relationship so user
   * code can template URLs (rare on a form, but symmetric with
   * `table()`). Overrides may omit it: `static override form(form)
   * { … }` is legal because TypeScript permits dropping trailing
   * parameters on overrides.
   */
  static form(form: Form, _ctx: RelationManagerContext): Form { return form }

  /**
   * Configure the table used by the manager's list page. Receives a
   * fresh `Table` instance; return the configured table. Mirrors
   * `Resource.table(table)`. The page-data builder auto-wires
   * `Table.records()` against `parent.related(relationship)` when the
   * parent's `ModelLike` is set and the table has no explicit
   * `records()` handler.
   *
   * `ctx` carries the live basePath / parentSlug / parentId /
   * relationship / parentRecord — wire `Action.relationCreate /
   * relationEdit / relationDelete(M, ctx)` factories into
   * `headerActions` / `recordActions` to template URLs to the
   * manager's own create / edit / delete routes. The framework
   * always passes ctx; overrides that don't need it can drop the
   * parameter.
   */
  static table(table: Table, _ctx: RelationManagerContext): Table { return table }

  /**
   * Schema for the read-only view page of a child record under this
   * manager (future surface — Plan #11 doesn't ship a per-child
   * ViewPage; clicking into a row navigates to the related Resource's
   * own view URL by default). Override `Table.recordUrl(fn)` on the
   * manager table to change navigation.
   */
  static detail(_record: unknown, _parentRecord: unknown): Element[] { return [] }

  /**
   * Phase B nested resources — declare RelationManagers that ride the
   * URL space *under* this manager's per-child view page:
   *
   * ```
   * /posts/123/comments/456/replies          ← list
   * /posts/123/comments/456/replies/create   ← create
   * /posts/123/comments/456/replies/789      ← view
   * /posts/123/comments/456/replies/789/edit ← edit
   * ```
   *
   * Defaults to `[]`. Subclasses opt in by overriding:
   *
   * ```ts
   * class PostsCommentsManager extends RelationManager {
   *   static relationship = 'comments'
   *   static override relations() { return [CommentRepliesManager] }
   * }
   * ```
   *
   * Auth runs in three layers per nested route: the parent Resource's
   * `canAccess + canEdit`, this manager's `canView(child, parent)` (the
   * gate to drill *into* a child), and the leaf manager's `canX(...)`
   * for the specific scope. Full-chain IDOR is enforced layer-by-layer
   * in `pageData.relationManagerData`.
   *
   * Phase B caps depth at 2; declaring `relations()` on a manager whose
   * own chain is already 2 deep is rejected at panel boot. Depth-3+ is
   * Phase D and likely a no-op (Filament stops at 2).
   */
  static relations(): typeof RelationManager[] { return [] }

  // ─── Authorization predicates ─────────────────────────────────
  // All async, all default `true`. The page-data builder calls the
  // parent's `R.canEdit(user, parentRecord)` first as an access gate;
  // the manager's predicates here scope the individual action.
  // Override per-manager when the policy needs to differ from the
  // related resource's defaults.

  /** Allowed to list the related records under this parent. */
  static async canViewAny(_user: unknown, _parentRecord: unknown): Promise<boolean> { return true }

  /** Allowed to view a single related record (read-only). Currently
   * unused by Plan #11 routes — reserved for the future per-child
   * ViewPage. */
  static async canView(_user: unknown, _record: unknown, _parentRecord: unknown): Promise<boolean> { return true }

  /** Allowed to access the create page + invoke the create form. */
  static async canCreate(_user: unknown, _parentRecord: unknown): Promise<boolean> { return true }

  /** Allowed to edit a related record. */
  static async canEdit(_user: unknown, _record: unknown, _parentRecord: unknown): Promise<boolean> { return true }

  /** Allowed to delete a related record. */
  static async canDelete(_user: unknown, _record: unknown, _parentRecord: unknown): Promise<boolean> { return true }

  /** Plan #13 — allowed to restore a soft-deleted related record. Defaults
   *  to `true`; override per-manager when restoration policy needs to
   *  differ from the related Resource's. Only consulted when the related
   *  Resource has `softDeletes = true`. */
  static async canRestore(_user: unknown, _record: unknown, _parentRecord: unknown): Promise<boolean> { return true }

  /** Plan #13 — allowed to permanently force-delete a related record.
   *  Inherits from `canDelete` by default (delegating via `this.canDelete`)
   *  for fail-closed inheritance: a manager that locks down `canDelete`
   *  also locks down force-delete unless explicitly relaxed. */
  static async canForceDelete(user: unknown, record: unknown, parentRecord: unknown): Promise<boolean> {
    return this.canDelete(user, record, parentRecord)
  }

  /** M2M follow-up — allowed to attach an existing related record to the
   *  parent (insert a pivot row). Default `true`. No fall-through to the
   *  related Resource: attaching is a pivot operation, not a record
   *  creation, so `Resource.canCreate` is the wrong gate. */
  static async canAttach(_user: unknown, _parentRecord: unknown): Promise<boolean> { return true }

  /** M2M follow-up — allowed to detach a related record from the parent
   *  (delete a pivot row, target record stays). Default `true`. No
   *  fall-through to the related Resource: detaching ≠ deleting. */
  static async canDetach(_user: unknown, _record: unknown, _parentRecord: unknown): Promise<boolean> { return true }

  // ─── Accessors ────────────────────────────────────────────────

  /**
   * Read the relationship key. Throws when the subclass forgot to set
   * it — better than a confusing 404 at runtime.
   */
  static getRelationship(): string {
    if (!this.relationship) {
      throw new Error(
        `[Pilotiq] ${this.name}: static relationship must be set on a RelationManager subclass.`,
      )
    }
    return this.relationship
  }

  /** Tab label, falling back to a sentence-cased relationship name. */
  static getLabel(): string {
    return this.label ?? sentenceCase(this.getRelationship())
  }

  /** Singular label, falling back to a single-cased relationship name. */
  static getLabelSingular(): string {
    return this.labelSingular ?? sentenceCase(singularize(this.getRelationship()))
  }

  /** Tab icon. Returns the configured icon or `undefined` (renderer
   * skips the icon slot when absent). */
  static getIcon(): IconValue | undefined { return this.icon }

  /** Record-title attribute, undefined when nothing's been configured
   * (callers fall back through name/title/id). */
  static getRecordTitleAttribute(): string | undefined {
    return this.recordTitleAttribute
  }
}

/** Reserved URL tokens that a manager's `relationship` cannot collide
 * with. Validated at panel boot in `PilotiqRegistry.register`. The
 * soft-delete tokens (`restore`, `force-delete`) entered the set with
 * Plan #13's relation-manager polish — they're sibling paths to a
 * resource's `:id/restore` route. The M2M follow-up adds `_attach /
 * _detach / _bulk-detach` for pivot-row mutations — these need to be
 * reserved even though they live one segment deeper than the
 * relationship name (they could otherwise alias a child record id of,
 * say, `_attach` slipping through the IDOR check). */
export const RESERVED_RELATIONSHIP_TOKENS: ReadonlySet<string> = new Set([
  'edit', 'delete', 'restore', 'force-delete',
  '_form', '_action', '_search', '_uploads',
  '_attach', '_detach', '_bulk-detach',
])

// ─── Authorization helpers (Plan #11) ────────────────────────────
// Shared by the route-side data builder (`pageData.relationManagerData`)
// and the action-factory side (`Action.relation*`). Lives here — not in
// pageData — so `Action.ts` can reuse the fall-through logic without
// importing pageData (cycle: pageData → Action → pageData).

/** Names of the predicate methods a `RelationManager` carries.
 *  `canAttach / canDetach` (M2M follow-up) are deliberately
 *  manager-only — they don't fall through to the related Resource
 *  because attach/detach are pivot operations, not record operations,
 *  so `Resource.canCreate / canDelete` are the wrong gates. */
export type ManagerCanMethod =
  | 'canViewAny' | 'canView' | 'canCreate' | 'canEdit' | 'canDelete'
  | 'canRestore' | 'canForceDelete'
  | 'canAttach'  | 'canDetach'

/** True when the subclass replaces the inherited base implementation.
 * Class statics are inherited via the constructor prototype chain, so
 * an un-overridden subclass returns `RelationManager`'s function by
 * reference. */
export function isManagerCanOverridden(
  M:      typeof RelationManager,
  method: ManagerCanMethod,
): boolean {
  return (M as unknown as Record<string, unknown>)[method]
       !== (RelationManager as unknown as Record<string, unknown>)[method]
}

/** Structural shape we need from the related Resource for fall-through.
 * Matches `Resource.canX` predicate signatures without importing the
 * full class (keeps Action.ts cycle-free). `canAttach / canDetach`
 * have no Resource analogue — pivot ops aren't record ops — so they
 * never fall through. */
interface RelatedResourceLike {
  canViewAny?(user: unknown): boolean | Promise<boolean>
  canView?(user: unknown, record: unknown): boolean | Promise<boolean>
  canCreate?(user: unknown): boolean | Promise<boolean>
  canEdit?(user: unknown, record: unknown): boolean | Promise<boolean>
  canDelete?(user: unknown, record: unknown): boolean | Promise<boolean>
  canRestore?(user: unknown, record: unknown): boolean | Promise<boolean>
  canForceDelete?(user: unknown, record: unknown): boolean | Promise<boolean>
}

/**
 * Authorize a manager-scoped action with sensible defaults.
 *
 * - If the manager overrode `method`: run that predicate. The manager
 *   shape carries `parent` (and, for record-scoped methods, `child`)
 *   so user code can scope per-parent.
 * - Otherwise, when a related Resource is registered: fall through to
 *   the Resource's own `canX`. The Resource side doesn't see `parent`
 *   — that's the trade-off for inheriting Resource-level rules.
 * - Otherwise: allow.
 *
 * Throws are absorbed as `false` (fail-closed), matching the
 * resource-side `checkPolicy` convention.
 */
export async function safeManagerPolicy(
  M:        typeof RelationManager,
  method:   ManagerCanMethod,
  Related:  RelatedResourceLike | undefined,
  user:     unknown,
  parent:   unknown,
  child?:   unknown,
): Promise<boolean> {
  const isRecordScoped =
    method === 'canView' || method === 'canEdit' || method === 'canDelete'
    || method === 'canRestore' || method === 'canForceDelete'
    || method === 'canDetach'

  // M2M follow-up — `canAttach` and `canDetach` are manager-only:
  // attach/detach are pivot operations, not record operations, so the
  // related Resource's canCreate/canDelete are the wrong gates. Skip
  // the Related fall-through for these two and just run the
  // (potentially default-true) predicate on the manager.
  const managerOnly = method === 'canAttach' || method === 'canDetach'

  try {
    if (isManagerCanOverridden(M, method) || managerOnly) {
      const fn = (M as unknown as Record<ManagerCanMethod, (...args: unknown[]) => unknown>)[method]
      const result = isRecordScoped ? fn(user, child, parent) : fn(user, parent)
      return Boolean(await (result as boolean | Promise<boolean>))
    }
    // Plan #13 polish — `canForceDelete` defaults to delegating to
    // `canDelete` (force is "stricter than delete"). When the manager
    // has overridden `canDelete` but not `canForceDelete`, mirror the
    // delegation here so the stricter rule propagates. Without this
    // step we'd fall straight through to Related which loses the
    // manager-level canDelete restriction.
    if (method === 'canForceDelete' && isManagerCanOverridden(M, 'canDelete')) {
      return safeManagerPolicy(M, 'canDelete', Related, user, parent, child)
    }
    if (Related) {
      const fn = (Related as unknown as Record<ManagerCanMethod, ((...args: unknown[]) => unknown) | undefined>)[method]
      if (!fn) {
        // Same delegation on the Related side: missing canForceDelete
        // falls back to canDelete.
        if (method === 'canForceDelete' && Related.canDelete) {
          const result = Related.canDelete(user, child)
          return Boolean(await (result as boolean | Promise<boolean>))
        }
        return true
      }
      const result = isRecordScoped ? fn(user, child) : fn(user)
      return Boolean(await (result as boolean | Promise<boolean>))
    }
    return true
  } catch {
    return false
  }
}

function sentenceCase(s: string): string {
  if (s.length === 0) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Naive singularization — strips a trailing `s` when present. Users
 * who want better can set `labelSingular` explicitly. */
function singularize(s: string): string {
  return s.endsWith('s') ? s.slice(0, -1) : s
}
