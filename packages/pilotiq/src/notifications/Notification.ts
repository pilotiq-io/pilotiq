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
import type { Notifiable } from './types.js'
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
   * Optional click-through URL. When set on a row that's been written
   * to the database via `sendToDatabase()`, the bell-icon dropdown
   * navigates here when the row is clicked (and marks it read in the
   * same step). Ignored on transient toasts.
   */
  url(href: string): this { this._url = href; return this }

  protected _url?: string

  // ─── Serialization ────────────────────────────────────

  toMeta(): NotificationMeta {
    return {
      id:    this._id ?? nextId(),
      type:  this._type,
      title: this._title,
      ...(this._body     !== undefined ? { body:     this._body     } : {}),
      ...(this._icon     !== undefined ? { icon:     this._icon     } : {}),
      ...(this._duration !== undefined ? { duration: this._duration } : {}),
    }
  }

  /**
   * Build the JSON payload stored in the `notification.data` column.
   * Mirrors the toast meta but always includes `type` (so the bell
   * dropdown can apply the matching tint chip) and `url` when set.
   */
  toDatabase(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      type:  this._type,
      title: this._title,
    }
    if (this._body !== undefined) data['body'] = this._body
    if (this._icon !== undefined) data['icon'] = this._icon
    if (this._url  !== undefined) data['url']  = this._url
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
