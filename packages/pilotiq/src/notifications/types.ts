import type { ActionColor, ActionSize, DownloadEnvelope } from '../actions/Action.js'
import type { NotificationMeta } from './Notification.js'

/**
 * Minimal notifiable contract used by `Notification.sendToDatabase()`
 * and the bell-icon endpoints. Mirrors the shape `@rudderjs/notification`
 * already publishes — `id` (string or number) is the only required
 * field. We coerce to string when writing the `notifiable_id` column so
 * mixed `number`/`string` ids stay consistent on disk.
 */
export interface Notifiable {
  readonly id:     string | number
  readonly email?: string
  readonly name?:  string
}

/**
 * Slim wire shape emitted by `Notification.actions([Action…])`. Same
 * format on the transient toast meta, the persisted database row's
 * `data.actions` JSON, and the `_notifications` list endpoint — so the
 * bell client and the toaster can share render code.
 *
 * Exactly one of `url` / `post` / `handler` is set. The serializer in
 * `Notification.ts` enforces mutual exclusion at config time and rejects
 * Action features that don't make sense in a notification context
 * (modal-form, submit, bulk placement) with a clear error.
 */
export interface NotificationActionMeta {
  /** Stable name; used as the registry key for handler dispatch and
   *  as the action identifier the route's URL carries. */
  name:               string
  label:              string
  /** Click navigates here. */
  url?:               string
  /** Click submits a `<form method="post" action="…">`. */
  post?:              string
  /** Registry key — looked up via `Pilotiq.notificationHandlers({…})`
   *  at request time. The matching handler runs server-side; the bell
   *  client renders a button that POSTs to the notification action
   *  endpoint. */
  handler?:           string
  /** Per-fire context the handler receives on `ctx.payload`. JSON-only
   *  (`Date`/`Map`/etc don't survive — stringify them yourself). Stored
   *  alongside the action when the row is persisted. */
  payload?:           Record<string, unknown>
  color?:             ActionColor
  icon?:              string
  outlined?:          boolean
  size?:              ActionSize
  openUrlInNewTab?:   boolean
  /**
   * When set, firing this action also flips the notification's
   * `read_at` column. Url/post variants fire the read POST as a
   * client-side side-effect; handler dispatch handles it server-side
   * inside the action route so the round-trip is one request.
   */
  markAsRead?:        boolean
}

/**
 * Server-side handler signature for `Pilotiq.notificationHandlers({…})`
 * registry entries. Mirrors the `ActionHandler` from
 * `dispatchAction` minus row context (notifications don't carry one),
 * plus `payload` (the per-fire context the action carried) and
 * `notificationId` (the row the click came from).
 */
export type NotificationActionHandler = (
  ctx: NotificationActionContext,
) => Promise<NotificationActionResult | undefined> | NotificationActionResult | undefined

export interface NotificationActionContext {
  /** Resolved by `pilotiq.resolveUser(req)` before the route fires.
   *  Always present — the route gates on auth before reaching the
   *  registry. */
  user:           unknown
  /** Per-fire context the action carried. Empty object when the action
   *  was created without `.payload({…})`. */
  payload:        Record<string, unknown>
  /** Database row id this click came from. */
  notificationId: string
  /** Raw request — same opaque shape that flows into Resource action
   *  handlers, in case a handler needs cookies / headers. */
  request?:       unknown
}

export interface NotificationActionResult {
  /** SPA-navigate after the handler completes. */
  redirect?: string
  /** Toast(s) to flash after the handler completes. */
  notify?:   NotificationMeta | NotificationMeta[]
  /** File-download envelope (parallel to dispatchAction). */
  download?: DownloadEnvelope
}
