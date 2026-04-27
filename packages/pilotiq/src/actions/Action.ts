import { Element, type ElementMeta } from '../schema/Element.js'

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

/**
 * Result a handler may return to influence the response. `void` is the
 * default — the dispatcher 303-redirects to the page the action was
 * triggered from. Returning `{ redirect }` overrides that with an
 * explicit URL. Throw an Error to surface as a 500 with the message.
 */
export type ActionResult = void | { redirect?: string }

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

  private constructor(name: string) {
    super()
    this.name = name
    this._label = name.charAt(0).toUpperCase() + name.slice(1)
  }

  static make(name: string): Action {
    return new Action(name)
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

  destructive(v = true): this { this._destructive = v; return this }

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

  // ─── Getters ──────────────────────────────────────────

  getLabel():     string             { return this._label }
  getPlacement(): ActionPlacement    { return this._placement }
  isDestructive(): boolean           { return this._destructive }
  getHandler():     ActionHandler | undefined { return this._handler }
  getHref():        string | undefined        { return this._href }
  getMethod():      ActionMethod | undefined  { return this._method }
  getActionUrl():   string | undefined        { return this._actionUrl }
  getDispatchUrl(): string | undefined        { return this._dispatchUrl }

  // ─── Element contract ────────────────────────────────

  getType(): string { return 'action' }

  override toMeta(): ActionMeta {
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
    }
  }
}
