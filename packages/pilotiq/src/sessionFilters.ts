// Duck-typed adapter over `@rudderjs/session` — pilotiq doesn't peer
// depend, so helpers no-op silently when no session is mounted on the
// request.

const PREFIX = 'pilotiq:filters:'

const EXCLUDED_KEYS = new Set(['page', 'tab', 'groupKey'])

// Heuristic also catches `<prefix>_page` from `Table.queryStringIdentifier`.
// A filter literally named `something_page` would be dropped too, but
// that's an unusual filter name.
function isPageKey(key: string): boolean {
  if (key === 'page') return true
  return key.endsWith('_page')
}

// Sibling heuristic for `<prefix>_groupKey`. Group drill-in is page-
// state (click-to-drill, × to clear), not filter-state — restoring it
// on a bare visit would land the user on the bucket they last drilled
// into instead of the banded list they probably expect.
function isGroupKeyKey(key: string): boolean {
  if (key === 'groupKey') return true
  return key.endsWith('_groupKey')
}

interface StorableSession {
  get<T>(key: string, fallback?: T): T | undefined
  put(key: string, value: unknown): void
}

function getSession(req: unknown): StorableSession | undefined {
  if (!req || typeof req !== 'object') return undefined
  const session = (req as { session?: unknown }).session
  if (!session || typeof session !== 'object') return undefined
  const s = session as Record<string, unknown>
  if (typeof s['get'] !== 'function' || typeof s['put'] !== 'function') return undefined
  return session as StorableSession
}

// Per-tab slot key. `tab === ''` is the "no tab" / "default tab" slot —
// resources without ListTabs always store under it. Tab name comes from
// `?tab=<name>` verbatim — keying by the URL value (not by the tab's
// "default" status) keeps writers + readers symmetric without the
// route handler having to know the schema's default-tab name.
export function listFiltersKey(basePath: string, slug: string, tab: string = ''): string {
  return `${PREFIX}${basePath}:${slug}:slot:${tab}`
}

// Pointer to whichever tab the user was last on. Read on bare-URL visits
// to decide which slot to restore — without it, bare visits would always
// restore the no-tab slot (a regression vs v1, where one slot held
// whatever tab+filters combo the user last applied).
export function lastTabKey(basePath: string, slug: string): string {
  return `${PREFIX}${basePath}:${slug}:lastTab`
}

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
    if (isPageKey(k))         continue
    if (isGroupKeyKey(k))     continue
    if (typeof v !== 'string') continue
    slice[k] = v
  }
  const prev = session.get<Record<string, unknown> | undefined>(key)
  if (prev && shallowEqualStringMap(prev, slice)) return
  session.put(key, slice)
}

export function readPersistedLastTab(
  req: unknown,
  basePath: string,
  slug: string,
): string | undefined {
  const session = getSession(req)
  if (!session) return undefined
  const v = session.get<unknown>(lastTabKey(basePath, slug))
  if (typeof v !== 'string') return undefined
  return v
}

export function writePersistedLastTab(
  req: unknown,
  basePath: string,
  slug: string,
  tab: string,
): void {
  const session = getSession(req)
  if (!session) return
  const key = lastTabKey(basePath, slug)
  if (session.get<string>(key) === tab) return
  session.put(key, tab)
}

export function encodePersistedQuery(
  slice: Record<string, string>,
  tab:   string = '',
): string {
  const params = new URLSearchParams()
  if (tab !== '') params.set('tab', tab)
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
