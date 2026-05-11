import type { NotificationMeta } from '../../../notifications/Notification.js'

// ─── Action dispatch helpers ────────────────────────────────
//
// Pure (non-React) helpers shared by every action-button component:
// JSON dispatch, notification drain, and the download branch that
// converts an attachment response into a synthetic `<a download>` click.

export type Notify   = (n: NotificationMeta | Omit<NotificationMeta, 'id'>) => void
export type Navigate = (url: string) => void

/** Drain `notifications[]` from a JSON response into `useToast().notify`. */
export function dispatchNotifications(data: unknown, notify: Notify): void {
  const notifs = (data as { notifications?: NotificationMeta[] }).notifications
  if (!notifs || notifs.length === 0) return
  for (const n of notifs) notify(n)
}

/**
 * Fetch + JSON dispatch for form-method actions (Delete-style — no
 * server-rendered <form>, no 303 redirect, no full page reload). Sends
 * `_method` as a body field so Hono's POST handler dispatches the
 * intended verb. On success: drain notifications, SPA-navigate to the
 * server-supplied redirect (or stay on current path if none).
 *
 * Failure modes:
 *   - 4xx/5xx with `{ error }`: surfaced as an error toast.
 *   - Network errors: error toast with the exception message.
 */
export async function dispatchMethodAction(
  url:      string,
  method:   'post' | 'put' | 'patch' | 'delete',
  navigate: Navigate,
  notify:   Notify,
): Promise<void> {
  try {
    const fd = new FormData()
    if (method !== 'post') fd.append('_method', method)
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Accept': 'application/json' },
      body:    fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = String((data as { error?: string }).error ?? `Request failed (${res.status})`)
      notify({ type: 'error', title: 'Action failed', body: message })
      return
    }
    dispatchNotifications(data, notify)
    const redirect = String((data as { redirect?: string }).redirect ?? '')
    if (redirect) navigate(redirect)
    else if (typeof window !== 'undefined') navigate(window.location.pathname + window.location.search)
  } catch (err) {
    notify({ type: 'error', title: 'Action failed', body: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * Fetch + JSON dispatch for handler-style actions (no schema, no modal,
 * just a button). Sends `ids[]` plus arbitrary `values` fields. Server
 * returns `{ ok, redirect, notifications }` (or `{ ok: false, error }` on
 * failure). On success: drain notifications, SPA-navigate; on failure:
 * surface the error as a toast. No full page reload in any case.
 */
export async function dispatchHandlerAction(
  url:      string,
  ids:      string[],
  navigate: Navigate,
  notify:   Notify,
  values:   Record<string, string> = {},
  formSnapshot?: FormData,
): Promise<void> {
  try {
    // When `formSnapshot` is set (Repeater / Builder `extraItemActions`
    // dispatch), the snapshot already carries the form's full state — we
    // just append `ids` / `values` on top so the server sees both the
    // form body (for coerceFormValues + row hydration) and the action's
    // own meta keys.
    const fd = formSnapshot ?? new FormData()
    for (const id of ids) fd.append('ids', id)
    for (const [k, v] of Object.entries(values)) fd.append(k, v)
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Accept': 'application/json' },
      body:    fd,
    })
    // Download branch — handlers that return `{ download }` ask the server
    // to write the body inline with `Content-Disposition: attachment`. Trip
    // a browser download via a synthetic `<a download>` and exit early
    // (no notify drain / no SPA-nav — the file IS the success signal).
    if (res.ok && triggerDownloadIfAttachment(res)) {
      await res.blob().then(triggerBlobDownload(res))
      return
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = String((data as { error?: string }).error ?? `Request failed (${res.status})`)
      notify({ type: 'error', title: 'Action failed', body: message })
      return
    }
    dispatchNotifications(data, notify)
    const redirect = String((data as { redirect?: string }).redirect ?? '')
    if (redirect) navigate(redirect)
    else if (typeof window !== 'undefined') navigate(window.location.pathname + window.location.search)
  } catch (err) {
    notify({ type: 'error', title: 'Action failed', body: err instanceof Error ? err.message : String(err) })
  }
}

/** Returns true when the response carries `Content-Disposition: attachment`,
 *  which is how the route layer signals a download payload. The header
 *  match is case-insensitive (different runtimes normalize differently). */
function triggerDownloadIfAttachment(res: Response): boolean {
  const cd = res.headers.get('Content-Disposition') ?? res.headers.get('content-disposition') ?? ''
  return cd.toLowerCase().includes('attachment')
}

/** Returns a closure that converts the blob into a download by clicking
 *  a synthetic `<a download="…">`. Filename is parsed from
 *  `Content-Disposition`'s `filename="…"` parameter; falls back to
 *  `'download'` when missing. Only mounted when `document` is present
 *  (no-op in SSR). */
function triggerBlobDownload(res: Response): (blob: Blob) => void {
  const cd = res.headers.get('Content-Disposition') ?? res.headers.get('content-disposition') ?? ''
  const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)
  const filename = (match?.[1] ?? 'download').trim()
  return (blob) => {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objUrl)
  }
}
