/**
 * Database-backed notifications — server-side store helpers.
 *
 * Pilotiq doesn't ship a Prisma model; we read/write the
 * `notification` table that `@rudderjs/notification`'s
 * `NotificationProvider` publishes (`prisma/schema/notification.prisma`).
 * Apps that want bell-icon notifications add `NotificationProvider` to
 * their providers list and run `prisma generate`/`db push`; pilotiq
 * then queries the same table via `@rudderjs/orm`'s `ModelRegistry`
 * adapter so the wire shape matches what
 * `Notifier.send(user, new MyNotification())` already writes.
 *
 * `@rudderjs/orm` is a runtime soft-import — pilotiq has no hard
 * dependency on it. When the host app hasn't installed orm (or no
 * adapter is registered), every helper resolves to a clean
 * "store unavailable" sentinel rather than throwing.
 */

import type { NotificationMeta, NotificationType } from './Notification.js'
import type { NotificationActionMeta } from './types.js'

/** Wire shape returned by the list endpoint to the bell client. */
export interface DatabaseNotificationMeta {
  /** Stable PK from the `notification.id` column. */
  id:        string
  /** Unix-ms timestamp the row was created. */
  createdAt: number
  /** ISO `read_at` timestamp; absent when unread. */
  readAt?:   string
  /** Display title — read from the `data` JSON `title` key. */
  title:     string
  /** Optional supporting text. */
  body?:     string
  /** Optional UI tint. Mirrors the transient toast types so the bell can
   *  share badge styling with the toaster. */
  type?:     NotificationType
  /** Optional icon (registry name). */
  icon?:     string
  /** Optional click-through URL. When set, clicking the row navigates
   *  there + marks the notification as read. */
  url?:      string
  /** Optional action strip rendered below the body. Round-trips
   *  verbatim through the `data.actions` JSON column (`Notification`
   *  emits the slim wire shape; `rowToMeta` validates each entry and
   *  drops malformed ones with a `console.warn` rather than failing
   *  the dropdown). */
  actions?:  NotificationActionMeta[]
}

/** Raw row shape on the `notification` table — matches the schema
 *  shipped by `@rudderjs/notification`. The `data` column is a
 *  JSON-encoded string blob. */
interface NotificationRow {
  id:              string
  notifiable_id:   string
  notifiable_type: string
  type:            string
  data:            string | Record<string, unknown>
  read_at:         string | null
  created_at:      string
  updated_at:      string
}

/** Minimal query surface we use against the orm adapter. `Row` is the
 *  shape of a fetched record — threaded through so `paginate().data` and
 *  `get()` come back typed instead of `unknown[]`. */
interface QB<Row = unknown> {
  where(column: string, value: unknown): QB<Row>
  where(column: string, op: string, value: unknown): QB<Row>
  orderBy(column: string, dir?: 'ASC' | 'DESC'): QB<Row>
  paginate(page: number, perPage?: number): Promise<{ data: Row[]; total: number }>
  get?(): Promise<Row[]>
  count?(): Promise<number>
  update?(data: Record<string, unknown>): Promise<unknown>
  updateAll?(data: Record<string, unknown>): Promise<number>
  create?(data: Record<string, unknown>): Promise<unknown>
}

/** The slice of the orm adapter we depend on — a single `query(table)`
 *  entry point. Generic on the row type so call sites pick it per table. */
interface OrmAdapter {
  query<Row = unknown>(table: string): QB<Row>
}

/** Test-injected adapter override; `null` falls back to dynamic import. */
let _testAdapter: OrmAdapter | null | 'unset' = 'unset'

/** Soft-resolved orm adapter. `null` when no orm adapter is registered.
 *
 *  Prefers the rudder service container (`app().make('db')`) — the
 *  orm-prisma / orm-drizzle providers register the adapter as a
 *  globalThis-rooted singleton there, so this resolution path survives
 *  the Vite SSR module-cache duplication that breaks shared singletons
 *  in raw ES module land. Falls back to `ModelRegistry.get()` for
 *  setups that wired the adapter directly.
 *
 *  Both modules are imported indirectly so TypeScript doesn't try to
 *  resolve them at type-check time — pilotiq doesn't peer-depend on
 *  `@rudderjs/orm` or `@rudderjs/core` (the bell-icon is opt-in).
 */
async function adapter(): Promise<OrmAdapter | null> {
  if (_testAdapter !== 'unset') return _testAdapter
  const fromContainer = await resolveFromContainer()
  if (fromContainer) return fromContainer
  return resolveFromOrmModule()
}

async function resolveFromContainer(): Promise<OrmAdapter | null> {
  const moduleName = '@rudderjs/core'
  try {
    const mod = await import(/* @vite-ignore */ moduleName) as {
      app?: () => { make(key: string): unknown }
    }
    if (!mod.app) return null
    const adapter = mod.app().make('db')
    if (!adapter || typeof adapter !== 'object') return null
    if (typeof (adapter as { query?: unknown }).query !== 'function') return null
    return adapter as OrmAdapter
  } catch {
    return null
  }
}

async function resolveFromOrmModule(): Promise<OrmAdapter | null> {
  const moduleName = '@rudderjs/orm'
  try {
    const mod = await import(/* @vite-ignore */ moduleName) as {
      ModelRegistry?: { get(): OrmAdapter | null }
    }
    return mod.ModelRegistry?.get() ?? null
  } catch {
    return null
  }
}

/** Notification-table row JSON-decoded `data` payload. We always store
 *  pilotiq's `NotificationMeta` shape; rows written by
 *  `@rudderjs/notification.Notifier.send(...)` may carry arbitrary
 *  application keys — we surface what we can recognize and ignore the rest. */
function parseRowData(raw: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) as Record<string, unknown> }
  catch { return {} }
}

function rowToMeta(row: NotificationRow): DatabaseNotificationMeta {
  const data = parseRowData(row.data)
  const meta: DatabaseNotificationMeta = {
    id:        row.id,
    createdAt: Date.parse(row.created_at) || Date.now(),
    title:     typeof data['title'] === 'string' ? (data['title'] as string) : '',
  }
  if (row.read_at) meta.readAt = row.read_at
  if (typeof data['body'] === 'string') meta.body = data['body'] as string
  if (typeof data['icon'] === 'string') meta.icon = data['icon'] as string
  if (typeof data['url']  === 'string') meta.url  = data['url']  as string
  if (
    data['type'] === 'info' || data['type'] === 'success' ||
    data['type'] === 'warning' || data['type'] === 'error'
  ) {
    meta.type = data['type']
  }
  const actions = parseStoredActions(data['actions'])
  if (actions.length > 0) meta.actions = actions
  return meta
}

/**
 * Validate the stored action array shape — the `data.actions` column
 * is end-user controllable through the `Notification` builder, so we
 * defend in depth: malformed entries are dropped with a warning rather
 * than crashing the bell dropdown render.
 *
 * Required: `name: string`, `label: string`, exactly one of `url` /
 * `post` / `handler` set to a string.
 */
function parseStoredActions(raw: unknown): NotificationActionMeta[] {
  if (!Array.isArray(raw)) return []
  const out: NotificationActionMeta[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e['name']  !== 'string' || !e['name'])  { warnDrop(e, 'missing name'); continue }
    if (typeof e['label'] !== 'string' || !e['label']) { warnDrop(e, 'missing label'); continue }
    const url     = typeof e['url']     === 'string' ? e['url']     as string : undefined
    const post    = typeof e['post']    === 'string' ? e['post']    as string : undefined
    const handler = typeof e['handler'] === 'string' ? e['handler'] as string : undefined
    const dispatchModes = [url, post, handler].filter(v => v !== undefined).length
    if (dispatchModes !== 1) { warnDrop(e, 'must set exactly one of url/post/handler'); continue }

    const action: NotificationActionMeta = { name: e['name'] as string, label: e['label'] as string }
    if (url     !== undefined) action.url     = url
    if (post    !== undefined) action.post    = post
    if (handler !== undefined) action.handler = handler
    if (e['payload'] && typeof e['payload'] === 'object' && !Array.isArray(e['payload'])) {
      action.payload = e['payload'] as Record<string, unknown>
    }
    if (typeof e['color']    === 'string') action.color    = e['color']    as never
    if (typeof e['icon']     === 'string') action.icon     = e['icon']     as string
    if (e['outlined']        === true)     action.outlined = true
    if (typeof e['size']     === 'string') action.size     = e['size']     as never
    if (e['openUrlInNewTab'] === true)     action.openUrlInNewTab = true
    if (e['markAsRead']      === true)     action.markAsRead      = true
    out.push(action)
  }
  return out
}

function warnDrop(entry: Record<string, unknown>, reason: string): void {
  // Only warn in non-production — keep the bell quiet on prod where
  // a dropped row is preferable to console spam.
  if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'production') return

  console.warn(
    `[Pilotiq] notification action dropped: ${reason}. Entry:`,
    entry,
  )
}

export interface ListOptions {
  /** `notifiable_type` column value. */
  notifiableType: string
  /** `notifiable_id` column value (typically the user's id). */
  notifiableId:   string
  /** Hard cap on rows returned. Default 25. */
  limit?:         number
  /** When true, only rows with `read_at IS NULL` are returned. */
  unreadOnly?:    boolean
}

export interface ListResult {
  notifications: DatabaseNotificationMeta[]
  unreadCount:   number
}

/**
 * Fetch the latest notifications for a notifiable + the unread count.
 * Returns `{ notifications: [], unreadCount: 0 }` when no orm adapter is
 * registered — apps without a database stay quiet rather than 500.
 */
export async function listForUser(opts: ListOptions): Promise<ListResult> {
  const adp = await adapter()
  if (!adp) return { notifications: [], unreadCount: 0 }

  const limit = opts.limit ?? 25
  let q: QB<NotificationRow> = adp.query<NotificationRow>('notification')
    .where('notifiable_type', opts.notifiableType)
    .where('notifiable_id',   opts.notifiableId)
  if (opts.unreadOnly) q = q.where('read_at', null)
  q = q.orderBy('created_at', 'DESC')

  const [page, count] = await Promise.all([
    q.paginate(1, limit),
    unreadCount({ notifiableType: opts.notifiableType, notifiableId: opts.notifiableId }),
  ])
  const rows = page.data.map(rowToMeta)
  return { notifications: rows, unreadCount: count }
}

/**
 * Fetch a single row by id, scoped to the notifiable. Returns
 * `undefined` when no row matches (already-deleted / wrong owner /
 * store unavailable). Used by the notification action route to look
 * up the stored `data.actions` array before dispatching.
 */
export async function findOneForUser(
  id: string,
  opts: { notifiableType: string; notifiableId: string },
): Promise<DatabaseNotificationMeta | undefined> {
  const adp = await adapter()
  if (!adp) return undefined
  const q = adp.query<NotificationRow>('notification')
    .where('notifiable_type', opts.notifiableType)
    .where('notifiable_id',   opts.notifiableId)
    .where('id',              id)
  const page = await q.paginate(1, 1)
  const row = page.data[0]
  if (!row) return undefined
  return rowToMeta(row)
}

/** Count rows with `read_at IS NULL` for the notifiable. */
export async function unreadCount(opts: {
  notifiableType: string
  notifiableId:   string
}): Promise<number> {
  const adp = await adapter()
  if (!adp) return 0
  const q = adp.query<NotificationRow>('notification')
    .where('notifiable_type', opts.notifiableType)
    .where('notifiable_id',   opts.notifiableId)
    .where('read_at', null)
  // Cheap path when the adapter implements `count()`; fall back to
  // paginate(1,1).total which both Prisma and Drizzle adapters support.
  if (q.count) return q.count()
  const page = await q.paginate(1, 1)
  return page.total
}

/**
 * Mark a single notification row as read. Always scoped to
 * `notifiableId` so a tampered POST can't mark another user's row.
 *
 * Returns `true` when a row was updated, `false` when no row matched
 * (already-deleted / wrong owner / store unavailable).
 */
export async function markAsRead(
  id: string,
  opts: { notifiableType: string; notifiableId: string },
): Promise<boolean> {
  const adp = await adapter()
  if (!adp) return false
  const q = adp.query<NotificationRow>('notification')
    .where('notifiable_type', opts.notifiableType)
    .where('notifiable_id',   opts.notifiableId)
    .where('id',              id)
  if (!q.updateAll) return false
  const n = await q.updateAll({ read_at: new Date().toISOString() })
  return n > 0
}

/** Mark a row unread again — used by the bell's "mark unread" affordance. */
export async function markAsUnread(
  id: string,
  opts: { notifiableType: string; notifiableId: string },
): Promise<boolean> {
  const adp = await adapter()
  if (!adp) return false
  const q = adp.query<NotificationRow>('notification')
    .where('notifiable_type', opts.notifiableType)
    .where('notifiable_id',   opts.notifiableId)
    .where('id',              id)
  if (!q.updateAll) return false
  const n = await q.updateAll({ read_at: null })
  return n > 0
}

/** Mark every unread notification for the notifiable as read. */
export async function markAllAsRead(opts: {
  notifiableType: string
  notifiableId:   string
}): Promise<number> {
  const adp = await adapter()
  if (!adp) return 0
  const q = adp.query<NotificationRow>('notification')
    .where('notifiable_type', opts.notifiableType)
    .where('notifiable_id',   opts.notifiableId)
    .where('read_at', null)
  if (!q.updateAll) return 0
  return q.updateAll({ read_at: new Date().toISOString() })
}

/**
 * Insert a notification row directly. Powers
 * `Notification.make(...).sendToDatabase(recipient)`. Throws when the
 * orm adapter isn't registered — the caller has explicitly asked to
 * persist, so silent no-op would hide a real config error.
 */
export async function persist(opts: {
  notifiableType: string
  notifiableId:   string
  type?:          string
  data:           NotificationMeta & Record<string, unknown>
}): Promise<{ id: string }> {
  const adp = await adapter()
  if (!adp) {
    throw new Error(
      '[Pilotiq] sendToDatabase() called but no @rudderjs/orm adapter is registered. ' +
      'Add a database provider (orm-prisma / orm-drizzle) to your providers list, ' +
      "or call .sendToDatabase() only when the orm is wired up.",
    )
  }
  const q = adp.query<NotificationRow>('notification')
  if (!q.create) {
    throw new Error('[Pilotiq] orm adapter does not support `query.create()`.')
  }
  const id = `pn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  const now = new Date().toISOString()
  await q.create({
    id,
    notifiable_id:   opts.notifiableId,
    notifiable_type: opts.notifiableType,
    type:            opts.type ?? 'PilotiqNotification',
    data:            JSON.stringify(opts.data),
    read_at:         null,
    created_at:      now,
    updated_at:      now,
  })
  return { id }
}

/** @internal — test seam. Inject a fake adapter (or `null` to mimic
 *  "store unavailable"). Pass `undefined` to clear and fall back to the
 *  dynamic `@rudderjs/orm` import. Tests should clear in `afterEach`. */
export function _setTestAdapter(
  adp: OrmAdapter | null | undefined,
): void {
  _testAdapter = adp === undefined ? 'unset' : adp
}

/** @internal — exposed for tests; lets a unit test inject a fake
 *  ModelRegistry without monkey-patching dynamic-import. */
export const _internal = {
  parseRowData,
  rowToMeta,
}
