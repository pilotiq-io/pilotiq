import { ServiceProvider } from '@rudderjs/core'
import type { Application } from '@rudderjs/core'
import type { Pilotiq } from './Pilotiq.js'
import { PilotiqRegistry } from './PilotiqRegistry.js'
import { registerPilotiqRoutes } from './routes.js'

// ─── Service Provider ─────────────────────────────────────

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

    // Load saved theme overrides from DB for panels with themeEditor enabled
    for (const panel of PilotiqRegistry.all()) {
      if (panel.getConfig().themeEditor) {
        try {
          const prisma = this.app.make('prisma') as any
          const slug = `${panel.getConfig().name}__theme`
          const row = await prisma.panelGlobal.findUnique({ where: { slug } })
          if (row?.data) {
            const overrides = typeof row.data === 'string' ? JSON.parse(row.data as string) : row.data
            panel.setThemeOverrides(overrides)
          }
        } catch { /* no DB or no table — use code defaults */ }
      }
      registerPilotiqRoutes(router, panel)
    }
  }
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
