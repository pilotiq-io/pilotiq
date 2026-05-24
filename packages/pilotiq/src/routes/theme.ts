import type { Router } from '@rudderjs/router'
import { view } from '@rudderjs/view'
import type { Pilotiq } from '../Pilotiq.js'
import type { ThemeConfig } from '../theme/types.js'
import { presets } from '../theme/presets.js'
import { baseColors } from '../theme/base-colors.js'
import { HUE_NAMES } from '../theme/colors.js'
import { migrateThemeOverrides } from '../theme/migrate.js'
import { radiusMap } from '../theme/radius.js'
import { panelInfo } from '../pageData.js'

/**
 * Register the theme editor routes — the `${base}/theme` editor page
 * plus the `${base}/api/_theme` GET / PUT / DELETE persistence endpoints.
 * Only mounted when `cfg.themeEditor` is set (caller checks first).
 *
 * Storage persists through `panel.getThemeStorage()` — the adapter
 * resolved by the service provider's boot pass (explicit when
 * `themeEditor({ storage })` was set, otherwise the implicit Prisma
 * fallback while that back-compat branch is still active).
 */
export function registerThemeRoutes(
  router:  Router,
  pilotiq: Pilotiq,
  base:    string,
): void {
  const cfg = pilotiq.getConfig()

  router.get(`${base}/theme`, async (req) => {
    return view('pilotiq.theme', {
      panel:       await panelInfo(pilotiq, req),
      basePath:    base,
      layout:      cfg.layout,
      themeConfig: pilotiq.getMergedTheme() ?? {},
      // Pure code-level defaults (the panel's `.theme()` config, sans DB
      // overrides) — the editor's "Reset to Defaults" snaps back to these.
      codeTheme:   cfg.theme ?? {},
    })
  })

  router.get(`${base}/api/_theme`, async (_req, res) => {
    let overrides: Partial<ThemeConfig> | null = null
    const storage = pilotiq.getThemeStorage()
    if (storage) {
      try {
        const raw = await storage.load()
        if (raw) overrides = migrateThemeOverrides(raw)
      } catch (e) {
        console.warn('[pilotiq] failed to load theme overrides:', e)
      }
    }

    return res.json({
      config:    cfg.theme ?? {},
      overrides: overrides ?? {},
      options: {
        presets:       Object.keys(presets),
        baseColors:    Object.keys(baseColors),
        themeColors:   ['base', ...HUE_NAMES],
        chartColors:   ['base', ...HUE_NAMES],
        radii:         Object.keys(radiusMap),
        iconLibraries: ['lucide', 'tabler', 'phosphor', 'remix'],
      },
    })
  })

  router.put(`${base}/api/_theme`, async (req, res) => {
    const storage = pilotiq.getThemeStorage()
    if (!storage) {
      return res.status(500).json({ message: 'No theme storage adapter configured.' })
    }
    try {
      const overrides = req.body as Partial<ThemeConfig>
      await storage.save(overrides)
      pilotiq.setThemeOverrides(overrides)
      return res.json({ ok: true })
    } catch (e) {
      return res.status(500).json({ message: e instanceof Error ? e.message : 'Failed to save theme' })
    }
  })

  router.delete(`${base}/api/_theme`, async (_req, res) => {
    const storage = pilotiq.getThemeStorage()
    if (storage) {
      try {
        await storage.clear()
      } catch (e) {
        console.warn('[pilotiq] failed to clear theme overrides:', e)
      }
    }
    pilotiq.setThemeOverrides(undefined)
    return res.json({ ok: true })
  })
}
