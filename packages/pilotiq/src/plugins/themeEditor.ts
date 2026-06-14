import type { PilotiqPlugin } from '../Pilotiq.js'
import type { ThemeStorageAdapter } from '../theme/storage.js'
import { ThemeSettingsPane } from '../react/ThemeSettingsPane.js'

export interface ThemeEditorOptions {
  /**
   * Override persistence adapter. Defaults to the implicit Prisma
   * fallback (auto-resolved from `app.make('prisma')` against the
   * `panelGlobal` row) — that fallback is deprecated; pass an explicit
   * adapter to opt out and silence the deprecation warning.
   *
   * @example
   * ```ts
   * import { prismaThemeStorage, themeEditor } from '@pilotiq/pilotiq/plugins'
   *
   * .use(themeEditor({
   *   storage: prismaThemeStorage(prisma, { slug: 'admin__theme' }),
   * }))
   * ```
   */
  storage?: ThemeStorageAdapter
}

/**
 * Theme editor plugin — adds an interactive theme customization page
 * with live preview, save/reset functionality, and DB persistence.
 *
 * Surfaces as the built-in "Appearance" pane inside the System Settings
 * shell (`${base}/settings/appearance`) — registered through
 * `panel.settingsPane()`, the same iOS-style seam any package uses to
 * inject its own settings.
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
export function themeEditor(opts: ThemeEditorOptions = {}): PilotiqPlugin {
  return {
    name: 'theme-editor',
    register(panel) {
      // Keeps the `${base}/api/_theme` persistence endpoints mounted and
      // `getMergedTheme()` resolving — the Theme pane reads/writes those.
      panel.enableThemeEditor()
      if (opts.storage) panel._setThemeStorage(opts.storage)
      panel.settingsPane({
        id:     'appearance',
        label:  'Appearance',
        icon:   'palette',
        group:  'General',
        sort:   10,
        render: ThemeSettingsPane,
      })
    },
  }
}
