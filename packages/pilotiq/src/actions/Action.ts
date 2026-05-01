import { Element, type ElementMeta } from '../schema/Element.js'
import type { ValidationErrors } from '../validation/index.js'
import type { Notification, NotificationMeta } from '../notifications/Notification.js'
import {
  safeManagerPolicy,
  type RelationManager,
  type RelationManagerContext,
} from '../RelationManager.js'

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
}

/** Convenience type: handlers can return either a built `Notification`
 * instance, its serialized meta, or arrays of either. */
export type NotificationLike =
  | Notification
  | NotificationMeta
  | ReadonlyArray<Notification | NotificationMeta>

/**
 * Result a handler may return to influence the response. `void` is the
 * default — the dispatcher 303-redirects to the page the action was
 * triggered from. Returning `{ redirect }` overrides that with an
 * explicit URL. Returning `{ notify }` flashes one or more toast
 * notifications on the next render. Throw an Error to surface as a
 * 500 with the message.
 */
export type ActionResult = void | { redirect?: string; notify?: NotificationLike }

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
 * `records` for bulk evaluations; `user` from the request when wired. */
export interface ActionVisibilityContext {
  record?:  unknown
  records?: unknown[]
  user?:    unknown
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

/** Structural shape of a Resource class for the factory functions —
 * matches `Resource.ts` exactly but keeps Action.ts free of an import
 * cycle. The optional fields are the Plan #10 policy predicates; their
 * defaults (return `true`) mean missing methods are equivalent to
 * "always allowed." */
interface ResourceLike {
  labelSingular: string
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
  canDelete?(user: unknown, record: unknown): boolean | Promise<boolean>
  canRestore?(user: unknown, record: unknown): boolean | Promise<boolean>
  canForceDelete?(user: unknown, record: unknown): boolean | Promise<boolean>
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
      .confirm(`Delete the selected ${R.labelSingular.toLowerCase()}s?`)
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
        return { notify: { title: `${n} ${R.labelSingular.toLowerCase()}s ${verb}`, type: 'success' } as never }
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
      .confirm(`Restore the selected ${R.labelSingular.toLowerCase()}s?`)
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
        return { notify: { title: `${n} ${R.labelSingular.toLowerCase()}s restored`, type: 'success' } as never }
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
      .confirm(`Permanently delete the selected ${R.labelSingular.toLowerCase()}s? This cannot be undone.`)
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
        return { notify: { title: `${n} ${R.labelSingular.toLowerCase()}s permanently deleted`, type: 'success' } as never }
      })
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
      .visible(({ user }) => safeManagerPolicy(M, 'canCreate', ctx.related, user, ctx.parentRecord))
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
      .visible(({ user, record }) => safeManagerPolicy(M, 'canEdit', ctx.related, user, ctx.parentRecord, record))
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
      .visible(({ user, record }) => safeManagerPolicy(M, 'canDelete', ctx.related, user, ctx.parentRecord, record))
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
