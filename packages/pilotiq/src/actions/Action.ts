import { Element, type ElementMeta } from '../schema/Element.js'
import type { ValidationErrors } from '../validation/index.js'
import type { Notification, NotificationMeta } from '../notifications/Notification.js'
import {
  safeManagerPolicy,
  type RelationManager,
  type RelationManagerContext,
} from '../RelationManager.js'
import {
  computeMorphPayload,
  getMorphRelationDescriptor,
  getParentRelationDescriptor,
  type ModelLike,
} from '../orm/modelDefaults.js'
import { buildImportSchema as buildImportModalSchema } from './importFactory.js'
import { buildAttachModalSchema } from './attachFactory.js'

/**
 * Where an Action renders. `inline` is the default — appears wherever the
 * Action sits in the schema tree (e.g. a button inside a Card). The other
 * three are list-page patterns:
 *  - `header` — top-right of a resource list (e.g. "Create new")
 *  - `bulk`   — appears in the action bar when rows are selected
 *  - `row`    — per-row dropdown menu entry
 */
export type ActionPlacement = 'inline' | 'bulk' | 'row' | 'header'

/**
 * Context handed to an Action's handler at dispatch time. `record` is set
 * for row/inline actions that operate on a single entity; `records` is set
 * for bulk actions. `values` carries any additional payload submitted with
 * the action (useful when an action has its own confirmation dialog form).
 * `request` is the raw `AppRequest` for handlers that need direct access
 * (auth, headers, etc).
 */
export interface ActionContext {
  record?:  unknown
  records?: unknown[]
  user?:    unknown
  values?:  Record<string, unknown>
  request?: unknown
  /**
   * Row-scoped context populated when this action was dispatched as a
   * Repeater / Builder `extraItemActions` button. `index` is the row's
   * 0-based position; `id` is the row's stable `__id`; `values` is the
   * row's submitted fields (the row's `data` body inside Builder); for
   * Builder, `blockType` carries the matched block name. `fieldName`
   * is the parent Repeater/Builder field's name — useful when a single
   * handler is shared across multiple repeater fields.
   *
   * Always undefined for non-row actions. Handlers that don't care about
   * row context just ignore this field.
   */
  row?:     {
    index:      number
    id:         string
    values:     Record<string, unknown>
    fieldName:  string
    blockType?: string
  }
  /**
   * Stamped by the manager-scoped `_action` route when an action is
   * dispatched from a `RelationManager`'s table. Carries the freshly-
   * loaded parent record + relationship key so handlers can call
   * `parent.related(name).attach(...) / detach(...) / sync(...)`
   * (rudder ORM accessor) without re-loading the parent themselves.
   *
   * Always undefined for resource-level / page-level / dashboard
   * dispatch. M2M-aware factories (`relationAttach / relationDetach /
   * relationBulkDetach`) consult this and `notify` an error when it's
   * missing — that means the action got dispatched outside the manager
   * scope (misconfiguration).
   */
  relation?: {
    parent:       unknown
    parentId:     string
    relationship: string
  }
}

/** Convenience type: handlers can return either a built `Notification`
 * instance, its serialized meta, or arrays of either. */
export type NotificationLike =
  | Notification
  | NotificationMeta
  | ReadonlyArray<Notification | NotificationMeta>

/** Download envelope a handler can return to ask the route layer to
 *  stream a file back instead of issuing the standard JSON / 303
 *  response. Used by `Action.export / Action.bulkExport`; any handler
 *  is free to return one. The route writes `Content-Type` +
 *  `Content-Disposition: attachment; filename="…"` and ends with
 *  `body`; the client renderer detects the disposition header and
 *  triggers a browser download via a synthesized `<a download>`. */
export interface DownloadEnvelope {
  filename:    string
  contentType: string
  body:        string
}

/**
 * Result a handler may return to influence the response. `void` is the
 * default — the dispatcher 303-redirects to the page the action was
 * triggered from. Returning `{ redirect }` overrides that with an
 * explicit URL. Returning `{ notify }` flashes one or more toast
 * notifications on the next render. Returning `{ download }` triggers
 * a file download (mutually exclusive with `redirect` — the route
 * prefers the download branch when both are set). Throw an Error to
 * surface as a 500 with the message.
 */
export type ActionResult =
  | void
  | { redirect?: string; notify?: NotificationLike; download?: DownloadEnvelope }

export type ActionHandler = (ctx: ActionContext) => ActionResult | Promise<ActionResult>

/**
 * A confirmation prompt shown before the handler runs. A bare string is
 * shorthand for `{ message: string }`; the object form lets callers
 * override the dialog title and confirm-button label.
 */
export interface ActionConfirm {
  title?:        string
  message:       string
  confirmLabel?: string
}

/** HTTP method for form-style actions. `'get'` is implied by `.href()`; the
 *  others spawn a `<form>`-wrapped submit button at render time. */
export type ActionMethod = 'post' | 'put' | 'patch' | 'delete'

/** Visual color preset. Maps to a tailwind class group at render time.
 * `destructive` is what `Action.destructive()` sugar sets; the other
 * presets exist so users can opt-in explicitly. */
export type ActionColor = 'primary' | 'destructive' | 'success' | 'warning' | 'info' | 'ghost'

/** Visual size preset. Maps to button height + padding + text size. */
export type ActionSize = 'sm' | 'md' | 'lg'

/** Context passed to visibility / disabled callbacks. `record` is set
 * for single-target evaluation (row actions, edit-page header actions);
 * `records` for bulk evaluations; `user` from the request when wired.
 *
 * `values` is populated only when this action is being evaluated inside
 * a Repeater / Builder row at meta-build time (via `extraItemActions`).
 * It mirrors the resolver's row-scoped values map — predicates branch
 * on the row's submitted fields (e.g. `({ values }) => values.status !==
 * 'archived'`). */
export interface ActionVisibilityContext {
  record?:  unknown
  records?: unknown[]
  user?:    unknown
  values?:  Record<string, unknown>
}

/** Boolean-or-callback rule used by `.visible()` / `.hidden()` /
 * `.disabled()`. Boolean values short-circuit; functions receive the
 * evaluation context and return the result (sync or async).
 *
 * Async support landed with Plan #10 authorization — `Resource.canEdit`
 * etc. return Promise<boolean>, and the `Action.create/edit/view/delete`
 * factories install those predicates as visibility rules. Sync rules
 * keep working unchanged; the awaiter coerces both. */
export type VisibilityRule =
  | boolean
  | ((ctx: ActionVisibilityContext) => boolean | Promise<boolean>)

/** Modal width preset — maps to a max-width class on the Dialog popup. */
export type ActionModalWidth = 'sm' | 'md' | 'lg' | 'xl'

/** Options bag for `Action.replicate`. Both fields optional. */
export interface ReplicateOptions {
  /** Attribute names to drop from the replicated payload IN ADDITION TO
   *  the always-stripped primary key + soft-delete column. Useful for
   *  unique columns the source row holds (e.g. `slug`, `email`) so the
   *  duplicate doesn't trip a unique constraint on save. */
  excludeAttributes?: ReadonlyArray<string>
  /** Mutate the prepared replica before it's persisted. Receives the
   *  already-stripped attributes plus the source record; must return the
   *  attributes to persist (mutate or replace). Useful for stamping
   *  "Copy of" prefixes onto a name column, regenerating slugs, etc. */
  beforeReplicaSaved?: (
    replica: Record<string, unknown>,
    source:  unknown,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
}

/** Structural shape of a Resource class for the factory functions —
 * matches `Resource.ts` exactly but keeps Action.ts free of an import
 * cycle. The optional fields are the Plan #10 policy predicates; their
 * defaults (return `true`) mean missing methods are equivalent to
 * "always allowed." */
interface ResourceLike {
  labelSingular: string
  /** Plural label. When unset, factories fall back to
   *  `${labelSingular}s` (naive). Used by bulk-action notification
   *  copy so "1 Post" / "5 Posts" render correctly. */
  label?: string
  getSlug(): string
  /** Plan #13 — soft-delete opt-in flag. When true, `Action.delete`
   *  auto-hides on already-trashed rows; `Action.restore` /
   *  `Action.forceDelete` auto-show on trashed rows. */
  softDeletes?: boolean
  /** Plan #13 — column name carrying the soft-delete timestamp.
   *  Defaults to `'deletedAt'` when undefined. */
  deletedAtColumn?: string
  canCreate?(user: unknown): boolean | Promise<boolean>
  canEdit?(user: unknown, record: unknown): boolean | Promise<boolean>
  canView?(user: unknown, record: unknown): boolean | Promise<boolean>
  canViewAny?(user: unknown): boolean | Promise<boolean>
  canDelete?(user: unknown, record: unknown): boolean | Promise<boolean>
  canRestore?(user: unknown, record: unknown): boolean | Promise<boolean>
  canForceDelete?(user: unknown, record: unknown): boolean | Promise<boolean>
  /** Resource model adapter (set when the resource opts into auto-CRUD
   *  via `static model = M`). Import / Export factories need access to
   *  `create / update / find / query` to drive their writes / reads. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model?: any
  /** Resource table configurator. Export factory calls
   *  `R.table(Table.make())` to discover columns + the records handler
   *  for the "filtered" / "all" scope. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table?(t: any): any
}

/** Pick the right label form for a count — `labelSingular` for 1,
 *  `label` (plural, lowercased) for any other count. Fall back to a
 *  naive `${labelSingular}s` when no plural label is set. Used by bulk
 *  notification copy so we don't ship "1 posts moved to trash". */
function labelForCount(R: ResourceLike, n: number): string {
  if (n === 1) return R.labelSingular.toLowerCase()
  const plural = R.label?.toLowerCase()
  return plural ?? `${R.labelSingular.toLowerCase()}s`
}

/** True when a `RelationManagerContext.mode` denotes a pivot-mutation
 *  shape — i.e. a many-to-many relation. All three modes share the
 *  `attach` / `detach` / `sync` accessor surface (the rudder ORM stamps
 *  + filters the polymorphic discriminator transparently for the morph
 *  variants). The `relationCreate / Edit / Delete` factories auto-hide
 *  under any of these modes because per-pivot-row create / edit / delete
 *  is meaningless — users create the related record via its own Resource,
 *  then attach via `relationAttach`. */
function isM2MMode(mode: RelationManagerContext['mode']): boolean {
  return mode === 'belongsToMany' || mode === 'morphToMany' || mode === 'morphedByMany'
}

/** Resolve the M2M pivot-mutation accessor for `parent[rel]`. Two
 *  shapes are supported, in this order:
 *    1. `parent[rel]()` — the real `@rudderjs/orm` shape installed by
 *       `_installBelongsToManyMethods` / `_installMorphPivotMethods`
 *       (e.g. `post.tags()` returns `{ attach, detach, sync }`).
 *    2. `parent.related(rel)` — legacy / test-double shape that
 *       returns the accessor directly. Kept so existing pilotiq tests
 *       built around `parent.related(...)` mocks keep passing.
 *
 *  Returns `undefined` when neither shape exposes a callable `attach`
 *  AND a callable `detach` — caller should surface a clear error
 *  notification. */
interface M2MAccessor {
  attach?(input: unknown): Promise<void>
  detach?(input?: unknown): Promise<unknown>
  sync?(desiredIds: ReadonlyArray<string | number>): Promise<unknown>
}
function resolveM2MAccessor(parent: unknown, rel: string): M2MAccessor | undefined {
  if (!parent || typeof parent !== 'object') return undefined
  // Shape 1: parent[rel]() — real ORM. Prototype-installed method.
  const inst = (parent as Record<string, unknown>)[rel]
  if (typeof inst === 'function') {
    try {
      const out = (inst as () => unknown).call(parent) as M2MAccessor | undefined
      if (out && (typeof out.attach === 'function' || typeof out.detach === 'function')) return out
    } catch { /* fall through to legacy shape */ }
  }
  // Shape 2: parent.related(rel) — legacy / test-mock shape.
  const relatedFn = (parent as { related?: (n: string) => unknown }).related
  if (typeof relatedFn === 'function') {
    const out = relatedFn.call(parent, rel) as M2MAccessor | undefined
    if (out && (typeof out.attach === 'function' || typeof out.detach === 'function')) return out
  }
  return undefined
}

/**
 * Compute the parent-attachment payload to force-pin onto a relation
 * replica. For `hasMany`, returns `{ [foreignKey]: parentId }` from the
 * parent's `static relations[name]` descriptor. For `morphMany` /
 * `morphOne`, returns `{ <morphName>Id, <morphName>Type }` via
 * `computeMorphPayload(parentRecord)`. Returns `{}` when no descriptor
 * matches — the route dispatcher already auto-hides under M2M / morphTo,
 * so missing descriptors there are a no-op rather than an error. Pure;
 * exported for tests and re-used by both factories.
 */
function computeRelationPin(
  ctx: RelationManagerContext,
): Record<string, unknown> {
  const parentModel = (ctx.parentRecord as { constructor?: ModelLike } | null | undefined)?.constructor
  if (!parentModel) return {}
  const rel = ctx.relationship
  // Polymorphic owner side first — `morphMany` carries no foreignKey
  // and would fail the hasMany descriptor's gate.
  if (ctx.mode === 'morphMany') {
    const morph = getMorphRelationDescriptor(parentModel, rel)
    if (!morph) return {}
    try { return computeMorphPayload(ctx.parentRecord, morph) }
    catch { return {} }
  }
  const desc = getParentRelationDescriptor(parentModel, rel)
  if (!desc) return {}
  return { [desc.foreignKey]: ctx.parentId }
}

/**
 * Build + persist a single relation replica. Runs the strip set
 * (PK + soft-delete column on the **related** Resource +
 * `opts.excludeAttributes`), force-pins the parent attachment columns,
 * runs the optional `beforeReplicaSaved` hook, and calls
 * `Related.model.create(...)`. Returns the model's create result so
 * callers can read its primary key for redirect targeting.
 *
 * Throws when the related Resource has no model — caller (single-row
 * factory) catches and surfaces an error notification; bulk caller
 * checks the model presence ahead of the loop.
 */
async function persistRelationReplica(
  _M:     typeof RelationManager,
  ctx:    RelationManagerContext,
  source: unknown,
  opts:   ReplicateOptions,
): Promise<unknown> {
  const Related = ctx.related
  if (!Related?.model || typeof Related.model.create !== 'function') {
    throw new Error('Related Resource has no model.create')
  }
  const M2 = Related.model as ModelLike
  const pkCol      = (M2 as { primaryKey?: string }).primaryKey ?? 'id'
  const trashedCol = Related.deletedAtColumn ?? 'deletedAt'
  const skip       = new Set<string>([pkCol, trashedCol, ...(opts.excludeAttributes ?? [])])
  let replica: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
    if (skip.has(k)) continue
    replica[k] = v
  }
  // Force-pin the parent attachment AFTER the strip but BEFORE the
  // user mutator, so `beforeReplicaSaved` can read / override the FK
  // if it really wants to (rare). Tampered source rows can't slip a
  // different parent in by riding their own FK column — the pin
  // overwrites whatever value was there.
  Object.assign(replica, computeRelationPin(ctx))
  if (opts.beforeReplicaSaved) {
    replica = await opts.beforeReplicaSaved(replica, source)
  }
  return M2.create(replica)
}

/**
 * Single-row dispatch for `Action.relationReplicate`. Resolves
 * `ctx.record` (loaded by the route's resolveRecord hook), validates,
 * persists the replica, and shapes the success notification. Errors
 * are caught and surfaced as error toasts.
 */
async function runRelationReplicateRow(
  M:    typeof RelationManager,
  ctx:  RelationManagerContext,
  hctx: ActionContext,
  opts: ReplicateOptions,
): Promise<ActionResult> {
  const source = hctx.record
  if (!source || typeof source !== 'object') {
    return { notify: { title: 'Replicate failed: source record missing', type: 'error' } as never }
  }
  const Related = ctx.related
  if (!Related?.model || typeof Related.model.create !== 'function') {
    return { notify: { title: 'Replicate not configured (related Resource has no model.create)', type: 'error' } as never }
  }
  try {
    await persistRelationReplica(M, ctx, source, opts)
  } catch (err) {
    return { notify: { title: `Replicate failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' } as never }
  }
  return {
    notify: { title: `${M.getLabelSingular()} replicated`, type: 'success' } as never,
  }
}

/** Read `record[R.deletedAtColumn ?? 'deletedAt']` and return true when
 *  the row is currently trashed (soft-deleted). Permissive on shape —
 *  bare `null` / `undefined` count as live; any other truthy value is
 *  trashed. */
function isTrashed(record: unknown, R: ResourceLike): boolean {
  if (!record || typeof record !== 'object') return false
  const col = R.deletedAtColumn ?? 'deletedAt'
  const v = (record as Record<string, unknown>)[col]
  return v !== null && v !== undefined
}

/** Lazy-load the `Table` class for use inside Action handlers. Direct
 *  module-level import would cycle (Table → Action → Table); dynamic
 *  import inside a handler runs after both modules have finished
 *  loading. Cached after first call so we don't pay the import cost
 *  on every dispatched export. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _TableClass: any | undefined
async function loadTableClass(): Promise<unknown> {
  if (_TableClass !== undefined) return _TableClass.make()
  const mod = await import('../elements/Table.js')
  _TableClass = mod.Table
  return _TableClass.make()
}

/** Call a (possibly undefined) Resource predicate. When unset, the
 * predicate is treated as "allowed" (returns true) so the factory
 * doesn't hide actions on Resources that haven't opted into Plan #10. */
function callPredicate(
  fn: ((user: unknown, record?: unknown) => boolean | Promise<boolean>) | undefined,
  user: unknown,
  record?: unknown,
): boolean | Promise<boolean> {
  if (!fn) return true
  return fn(user, record)
}

/** Render-time meta for an action that opens a modal (with or without a
 * form schema). When `meta.children` is also populated by the resolver,
 * the modal renders those Elements as a form whose values pass through
 * to the handler as `ctx.values`. */
export interface ActionModalMeta {
  heading?:     string
  description?: string
  submitLabel?: string
  cancelLabel?: string
  icon?:        string
  width?:       ActionModalWidth
  slideOver?:   boolean
}

export interface ActionMeta extends ElementMeta {
  type:         'action'
  name:         string
  label:        string
  placement:    ActionPlacement
  destructive:  boolean
  icon?:        string
  confirm?:     ActionConfirm
  href?:        string
  method?:      ActionMethod
  action?:      string
  /** POST URL for handler-style actions. Set server-side by the route
   * registrar so the client knows where to dispatch. */
  dispatchUrl?: string
  /** True when this action submits its enclosing `<form>` — renders as
   * `<button type="submit">` and lets the form's `action`/`method`
   * attributes drive the request. */
  submit?:      boolean
  /** When `submit` is true and this id is set, the rendered button uses
   * the HTML `form="<id>"` attribute so it can submit a form it lives
   * outside of (e.g. a Save action in the page header). */
  form?:        string
  /** When `submit` is true, attach `name`+`value` to the `<button>` so
   * the clicked button's pair lands in the form body. Used by the
   * "Create & create another" pattern: a secondary submit posts a
   * sentinel like `{ _continueCreate: '1' }` that the server reads to
   * route the redirect back to the create page. */
  formField?:   { name: string; value: string }
  /** Modal-style action chrome. Present when `.schema()` and/or any of
   * the `modalXxx` builders ran. The fields themselves arrive on
   * `meta.children` via the schema resolver. */
  modal?:       ActionModalMeta
  /** Color preset — drives button colors at render time. `destructive`
   * coincides with `destructive: true` (kept for back-compat). */
  color?:       ActionColor
  /** Size preset — drives button height/padding/text-size. */
  size?:        ActionSize
  /** Hover tooltip text. Wraps the rendered button in a Tooltip. */
  tooltip?:     string
  /** Outlined trigger style — replaces the solid color background with
   * a border + transparent bg. */
  outlined?:    boolean
  /** Icon-only trigger style — hides the label and renders a square
   * button. Requires `icon` to be set. */
  iconOnly?:    boolean
  /** Optional badge shown on the trigger (e.g. unread count). */
  badge?:       string | number
  badgeColor?:  string
  /** Disabled flag set at evaluation time. The trigger renders greyed-out
   * and skips dispatch when true. */
  disabled?:    boolean
  /** True when the action has `.visible()`, `.hidden()`, or `.disabled()`
   * rules — the row renderer uses this to know whether to consult the
   * row's `_visibleActions` / `_disabledActions` lookup. Static actions
   * without rules render unconditionally. */
  conditional?: boolean
}

/**
 * Action — a button-or-menu-entry that performs work when clicked.
 *
 * One class for all four placements; pick one via `.inline()` / `.row()` /
 * `.bulk()` / `.header()` (or `.placement(...)`). Actions can sit inline
 * inside any container Element (Card, Section, etc.) or attach to a
 * Resource's list page.
 *
 * Phase 1.4 ships the shape + serialization. Handler dispatch and
 * confirmation-form support land in Phase 2 alongside Resource lifecycle.
 */
export class Action extends Element {
  readonly name: string

  protected _label: string
  protected _icon?: string
  protected _placement: ActionPlacement = 'inline'
  protected _destructive = false
  protected _confirm?: ActionConfirm
  protected _handler?: ActionHandler
  protected _href?: string
  protected _method?: ActionMethod
  protected _actionUrl?: string
  protected _dispatchUrl?: string
  protected _submit = false
  protected _formTarget?: string
  protected _formField?: { name: string; value: string }

  // Modal chrome — present whenever `.schema()` or any of the modal
  // builders below have been called.
  protected _hasModal = false
  protected _modalHeading?: string
  protected _modalDescription?: string
  protected _modalSubmitLabel?: string
  protected _modalCancelLabel?: string
  protected _modalIcon?: string
  protected _modalWidth?: ActionModalWidth
  protected _slideOver = false

  // Trigger variants & cosmetics
  protected _color?: ActionColor
  protected _size?: ActionSize
  protected _tooltip?: string
  protected _outlined = false
  protected _iconOnly = false
  protected _badge?: string | number
  protected _badgeColor?: string

  // Conditional visibility / disabled rules
  protected _visible?: VisibilityRule
  protected _hidden?: VisibilityRule
  protected _isDisabled?: VisibilityRule

  private constructor(name: string) {
    super()
    this.name = name
    this._label = name.charAt(0).toUpperCase() + name.slice(1)
  }

  static make(name: string): Action {
    return new Action(name)
  }

  // ─── Resource-aware factories ─────────────────────────
  //
  // Pre-configured Action shapes that target a Resource's standard CRUD
  // pages. Drop into `Table.recordActions([…])`, `headerActions([…])`,
  // or `ViewPage.getActions(...)` — placement is stamped by the slot.
  // Filament-style: explicit, but ergonomic.
  //
  // Each factory uses `:id` template substitution for row context; the
  // renderer fills in the row's id when rendering. Header / view actions
  // ignore the template (no `:id` needed for create / list URLs).
  //
  // Plan #10 — each factory auto-attaches a visibility rule that
  // delegates to the Resource's matching policy method (`R.canCreate`
  // for `Action.create`, etc). When `R.canX` is unset (default returns
  // `true`) the action stays visible. Pass an explicit `.visible(...)`
  // after the factory to override.

  /** Create-action factory — link to `${basePath}/${R.slug}/create`.
   * Auto-hides when `R.canCreate(user)` returns false. */
  static create(R: ResourceLike, basePath: string): Action {
    return Action.make('create')
      .label(`New ${R.labelSingular}`)
      .href(`${basePath}/${R.getSlug()}/create`)
      .visible(({ user }) => callPredicate(R.canCreate, user))
  }

  /**
   * Edit-action factory — link to the resource's edit page.
   *
   * Pass `recordId` when building actions for a single-record context
   * (e.g. `ViewPage.getActions()`); the URL is baked at config time.
   * Omit `recordId` for row context (`Table.recordActions(...)`); the
   * URL keeps the `:id` template and the renderer substitutes per-row.
   *
   * Auto-hides when `R.canEdit(user, record)` returns false. For row
   * context the per-row record threads in via `loadTableRecords`'s
   * per-row eval; for view-page context, `resolveSchema` provides the
   * resolved record on the eval context.
   */
  static edit(R: ResourceLike, basePath: string, recordId?: string): Action {
    const id = recordId ?? ':id'
    return Action.make('edit')
      .label('Edit')
      .href(`${basePath}/${R.getSlug()}/${id}/edit`)
      .visible(({ user, record }) => callPredicate(R.canEdit, user, record))
  }

  /** View-action factory — link to the resource's view page. See `Action.edit` for the `recordId` semantics.
   * Auto-hides when `R.canView(user, record)` returns false. */
  static view(R: ResourceLike, basePath: string, recordId?: string): Action {
    const id = recordId ?? ':id'
    return Action.make('view')
      .label('View')
      .href(`${basePath}/${R.getSlug()}/${id}`)
      .visible(({ user, record }) => callPredicate(R.canView, user, record))
  }

  /**
   * Delete-action factory — POSTs to the resource's delete route,
   * destructive style, with a confirmation prompt referencing the
   * resource label. Same `recordId` semantics as `Action.edit`.
   * Auto-hides when `R.canDelete(user, record)` returns false.
   *
   * Plan #13 — when `R.softDeletes = true`, additionally hides on
   * rows whose `deletedAtColumn` is set (already-trashed rows get the
   * Restore + ForceDelete pair instead, surfaced via the matching
   * factories below).
   */
  static delete(R: ResourceLike, basePath: string, recordId?: string): Action {
    const id = recordId ?? ':id'
    return Action.make('delete')
      .label('Delete')
      .destructive()
      .method('post')
      .action(`${basePath}/${R.getSlug()}/${id}/delete`)
      .confirm(`Delete this ${R.labelSingular.toLowerCase()}?`)
      .visible(async ({ user, record }) => {
        if (R.softDeletes && isTrashed(record, R)) return false
        return callPredicate(R.canDelete, user, record)
      })
  }

  /**
   * Replicate-action factory — handler-style. Loads the source record
   * from `ctx.record` (the `_action/:actionName` route already resolves
   * it through `R.query(ctx)` for row + single-target placements),
   * strips PK + soft-delete column + any `opts.excludeAttributes`,
   * optionally runs `opts.beforeReplicaSaved`, and creates a new row
   * via `R.model.create(...)`. Redirects to the new record's edit page
   * on success so the user can review + tweak before saving again.
   *
   * `recordId` kept in the signature for parity with `delete / edit /
   * view` so users can swap factories without rewriting call sites; the
   * dispatcher resolves the source record from the URL and hands it to
   * the handler as `ctx.record`, so we don't reference `recordId` here.
   *
   * Auto-hides when `R.canCreate(user)` returns false — replicating
   * writes a new row, so the gate is `canCreate`, not `canView`.
   */
  static replicate(
    R:        ResourceLike,
    basePath: string,
    recordId?: string,
    opts:     ReplicateOptions = {},
  ): Action {
    void recordId
    return Action.make('replicate')
      .label('Replicate')
      .handler(async (ctx) => {
        const source = ctx.record
        if (!source || typeof source !== 'object') {
          return { notify: { title: 'Replicate failed: source record missing', type: 'error' } as never }
        }
        const M = R.model
        if (!M || typeof M.create !== 'function') {
          return { notify: { title: 'Replicate not configured (resource has no model.create)', type: 'error' } as never }
        }

        const pkCol      = (M as { primaryKey?: string }).primaryKey ?? 'id'
        const trashedCol = R.deletedAtColumn ?? 'deletedAt'
        const skip = new Set<string>([pkCol, trashedCol, ...(opts.excludeAttributes ?? [])])
        let replica: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
          if (skip.has(k)) continue
          replica[k] = v
        }
        if (opts.beforeReplicaSaved) {
          try { replica = await opts.beforeReplicaSaved(replica, source) }
          catch (err) {
            return { notify: { title: `Replicate failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' } as never }
          }
        }

        let created: unknown
        try {
          created = await M.create(replica)
        } catch (err) {
          return { notify: { title: `Replicate failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' } as never }
        }

        const newId = (created as Record<string, unknown> | null | undefined)?.[pkCol]
        const redirect = newId !== undefined && newId !== null
          ? `${basePath}/${R.getSlug()}/${String(newId)}/edit`
          : `${basePath}/${R.getSlug()}`
        return {
          redirect,
          notify: { title: `${R.labelSingular} replicated`, type: 'success' } as never,
        }
      })
      .visible(({ user }) => callPredicate(R.canCreate, user))
  }

  /**
   * Plan #13 — Restore factory. POSTs to the resource's restore route,
   * success-styled, no confirm prompt (restoration is reversible).
   * Auto-hides on live (non-trashed) rows AND when `R.canRestore(user,
   * record)` returns false. Same `recordId` semantics as `Action.edit`.
   */
  static restore(R: ResourceLike, basePath: string, recordId?: string): Action {
    const id = recordId ?? ':id'
    return Action.make('restore')
      .label('Restore')
      .color('success')
      .method('post')
      .action(`${basePath}/${R.getSlug()}/${id}/restore`)
      .visible(async ({ user, record }) => {
        if (!isTrashed(record, R)) return false
        return callPredicate(R.canRestore, user, record)
      })
  }

  /**
   * Plan #13 — Force-delete factory. POSTs to the resource's
   * force-delete route, destructive-styled, with a stricter confirm
   * prompt referencing permanence. Auto-hides on live (non-trashed)
   * rows AND when `R.canForceDelete(user, record)` returns false.
   */
  static forceDelete(R: ResourceLike, basePath: string, recordId?: string): Action {
    const id = recordId ?? ':id'
    return Action.make('forceDelete')
      .label('Delete forever')
      .destructive()
      .method('post')
      .action(`${basePath}/${R.getSlug()}/${id}/force-delete`)
      .confirm(`Permanently delete this ${R.labelSingular.toLowerCase()}? This cannot be undone.`)
      .visible(async ({ user, record }) => {
        if (!isTrashed(record, R)) return false
        return callPredicate(R.canForceDelete, user, record)
      })
  }

  // ─── Bulk factories (Plan #13) ────────────────────────────────
  //
  // Handler-style bulk actions that iterate `ctx.records`, run policy
  // per-row, and call the matching Resource / Model method. No new
  // routes — the existing `/_action/:actionName` dispatcher already
  // handles bulk via `ctx.records`. Drop into `bulkActions([...])`
  // from inside `Resource.table()`.
  //
  // Each returns a notification with the count succeeded; rows whose
  // policy denied (or whose call threw) are silently skipped — surface
  // them via your own logging if needed.

  /** Bulk delete — calls `R.deleteRecord(id)` per row. On a
   *  soft-delete resource that hits `Model.delete()` which writes
   *  `deletedAt`. Notification: "N posts moved to trash" / "N posts
   *  deleted" depending on `R.softDeletes`. */
  static bulkDelete(R: ResourceLike, _basePath: string): Action {
    return Action.make('bulkDelete')
      .label('Delete selected')
      .destructive()
      .bulk()
      .confirm(`Delete the selected ${labelForCount(R, 0)}?`)
      .handler(async (ctx) => {
        const records = ctx.records ?? []
        const Rfull = R as ResourceLike & { deleteRecord(id: string): Promise<void> }
        let n = 0
        for (const record of records) {
          const id = String((record as { id?: unknown }).id ?? '')
          if (!id) continue
          const allowed = await callPredicate(R.canDelete, ctx.user, record)
          if (!allowed) continue
          try { await Rfull.deleteRecord(id); n++ } catch { /* skip — agg notify shows total */ }
        }
        const verb = R.softDeletes ? 'moved to trash' : 'deleted'
        return { notify: { title: `${n} ${labelForCount(R, n)} ${verb}`, type: 'success' } as never }
      })
  }

  /** Bulk restore — calls `R.model.restore(id)` per row. Visible only
   *  on soft-delete resources (the entire bulk-restore concept is
   *  specific to them). */
  static bulkRestore(R: ResourceLike, _basePath: string): Action {
    return Action.make('bulkRestore')
      .label('Restore selected')
      .color('success')
      .bulk()
      .confirm(`Restore the selected ${labelForCount(R, 0)}?`)
      .handler(async (ctx) => {
        const records = ctx.records ?? []
        const Rfull = R as ResourceLike & { model?: { restore?(id: string | number): Promise<unknown> } }
        const restore = Rfull.model?.restore
        if (!restore) {
          return { notify: { title: 'Restore not configured', type: 'error' } as never }
        }
        let n = 0
        for (const record of records) {
          const id = String((record as { id?: unknown }).id ?? '')
          if (!id) continue
          const allowed = await callPredicate(R.canRestore, ctx.user, record)
          if (!allowed) continue
          try { await restore(id); n++ } catch { /* skip */ }
        }
        return { notify: { title: `${n} ${labelForCount(R, n)} restored`, type: 'success' } as never }
      })
  }

  /** Bulk force-delete — calls `R.model.forceDelete(id)` per row. Same
   *  destructive confirm as the per-row variant. Visible only on
   *  soft-delete resources. */
  static bulkForceDelete(R: ResourceLike, _basePath: string): Action {
    return Action.make('bulkForceDelete')
      .label('Delete forever')
      .destructive()
      .bulk()
      .confirm(`Permanently delete the selected ${labelForCount(R, 0)}? This cannot be undone.`)
      .handler(async (ctx) => {
        const records = ctx.records ?? []
        const Rfull = R as ResourceLike & { model?: { forceDelete?(id: string | number): Promise<void> } }
        const forceDelete = Rfull.model?.forceDelete
        if (!forceDelete) {
          return { notify: { title: 'Force-delete not configured', type: 'error' } as never }
        }
        let n = 0
        for (const record of records) {
          const id = String((record as { id?: unknown }).id ?? '')
          if (!id) continue
          const allowed = await callPredicate(R.canForceDelete, ctx.user, record)
          if (!allowed) continue
          try { await forceDelete(id); n++ } catch { /* skip */ }
        }
        return { notify: { title: `${n} ${labelForCount(R, n)} permanently deleted`, type: 'success' } as never }
      })
  }

  /**
   * Bulk replicate — calls `R.model.create(...)` once per selected row
   * with the source row's attributes minus PK / soft-delete column /
   * `opts.excludeAttributes`. Optional `opts.beforeReplicaSaved(replica,
   * source)` runs per-row. Rows that throw during create are skipped
   * silently so a single bad row doesn't abort the batch (the user sees
   * the success count on the toast). Visibility delegates to
   * `R.canCreate(user)`.
   *
   * Sibling of `Action.replicate` — same options bag, same strip set,
   * same authorization gate. Stays on the list page (no per-row
   * redirect possible for N rows).
   */
  static bulkReplicate(
    R:        ResourceLike,
    _basePath: string,
    opts:     ReplicateOptions = {},
  ): Action {
    return Action.make('bulkReplicate')
      .label('Replicate selected')
      .bulk()
      .confirm(`Replicate the selected ${labelForCount(R, 0)}?`)
      .handler(async (ctx) => {
        const M = R.model
        if (!M || typeof M.create !== 'function') {
          return { notify: { title: 'Replicate not configured (resource has no model.create)', type: 'error' } as never }
        }
        const records = ctx.records ?? []
        const pkCol      = (M as { primaryKey?: string }).primaryKey ?? 'id'
        const trashedCol = R.deletedAtColumn ?? 'deletedAt'
        const skip = new Set<string>([pkCol, trashedCol, ...(opts.excludeAttributes ?? [])])
        let n = 0
        for (const source of records) {
          if (!source || typeof source !== 'object') continue
          const allowed = await callPredicate(R.canCreate, ctx.user)
          if (!allowed) continue
          let replica: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
            if (skip.has(k)) continue
            replica[k] = v
          }
          if (opts.beforeReplicaSaved) {
            try { replica = await opts.beforeReplicaSaved(replica, source) }
            catch { continue }
          }
          try { await M.create(replica); n++ } catch { /* skip — agg notify shows total */ }
        }
        return { notify: { title: `${n} ${labelForCount(R, n)} replicated`, type: 'success' } as never }
      })
      .visible(({ user }) => callPredicate(R.canCreate, user))
  }

  // ─── Import / Export factories ────────────────────────────────
  //
  // Pre-built CSV / JSON in/out for any Resource that has `R.model`.
  // `Action.export` walks the configured `R.table()` records handler
  // in pages (so it picks up the active filter/search/sort by default,
  // and stays consistent with what the user is looking at). The bulk
  // variant exports `ctx.records` instead. `Action.import` opens a
  // form-modal with a `FileUpload`, parses the uploaded file, and runs
  // create / upsert through `R.model`.
  //
  // Internals live in `./exportFactory.ts` and `./importFactory.ts`
  // — kept out of this file because they need to import `Table` /
  // field types that themselves import `Action`. Lazy-import inside
  // the handler avoids the cycle (handlers run at request-time, well
  // after module load).

  /** Header-placement export — downloads the table as CSV (default) or
   *  JSON. Visibility defaults to `R.canViewAny(user)`. Drop into
   *  `headerActions([...])` from inside `Resource.table()`. See
   *  `docs/plans/import-export-actions.md` for the full options bag. */
  static export(
    R: ResourceLike,
    _basePath: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    opts: import('./exportFactory.js').ExportOptions = {},
  ): Action {
    return Action.make('export')
      .label('Export')
      .handler(async (ctx) => {
        const ef = await import('./exportFactory.js')
        const tableInst = R.table?.(await loadTableClass())
        if (!tableInst) {
          return { notify: { title: 'Export not configured (resource has no table())', type: 'error' } as never }
        }
        const cols = ef.resolveExportColumns(opts.columns, R)
        if (cols.length === 0) {
          return { notify: { title: 'Export has no columns', type: 'error' } as never }
        }
        const maxRows  = opts.maxRows ?? 50_000
        const records  = await ef.collectExportRows(tableInst, ctx, opts.scope ?? 'filtered', maxRows, opts.chunkSize)
        if (records.length > maxRows) {
          return { notify: { title: `Export exceeded ${maxRows} rows`, type: 'error' } as never }
        }
        const rows     = records.map(r => ef.buildExportRow(r, cols))
        const format   = opts.format ?? 'csv'
        const { body, contentType } = ef.encodeExport(rows, cols, format)
        const filename = typeof opts.filename === 'function'
          ? opts.filename(ctx)
          : (opts.filename ?? ef.defaultExportFilename(R.getSlug(), format))
        return { download: { filename, contentType, body } }
      })
      .visible(({ user }) => callPredicate(R.canViewAny, user))
  }

  /** Bulk-placement export — downloads the rows the user selected via
   *  the bulk-select checkboxes. Same options as `Action.export` minus
   *  `scope` (always operates on `ctx.records`). Drop into
   *  `bulkActions([...])`. */
  static bulkExport(
    R: ResourceLike,
    _basePath: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    opts: Omit<import('./exportFactory.js').ExportOptions, 'scope'> = {},
  ): Action {
    return Action.make('bulkExport')
      .label('Export selected')
      .bulk()
      .handler(async (ctx) => {
        const ef = await import('./exportFactory.js')
        const cols = ef.resolveExportColumns(opts.columns, R)
        if (cols.length === 0) {
          return { notify: { title: 'Export has no columns', type: 'error' } as never }
        }
        const records = ctx.records ?? []
        const maxRows = opts.maxRows ?? 50_000
        if (records.length > maxRows) {
          return { notify: { title: `Export exceeded ${maxRows} rows`, type: 'error' } as never }
        }
        const rows     = records.map(r => ef.buildExportRow(r, cols))
        const format   = opts.format ?? 'csv'
        const { body, contentType } = ef.encodeExport(rows, cols, format)
        const filename = typeof opts.filename === 'function'
          ? opts.filename(ctx)
          : (opts.filename ?? ef.defaultExportFilename(R.getSlug(), format))
        return { download: { filename, contentType, body } }
      })
      .visible(({ user }) => callPredicate(R.canViewAny, user))
  }

  /** Header-placement import — opens a modal with a `FileUpload` (and a
   *  Mode select when `upsertBy` is set), parses the uploaded file, and
   *  walks each row through `R.model.create` / `R.model.update`.
   *  Visibility defaults to `R.canCreate(user)`. Drop into
   *  `headerActions([...])` from inside `Resource.table()`. See
   *  `docs/plans/import-export-actions.md` for the full options bag. */
  static import(
    R: ResourceLike,
    _basePath: string,
    opts: import('./importFactory.js').ImportOptions = {},
  ): Action {
    const upsertable = typeof opts.upsertBy === 'string' && opts.upsertBy.length > 0
    const a = Action.make('import')
      .label('Import')
      .modalHeading(`Import ${R.label ?? `${R.labelSingular}s`}`)
      .modalSubmitLabel('Import')
      .modalCancelLabel('Cancel')
      .handler(async (ctx) => {
        const M = R.model
        if (!M || typeof M.create !== 'function') {
          return { notify: { title: 'Import not configured (resource has no model.create)', type: 'error' } as never }
        }
        if (upsertable && typeof M.update !== 'function') {
          return { notify: { title: 'Upsert import requires model.update', type: 'error' } as never }
        }
        const fileUrl = String((ctx.values?.['file'] as unknown) ?? '')
        if (fileUrl.length === 0) {
          return { notify: { title: 'No file uploaded', type: 'error' } as never }
        }
        const ifac = await import('./importFactory.js')
        let text: string
        try {
          const r = await fetch(fileUrl)
          if (!r.ok) {
            return { notify: { title: `Failed to fetch upload (${r.status})`, type: 'error' } as never }
          }
          text = await r.text()
        } catch (err) {
          return { notify: { title: `Failed to read upload: ${err instanceof Error ? err.message : String(err)}`, type: 'error' } as never }
        }
        const format = opts.format ?? (fileUrl.toLowerCase().endsWith('.json') ? 'json' : 'csv')
        let rows: Array<Record<string, unknown>>
        try {
          rows = ifac.parseImportText(text, format, opts.columns)
        } catch (err) {
          return { notify: { title: `Failed to parse ${format.toUpperCase()}: ${err instanceof Error ? err.message : String(err)}`, type: 'error' } as never }
        }
        const maxRows = opts.maxRows ?? 10_000
        if (rows.length > maxRows) {
          return { notify: { title: `Import too large (${rows.length} > ${maxRows})`, type: 'error' } as never }
        }
        const mode = upsertable && (ctx.values?.['mode'] === 'upsert') ? 'upsert' : 'create'
        const summary = await ifac.runImport(rows, M, mode, opts, ctx)
        return { notify: ifac.buildImportNotification(summary, { upsert: upsertable }) as never }
      })
      .visible(({ user }) => callPredicate(R.canCreate, user))

    // Build the modal-form schema synchronously. importFactory has no
    // runtime import edge back to Action.ts (only a type-import, erased
    // at compile time), so the top-of-file static import below is
    // cycle-free.
    a.schema(buildImportModalSchema(opts))
    return a
  }

  // ─── Relation-manager factories (Plan #11 polish) ─────────────
  //
  // Mirror `Action.create / edit / delete` but build URLs under the
  // parent record: `${base}/${parentSlug}/${parentId}/${rel}/...`.
  // Designed to be called inside `RelationManager.static table()` —
  // the page-data builder pipes `RelationManagerContext` into that
  // configurator so users get `basePath`, `parentId`, and the
  // discovered Related resource without threading them by hand.
  //
  // Visibility predicates use `safeManagerPolicy` so the manager's
  // `canX` (when overridden) wins, otherwise falls through to the
  // related Resource's `canX`. Throws absorb as `false`.
  //
  // `:id` template substitution still happens at render time for row
  // context — the same mechanism that drives `Action.edit / delete`.
  // The parent's id is baked into the URL at config time (it's known
  // upfront from `ctx.parentId`), so `:id` unambiguously refers to
  // the row's *child* id.

  /** Relation create-action factory — link to
   * `${base}/${parentSlug}/${parentId}/${relationship}/create`.
   *
   * Visibility delegates to `M.canCreate(user, parentRecord)` (or the
   * related Resource's `canCreate(user)` when the manager hasn't
   * overridden). Drop into `headerActions([...])` from inside
   * `RelationManager.table(table, ctx)`.
   */
  static relationCreate(
    M:   typeof RelationManager,
    ctx: RelationManagerContext,
  ): Action {
    const labelSingular = M.getLabelSingular()
    return Action.make('create')
      .label(`New ${labelSingular}`)
      .href(`${ctx.basePath}/${ctx.parentSlug}/${ctx.parentId}/${ctx.relationship}/create`)
      .visible(({ user }) => {
        // M2M managers don't have a per-pivot-row create surface — the
        // related record is created via its own Resource, then attached
        // via `relationAttach`. Auto-hide so dropping this factory into
        // any M2M manager (belongsToMany / morphToMany / morphedByMany)
        // is a no-op (visible=false) instead of a 404-on-click foot-gun.
        if (isM2MMode(ctx.mode)) return false
        return safeManagerPolicy(M, 'canCreate', ctx.related, user, ctx.parentRecord)
      })
  }

  /** Relation edit-action factory — link to
   * `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/edit`.
   *
   * Same `recordId` semantics as `Action.edit`: omit for row context
   * so the renderer substitutes `:id` per row; pass explicitly when
   * building actions for a single-record context. Visibility delegates
   * to `M.canEdit(user, child, parentRecord)` with fall-through to the
   * related Resource's `canEdit(user, record)`.
   */
  static relationEdit(
    M:        typeof RelationManager,
    ctx:      RelationManagerContext,
    recordId?: string,
  ): Action {
    const id = recordId ?? ':id'
    return Action.make('edit')
      .label('Edit')
      .href(`${ctx.basePath}/${ctx.parentSlug}/${ctx.parentId}/${ctx.relationship}/${id}/edit`)
      .visible(({ user, record }) => {
        // M2M: per-pivot-row "edit" doesn't exist; users edit the
        // related record via its own Resource. Auto-hide for every M2M
        // mode (belongsToMany / morphToMany / morphedByMany).
        if (isM2MMode(ctx.mode)) return false
        return safeManagerPolicy(M, 'canEdit', ctx.related, user, ctx.parentRecord, record)
      })
  }

  /** Relation delete-action factory — POST to
   * `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/delete`,
   * destructive style with a labeled confirmation. Visibility delegates
   * to `M.canDelete(user, child, parentRecord)` with fall-through to the
   * related Resource's `canDelete(user, record)`.
   */
  static relationDelete(
    M:        typeof RelationManager,
    ctx:      RelationManagerContext,
    recordId?: string,
  ): Action {
    const id = recordId ?? ':id'
    const singular = M.getLabelSingular().toLowerCase()
    return Action.make('delete')
      .label('Delete')
      .destructive()
      .method('post')
      .action(`${ctx.basePath}/${ctx.parentSlug}/${ctx.parentId}/${ctx.relationship}/${id}/delete`)
      .confirm(`Delete this ${singular}?`)
      .visible(async ({ user, record }) => {
        // M2M: "delete" of the related record is destructive in a way
        // that "detach" isn't — surface only `relationDetach` on every
        // M2M manager (belongsToMany / morphToMany / morphedByMany).
        // Users who genuinely want to delete the related record reach
        // for `Action.delete(R)` on the related Resource instead.
        if (isM2MMode(ctx.mode)) return false
        if (ctx.related?.softDeletes && isTrashed(record, ctx.related as ResourceLike)) return false
        return safeManagerPolicy(M, 'canDelete', ctx.related, user, ctx.parentRecord, record)
      })
  }

  /**
   * Plan #13 polish — Restore factory for relation managers. POSTs to
   * `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/restore`,
   * success-styled, no confirm prompt. Auto-hides on live (non-trashed)
   * rows AND when `M.canRestore` (or related Resource fall-through)
   * denies. Drop into `recordActions([...])` from `RelationManager.table(table, ctx)`.
   */
  static relationRestore(
    M:        typeof RelationManager,
    ctx:      RelationManagerContext,
    recordId?: string,
  ): Action {
    const id = recordId ?? ':id'
    return Action.make('restore')
      .label('Restore')
      .color('success')
      .method('post')
      .action(`${ctx.basePath}/${ctx.parentSlug}/${ctx.parentId}/${ctx.relationship}/${id}/restore`)
      .visible(async ({ user, record }) => {
        if (!ctx.related?.softDeletes) return false
        if (!isTrashed(record, ctx.related as ResourceLike)) return false
        return safeManagerPolicy(M, 'canRestore', ctx.related, user, ctx.parentRecord, record)
      })
  }

  /**
   * Plan #13 polish — Force-delete factory for relation managers. POSTs
   * to `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/force-delete`,
   * destructive style with a permanence-aware confirmation. Auto-hides on
   * live (non-trashed) rows and when policy denies.
   */
  static relationForceDelete(
    M:        typeof RelationManager,
    ctx:      RelationManagerContext,
    recordId?: string,
  ): Action {
    const id = recordId ?? ':id'
    const singular = M.getLabelSingular().toLowerCase()
    return Action.make('forceDelete')
      .label('Delete forever')
      .destructive()
      .method('post')
      .action(`${ctx.basePath}/${ctx.parentSlug}/${ctx.parentId}/${ctx.relationship}/${id}/force-delete`)
      .confirm(`Permanently delete this ${singular}? This cannot be undone.`)
      .visible(async ({ user, record }) => {
        if (!ctx.related?.softDeletes) return false
        if (!isTrashed(record, ctx.related as ResourceLike)) return false
        return safeManagerPolicy(M, 'canForceDelete', ctx.related, user, ctx.parentRecord, record)
      })
  }

  // ─── Relation-manager replicate factories ─────────────────
  //
  // Sibling of `Action.replicate / bulkReplicate` scoped to a
  // RelationManager. Operates on the **related** Resource's model and
  // **forces** the parent attachment back onto the replica:
  //
  // - `hasMany` — re-stamps `<foreignKey> = ctx.parentId` from the
  //   parent's `static relations[name]` descriptor. Defends against a
  //   tampered POST body (or a source row loaded from a different
  //   parent's children) silently re-attaching the new row to a
  //   different parent.
  // - `morphMany` — re-stamps `<morphName>Id` + `<morphName>Type` via
  //   `computeMorphPayload(parentRecord, descriptor)`, same auto-fill
  //   the relation-create POST handler uses on the create form.
  // - M2M (`belongsToMany / morphToMany / morphedByMany`) — auto-hides.
  //   Replicate doesn't fit pivot semantics; users create the related
  //   record via its own Resource, then attach via `relationAttach`.
  // - `morphTo` — auto-hides. Child-side polymorphic relations don't
  //   have a single owner to pin to (the row's existing morph cols
  //   already point somewhere; cloning is the user's job, not ours).
  //
  // Both factories dispatch through the manager-scoped
  // `_action/:actionName` route already wired in `routes.ts`. The route
  // resolves `ctx.record` (and `ctx.records` for bulk) via
  // `Related.model.find(id)`, and stamps `ctx.relation = { parent,
  // parentId, relationship }` so the handlers can read the live parent
  // without re-loading.
  //
  // Visibility delegates to `safeManagerPolicy(M, 'canCreate', Related,
  // user, parentRecord)` — the manager's `canCreate` (when overridden)
  // wins, otherwise falls through to the related Resource's `canCreate`.

  /**
   * Relation row-replicate factory. Clones the row's child record
   * inside the manager's parent scope.
   *
   * Strips the related model's primary key, soft-delete column, and
   * `opts.excludeAttributes`. Re-applies the parent attachment columns
   * after the strip + before the optional `beforeReplicaSaved` hook,
   * so user code can still mutate non-FK fields without accidentally
   * unlinking the replica.
   *
   * On success the manager-scoped route falls back to the manager
   * list URL (`${base}/${parentSlug}/${parentId}/${relationship}`)
   * because no explicit `redirect` is returned — same default as the
   * other handler-style relation factories.
   *
   * `recordId` kept in the signature for parity with the rest of the
   * relation factory family. The dispatcher resolves the source row
   * from the request body, so it isn't referenced here.
   */
  static relationReplicate(
    M:        typeof RelationManager,
    ctx:      RelationManagerContext,
    recordId?: string,
    opts:     ReplicateOptions = {},
  ): Action {
    void recordId
    return Action.make('relationReplicate')
      .label('Replicate')
      .row()
      .handler(async (hctx) => {
        const result = await runRelationReplicateRow(M, ctx, hctx, opts)
        return result
      })
      .visible(({ user }) => {
        if (isM2MMode(ctx.mode) || ctx.mode === 'morphTo') return false
        return safeManagerPolicy(M, 'canCreate', ctx.related, user, ctx.parentRecord)
      })
  }

  /**
   * Bulk sibling — replicates every selected child row inside the
   * manager's parent scope. Same strip + force-pin pipeline applied
   * per row. Per-row `safeManagerPolicy(M, 'canCreate', …)` runs
   * inside the loop so a partially-permitted selection still proceeds
   * for the rows that pass. Rows that throw are skipped silently —
   * the toast count reflects only successful creates.
   */
  static relationBulkReplicate(
    M:    typeof RelationManager,
    ctx:  RelationManagerContext,
    opts: ReplicateOptions = {},
  ): Action {
    return Action.make('relationBulkReplicate')
      .label('Replicate selected')
      .bulk()
      .confirm(`Replicate the selected ${M.getLabel().toLowerCase()}?`)
      .handler(async (hctx) => {
        const Related = ctx.related
        if (!Related?.model || typeof Related.model.create !== 'function') {
          return { notify: { title: 'Replicate not configured (related Resource has no model.create)', type: 'error' } as never }
        }
        const records = hctx.records ?? []
        let n = 0
        for (const source of records) {
          if (!source || typeof source !== 'object') continue
          const allowed = await safeManagerPolicy(M, 'canCreate', Related, hctx.user, ctx.parentRecord)
          if (!allowed) continue
          try {
            await persistRelationReplica(M, ctx, source, opts)
            n++
          } catch { /* skip — agg notify shows total */ }
        }
        const labelPlural = M.getLabel().toLowerCase()
        const labelSingular = M.getLabelSingular().toLowerCase()
        return {
          notify: {
            title: `${n} ${n === 1 ? labelSingular : labelPlural} replicated`,
            type:  'success',
          } as never,
        }
      })
      .visible(({ user }) => {
        if (isM2MMode(ctx.mode) || ctx.mode === 'morphTo') return false
        return safeManagerPolicy(M, 'canCreate', ctx.related, user, ctx.parentRecord)
      })
  }

  // ─── M2M relation factories ───────────────────────────────
  //
  // Sibling of `relationCreate / Edit / Delete` for every M2M mode
  // (`belongsToMany`, `morphToMany` (owning polymorphic side),
  // `morphedByMany` (inverse polymorphic side)). All three modes share
  // the same `attach` / `detach` / `sync` accessor surface — the rudder
  // ORM stamps + filters the polymorphic discriminator on the morph
  // variants automatically, so pilotiq's pivot factories are mode-agnostic
  // beyond the visibility gate.
  //
  // Three factories: `relationAttach` (header, modal-form picker →
  // POST `_action/relationAttach`), `relationDetach` (row, direct POST
  // to `_detach/:childId`), `relationBulkDetach` (bulk, handler-
  // dispatched). The first and third route through the manager-scoped
  // `_action/:actionName` endpoint (added in routes.ts) so handlers
  // see `ctx.relation = { parent, parentId, relationship }`.
  //
  // All three auto-hide outside any M2M mode so dropping a factory into
  // a non-M2M manager is a no-op (visible=false) instead of a confusing
  // 404.

  /** Header-placement attach factory — opens a modal with a SelectField
   *  listing related records that aren't already attached, and POSTs the
   *  selected id to the manager's `_action/relationAttach` endpoint.
   *
   *  Visibility delegates to `M.canAttach(user, parentRecord)` AND
   *  guards against being dropped into a non-M2M manager. */
  static relationAttach(
    M:   typeof RelationManager,
    ctx: RelationManagerContext,
  ): Action {
    const labelSingular = M.getLabelSingular()
    const a = Action.make('relationAttach')
      .label(`Attach ${labelSingular}`)
      .header()
      .modalHeading(`Attach ${labelSingular}`)
      .modalSubmitLabel('Attach')
      .modalCancelLabel('Cancel')
      .handler(async (hctx) => {
        const rel = hctx.relation
        if (!rel) {
          return { notify: { title: 'Attach handler missing parent context — manager-scoped _action route not wired', type: 'error' } as never }
        }
        const Related = ctx.related
        if (!Related?.model) {
          return { notify: { title: 'Cannot attach: related Resource has no model', type: 'error' } as never }
        }
        const idStr = String((hctx.values?.['_attachId'] as unknown) ?? '')
        if (idStr.length === 0) {
          return { notify: { title: 'Pick a record to attach', type: 'error' } as never }
        }
        const accessor = resolveM2MAccessor(rel.parent, rel.relationship)
        if (!accessor || typeof accessor.attach !== 'function') {
          return { notify: { title: `Pivot accessor missing on ${rel.relationship} — wrong relation type or ORM version?`, type: 'error' } as never }
        }
        try {
          await accessor.attach([idStr])
        } catch (err) {
          return { notify: { title: `Attach failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' } as never }
        }
        return { notify: { title: `${labelSingular} attached`, type: 'success' } as never }
      })
      .visible(({ user }) => {
        if (!isM2MMode(ctx.mode)) return false
        return safeManagerPolicy(M, 'canAttach', ctx.related, user, ctx.parentRecord)
      })

    // Build the modal-form schema only when this is actually an M2M
    // manager — non-M2M drops keep the action hidden via the visibility
    // predicate, but still need a schema-less Action so the meta walker
    // doesn't blow up. Static import is fine: `attachFactory` only
    // depends on `SelectField` + ORM helpers, no cycle back to Action.
    if (isM2MMode(ctx.mode) && ctx.related?.model) {
      a.schema(buildAttachModalSchema({
        Related:         ctx.related,
        relationship:    ctx.relationship,
        recordTitleAttr: M.getRecordTitleAttribute() ?? ctx.related.recordTitleAttribute,
        labelSingular,
      }))
    }
    return a
  }

  /** Row-placement detach factory — POSTs to
   *  `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/_detach`,
   *  destructive style with a confirmation prompt that says "Detach"
   *  (not "Delete") so users understand the target record stays.
   *  Visibility delegates to `M.canDetach`. */
  static relationDetach(
    M:        typeof RelationManager,
    ctx:      RelationManagerContext,
    recordId?: string,
  ): Action {
    const id = recordId ?? ':id'
    const singular = M.getLabelSingular().toLowerCase()
    return Action.make('relationDetach')
      .label('Detach')
      .destructive()
      .method('post')
      .action(`${ctx.basePath}/${ctx.parentSlug}/${ctx.parentId}/${ctx.relationship}/${id}/_detach`)
      .confirm(`Detach this ${singular}? The ${singular} record stays in place; only the link is removed.`)
      .visible(async ({ user, record }) => {
        if (!isM2MMode(ctx.mode)) return false
        return safeManagerPolicy(M, 'canDetach', ctx.related, user, ctx.parentRecord, record)
      })
  }

  /** Bulk-placement bulk-detach factory — handler-dispatched. Calls
   *  `parent.related(rel).detach(ids)` for the selected rows. Visibility
   *  delegates to `M.canAttach` (acts like a "manager admin" gate; we
   *  intentionally don't enforce per-row `canDetach` on the visibility
   *  side because the bulk button needs to be visible before the user
   *  has selected anything — per-row gating happens inside the handler). */
  static relationBulkDetach(
    M:   typeof RelationManager,
    ctx: RelationManagerContext,
  ): Action {
    const labelPlural = M.getLabel().toLowerCase()
    return Action.make('relationBulkDetach')
      .label('Detach selected')
      .destructive()
      .bulk()
      .confirm(`Detach the selected ${labelPlural}? The records stay in place; only the links are removed.`)
      .handler(async (hctx) => {
        const rel = hctx.relation
        if (!rel) {
          return { notify: { title: 'Bulk-detach handler missing parent context — manager-scoped _action route not wired', type: 'error' } as never }
        }
        const records = hctx.records ?? []
        const ids: string[] = []
        for (const r of records) {
          const id = String((r as { id?: unknown }).id ?? '')
          if (!id) continue
          const allowed = await safeManagerPolicy(M, 'canDetach', ctx.related, hctx.user, ctx.parentRecord, r)
          if (!allowed) continue
          ids.push(id)
        }
        if (ids.length === 0) {
          return { notify: { title: 'Nothing to detach (no permitted rows)', type: 'warning' } as never }
        }
        const accessor = resolveM2MAccessor(rel.parent, rel.relationship)
        if (!accessor || typeof accessor.detach !== 'function') {
          return { notify: { title: `Pivot accessor missing on ${rel.relationship} — wrong relation type or ORM version?`, type: 'error' } as never }
        }
        try {
          await accessor.detach(ids)
        } catch (err) {
          return { notify: { title: `Bulk detach failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' } as never }
        }
        return { notify: { title: `${ids.length} ${labelPlural} detached`, type: 'success' } as never }
      })
      .visible(({ user }) => {
        if (!isM2MMode(ctx.mode)) return false
        // Bulk gate uses canAttach as a stand-in for "manager admin" —
        // per-row canDetach is enforced inside the handler.
        return safeManagerPolicy(M, 'canAttach', ctx.related, user, ctx.parentRecord)
      })
  }

  label(l: string): this { this._label = l; return this }
  icon(i: string): this  { this._icon  = i; return this }

  // ─── Placement ────────────────────────────────────────

  placement(p: ActionPlacement): this { this._placement = p; return this }
  inline(): this { return this.placement('inline') }
  row(): this    { return this.placement('row') }
  bulk(): this   { return this.placement('bulk') }
  header(): this { return this.placement('header') }

  // ─── Behavior ─────────────────────────────────────────

  destructive(v = true): this {
    this._destructive = v
    if (v && this._color === undefined) this._color = 'destructive'
    return this
  }

  /** Set the visual color. `destructive` is also set by `.destructive()`. */
  color(c: ActionColor): this { this._color = c; return this }

  /** Set the size preset (sm | md | lg). Default is `md`. */
  size(s: ActionSize): this { this._size = s; return this }

  /** Hover tooltip. Wraps the button in a Tooltip primitive. */
  tooltip(t: string): this { this._tooltip = t; return this }

  /** Outlined trigger style — border + transparent bg instead of solid color. */
  outlined(v = true): this { this._outlined = v; return this }

  /** Icon-only trigger style. Renders a square button with just the icon;
   * the label is used as `aria-label`. Requires `.icon()` to be set. */
  iconButton(v = true): this { this._iconOnly = v; return this }

  /** Show a small badge on the trigger (e.g. unread count). */
  badge(value: string | number): this { this._badge = value; return this }

  /** Optional color class for the badge (e.g. 'bg-emerald-500'). */
  badgeColor(c: string): this { this._badgeColor = c; return this }

  // ─── Conditional visibility / disabled ───────────────

  /** Show the action only when `rule` is truthy. Pair with a function for
   * record-aware visibility (e.g. `({ record }) => !record.archived`).
   * Row-placement actions are evaluated per-row at table-load time;
   * other placements are evaluated at schema-resolve time with the
   * page-level context. */
  visible(rule: VisibilityRule): this { this._visible = rule; return this }

  /** Inverse of `visible` — hide the action when `rule` is truthy.
   * Both rules combine via AND: visible if `visible !== false` AND
   * `hidden !== true`. */
  hidden(rule: VisibilityRule): this { this._hidden = rule; return this }

  /** Disable (render greyed-out and skip dispatch) when `rule` is truthy.
   * Disabled actions still appear in the UI, unlike hidden ones. */
  disabled(rule: VisibilityRule): this { this._isDisabled = rule; return this }

  /** Policy-style alias for `.visible(fn)` — semantically identical
   * but reads better when guarding by user permissions. */
  authorize(rule: VisibilityRule): this { return this.visible(rule) }

  /** Evaluate the visibility / disabled rules with the given context.
   * Defaults: visible = true, disabled = false. Both `visible` and
   * `hidden` are folded in: `visible: visible !== false && hidden !== true`.
   *
   * Async to support Plan #10 — visibility rules can return Promise<bool>
   * (for `Resource.canX(user, record)` integration). Throwing rules are
   * treated as fail-closed (`visible: false` / `disabled: true`). */
  async evaluate(ctx: ActionVisibilityContext = {}): Promise<{ visible: boolean; disabled: boolean }> {
    const evalRule = async (rule: VisibilityRule | undefined, fallback: boolean): Promise<boolean> => {
      if (rule === undefined) return fallback
      if (typeof rule !== 'function') return rule
      try {
        return await rule(ctx)
      } catch {
        // Fail closed — a throwing rule shouldn't accidentally show a
        // destructive action.
        return !fallback
      }
    }
    const [visibleRaw, hiddenRaw, disabledRaw] = await Promise.all([
      evalRule(this._visible, true),
      evalRule(this._hidden, false),
      evalRule(this._isDisabled, false),
    ])
    return {
      visible:  visibleRaw && !hiddenRaw,
      disabled: disabledRaw,
    }
  }

  /** True when any visibility / hidden / disabled rule is set. Useful for
   * the resolver to know whether per-row evaluation is needed for a
   * row-placement action. */
  hasVisibilityRules(): boolean {
    return this._visible !== undefined || this._hidden !== undefined || this._isDisabled !== undefined
  }

  /**
   * Prompt the user before running the handler. Pass a string for a simple
   * "are you sure?" message, or an object for full control.
   */
  confirm(prompt: string | ActionConfirm): this {
    this._confirm = typeof prompt === 'string' ? { message: prompt } : prompt
    return this
  }

  /** Server-side handler. Stored in Phase 1; dispatched in Phase 2. */
  handler(fn: ActionHandler): this { this._handler = fn; return this }

  // ─── Modal / form-modal action ────────────────────────

  /**
   * Attach a form schema that opens in a modal Dialog when the action is
   * triggered. The submitted values flow through validation + coercion
   * server-side and arrive on the handler's `ctx.values`. Triggers modal
   * chrome (heading / submit button / cancel button) if not configured
   * via the other modal builders below.
   */
  schema(elements: Element[]): this {
    this._children = elements
    this._hasModal = true
    return this
  }

  modalHeading(s: string): this     { this._modalHeading = s;     this._hasModal = true; return this }
  modalDescription(s: string): this { this._modalDescription = s; this._hasModal = true; return this }
  modalSubmitLabel(s: string): this { this._modalSubmitLabel = s; this._hasModal = true; return this }
  modalCancelLabel(s: string): this { this._modalCancelLabel = s; this._hasModal = true; return this }
  modalIcon(i: string): this        { this._modalIcon = i;        this._hasModal = true; return this }
  modalWidth(w: ActionModalWidth): this { this._modalWidth = w;   this._hasModal = true; return this }
  slideOver(v = true): this         { this._slideOver = v;        this._hasModal = true; return this }

  // ─── Link / form modes ────────────────────────────────

  /**
   * Render this action as a link to `url`. Mutually exclusive with
   * `.method()` — setting `href` clears any prior method/action URL.
   */
  href(url: string): this {
    this._href = url
    delete this._method
    delete this._actionUrl
    return this
  }

  /**
   * Render this action as a form-style submit button using `method`. Pair
   * with `.action(url)` to set the form's action URL — falls back to the
   * current page URL otherwise.
   */
  method(m: ActionMethod): this {
    this._method = m
    delete this._href
    return this
  }

  /** Form action URL — only meaningful when `.method()` is set. */
  action(url: string): this {
    this._actionUrl = url
    delete this._href
    return this
  }

  /**
   * Render-time URL the client should POST to when invoking this
   * action's handler. Set by the route registrar — users don't normally
   * call this directly. Format: `${pageUrl}/_action/${action.name}`.
   */
  dispatchUrl(url: string): this {
    this._dispatchUrl = url
    return this
  }

  /**
   * Mark this action as the form-submit button for its enclosing
   * `<form>`. Renders as `<button type="submit">` and relies on the form
   * itself to carry `action` + `method`. Mutually exclusive with
   * `.href()` / `.method()` / handler-style.
   */
  submit(): this {
    this._submit = true
    delete this._href
    delete this._method
    delete this._actionUrl
    delete this._dispatchUrl
    return this
  }

  /**
   * Target a specific `<form id="">` when this is a submit action — uses
   * the HTML `form` attribute so the button can submit a form it doesn't
   * live inside. Required when the submit action sits in the page
   * header (outside the form's DOM subtree).
   */
  form(formId: string): this {
    this._formTarget = formId
    return this
  }

  /**
   * Attach a `name`+`value` pair to a submit button so it round-trips
   * through the form body when this specific button is clicked. Wires
   * the "Create & create another" pattern: the secondary submit posts
   * `{ _continueCreate: '1' }` and the server routes the redirect back
   * to the create page. Browsers natively only include the clicked
   * submit button's name/value in `FormData`; the FormRenderer threads
   * `event.submitter` into the `FormData` constructor to preserve that.
   */
  formField(name: string, value: string = '1'): this {
    this._formField = { name, value }
    return this
  }

  // ─── Getters ──────────────────────────────────────────

  getLabel():     string             { return this._label }
  getPlacement(): ActionPlacement    { return this._placement }
  isDestructive(): boolean           { return this._destructive }
  getHandler():     ActionHandler | undefined { return this._handler }
  getHref():        string | undefined        { return this._href }
  getMethod():      ActionMethod | undefined  { return this._method }
  getActionUrl():   string | undefined        { return this._actionUrl }
  getDispatchUrl(): string | undefined        { return this._dispatchUrl }
  isSubmit():       boolean                   { return this._submit }
  getFormTarget():  string | undefined        { return this._formTarget }
  getFormField():   { name: string; value: string } | undefined { return this._formField }
  hasModal():       boolean                   { return this._hasModal }
  /** Schema fields stored as children; `getChildren()` returns the same. */
  getSchema():      Element[]                 { return this._children ?? [] }
  getColor():       ActionColor | undefined   { return this._color }
  getSize():        ActionSize | undefined    { return this._size }
  getTooltip():     string | undefined        { return this._tooltip }
  isOutlined():     boolean                   { return this._outlined }
  isIconOnly():     boolean                   { return this._iconOnly }
  getBadge():       string | number | undefined { return this._badge }

  // ─── Element contract ────────────────────────────────

  getType(): string { return 'action' }

  override toMeta(): ActionMeta {
    const modal: ActionModalMeta | undefined = this._hasModal ? {
      ...(this._modalHeading      !== undefined ? { heading:     this._modalHeading      } : {}),
      ...(this._modalDescription  !== undefined ? { description: this._modalDescription  } : {}),
      ...(this._modalSubmitLabel  !== undefined ? { submitLabel: this._modalSubmitLabel  } : {}),
      ...(this._modalCancelLabel  !== undefined ? { cancelLabel: this._modalCancelLabel  } : {}),
      ...(this._modalIcon         !== undefined ? { icon:        this._modalIcon         } : {}),
      ...(this._modalWidth        !== undefined ? { width:       this._modalWidth        } : {}),
      ...(this._slideOver                       ? { slideOver:   true                    } : {}),
    } : undefined
    return {
      type:        'action',
      name:        this.name,
      label:       this._label,
      placement:   this._placement,
      destructive: this._destructive,
      ...(this._icon        ? { icon:        this._icon        } : {}),
      ...(this._confirm     ? { confirm:     this._confirm     } : {}),
      ...(this._href        ? { href:        this._href        } : {}),
      ...(this._method      ? { method:      this._method      } : {}),
      ...(this._actionUrl   ? { action:      this._actionUrl   } : {}),
      ...(this._dispatchUrl ? { dispatchUrl: this._dispatchUrl } : {}),
      ...(this._submit      ? { submit:      true              } : {}),
      ...(this._formTarget  ? { form:        this._formTarget  } : {}),
      ...(this._formField   ? { formField:   this._formField   } : {}),
      ...(modal             ? { modal                          } : {}),
      ...(this._color       ? { color:       this._color       } : {}),
      ...(this._size        ? { size:        this._size        } : {}),
      ...(this._tooltip     ? { tooltip:     this._tooltip     } : {}),
      ...(this._outlined    ? { outlined:    true              } : {}),
      ...(this._iconOnly    ? { iconOnly:    true              } : {}),
      ...(this._badge       !== undefined ? { badge:      this._badge      } : {}),
      ...(this._badgeColor  ? { badgeColor:  this._badgeColor  } : {}),
      ...(this.hasVisibilityRules() ? { conditional: true   } : {}),
    }
  }
}

/** Re-export for routes/dispatch consumers that need to type-narrow on
 * action validation failures. */
export type { ValidationErrors }
