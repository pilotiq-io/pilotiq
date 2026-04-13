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

    for (const panel of PilotiqRegistry.all()) {
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
