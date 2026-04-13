import type { Router } from '@rudderjs/router'
import { view } from '@rudderjs/view'
import type { Pilotiq } from './Pilotiq.js'
import type { Resource } from './Resource.js'
import type { Page } from './Page.js'
import { resolveSchema } from './schema/resolveSchema.js'
import { resolveTheme } from './theme/resolve.js'
import type { ThemeConfig, ThemeMeta } from './theme/types.js'
import { presets } from './theme/presets.js'
import { baseColors } from './theme/base-colors.js'
import { accentColors } from './theme/accent-colors.js'
import { chartPalettes } from './theme/chart-palettes.js'
import { radiusMap } from './theme/radius.js'

function panelInfo(panel: Pilotiq) {
  const cfg = panel.getConfig()
  const merged = panel.getMergedTheme()
  const theme: ThemeMeta | undefined = merged ? resolveTheme(merged) : undefined
  return {
    name: cfg.name,
    branding: cfg.branding,
    resources: cfg.resources.map(R => {
      const Ctor = R.constructor as typeof Resource
      return { label: Ctor.label, slug: Ctor.getSlug(), icon: Ctor.icon }
    }),
    pages: cfg.pages.map(P => ({
      label: P.getLabel(), slug: P.getSlug(), icon: P.icon,
    })),
    theme,
    themeEditor: cfg.themeEditor ?? false,
  }
}

export function registerPilotiqRoutes(
  router: Router,
  pilotiq: Pilotiq,
): void {
  const cfg = pilotiq.getConfig()
  const base = cfg.path

  // Dashboard
  router.get(base, async () => {
    const schemaData = await resolveSchema(cfg.schema, {})
    return view('pilotiq.dashboard', {
      panel: panelInfo(pilotiq),
      basePath: base,
      layout: cfg.layout,
      schemaData,
    })
  })

  // Resource routes
  for (const R of cfg.resources) {
    const Ctor = R.constructor as typeof Resource
    const slug = Ctor.getSlug()

    // Index
    router.get(`${base}/${slug}`, async () => {
      const tableConfig = R.table()
      return view('pilotiq.slug', {
        pageType: 'resource',
        panel:    panelInfo(pilotiq),
        resource: { label: Ctor.label, labelSingular: Ctor.labelSingular, slug, icon: Ctor.icon },
        columns:  tableConfig.columns.map(col => ({
          name: col.name,
          label: col.getLabel(),
          sortable: col.isSortable(),
          searchable: col.isSearchable(),
        })),
        basePath: base,
        layout: cfg.layout,
      })
    })

    // Create
    router.get(`${base}/${slug}/create`, async () => {
      const formConfig = R.form()
      return view('pilotiq.resources.form', {
        panel:    panelInfo(pilotiq),
        resource: { label: Ctor.labelSingular, slug, icon: Ctor.icon },
        fields:   formConfig.fields.map(f => ({
          name: f.name,
          fieldType: f.fieldType,
          label: f.getLabel(),
          required: f.isRequired(),
          readonly: f.isReadonly(),
          placeholder: f.getPlaceholder(),
        })),
        mode:     'create' as const,
        basePath: base,
        layout: cfg.layout,
      })
    })

    // Edit
    router.get(`${base}/${slug}/:id/edit`, async (req) => {
      const formConfig = R.form()
      return view('pilotiq.resources.form', {
        panel:    panelInfo(pilotiq),
        resource: { label: Ctor.labelSingular, slug, icon: Ctor.icon },
        fields:   formConfig.fields.map(f => ({
          name: f.name,
          fieldType: f.fieldType,
          label: f.getLabel(),
          required: f.isRequired(),
          readonly: f.isReadonly(),
          placeholder: f.getPlaceholder(),
        })),
        mode:     'edit' as const,
        recordId: req.params['id'],
        basePath: base,
        layout: cfg.layout,
      })
    })
  }

  // Custom page routes
  for (const PageClass of cfg.pages) {
    const pageSlug = PageClass.getSlug()

    router.get(`${base}/${pageSlug}`, async () => {
      const schemaData = await resolveSchema(
        (ctx) => PageClass.schema(ctx),
        {},
      )
      return view('pilotiq.slug', {
        pageType:   'page',
        panel:      panelInfo(pilotiq),
        page:       PageClass.toMeta(),
        schemaData,
        basePath:   base,
        layout:     cfg.layout,
      })
    })
  }

  // Theme editor routes (only when themeEditor plugin is active)
  if (cfg.themeEditor) {
    // Theme editor page
    router.get(`${base}/theme`, async () => {
      return view('pilotiq.theme', {
        panel:       panelInfo(pilotiq),
        basePath:    base,
        layout:      cfg.layout,
        themeConfig: pilotiq.getMergedTheme() ?? {},
      })
    })

    // Theme API — GET (load config + overrides + options)
    router.get(`${base}/api/_theme`, async (_req, res) => {
      let overrides: Partial<ThemeConfig> | null = null
      try {
        const { app } = await import(/* @vite-ignore */ '@rudderjs/core') as { app(): { make(key: string): unknown } }
        const prisma = app().make('prisma') as any
        const slug = `${cfg.name}__theme`
        const row = await prisma.panelGlobal.findUnique({ where: { slug } })
        if (row?.data) {
          overrides = typeof row.data === 'string' ? JSON.parse(row.data as string) : row.data
        }
      } catch { /* no DB or no table — that's fine */ }

      return res.json({
        config:    cfg.theme ?? {},
        overrides: overrides ?? {},
        options: {
          presets:       Object.keys(presets),
          baseColors:    Object.keys(baseColors),
          accentColors:  Object.keys(accentColors),
          chartPalettes: Object.keys(chartPalettes),
          radii:         Object.keys(radiusMap),
          iconLibraries: ['lucide', 'tabler', 'phosphor', 'remix'],
        },
      })
    })

    // Theme API — PUT (save overrides)
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

    // Theme API — DELETE (reset to code defaults)
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
