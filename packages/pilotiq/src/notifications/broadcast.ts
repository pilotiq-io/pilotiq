/**
 * Broadcast-backed notifications — server-side push helpers.
 *
 * Phase 2 of the notifications plan. Pairs with `database.ts` (Phase 1):
 * `database.ts` writes a row, `broadcast.ts` pushes the same payload to
 * the recipient's private WebSocket channel so the bell-icon dropdown
 * can refetch immediately instead of waiting on its polling interval.
 *
 * `@rudderjs/broadcast` is a runtime soft-import — pilotiq has no hard
 * dependency on it. When the host app hasn't installed broadcast (or
 * the provider hasn't booted), `push()` resolves to a clean no-op so
 * apps that opt into the database surface only stay quiet.
 *
 * Channel naming convention: `private-pilotiq-notifications.${userId}`.
 * Auth callbacks register at panel boot (`registerBroadcastAuth` in
 * `routes.ts`) and gate subscriptions on
 * `pilotiq.resolveUser(req).id === channel.userId`.
 */

import type { DatabaseNotificationMeta } from './database.js'

/** Internal cached snapshot of `@rudderjs/broadcast`'s public surface.
 *  We only need the `broadcast` fn from the package — auth registration
 *  goes through the same module via a separate path in `routes.ts`. */
interface BroadcastModule {
  broadcast(channel: string, event: string, data: unknown): void
}

let _testModule: BroadcastModule | null | 'unset' = 'unset'

/** Soft-resolve the broadcast module. Returns `null` when the package
 *  isn't installed OR when `BroadcastingProvider` hasn't booted (the
 *  `broadcast()` fn is a no-op until then, but we still want to import
 *  the module in case the provider is wired up later in the request
 *  lifecycle). */
async function loadBroadcast(): Promise<BroadcastModule | null> {
  if (_testModule !== 'unset') return _testModule
  const moduleName = '@rudderjs/broadcast'
  try {
    const mod = await import(/* @vite-ignore */ moduleName) as Partial<BroadcastModule>
    if (typeof mod.broadcast !== 'function') return null
    return mod as BroadcastModule
  } catch {
    return null
  }
}

/** Build the private channel name for a recipient. Mirrors the constant
 *  in `routes.ts` so the boot-time auth registration and the runtime
 *  push agree on the shape. Exported so the client renderer's
 *  channel-name calculation can import the same helper. */
export function notificationChannel(userId: string | number): string {
  return `private-pilotiq-notifications.${String(userId)}`
}

/** Standard event name we push for new-row events. The bell client
 *  subscribes to this event and re-fetches the list when it fires. */
export const NOTIFICATION_CREATED_EVENT = 'notification.created'

export interface PushOptions {
  /** Recipient identity — typically the user.id used as `notifiable_id`. */
  recipientId: string | number
  /** Optional override for the channel name (advanced). Defaults to
   *  `notificationChannel(recipientId)`. */
  channel?:    string
  /** Optional override for the event name. Defaults to
   *  `NOTIFICATION_CREATED_EVENT`. */
  event?:      string
  /** The payload to push. Typically the same `DatabaseNotificationMeta`
   *  shape returned by the list endpoint, plus any free-form keys. */
  payload:     DatabaseNotificationMeta | Record<string, unknown>
}

/** Push a notification event to the recipient's private channel. Soft-fails
 *  when `@rudderjs/broadcast` isn't installed — apps that haven't enabled
 *  broadcast still work; the bell falls back to polling. */
export async function push(opts: PushOptions): Promise<{ ok: boolean }> {
  const mod = await loadBroadcast()
  if (!mod) return { ok: false }
  const channel = opts.channel ?? notificationChannel(opts.recipientId)
  const event   = opts.event   ?? NOTIFICATION_CREATED_EVENT
  try {
    mod.broadcast(channel, event, opts.payload)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** @internal — test seam. Inject a fake broadcast module (or `null` to
 *  mimic "package not installed"). Pass `undefined` to clear and fall
 *  back to the dynamic import. */
export function _setTestBroadcast(mod: BroadcastModule | null | undefined): void {
  _testModule = mod === undefined ? 'unset' : mod
}
