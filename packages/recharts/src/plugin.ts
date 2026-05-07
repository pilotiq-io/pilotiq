import type { PilotiqPlugin } from '@pilotiq/pilotiq'
import { registerChartRenderer } from './register.js'

/**
 * Pilotiq plugin that registers the Recharts-based renderer for `Chart`
 * widgets.
 *
 * @example
 * ```ts
 * import { Pilotiq } from '@pilotiq/pilotiq'
 * import { recharts } from '@pilotiq/recharts'
 *
 * Pilotiq.make('Admin').plugins([recharts()])
 * ```
 */
export function recharts(): PilotiqPlugin {
  return {
    name: '@pilotiq/recharts',
    register() {
      registerChartRenderer()
    },
  }
}
