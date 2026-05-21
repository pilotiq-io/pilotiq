import { ServiceProvider } from '@rudderjs/core'
import type { Application } from '@rudderjs/core'
import type { Pilotiq } from './Pilotiq.js'
import { PilotiqRegistry } from './PilotiqRegistry.js'
import { registerPilotiqRoutes } from './routes.js'
import { migrateThemeOverrides } from './theme/migrate.js'
import { prismaThemeStorage } from './theme/storage.js'
import type { PanelGlobalDelegate, ThemeStorageAdapter } from './theme/storage.js'

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
    const { router } = await import('@rudderjs/router') as {
      router: Parameters<typeof registerPilotiqRoutes>[0]
    }

    for (const panel of PilotiqRegistry.all()) {
      if (panel.getConfig().themeEditor) {
        await loadThemeOverrides(this.app, panel)
      }
      registerPilotiqRoutes(router, panel)
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
    return null
  }
  if (!prisma || typeof prisma.panelGlobal?.findUnique !== 'function') return null

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
