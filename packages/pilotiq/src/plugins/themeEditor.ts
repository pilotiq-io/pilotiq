import type { PilotiqPlugin } from '../Pilotiq.js'

/**
 * Theme editor plugin — adds an interactive theme customization page
 * with live preview, save/reset functionality, and DB persistence.
 *
 * @example
 * ```ts
 * import { Pilotiq } from '@pilotiq/pilotiq'
 * import { themeEditor } from '@pilotiq/pilotiq/plugins'
 *
 * Pilotiq.make('Admin')
 *   .theme({ preset: 'vega', themeColor: 'blue' })
 *   .use(themeEditor())
 * ```
 */
export function themeEditor(): PilotiqPlugin {
  return {
    name: 'theme-editor',
    register(panel) {
      panel.enableThemeEditor()
    },
  }
}
