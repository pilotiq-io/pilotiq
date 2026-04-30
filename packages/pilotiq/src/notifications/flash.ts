/**
 * Bridge between the form/action lifecycle (which produces
 * `NotificationMeta[]` on success) and the next request's render (which
 * needs them in `viewProps.notifications` so the `Toaster` can fire).
 *
 * Sits on top of `@rudderjs/session`'s built-in flash primitive — see
 * `SessionInstance.flash / getFlash`. We don't ship our own storage; we
 * only namespace the key (`pilotiq:notifications`) and shape the value.
 *
 * If the host app hasn't installed `@rudderjs/session`, `req.session` is
 * undefined; both helpers no-op silently rather than throwing — losing
 * notifications on the 303 path is the same status quo as before flash
 * landed, so an opt-out is the correct fallback.
 */
import type { NotificationMeta } from './Notification.js'

const FLASH_KEY = 'pilotiq:notifications'

interface FlashCapableSession {
  flash(key: string, value: unknown): void
  getFlash<T>(key: string, fallback?: T): T | undefined
}

/**
 * Pull a `FlashCapableSession` off any request-like object. `AppRequest`
 * doesn't declare `session` in `@rudderjs/contracts` directly — the field
 * is added via module augmentation in `@rudderjs/session`, which pilotiq
 * doesn't peer-depend on (sessions are optional in the host). We duck-type
 * at runtime so the helpers compile against unaugmented `AppRequest` and
 * still find a real `SessionInstance` when one's mounted.
 */
function getSession(req: unknown): FlashCapableSession | undefined {
  if (!req || typeof req !== 'object') return undefined
  const session = (req as { session?: unknown }).session
  if (!session || typeof session !== 'object') return undefined
  const s = session as Record<string, unknown>
  if (typeof s['flash'] !== 'function' || typeof s['getFlash'] !== 'function') return undefined
  return session as FlashCapableSession
}

/**
 * Stash notifications on the session for the next request to consume.
 * Called from POST handlers right before `res.redirect(..., 303)`.
 *
 * Invariant: call at most once per response. The underlying
 * `session.flash(key, value)` overwrites any previously flashed value
 * under the same key, so coalescing across multiple calls would silently
 * lose the earlier batch.
 *
 * No-ops silently when the host app hasn't installed `@rudderjs/session`.
 */
export function flashNotifications(
  req:           unknown,
  notifications: ReadonlyArray<NotificationMeta> | undefined,
): void {
  if (!notifications || notifications.length === 0) return
  const session = getSession(req)
  if (!session) return
  session.flash(FLASH_KEY, [...notifications])
}

/**
 * Read & clear the flashed notifications (consume-once semantics — the
 * session driver clears the previous-request flash slot on save). Returns
 * an empty array when there's nothing flashed or no session is installed.
 */
export function consumeFlashedNotifications(req: unknown): NotificationMeta[] {
  const session = getSession(req)
  if (!session) return []
  return session.getFlash<NotificationMeta[]>(FLASH_KEY) ?? []
}
