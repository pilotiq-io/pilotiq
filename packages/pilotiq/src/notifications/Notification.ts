/**
 * Notification — fluent builder for toast/flash messages emitted from
 * action handlers, form lifecycle hooks, or the route layer. Serializes
 * to a `NotificationMeta` that the client `<Toaster>` consumes.
 *
 * The same builder also doubles as the entry-point for persistent
 * notifications: `notification.sendToDatabase(user)` writes a row on
 * the `notification` table shipped by `@rudderjs/notification`. The
 * panel's bell-icon dropdown reads from that table so the same call
 * site that emits a toast can also drop a row into the user's inbox.
 */
import type { Notifiable, NotificationActionMeta } from './types.js'
import type { Action } from '../actions/Action.js'
import { persist as persistDatabaseNotification } from './database.js'
import {
  push as pushBroadcast,
  notificationChannel,
} from './broadcast.js'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface NotificationMeta {
  /** Stable id; used by the client to dedupe and dismiss. Auto-generated
   * when not supplied. */
  id:        string
  type:      NotificationType
  title:     string
  body?:     string
  icon?:     string
  /** Auto-dismiss duration in ms. `0` keeps the toast until manually
   * dismissed. Default 5000. */
  duration?: number
  /** Filament-style action strip rendered below the body. Same shape
   *  on transient toasts and persisted bell rows. Closure-handler
   *  actions are valid on toasts but rejected at `sendToDatabase` time
   *  (closures don't survive serialization). */
  actions?:  NotificationActionMeta[]
}

let _idSeq = 0
function nextId(): string {
  _idSeq += 1
  return `n-${_idSeq}-${Date.now()}`
}

export class Notification {
  protected _id?: string
  protected _type: NotificationType = 'info'
  protected _title = ''
  protected _body?: string
  protected _icon?: string
  protected _duration?: number
  protected _actions: Action[] = []

  private constructor() {}

  static make(title?: string): Notification {
    const n = new Notification()
    if (title) n._title = title
    return n
  }

  // ─── Type sugar ───────────────────────────────────────

  info(): this    { this._type = 'info';    return this }
  success(): this { this._type = 'success'; return this }
  warning(): this { this._type = 'warning'; return this }
  error(): this   { this._type = 'error';   return this }

  // ─── Content ──────────────────────────────────────────

  title(s: string): this { this._title = s; return this }
  body(s: string): this  { this._body  = s; return this }
  icon(i: string): this  { this._icon  = i; return this }

  // ─── Behavior ─────────────────────────────────────────

  /** Auto-dismiss timeout in ms. `0` means persistent. Default 5000. */
  duration(ms: number): this { this._duration = ms; return this }

  /** Override the auto-generated id (rarely needed). */
  id(s: string): this { this._id = s; return this }

  /**
   * Filament-style action strip — buttons rendered below the body on
   * both transient toasts and persisted bell rows.
   *
   * Three serializable dispatch modes:
   *   - `Action.make('view').url('/p/123')`             — href anchor
   *   - `Action.make('post').method('post').action(u)`  — form-POST
   *   - `Action.make('archive').handler('name').payload({…})`
   *                                                      — registered
   *                                                        handler
   *
   * Closure handlers (`.handler(async ctx => …)`) work on transient
   * toasts (dispatched against the page's `_action/:name`) but are
   * rejected at `sendToDatabase()` time — closures don't round-trip
   * through the `data` JSON column. Use the named-registry path
   * (`Pilotiq.notificationHandlers({…})`) for persistent rows.
   *
   * Pair with `.markAsRead()` on any action to flip the row's
   * `read_at` when the action fires:
   *
   *   Notification.make('New project assigned')
   *     .actions([
   *       Action.make('view').url('/p/123').markAsRead(),
   *       Action.make('archive').handler('archive-project')
   *         .payload({ projectId: 123 }).markAsRead(),
   *     ])
   *     .sendToDatabase(currentUser)
   */
  actions(actions: Action[]): this {
    this._actions = actions
    return this
  }

  /** Internal — exposed so the toaster / dispatcher can read the
   *  authored Action instances directly when needed (rare). Most
   *  consumers should read from `toMeta().actions` instead. */
  getActions(): readonly Action[] { return this._actions }

  /**
   * Optional click-through URL. When set on a row that's been written
   * to the database via `sendToDatabase()`, the bell-icon dropdown
   * navigates here when the row is clicked (and marks it read in the
   * same step). Ignored on transient toasts.
   */
  url(href: string): this { this._url = href; return this }

  protected _url?: string

  // ─── Serialization ────────────────────────────────────

  toMeta(): NotificationMeta {
    const actions = this._actions.length > 0
      ? this._actions.map(a => serializeForNotification(a, { transient: true }))
      : undefined
    return {
      id:    this._id ?? nextId(),
      type:  this._type,
      title: this._title,
      ...(this._body     !== undefined ? { body:     this._body     } : {}),
      ...(this._icon     !== undefined ? { icon:     this._icon     } : {}),
      ...(this._duration !== undefined ? { duration: this._duration } : {}),
      ...(actions        !== undefined ? { actions                  } : {}),
    }
  }

  /**
   * Build the JSON payload stored in the `notification.data` column.
   * Mirrors the toast meta but always includes `type` (so the bell
   * dropdown can apply the matching tint chip) and `url` when set.
   *
   * Action strip: closure-handler actions are rejected here — their
   * dispatch target only exists on the page that authored the notify,
   * and the row may outlive that page by days. The named-registry path
   * (`Pilotiq.notificationHandlers({…})`) is the persistence-safe
   * escape hatch.
   */
  toDatabase(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      type:  this._type,
      title: this._title,
    }
    if (this._body !== undefined) data['body'] = this._body
    if (this._icon !== undefined) data['icon'] = this._icon
    if (this._url  !== undefined) data['url']  = this._url
    if (this._actions.length > 0) {
      data['actions'] = this._actions.map(a => serializeForNotification(a, { transient: false }))
    }
    return data
  }

  /**
   * Persist this notification on the `notification` table for
   * `recipient`. The bell-icon dropdown surfaces it on the recipient's
   * next poll (or immediately on broadcast — see Phase 2).
   *
   * Throws when no `@rudderjs/orm` adapter is registered, with a clear
   * message pointing at the providers list.
   *
   * `notifiableType` lets the caller override the column value when an
   * app stores notifications scoped to a non-`'users'` notifiable
   * (teams, projects, etc). Default `'users'` matches the table layout
   * `@rudderjs/notification`'s `DatabaseChannel` writes.
   *
   *   await Notification.make('Saved successfully')
   *     .body('Changes to the post have been saved.')
   *     .success()
   *     .sendToDatabase(currentUser)
   */
  async sendToDatabase(
    recipient: Notifiable,
    opts: { notifiableType?: string; broadcast?: boolean } = {},
  ): Promise<{ id: string }> {
    const data = this.toDatabase() as NotificationMeta & Record<string, unknown>
    const result = await persistDatabaseNotification({
      notifiableType: opts.notifiableType ?? 'users',
      notifiableId:   String(recipient.id),
      data,
    })
    // Phase 2: push the same payload over WebSocket so the bell client
    // can refetch immediately. Soft-fails when `@rudderjs/broadcast`
    // isn't installed (or when the provider hasn't booted) — apps still
    // get the persisted row via polling.
    if (opts.broadcast) {
      await pushBroadcast({
        recipientId: recipient.id,
        payload: { ...data, id: result.id, createdAt: Date.now() },
      })
    }
    return result
  }

  /**
   * Push this notification over WebSocket without persisting it. Pairs
   * with `sendToDatabase()` (or runs standalone for ephemeral pushes
   * like "user-X started typing"). Soft-fails when `@rudderjs/broadcast`
   * isn't installed.
   *
   * Channel: `private-pilotiq-notifications.${recipient.id}`. The bell
   * client subscribes to this channel automatically when broadcast is
   * enabled in `Pilotiq.databaseNotifications({ broadcast: true })`.
   *
   *   await Notification.make('Live update')
   *     .info()
   *     .broadcast(currentUser)
   */
  async broadcast(recipient: Notifiable): Promise<{ ok: boolean }> {
    return pushBroadcast({
      recipientId: recipient.id,
      payload: this.toDatabase(),
    })
  }
}

/** Re-export so callers can build channel names without reaching into
 *  the internal broadcast module. Useful for apps that want to push
 *  custom events from their own code (e.g. presence pings). */
export { notificationChannel }

/** @internal — reset id sequence; tests use this for stability. */
export function _resetNotificationIdSeq(): void {
  _idSeq = 0
}

/**
 * Walk an `Action` instance and emit the slim `NotificationActionMeta`
 * wire shape — the same format on transient toasts (`toMeta()`) and
 * persisted bell rows (`toDatabase()`).
 *
 * Rejects Action features that don't fit a notification context:
 *
 *   - Modal / form-modal actions (`.schema()`, `.modal*()`,
 *     `.slideOver()`) — notifications aren't Resource pages, the modal
 *     dispatcher's row/page context isn't available.
 *   - Submit-button actions (`.submit()` / `.formField()`) — there's no
 *     surrounding `<form>` to submit.
 *   - Bulk placement — notifications are per-row, no `records[]`.
 *   - Visibility callbacks (`.visible(fn)` / `.disabled(fn)`) — need
 *     a render context the notification doesn't carry. Use the
 *     server-side filter (only emit the action when relevant) instead.
 *
 * `transient: true` (used by `toMeta()`) tolerates closure handlers —
 * they dispatch through the current page's `_action/:name` endpoint.
 * `transient: false` (used by `toDatabase()`) rejects closures with a
 * clear message pointing at the named-registry pattern.
 */
export function serializeForNotification(
  action: Action,
  opts: { transient: boolean },
): NotificationActionMeta {
  // Reject incompatible Action features at config time (works on both
  // transports; the row's wire shape can't carry these even if we
  // wanted it to).
  if (action.hasModal()) {
    throw new Error(
      `[Pilotiq] Notification.actions: action "${action.name}" carries a modal-form ` +
      `(.schema() / .modalHeading() / .slideOver()). Modal-form actions aren't supported ` +
      `inside notifications in v1 — drop the modal or move the workflow to a Resource action.`,
    )
  }
  if (action.isSubmit()) {
    throw new Error(
      `[Pilotiq] Notification.actions: action "${action.name}" is a submit button (.submit()). ` +
      `Notifications have no surrounding <form>; use .url() / .method() / .handler() instead.`,
    )
  }
  if (action.getPlacement() === 'bulk') {
    throw new Error(
      `[Pilotiq] Notification.actions: action "${action.name}" is bulk-placed. ` +
      `Notifications are per-row — bulk placement has no recipient context.`,
    )
  }

  const handlerFn   = action.getHandler()
  const handlerName = action.getHandlerName()
  const href        = action.getHref()
  const method      = action.getMethod()
  const actionUrl   = action.getActionUrl()

  // Closure handler on a persisted row — reject loudly. The caller
  // explicitly asked to `sendToDatabase`; silently dropping the action
  // would surprise.
  if (!opts.transient && handlerFn && !handlerName) {
    throw new Error(
      `[Pilotiq] Notification.actions: action "${action.name}" has a closure handler ` +
      `but is being persisted via .sendToDatabase(). Closures don't survive serialization. ` +
      `Use Pilotiq.notificationHandlers({ '${action.name}': async ctx => … }) and call ` +
      `Action.handler('${action.name}') instead.`,
    )
  }

  const meta: NotificationActionMeta = {
    name:  action.name,
    label: action.getLabel(),
  }
  // Dispatch mode — exactly one of url / post / handler. Precedence
  // matches the Action surface: explicit href wins over method-form.
  if (href) {
    meta.url = href
  } else if (method && actionUrl) {
    meta.post = actionUrl
  } else if (handlerName) {
    meta.handler = handlerName
    const payload = action.getPayload()
    if (Object.keys(payload).length > 0) meta.payload = payload
  } else if (handlerFn && opts.transient) {
    // Transient toast with a closure handler — defer dispatch to the
    // current page's `_action/:name`. Wire shape doesn't carry the
    // closure itself; the toaster reads `Notification.getActions()`
    // for closures and falls back to the page-level dispatch URL.
    meta.handler = action.name
  } else {
    throw new Error(
      `[Pilotiq] Notification.actions: action "${action.name}" has no dispatch target. ` +
      `Set one of .url() / .method().action() / .handler(closureOrName).`,
    )
  }

  // Chrome — copy through the subset that makes sense in a strip.
  const color    = action.getColor()
  const icon     = action.getIcon()
  const outlined = action.isOutlined()
  const size     = action.getSize()
  if (color    !== undefined) meta.color           = color
  if (icon     !== undefined) meta.icon            = icon
  if (outlined)               meta.outlined        = true
  if (size     !== undefined) meta.size            = size
  if (action.isOpenUrlInNewTab()) meta.openUrlInNewTab = true
  if (action.isMarkAsReadOnFire()) meta.markAsRead = true

  return meta
}
