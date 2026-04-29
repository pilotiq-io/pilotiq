/**
 * Notification — fluent builder for toast/flash messages emitted from
 * action handlers, form lifecycle hooks, or the route layer. Serializes
 * to a `NotificationMeta` that the client `<Toaster>` consumes.
 */

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
}

/** @internal — reset id sequence; tests use this for stability. */
export function _resetNotificationIdSeq(): void {
  _idSeq = 0
}
