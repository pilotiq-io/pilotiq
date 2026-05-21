import type { ThemeConfig } from './types.js'

/**
 * Adapter that persists a panel's theme overrides — the JSON blob
 * written when a user edits theme settings via the `themeEditor()`
 * plugin and reloaded on next boot.
 *
 * The shipped implementation is `prismaThemeStorage`, which writes to
 * the `panelGlobal` row created by `@rudderjs/orm-prisma`. Apps on a
 * different ORM, key-value store, or filesystem can implement the
 * three methods themselves.
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
