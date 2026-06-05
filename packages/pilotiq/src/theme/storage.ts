import type { ThemeConfig } from './types.js'

/**
 * Adapter that persists a panel's theme overrides — the JSON blob
 * written when a user edits theme settings via the `themeEditor()`
 * plugin and reloaded on next boot.
 *
 * Two implementations ship: `databaseThemeStorage` (rides any rudder
 * ORM adapter's `query(table)` builder — native engine, Drizzle, …)
 * and `prismaThemeStorage` (writes through a Prisma `panelGlobal`
 * delegate). Apps on a key-value store or filesystem can implement
 * the three methods themselves.
 *
 * Contract:
 *
 * - `load()` returns `null` when no overrides have been persisted yet
 *   (fresh install). Throwing surfaces a configuration error to the
 *   caller — pilotiq does not swallow.
 * - `save(overrides)` writes the blob verbatim. The next `load()` must
 *   return a deep-equal copy. Throwing surfaces to the route handler
 *   as a 500.
 * - `clear()` deletes the row. Tolerating "not found" is the adapter's
 *   responsibility — `clear()` on an empty store is a no-op.
 */
export interface ThemeStorageAdapter {
  load(): Promise<Partial<ThemeConfig> | null>
  save(overrides: Partial<ThemeConfig>): Promise<void>
  clear(): Promise<void>
}

/**
 * Minimal Prisma surface used by `prismaThemeStorage`. Narrow enough
 * to keep the import surface decoupled from `PrismaClient`'s generated
 * types — apps swap in any client whose `panelGlobal` delegate matches
 * this shape.
 */
export interface PanelGlobalDelegate {
  panelGlobal: {
    findUnique(args: { where: { slug: string } }): Promise<{ data: string | object | null } | null>
    upsert(args: {
      where:  { slug: string }
      update: { data: string }
      create: { slug: string; data: string }
    }): Promise<unknown>
    delete(args: { where: { slug: string } }): Promise<unknown>
  }
}

export interface PrismaThemeStorageOptions {
  /** Row key written to `panelGlobal.slug`. Pass per-panel so multiple
   *  panels in the same app don't clobber each other. Typically
   *  `${panel.name}__theme`. */
  slug: string
}

/**
 * Default storage adapter — writes JSON to the `panelGlobal` row keyed
 * by `opts.slug`. The Prisma delegate is dependency-injected so consumers
 * pick how to resolve it (e.g. `app.make('prisma')`, a direct import, a
 * test stub).
 *
 * @example
 * ```ts
 * import { Pilotiq } from '@pilotiq/pilotiq'
 * import { themeEditor, prismaThemeStorage } from '@pilotiq/pilotiq/plugins'
 *
 * const adminPanel = Pilotiq.make('Admin')
 *   .use(themeEditor({
 *     storage: prismaThemeStorage(prisma, { slug: 'admin__theme' }),
 *   }))
 * ```
 */
export function prismaThemeStorage(
  prisma: PanelGlobalDelegate,
  opts:   PrismaThemeStorageOptions,
): ThemeStorageAdapter {
  const { slug } = opts
  return {
    async load() {
      const row = await prisma.panelGlobal.findUnique({ where: { slug } })
      if (!row?.data) return null
      const raw = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
      return raw as Partial<ThemeConfig>
    },
    async save(overrides) {
      const data = JSON.stringify(overrides)
      await prisma.panelGlobal.upsert({
        where:  { slug },
        update: { data },
        create: { slug, data },
      })
    },
    async clear() {
      try {
        await prisma.panelGlobal.delete({ where: { slug } })
      } catch (e) {
        if (!isRecordNotFound(e)) throw e
      }
    },
  }
}

function isRecordNotFound(e: unknown): boolean {
  return typeof e === 'object'
    && e !== null
    && (e as { code?: string }).code === 'P2025'
}

/**
 * Minimal query-builder surface used by `databaseThemeStorage`.
 * Structural subset of the rudder ORM adapter contract (`OrmAdapter`),
 * mirroring the duck-typed shape `notifications/database.ts` consumes —
 * the native engine, Drizzle, and any future adapter all satisfy it.
 */
export interface ThemeStorageQuery {
  where(column: string, value: unknown): ThemeStorageQuery
  first(): Promise<{ data: string | object | null } | null>
  updateAll(data: Record<string, unknown>): Promise<number>
  insertMany(rows: Record<string, unknown>[]): Promise<void>
  deleteAll(): Promise<number>
}

export interface ThemeStorageDb {
  query(table: string): ThemeStorageQuery
}

export interface DatabaseThemeStorageOptions {
  /** Row key written to the `slug` column. Pass per-panel so multiple
   *  panels in the same app don't clobber each other. Typically
   *  `${panel.name}__theme`. */
  slug: string
  /** Table name. Defaults to `'panelGlobal'` — the same row store
   *  `prismaThemeStorage` uses. Expected shape: `slug` TEXT primary
   *  key, `data` TEXT (JSON), nullable `updatedAt` DATETIME. */
  table?: string
}

/**
 * ORM-agnostic storage adapter — writes JSON to the `panelGlobal` row
 * keyed by `opts.slug` through any rudder ORM adapter (native engine,
 * Drizzle, …). The adapter is dependency-injected so consumers pick how
 * to resolve it (e.g. `app.make('db')`, a test stub).
 *
 * @example
 * ```ts
 * import { app } from '@rudderjs/core'
 * import { themeEditor, databaseThemeStorage } from '@pilotiq/pilotiq/plugins'
 *
 * const adminPanel = Pilotiq.make('Admin')
 *   .use(themeEditor({
 *     storage: databaseThemeStorage(() => app().make('db'), { slug: 'admin__theme' }),
 *   }))
 * ```
 */
export function databaseThemeStorage(
  db:   ThemeStorageDb | (() => ThemeStorageDb),
  opts: DatabaseThemeStorageOptions,
): ThemeStorageAdapter {
  const { slug, table = 'panelGlobal' } = opts
  // Lazy getter so `databaseThemeStorage(() => app.make('db'), …)` can be
  // wired in the panel module before the database provider has booted.
  const resolve = () => (typeof db === 'function' ? db() : db)
  return {
    async load() {
      let row: { data: string | object | null } | null
      try {
        row = await resolve().query(table).where('slug', slug).first()
      } catch (e) {
        // A missing table IS the fresh-install state — `rudder migrate`
        // boots the app (and with it this load()) BEFORE the migration
        // that creates the table has run. Treat it as "nothing persisted";
        // anything else (connection refused, bad SQL) still bubbles.
        if (isMissingTable(e)) return null
        throw e
      }
      if (!row?.data) return null
      const raw = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
      return raw as Partial<ThemeConfig>
    },
    async save(overrides) {
      const data = JSON.stringify(overrides)
      // ISO string, not a Date — better-sqlite3 can't bind Date objects.
      const updatedAt = new Date().toISOString()
      const q = resolve().query(table)
      const updated = await q.where('slug', slug).updateAll({ data, updatedAt })
      if (updated === 0) {
        await resolve().query(table).insertMany([{ slug, data, updatedAt }])
      }
    },
    async clear() {
      try {
        // deleteAll() on zero matching rows is a no-op — the contract's
        // "clear() on an empty store" case needs no special handling.
        await resolve().query(table).where('slug', slug).deleteAll()
      } catch (e) {
        // No table → nothing to clear. save() does NOT get this leniency —
        // an explicit write against a missing table is a config error.
        if (!isMissingTable(e)) throw e
      }
    },
  }
}

/** Missing-table probe across the three native drivers (sqlite message,
 *  pg `42P01` undefined_table, mysql `ER_NO_SUCH_TABLE`/1146). */
function isMissingTable(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const err = e as { message?: string; code?: string; errno?: number; cause?: unknown }
  if (err.code === '42P01' || err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146) return true
  if (typeof err.message === 'string' && /no such table|does not exist|doesn't exist/i.test(err.message)) return true
  return err.cause !== undefined && err.cause !== e && isMissingTable(err.cause)
}
