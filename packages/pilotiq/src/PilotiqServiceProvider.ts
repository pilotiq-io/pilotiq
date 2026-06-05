import { ServiceProvider } from '@rudderjs/core'
import type { Application } from '@rudderjs/core'
import type { Pilotiq } from './Pilotiq.js'
import { PilotiqRegistry } from './PilotiqRegistry.js'
import { registerPilotiqRoutes } from './routes.js'
import { migrateThemeOverrides } from './theme/migrate.js'
import { databaseThemeStorage, prismaThemeStorage } from './theme/storage.js'
import type { PanelGlobalDelegate, ThemeStorageAdapter, ThemeStorageDb } from './theme/storage.js'

// ─── Service Provider ─────────────────────────────────────

const autoFallbackWarned = new Set<string>()

class PilotiqServiceProvider extends ServiceProvider {
  private panels: Pilotiq[]

  constructor(app: Application, panels: Pilotiq[]) {
    super(app)
    this.panels = panels
  }

  register(): void {
    PilotiqRegistry.reset()
    for (const panel of this.panels) {
      PilotiqRegistry.register(panel)
    }
  }

  async boot(): Promise<void> {
    // Variable-specifier dynamic import (same idiom as notifications/database.ts)
    // — boot() is server-only, but this provider rides the main barrel into the
    // CLIENT graph via the generated `_components.ts` → AdminPanel chain. A
    // literal `import('@rudderjs/router')` is statically analyzable, so Vite
    // would lazily optimize @rudderjs/router into the browser deps mid-session
    // (a "new dependencies optimized" reload) — and router must never be
    // client-pre-bundled (its @rudderjs/console → @clack/prompts chain).
    const routerModule = '@rudderjs/router'
    const { router, runWithGroup } = await import(/* @vite-ignore */ routerModule) as {
      router: Parameters<typeof registerPilotiqRoutes>[0]
      runWithGroup?: <R>(group: 'web' | 'api', fn: () => R) => R
    }

    for (const panel of PilotiqRegistry.all()) {
      if (panel.getConfig().themeEditor) {
        await loadThemeOverrides(this.app, panel)
      }
      // Panel pages are web pages — register them inside the 'web' route
      // group so the framework's group middleware (Session / Auth) runs in
      // front of every panel route. Without this, apps using @rudderjs/auth
      // never see `req.user` on panel requests (`.user()` resolves null,
      // `.guard()` 401s a logged-in browser) and `persistFiltersInSession`
      // silently no-ops (no `req.session`). Routes register synchronously,
      // which is the supported runWithGroup case. Optional-chained for
      // @rudderjs/router versions that predate group tagging.
      if (runWithGroup) {
        runWithGroup('web', () => registerPilotiqRoutes(router, panel))
      } else {
        registerPilotiqRoutes(router, panel)
      }
    }
  }
}

/**
 * Resolve the panel's theme storage adapter and hydrate any persisted
 * overrides onto the panel.
 *
 * - Explicit `themeEditor({ storage })`: errors bubble (the user opted
 *   in, misconfiguration should surface loudly).
 * - Implicit Prisma fallback: errors swallowed for back-compat with a
 *   one-time deprecation warning. Removing this branch is the breaking
 *   change scheduled for the next minor.
 * - Implicit `'db'` adapter fallback: when no `'prisma'` binding exists,
 *   any rudder ORM adapter (native engine, Drizzle) registered as `'db'`
 *   persists to the same `panelGlobal` table via `databaseThemeStorage`.
 *   Errors swallowed — the table may not exist until the app migrates it.
 */
async function loadThemeOverrides(app: Application, panel: Pilotiq): Promise<void> {
  const adapter = resolveThemeStorage(app, panel)
  if (!adapter) return

  const isExplicit = panel.getConfig().themeStorage === adapter
  if (!isExplicit) panel._setThemeStorage(adapter)

  try {
    const overrides = await adapter.load()
    if (overrides) panel.setThemeOverrides(migrateThemeOverrides(overrides))
  } catch (e) {
    if (isExplicit) throw e
    // Implicit fallback: swallow connection / schema errors. Removed
    // alongside the auto-fallback branch in a future minor.
  }
}

function resolveThemeStorage(app: Application, panel: Pilotiq): ThemeStorageAdapter | null {
  const explicit = panel.getConfig().themeStorage
  if (explicit) return explicit

  let prisma: PanelGlobalDelegate | null
  try {
    prisma = app.make('prisma') as PanelGlobalDelegate
  } catch {
    prisma = null
  }
  if (!prisma || typeof prisma.panelGlobal?.findUnique !== 'function') {
    return resolveDbThemeStorage(app, panel)
  }

  const panelName = panel.getConfig().name
  if (!autoFallbackWarned.has(panelName)) {
    autoFallbackWarned.add(panelName)
    console.warn(
      `[pilotiq] themeEditor() on panel "${panelName}" is using the implicit ` +
      `Prisma fallback for theme persistence. Pass storage explicitly — ` +
      `themeEditor({ storage: prismaThemeStorage(prisma, { slug: '${panelName}__theme' }) }) — ` +
      `the implicit fallback is deprecated and will be removed in a future minor.`,
    )
  }
  return prismaThemeStorage(prisma, { slug: `${panelName}__theme` })
}

/**
 * Non-Prisma implicit fallback — any rudder ORM adapter bound as `'db'`
 * (native engine, Drizzle) whose `query(table)` builder satisfies the
 * `ThemeStorageDb` shape. Not deprecated: `'db'` is the adapter registry
 * every rudder database provider populates, so it's the going-forward
 * default. Pass `themeEditor({ storage })` to override slug or table.
 */
function resolveDbThemeStorage(app: Application, panel: Pilotiq): ThemeStorageAdapter | null {
  let db: ThemeStorageDb | null
  try {
    db = app.make('db') as ThemeStorageDb
  } catch {
    return null
  }
  if (!db || typeof db.query !== 'function') return null

  const panelName = panel.getConfig().name
  return databaseThemeStorage(db, { slug: `${panelName}__theme` })
}

/** @internal — test seam; resets the "deprecation already warned" memo. */
export function _resetThemeFallbackWarned(): void {
  autoFallbackWarned.clear()
}

// ─── Factory ──────────────────────────────────────────────

/**
 * Register one or more Pilotiq panels and mount their view routes.
 *
 * @example
 * import { pilotiq } from '@pilotiq/pilotiq'
 * import { adminPanel } from './app/Pilotiq/AdminPanel.js'
 *
 * export default [
 *   pilotiq([adminPanel]),
 * ]
 */
export function pilotiq(
  panelList: Pilotiq[],
): new (app: Application) => ServiceProvider {
  return class PilotiqProvider extends PilotiqServiceProvider {
    constructor(app: Application) {
      super(app, panelList)
    }
  }
}
