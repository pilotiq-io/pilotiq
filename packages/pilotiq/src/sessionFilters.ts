/**
 * Resource-list filter persistence — stash the active URL filter slice on
 * the user's session so revisiting `/admin/<slug>` from the sidebar lands
 * back on the same filtered view they last had open.
 *
 * Opt-in per resource via `Resource.persistFiltersInSession = true`. Sits
 * on top of `@rudderjs/session`'s built-in key/value store via the same
 * duck-typed bridge as `notifications/flash.ts` — pilotiq doesn't peer
 * depend on `@rudderjs/session`; helpers no-op silently when no session is
 * mounted on the request.
 *
 * Design notes:
 *
 * - Storage is per `(basePath, slug)`; `tab` is intentionally not part of
 *   the key (v1 limitation — all tabs of a resource share one slot). Add
 *   per-tab keying when a consumer asks.
 *
 * - `page` and `tab` URL params are skipped on write — pagination resets
 *   to 1 on every restore, and tab has its own URL semantics. Everything
 *   else (filter values, `group`, `search`, `sort`, `perPage`) round-trips
 *   verbatim so unknown future filter names work without changes here.
 *
 * - Empty-string values are preserved on write (they encode "user
 *   explicitly cleared this filter") but stripped on restore (an empty
 *   filter contributes nothing to the redirect URL).
 *
 * - "Bare visit" detection lives in the route layer (`Object.keys(query)
 *   .length === 0`) so this module stays a pure session adapter — easier
 *   to unit-test in isolation.
 */

const PREFIX = 'pilotiq:filters:'

/** URL params NOT persisted — pagination resets on restore, tab has its
 *  own state slot. */
const EXCLUDED_KEYS = new Set(['page', 'tab'])

interface StorableSession {
  get<T>(key: string, fallback?: T): T | undefined
  put(key: string, value: unknown): void
}

/**
 * Pull a `StorableSession` off any request-like object. Mirrors the
 * duck-typing in `notifications/flash.ts` — `AppRequest` doesn't declare
 * `session` so pilotiq compiles against unaugmented `AppRequest` and
 * still finds a real `SessionInstance` when one's mounted.
 */
function getSession(req: unknown): StorableSession | undefined {
  if (!req || typeof req !== 'object') return undefined
  const session = (req as { session?: unknown }).session
  if (!session || typeof session !== 'object') return undefined
  const s = session as Record<string, unknown>
  if (typeof s['get'] !== 'function' || typeof s['put'] !== 'function') return undefined
  return session as StorableSession
}

/** Session-storage key for a given list page. */
export function listFiltersKey(basePath: string, slug: string): string {
  return `${PREFIX}${basePath}:${slug}`
}

/** Read the persisted query slice. Returns `undefined` when no session is
 *  mounted, no entry exists, or the entry shape is unexpected (corrupted
 *  cookie / driver returned wrong type). */
export function readPersistedListQuery(
  req: unknown,
  key: string,
): Record<string, string> | undefined {
  const session = getSession(req)
  if (!session) return undefined
  const v = session.get<unknown>(key)
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  // Filter out non-string values defensively — a malformed cookie that
  // round-tripped through some other writer shouldn't crash the page.
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val
  }
  return out
}

/** Stash the filter-relevant slice of the current URL query on the session.
 *  Excludes `page` / `tab`; preserves empty strings (explicit clear).
 *  No-ops when the value would be deep-equal to what's already stored —
 *  saves a `Set-Cookie` round-trip on no-op revisits. */
export function writePersistedListQuery(
  req: unknown,
  key: string,
  query: Record<string, unknown>,
): void {
  const session = getSession(req)
  if (!session) return
  const slice: Record<string, string> = {}
  for (const [k, v] of Object.entries(query)) {
    if (EXCLUDED_KEYS.has(k)) continue
    if (typeof v !== 'string') continue
    slice[k] = v
  }
  const prev = session.get<Record<string, unknown> | undefined>(key)
  if (prev && shallowEqualStringMap(prev, slice)) return
  session.put(key, slice)
}

/** Build a query string from a persisted slice. Empty values are dropped
 *  (they were retained on write to mark explicit-clear, but contribute
 *  nothing to a restore URL). Returns `''` when nothing is restorable. */
export function encodePersistedQuery(slice: Record<string, string>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(slice)) {
    if (v === '') continue
    params.set(k, v)
  }
  return params.toString()
}

function shallowEqualStringMap(
  a: Record<string, unknown>,
  b: Record<string, string>,
): boolean {
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (const k of bk) {
    if (a[k] !== b[k]) return false
  }
  return true
}
