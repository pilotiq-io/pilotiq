import type { Router } from '@rudderjs/router'
import { view } from '@rudderjs/view'
import type { Pilotiq } from './Pilotiq.js'
import type { Page } from './Page.js'
import { resolveSchema, type SchemaContext } from './schema/resolveSchema.js'
import { resolveTheme } from './theme/resolve.js'
import type { ThemeConfig, ThemeMeta } from './theme/types.js'
import { presets } from './theme/presets.js'
import { baseColors } from './theme/base-colors.js'
import { HUE_NAMES } from './theme/colors.js'
import { migrateThemeOverrides } from './theme/migrate.js'
import { radiusMap } from './theme/radius.js'

function panelInfo(pilotiq: Pilotiq) {
  const cfg = pilotiq.getConfig()
  const merged = pilotiq.getMergedTheme()
  const theme: ThemeMeta | undefined = merged ? resolveTheme(merged) : undefined
  return {
    name: cfg.name,
    branding: cfg.branding,
    resources: cfg.resources.map(R => ({
      label: R.label, slug: R.getSlug(), icon: R.icon,
    })),
    pages: cfg.pages.map(P => ({
      label: P.getLabel(), slug: P.getSlug(), icon: P.icon,
    })),
    theme,
    themeEditor: cfg.themeEditor ?? false,
  }
}

/**
 * Resolve a Page's schema with a given render context, returning the
 * serialized element tree for the client. All resource and custom-page
 * routes funnel through this so the schema pipeline is identical.
 */
async function resolvePageSchema(
  PageClass: typeof Page,
  ctx: SchemaContext & { mode?: 'table' | 'create' | 'edit' | 'view' },
) {
  return resolveSchema(c => PageClass.schema({ ...ctx, ...c }), ctx)
}

export function registerPilotiqRoutes(
  router: Router,
  pilotiq: Pilotiq,
): void {
  const cfg = pilotiq.getConfig()
  const base = cfg.path

  // ── Dashboard (1-segment) ─────────────────────────────
  router.get(base, async () => {
    const schemaData = await resolveSchema(cfg.schema, {})
    return view('pilotiq.dashboard', {
      panel: panelInfo(pilotiq),
      basePath: base,
      layout: cfg.layout,
      schemaData,
    })
  })

  // ── Resource routes ───────────────────────────────────
  // Each resource exposes index/create/edit/view via Resource.resolvePages().
  // URL conventions are fixed by role; the Page class supplies the schema.
  for (const R of cfg.resources) {
    const slug  = R.getSlug()
    const pages = R.resolvePages()

    // Index — 2-segment URL
    if (pages.index) {
      const PageClass = pages.index
      router.get(`${base}/${slug}`, async () => {
        const schemaData = await resolvePageSchema(PageClass, { mode: 'table' })
        return view('pilotiq.slug', {
          pageType: 'resource',
          panel:    panelInfo(pilotiq),
          page:     PageClass.toMeta(),
          resource: { label: R.label, labelSingular: R.labelSingular, slug, icon: R.icon },
          basePath: base,
          layout:   cfg.layout,
          schemaData,
        })
      })
    }

    // Create — 3-segment URL with /create suffix
    if (pages.create) {
      const PageClass = pages.create
      router.get(`${base}/${slug}/create`, async () => {
        const schemaData = await resolvePageSchema(PageClass, { mode: 'create' })
        return view('pilotiq.resource-create', {
          panel:    panelInfo(pilotiq),
          page:     PageClass.toMeta(),
          resource: { label: R.labelSingular, slug, icon: R.icon },
          mode:     'create' as const,
          basePath: base,
          layout:   cfg.layout,
          schemaData,
        })
      })
    }

    // Edit — 4-segment URL with /edit suffix. Record loading lands in 2.4.
    if (pages.edit) {
      const PageClass = pages.edit
      router.get(`${base}/${slug}/:id/edit`, async (req) => {
        const recordId = req.params['id']
        const schemaData = await resolvePageSchema(PageClass, { mode: 'edit', recordId })
        return view('pilotiq.resource-edit', {
          panel:    panelInfo(pilotiq),
          page:     PageClass.toMeta(),
          resource: { label: R.labelSingular, slug, icon: R.icon },
          mode:     'edit' as const,
          recordId,
          basePath: base,
          layout:   cfg.layout,
          schemaData,
        })
      })
    }
  }

  // ── Custom pages (2-segment, slug route) ──────────────
  for (const PageClass of cfg.pages) {
    const pageSlug = PageClass.getSlug()

    router.get(`${base}/${pageSlug}`, async () => {
      const schemaData = await resolvePageSchema(PageClass, {})
      return view('pilotiq.slug', {
        pageType: 'page',
        panel:    panelInfo(pilotiq),
        page:     PageClass.toMeta(),
        schemaData,
        basePath: base,
        layout:   cfg.layout,
      })
    })
  }

  // ── Theme editor ──────────────────────────────────────
  if (cfg.themeEditor) {
    router.get(`${base}/theme`, async () => {
      return view('pilotiq.theme', {
        panel:       panelInfo(pilotiq),
        basePath:    base,
        layout:      cfg.layout,
        themeConfig: pilotiq.getMergedTheme() ?? {},
      })
    })

    router.get(`${base}/api/_theme`, async (_req, res) => {
      let overrides: Partial<ThemeConfig> | null = null
      try {
        const { app } = await import(/* @vite-ignore */ '@rudderjs/core') as { app(): { make(key: string): unknown } }
        const prisma = app().make('prisma') as any
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
        const prisma = app().make('prisma') as any
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
        const prisma = app().make('prisma') as any
        const slug = `${cfg.name}__theme`
        await prisma.panelGlobal.delete({ where: { slug } }).catch(() => {})
        pilotiq.setThemeOverrides(undefined)
      } catch { /* ignore */ }
      return res.json({ ok: true })
    })
  }
}
