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

/** Minimal Prisma surface used by the theme editor — narrow enough to
 *  keep the DI lookup type-safe without dragging in `PrismaClient`,
 *  which would couple the package to a concrete schema. */
type PanelGlobalRow = { data: string | object | null }
type PanelGlobalDelegate = {
  panelGlobal: {
    findUnique(args: { where: { slug: string } }): Promise<PanelGlobalRow | null>
    upsert(args: {
      where:  { slug: string }
      update: { data: string }
      create: { slug: string; data: string }
    }): Promise<unknown>
    delete(args: { where: { slug: string } }): Promise<unknown>
  }
}

/**
 * Register the theme editor routes — the `${base}/theme` editor page
 * plus the `${base}/api/_theme` GET / PUT / DELETE persistence endpoints.
 * Only mounted when `cfg.themeEditor` is set (caller checks first).
 *
 * Pulled out of `registerPilotiqRoutes` in 2026-05-12 (Phase 3 of the
 * routes.ts split).
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
    })
  })

  router.get(`${base}/api/_theme`, async (_req, res) => {
    let overrides: Partial<ThemeConfig> | null = null
    try {
      const { app } = await import(/* @vite-ignore */ '@rudderjs/core') as { app(): { make(key: string): unknown } }
      const prisma = app().make('prisma') as PanelGlobalDelegate
      const slug = `${cfg.name}__theme`
      const row = await prisma.panelGlobal.findUnique({ where: { slug } })
      if (row?.data) {
        const raw = typeof row.data === 'string' ? JSON.parse(row.data as string) : row.data
        overrides = migrateThemeOverrides(raw)
      }
    } catch { /* no DB or no table — that's fine */ }

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
    try {
      const overrides = req.body as Partial<ThemeConfig>
      const { app } = await import(/* @vite-ignore */ '@rudderjs/core') as { app(): { make(key: string): unknown } }
      const prisma = app().make('prisma') as PanelGlobalDelegate
      const slug = `${cfg.name}__theme`

      await prisma.panelGlobal.upsert({
        where:  { slug },
        update: { data: JSON.stringify(overrides) },
        create: { slug, data: JSON.stringify(overrides) },
      })

      pilotiq.setThemeOverrides(overrides)
      return res.json({ ok: true })
    } catch (e) {
      return res.status(500).json({ message: e instanceof Error ? e.message : 'Failed to save theme' })
    }
  })

  router.delete(`${base}/api/_theme`, async (_req, res) => {
    try {
      const { app } = await import(/* @vite-ignore */ '@rudderjs/core') as { app(): { make(key: string): unknown } }
      const prisma = app().make('prisma') as PanelGlobalDelegate
      const slug = `${cfg.name}__theme`
      await prisma.panelGlobal.delete({ where: { slug } }).catch(() => {})
      pilotiq.setThemeOverrides(undefined)
    } catch { /* ignore */ }
    return res.json({ ok: true })
  })
}
