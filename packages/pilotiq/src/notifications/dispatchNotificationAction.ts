/**
 * Server-side dispatcher for `Notification.actions([Action…])` slots
 * that target a registered handler by name. Mounted by `routes.ts` at
 * `POST {base}/_notifications/:id/_action/:actionName`.
 *
 * Auth/lookup chain (each step returns the next-status code on miss):
 *   401  → no resolved user
 *   404  → row doesn't exist OR `notifiable_id !== user.id`
 *   404  → stored row's `data.actions` doesn't contain `actionName`
 *   404  → stored action's `handler` field isn't a string (closures
 *          should already be filtered at `sendToDatabase` — defend in
 *          depth)
 *   404  → no registry entry under that handler name
 *   200  → handler ran cleanly; result echoes back as
 *          `{ ok, redirect?, notifications?, download? }`
 *   500  → handler threw — caught and wrapped
 *
 * The handler reads `payload` exclusively from the stored row, never
 * from the request body, so a tampered client can't inject extra
 * payload keys.
 */

import type { Pilotiq } from '../Pilotiq.js'
import type {
  NotificationActionContext,
  NotificationActionResult,
} from './types.js'
import type { NotificationMeta } from './Notification.js'
import { findOneForUser, markAsRead } from './database.js'

export interface DispatchNotificationActionInput {
  notificationId: string
  actionName:     string
  notifiableType: string
  notifiableId:   string
  user:           unknown
  request?:       unknown
}

export interface DispatchNotificationActionSuccess {
  ok:             true
  redirect?:      string
  notifications?: NotificationMeta[]
  /** When the matched action carried `markAsRead: true`, the route
   *  flipped `read_at` server-side. Mirrored back so the bell client
   *  can update its optimistic state without an extra round-trip. */
  markedAsRead?:  boolean
}

export interface DispatchNotificationActionFailure {
  ok:     false
  status: 401 | 404 | 500
  error:  string
}

export type DispatchNotificationActionResult =
  | DispatchNotificationActionSuccess
  | DispatchNotificationActionFailure

export async function dispatchNotificationAction(
  pilotiq: Pilotiq,
  input:   DispatchNotificationActionInput,
): Promise<DispatchNotificationActionResult> {
  if (input.user === null || input.user === undefined) {
    return { ok: false, status: 401, error: 'Not authenticated' }
  }

  const row = await findOneForUser(input.notificationId, {
    notifiableType: input.notifiableType,
    notifiableId:   input.notifiableId,
  })
  if (!row) return { ok: false, status: 404, error: 'Notification not found' }

  const action = row.actions?.find(a => a.name === input.actionName)
  if (!action) return { ok: false, status: 404, error: 'Action not found on notification' }

  // Closures don't survive serialization — if a stored action carries
  // anything other than a string handler, treat it as a tampered row
  // (or one written by an older code path) and refuse to dispatch.
  if (typeof action.handler !== 'string') {
    return {
      ok:     false,
      status: 404,
      error:  'Action does not target a registered handler (use Pilotiq.notificationHandlers).',
    }
  }

  const handler = pilotiq.getNotificationHandler(action.handler)
  if (!handler) {
    return {
      ok:     false,
      status: 404,
      error:  `No notification handler registered for "${action.handler}".`,
    }
  }

  const ctx: NotificationActionContext = {
    user:           input.user,
    payload:        action.payload ?? {},
    notificationId: input.notificationId,
  }
  if (input.request !== undefined) ctx.request = input.request

  let result: NotificationActionResult | undefined
  try {
    result = await handler(ctx)
  } catch (e) {
    return {
      ok:     false,
      status: 500,
      error:  e instanceof Error ? e.message : 'Notification handler threw',
    }
  }

  // Side-effect: flip `read_at` when the stored action opted in.
  // Server-side authoritative — handler dispatch is one round-trip,
  // not two, and tampered clients can't suppress the mark.
  let markedAsRead = false
  if (action.markAsRead) {
    markedAsRead = await markAsRead(input.notificationId, {
      notifiableType: input.notifiableType,
      notifiableId:   input.notifiableId,
    })
  }

  const success: DispatchNotificationActionSuccess = { ok: true }
  if (result && typeof result === 'object') {
    if (typeof result.redirect === 'string') success.redirect = result.redirect
    if (result.notify !== undefined) {
      const notifs = Array.isArray(result.notify) ? result.notify : [result.notify]
      const valid  = notifs.filter(
        (n): n is NotificationMeta => Boolean(n) && typeof n === 'object' && typeof (n as NotificationMeta).title === 'string',
      )
      if (valid.length > 0) success.notifications = valid
    }
    // download envelope (parallel to dispatchAction) — wired through
    // the route layer when present; v1 doesn't surface it here to keep
    // the wire shape narrow. Add when a consumer asks.
  }
  if (markedAsRead) success.markedAsRead = true
  return success
}
