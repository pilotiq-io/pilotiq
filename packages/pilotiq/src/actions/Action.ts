import { Element, type ElementMeta } from '../schema/Element.js'
import type { ValidationErrors } from '../validation/index.js'
import type { Notification, NotificationMeta } from '../notifications/Notification.js'
import type { RelationManager, RelationManagerContext } from '../RelationManager.js'
import { buildImportSchema as buildImportModalSchema } from './importFactory.js'
import { callPredicate } from './factoryHelpers.js'
import {
  createAction,
  deleteAction,
  editAction,
  forceDeleteAction,
  markAsReadAction,
  replicateAction,
  restoreAction,
  viewAction,
} from './crudFactories.js'
import {
  bulkDeleteAction,
  bulkForceDeleteAction,
  bulkReplicateAction,
  bulkRestoreAction,
} from './bulkFactories.js'
import {
  relationBulkReplicateAction,
  relationCreateAction,
  relationDeleteAction,
  relationEditAction,
  relationForceDeleteAction,
  relationReplicateAction,
  relationRestoreAction,
} from './relationFactories.js'
import {
  relationAttachAction,
  relationBulkDetachAction,
  relationDetachAction,
} from './m2mFactories.js'

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

/** Horizontal alignment applied to the modal's header / body / footer
 *  text. Matches Filament v5's `modalAlignment()` (start / center / end). */
export type ActionModalAlignment = 'start' | 'center' | 'end'

/** Color preset for the icon shown next to the modal heading. Mirrors
 *  `BadgeColor` so userspace doesn't have to learn another scale. */
export type ActionModalIconColor =
  | 'gray' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'

/** Context shape passed to `ReplicateOptions.getCreatedNotificationTitle`.
 *  Single-row factories (`replicate`, `relationReplicate`) populate
 *  `replica` (the just-created record returned by `M.create`) and
 *  `source` (the original row). Bulk factories (`bulkReplicate`,
 *  `relationBulkReplicate`) populate `count` (number of successful
 *  creates) and `records` (the original selected rows). The opposite
 *  fields are always undefined for the other call site so consumers
 *  can branch on whichever is set. */
export interface ReplicateNotificationContext {
  replica?: unknown
  source?:  unknown
  count?:   number
  records?: unknown[]
}

/** Context shape passed to `ReplicateOptions.getRedirectUrl`. Single-row
 *  factories only — bulk variants stay on the list / manager URL
 *  regardless. `replica` is the freshly-created record; `source` is
 *  the original. */
export interface ReplicateRedirectContext {
  replica: unknown
  source:  unknown
}

/** Options bag for `Action.replicate` and its three siblings
 *  (`bulkReplicate`, `relationReplicate`, `relationBulkReplicate`).
 *  Every field optional. */
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
  /** Override the success notification title. Single-row factories
   *  receive `{ replica, source }`; bulk factories receive
   *  `{ count, records }` (`replica`/`source` undefined). Return a
   *  string to use it; return `undefined` to fall back to the default
   *  (`"${labelSingular} replicated"` for single-row,
   *  `"${count} ${label(s)} replicated"` for bulk). Sync or async. */
  getCreatedNotificationTitle?: (
    ctx: ReplicateNotificationContext,
  ) => string | undefined | Promise<string | undefined>
  /** Override the redirect URL. Single-row factories only — bulk
   *  variants don't redirect. Receives `{ replica, source }`. Return a
   *  string to use it; return `undefined` to fall back to the default
   *  (the new record's edit page for `replicate`; the manager list
   *  URL for `relationReplicate`, owned by the route layer). Sync or
   *  async. */
  getRedirectUrl?: (
    ctx: ReplicateRedirectContext,
  ) => string | undefined | Promise<string | undefined>
}

/** Structural shape of a Resource class for the factory functions —
 * matches `Resource.ts` exactly but keeps Action.ts free of an import
 * cycle. The optional fields are the Plan #10 policy predicates; their
 * defaults (return `true`) mean missing methods are equivalent to
 * "always allowed." */
export interface ResourceLike {
  labelSingular: string
  /** Plural label. When unset, factories fall back to
   *  `${labelSingular}s` (naive). Used by bulk-action notification
   *  copy so "1 Post" / "5 Posts" render correctly. */
  label?: string
  getSlug(): string
  /** Cluster the resource belongs to, when registered via `Pilotiq.clusters`.
   *  Action factories thread the cluster slug into URL builders so
   *  `${basePath}/<cluster>/<slug>/...` round-trips correctly. */
  cluster?: { getSlug(): string }
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
   
  model?: any
  /** Resource table configurator. Export factory calls
   *  `R.table(Table.make())` to discover columns + the records handler
   *  for the "filtered" / "all" scope. */
   
  table?(t: any): any
}

/** Lazy-load the `Table` class for use inside Action handlers. Direct
 *  module-level import would cycle (Table → Action → Table); dynamic
 *  import inside a handler runs after both modules have finished
 *  loading. Cached after first call so we don't pay the import cost
 *  on every dispatched export. */
 
let _TableClass: any | undefined
async function loadTableClass(): Promise<unknown> {
  if (_TableClass !== undefined) return _TableClass.make()
  const mod = await import('../elements/Table.js')
  _TableClass = mod.Table
  return _TableClass.make()
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
  /** Color preset applied to the heading icon (`modalIconColor()`).
   *  Renderer maps to a tailwind text-color class. */
  iconColor?:   ActionModalIconColor
  width?:       ActionModalWidth
  slideOver?:   boolean
  /** Default `true`; emitted only when the user passed `false`. The
   *  renderer turns this into Base UI's `disablePointerDismissal`. */
  closeByClickingAway?: boolean
  /** Default `true`; emitted only when `false`. Renderer cancels the
   *  Base UI `onOpenChange` event when reason is `'escapeKey'`. */
  closeByEscaping?:     boolean
  /** Sticky header inside a scrolling modal body. Default `false`. */
  stickyHeader?:        boolean
  /** Sticky footer inside a scrolling modal body. Default `false`. */
  stickyFooter?:        boolean
  /** Override the default autofocus behaviour. When `false` no element
   *  inside the modal receives focus on mount; when `true` the renderer
   *  focuses the first form input (or the submit button when there is
   *  no form). When omitted, the legacy default applies (the submit
   *  button autofocuses for confirm-only modals). */
  autofocus?:           boolean
  /** Horizontal alignment for the heading / body / footer text. */
  alignment?:           ActionModalAlignment
  /** When `true`, an X close-button renders in the top-right of the
   *  popup. Default `false`. */
  closeButton?:         boolean
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
  /** Resolved Elements stamped by `resolveSchema` after `toMeta()` when
   *  `.modalContentFooter([…])` was called. Renderer mounts them between
   *  the form body and the Cancel/Submit footer — useful for an inline
   *  Alert, summary text, or auxiliary Action that lives alongside the
   *  primary submit. Mirrors `Section.afterHeader`'s parallel-slot
   *  pattern; not populated when the setter wasn't used. */
  modalContentFooter?: Array<Record<string, unknown>>
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
  /**
   * Notification-registry handler key — set by `.handler(string)`. The
   * notification-action route looks this up against
   * `Pilotiq.notificationHandlers({…})` at request time. Mutually
   * exclusive with the closure `_handler` — passing a string clears
   * `_handler`, passing a function clears `_handlerName`. Closures can't
   * round-trip through a `data` JSON column; the registry path is the
   * persisted-notification escape hatch.
   */
  protected _handlerName?: string
  /**
   * Per-fire context for registry-handler dispatch. Round-trips through
   * the notification's `data.actions` JSON column verbatim and arrives
   * on the handler's `ctx.payload`.
   */
  protected _payload?: Record<string, unknown>
  /**
   * Filament-style chain modifier — when set on an action used inside a
   * `Notification.actions([…])` slot, firing the action also flips the
   * notification's `read_at`. No-op when the action isn't in a
   * notification context.
   */
  protected _markAsReadOnFire = false
  /**
   * When set, click-through opens in a new tab. Honored by the
   * notification action strip renderers (bell + toast); ignored by
   * everything else (Resource action triggers don't expose this knob —
   * use `target` on the underlying anchor if you need it elsewhere).
   */
  protected _openUrlInNewTab = false
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
  protected _modalIconColor?: ActionModalIconColor
  protected _modalWidth?: ActionModalWidth
  protected _slideOver = false
  // Defaults match the existing renderer behaviour (closeable both ways,
  // no sticky chrome, no X button). Setters with a default arg of `false`
  // / `true` mirror Filament's call shapes — `closeModalByClickingAway()`
  // disables pointer dismiss, `stickyModalHeader()` enables sticky.
  protected _closeModalByClickingAway = true
  protected _closeModalByEscaping     = true
  protected _stickyModalHeader        = false
  protected _stickyModalFooter        = false
  protected _modalAutofocus?: boolean
  protected _modalAlignment?: ActionModalAlignment
  protected _modalCloseButton         = false
  // Filament v5 — auxiliary Elements rendered between the modal body
  // and the Cancel/Submit footer. Resolved by `resolveSchema` after
  // `toMeta()` (parallel-slot pattern, mirrors `Section.afterHeader`).
  protected _modalContentFooter?: Element[]

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
    return this.configured(new Action(name))
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
    return createAction(R, basePath)
  }

  /**
   * Edit-action factory — link to the resource's edit page.
   *
   * Pass `recordId` when building actions for a single-record context
   * (e.g. `ViewPage.getActions()`); the URL is baked at config time.
   * Omit `recordId` for row context (`Table.recordActions(...)`); the
   * URL keeps the `:id` template and the renderer substitutes per-row.
   *
   * Auto-hides when `R.canEdit(user, record)` returns false.
   */
  static edit(R: ResourceLike, basePath: string, recordId?: string): Action {
    return editAction(R, basePath, recordId)
  }

  /** View-action factory — link to the resource's view page. See `Action.edit` for the `recordId` semantics.
   * Auto-hides when `R.canView(user, record)` returns false. */
  static view(R: ResourceLike, basePath: string, recordId?: string): Action {
    return viewAction(R, basePath, recordId)
  }

  /**
   * Delete-action factory — POSTs to the resource's delete route,
   * destructive style, with a confirmation prompt referencing the
   * resource label. Same `recordId` semantics as `Action.edit`.
   * Auto-hides when `R.canDelete(user, record)` returns false.
   *
   * Plan #13 — when `R.softDeletes = true`, additionally hides on
   * already-trashed rows (Restore + ForceDelete take over).
   */
  static delete(R: ResourceLike, basePath: string, recordId?: string): Action {
    return deleteAction(R, basePath, recordId)
  }

  /**
   * Replicate-action factory — handler-style. Strips PK + soft-delete
   * column + `opts.excludeAttributes` from `ctx.record`, optionally
   * runs `opts.beforeReplicaSaved`, and creates a new row via
   * `R.model.create(...)`. Redirects to the new record's edit page
   * on success. Auto-hides when `R.canCreate(user)` returns false.
   */
  static replicate(
    R:        ResourceLike,
    basePath: string,
    recordId?: string,
    opts:     ReplicateOptions = {},
  ): Action {
    return replicateAction(R, basePath, recordId, opts)
  }

  /**
   * Plan #13 — Restore factory. POSTs to the resource's restore route,
   * success-styled, no confirm prompt. Auto-hides on live (non-trashed)
   * rows AND when `R.canRestore(user, record)` returns false.
   */
  static restore(R: ResourceLike, basePath: string, recordId?: string): Action {
    return restoreAction(R, basePath, recordId)
  }

  /**
   * Plan #13 — Force-delete factory. POSTs to the resource's
   * force-delete route, destructive-styled, with a stricter confirm
   * prompt. Auto-hides on live rows + when `R.canForceDelete` denies.
   */
  static forceDelete(R: ResourceLike, basePath: string, recordId?: string): Action {
    return forceDeleteAction(R, basePath, recordId)
  }

  // ─── Notification factories ───────────────────────────────────
  //
  // Pre-configured Action shapes that target the bell-table read /
  // unread endpoints mounted by `Pilotiq.databaseNotifications()`. Use
  // inside a custom notification inbox page's `recordActions(...)` (or
  // alongside a `Notification.actions([…])` slot when one ships) to
  // give end-users explicit "Mark as read" / "Mark as unread" buttons.
  //
  // Filament-style chain modifier `Action::make('view')->markAsRead()`
  // is a separate concern — it'd add an implicit mark-read side-effect
  // to a custom action. v1 ships only the explicit factory; the chain
  // modifier is deferred until a consumer asks.

  /**
   * Mark-as-read factory — POSTs to the panel's notification read
   * endpoint for the given notification id. The endpoint
   * (`${base}/_notifications/:id/read`) is mounted by
   * `Pilotiq.databaseNotifications()`, so calling this without
   * opting into the bell surface produces an Action whose POST 404s.
   *
   * `notificationId` is baked at config time. For row context where
   * the id varies per row, omit it and the URL keeps the `:id`
   * template; the renderer substitutes per-row at render time
   * (parallel to `Action.edit`'s row form).
   *
   * No auto-visibility. Wrap in `.visible(({ record }) => !record.readAt)`
   * to hide on already-read rows.
   */
  static markAsRead(basePath: string, notificationId?: string): Action {
    return markAsReadAction(basePath, notificationId)
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
   *  `deletedAt`. */
  static bulkDelete(R: ResourceLike, _basePath: string): Action {
    return bulkDeleteAction(R, _basePath)
  }

  /** Bulk restore — calls `R.model.restore(id)` per row. */
  static bulkRestore(R: ResourceLike, _basePath: string): Action {
    return bulkRestoreAction(R, _basePath)
  }

  /** Bulk force-delete — calls `R.model.forceDelete(id)` per row. */
  static bulkForceDelete(R: ResourceLike, _basePath: string): Action {
    return bulkForceDeleteAction(R, _basePath)
  }

  /**
   * Bulk replicate — calls `R.model.create(...)` once per selected row
   * with the source row's attributes minus PK / soft-delete column /
   * `opts.excludeAttributes`. Sibling of `Action.replicate`.
   */
  static bulkReplicate(
    R:        ResourceLike,
    _basePath: string,
    opts:     ReplicateOptions = {},
  ): Action {
    return bulkReplicateAction(R, _basePath, opts)
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
   * Visibility delegates to `M.canCreate(user, parentRecord)` with
   * fall-through to the related Resource's `canCreate(user)`.
   */
  static relationCreate(
    M:   typeof RelationManager,
    ctx: RelationManagerContext,
  ): Action {
    return relationCreateAction(M, ctx)
  }

  /** Relation edit-action factory — link to
   * `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/edit`.
   */
  static relationEdit(
    M:        typeof RelationManager,
    ctx:      RelationManagerContext,
    recordId?: string,
  ): Action {
    return relationEditAction(M, ctx, recordId)
  }

  /** Relation delete-action factory — POST to
   * `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/delete`.
   */
  static relationDelete(
    M:        typeof RelationManager,
    ctx:      RelationManagerContext,
    recordId?: string,
  ): Action {
    return relationDeleteAction(M, ctx, recordId)
  }

  /**
   * Plan #13 polish — Restore factory for relation managers. POSTs to
   * the relation-restore route. Auto-hides on live rows + policy denies.
   */
  static relationRestore(
    M:        typeof RelationManager,
    ctx:      RelationManagerContext,
    recordId?: string,
  ): Action {
    return relationRestoreAction(M, ctx, recordId)
  }

  /**
   * Plan #13 polish — Force-delete factory for relation managers.
   */
  static relationForceDelete(
    M:        typeof RelationManager,
    ctx:      RelationManagerContext,
    recordId?: string,
  ): Action {
    return relationForceDeleteAction(M, ctx, recordId)
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
   * inside the manager's parent scope. Strips PK + soft-delete column
   * + `opts.excludeAttributes`, then force-pins the parent attachment
   * columns before optional `beforeReplicaSaved` runs.
   */
  static relationReplicate(
    M:        typeof RelationManager,
    ctx:      RelationManagerContext,
    recordId?: string,
    opts:     ReplicateOptions = {},
  ): Action {
    return relationReplicateAction(M, ctx, recordId, opts)
  }

  /**
   * Bulk sibling — replicates every selected child row inside the
   * manager's parent scope. Same strip + force-pin pipeline per row.
   */
  static relationBulkReplicate(
    M:    typeof RelationManager,
    ctx:  RelationManagerContext,
    opts: ReplicateOptions = {},
  ): Action {
    return relationBulkReplicateAction(M, ctx, opts)
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
   *  Visibility delegates to `M.canAttach(user, parentRecord)` AND
   *  guards against being dropped into a non-M2M manager. */
  static relationAttach(
    M:   typeof RelationManager,
    ctx: RelationManagerContext,
  ): Action {
    return relationAttachAction(M, ctx)
  }

  /** Row-placement detach factory — POSTs to
   *  `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/_detach`,
   *  destructive style with a "Detach" confirmation. */
  static relationDetach(
    M:        typeof RelationManager,
    ctx:      RelationManagerContext,
    recordId?: string,
  ): Action {
    return relationDetachAction(M, ctx, recordId)
  }

  /** Bulk-placement bulk-detach factory — handler-dispatched. Calls
   *  `parent.related(rel).detach(ids)` for the selected rows. */
  static relationBulkDetach(
    M:   typeof RelationManager,
    ctx: RelationManagerContext,
  ): Action {
    return relationBulkDetachAction(M, ctx)
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

  /**
   * Server-side handler. Two shapes:
   *
   * - **Closure** — `handler(async ctx => …)`. Dispatched against the
   *   current page's `_action/:name` endpoint. Closures don't survive
   *   serialization, so they can't ride a persisted notification —
   *   `Notification.toDatabase()` rejects them with a clear error.
   *
   * - **Registry key** — `handler('archive-project')`. Looked up against
   *   `Pilotiq.notificationHandlers({…})` at request time. Round-trips
   *   through a `Notification`'s `data.actions` JSON column, so this is
   *   the path to take when an action lives on a row that may be
   *   clicked days later.
   *
   * Mutually exclusive — setting one clears the other.
   */
  handler(fnOrName: ActionHandler | string): this {
    if (typeof fnOrName === 'string') {
      this._handlerName = fnOrName
      delete this._handler
    } else {
      this._handler = fnOrName
      delete this._handlerName
    }
    return this
  }

  /**
   * Per-fire context for registry-handler dispatch. JSON-serializable
   * keys only — values flow through the notification's `data.actions`
   * column and arrive on the handler's `ctx.payload`.
   *
   *   Action.make('archive')
   *     .handler('archive-project')
   *     .payload({ projectId: 123 })
   */
  payload(data: Record<string, unknown>): this {
    this._payload = data
    return this
  }

  /**
   * Filament-style chain modifier — when this action lives inside a
   * `Notification.actions([…])` slot, firing it also flips the
   * notification's `read_at`. No-op for actions used outside the
   * notification context (Resource actions, etc).
   *
   *   Action.make('view').url('/projects/123').markAsRead()
   *
   * On url/post actions the bell client fires the read POST as a
   * client-side side-effect *before* navigating/submitting; on
   * registry-handler actions the route flips `read_at` server-side
   * after the handler runs (one round-trip, not two).
   */
  markAsRead(v = true): this {
    this._markAsReadOnFire = v
    return this
  }

  /**
   * Open the action's url in a new tab. Honored by the notification
   * action-strip renderers; equivalent to `target="_blank"` on the
   * underlying anchor.
   */
  openUrlInNewTab(v = true): this {
    this._openUrlInNewTab = v
    return this
  }

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
  /** Filament v5 alias for `modalSubmitLabel`. Reads more naturally
   *  alongside `modalCancelActionLabel` when both are set. */
  modalSubmitActionLabel(s: string): this { return this.modalSubmitLabel(s) }
  /** Filament v5 alias for `modalCancelLabel`. */
  modalCancelActionLabel(s: string): this { return this.modalCancelLabel(s) }
  modalIcon(i: string): this        { this._modalIcon = i;        this._hasModal = true; return this }
  modalIconColor(c: ActionModalIconColor): this {
    this._modalIconColor = c
    this._hasModal       = true
    return this
  }
  modalWidth(w: ActionModalWidth): this { this._modalWidth = w;   this._hasModal = true; return this }
  modalAlignment(a: ActionModalAlignment): this {
    this._modalAlignment = a
    this._hasModal       = true
    return this
  }
  slideOver(v = true): this         { this._slideOver = v;        this._hasModal = true; return this }

  /**
   * Disable / re-enable closing the modal by clicking outside the popup.
   * Default: enabled. Calling without an arg disables (matches Filament's
   * `->closeModalByClickingAway(false)` shape — most uses are to gate
   * accidental dismissal of important modals).
   */
  closeModalByClickingAway(v: boolean = false): this {
    this._closeModalByClickingAway = v
    this._hasModal                 = true
    return this
  }

  /**
   * Disable / re-enable closing the modal with the Escape key. Default:
   * enabled. Same shape as `closeModalByClickingAway`. Useful when a
   * partially-completed multi-step modal would lose work on a stray Esc.
   */
  closeModalByEscaping(v: boolean = false): this {
    this._closeModalByEscaping = v
    this._hasModal             = true
    return this
  }

  /** Sticky header inside the modal body. Useful when the body scrolls
   *  past the heading on long forms. Default: off. */
  stickyModalHeader(v: boolean = true): this {
    this._stickyModalHeader = v
    this._hasModal          = true
    return this
  }

  /** Sticky footer inside the modal body. Pairs naturally with
   *  `stickyModalHeader` on long forms — keeps the Submit / Cancel
   *  buttons visible while the user scrolls. Default: off. */
  stickyModalFooter(v: boolean = true): this {
    this._stickyModalFooter = v
    this._hasModal          = true
    return this
  }

  /**
   * Override the default autofocus behaviour. `true` focuses the first
   * form input on mount (or the submit button when there is no form);
   * `false` disables autofocus entirely. Omit to keep the legacy default
   * (submit button autofocuses for confirm-only modals).
   */
  modalAutofocus(v: boolean = true): this {
    this._modalAutofocus = v
    this._hasModal       = true
    return this
  }

  /** Render an X close button in the top-right corner of the popup.
   *  Default: off (the Cancel button in the footer is the documented
   *  affordance). Useful for slide-over panels where the footer is
   *  far from the top of the viewport. */
  modalCloseButton(v: boolean = true): this {
    this._modalCloseButton = v
    this._hasModal         = true
    return this
  }

  /**
   * Auxiliary Elements rendered between the modal body and the
   * Cancel/Submit footer. Useful for an inline `Alert` summarising
   * the consequence of the action, supplemental `Text` / `Heading`,
   * or a secondary `Action` (e.g. a "Learn more" link) that sits
   * alongside the primary submit. Resolved through the standard
   * walker so any `.visible() / .disabled()` rules on inner Actions
   * evaluate the same way as anywhere else.
   *
   * Mirrors `Section.afterHeader([Action…])`'s parallel-slot pattern;
   * unlike `afterHeader`, this slot accepts any Element type since
   * non-Action chrome (alerts, copy) is the documented use case in
   * Filament v5's `modalContentFooter` API.
   */
  modalContentFooter(elements: Element[]): this {
    this._modalContentFooter = elements
    this._hasModal           = true
    return this
  }

  /** Read-only accessor used by `resolveSchema` to walk the slot. */
  getModalContentFooter(): Element[] | undefined { return this._modalContentFooter }

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
   * Sugar alias for `.href(url)` — matches Filament's `->url(...)` API
   * and reads more naturally inside `Notification.actions([…])`.
   */
  url(href: string): this { return this.href(href) }

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
  /** Registry key set by `.handler(string)`; undefined when the handler
   *  is a closure (or unset). Mutually exclusive with `getHandler()`. */
  getHandlerName(): string | undefined        { return this._handlerName }
  /** Per-fire context set by `.payload({…})`. Empty `{}` when unset
   *  (callers can spread without a null check). */
  getPayload():     Record<string, unknown>   { return this._payload ?? {} }
  /** Filament chain modifier — true when `.markAsRead()` was called.
   *  Read by `Notification.actions([…])` serializer; ignored elsewhere. */
  isMarkAsReadOnFire(): boolean               { return this._markAsReadOnFire }
  /** Honored by the notification action-strip renderers; equivalent to
   *  `target="_blank"` on the underlying anchor. */
  isOpenUrlInNewTab():  boolean               { return this._openUrlInNewTab }
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
  getIcon():        string | undefined        { return this._icon }
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
      ...(this._modalIconColor    !== undefined ? { iconColor:   this._modalIconColor    } : {}),
      ...(this._modalWidth        !== undefined ? { width:       this._modalWidth        } : {}),
      ...(this._modalAlignment    !== undefined ? { alignment:   this._modalAlignment    } : {}),
      ...(this._slideOver                       ? { slideOver:   true                    } : {}),
      // Boolean defaults are emitted only when the user has flipped them
      // away from the default — keeps the wire-shape unchanged for the
      // common case (no setter ever called).
      ...(this._closeModalByClickingAway === false ? { closeByClickingAway: false } : {}),
      ...(this._closeModalByEscaping     === false ? { closeByEscaping:     false } : {}),
      ...(this._stickyModalHeader                  ? { stickyHeader:        true  } : {}),
      ...(this._stickyModalFooter                  ? { stickyFooter:        true  } : {}),
      ...(this._modalCloseButton                   ? { closeButton:         true  } : {}),
      ...(this._modalAutofocus !== undefined       ? { autofocus: this._modalAutofocus } : {}),
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
