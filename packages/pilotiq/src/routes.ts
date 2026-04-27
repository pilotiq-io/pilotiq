import type { Router } from '@rudderjs/router'
import type { AppRequest } from '@rudderjs/contracts'
import { view } from '@rudderjs/view'
import type { Pilotiq } from './Pilotiq.js'
import type { Page } from './Page.js'
import type { Form } from './elements/Form.js'
import type { Element } from './schema/Element.js'
import { resolveSchema, type SchemaContext } from './schema/resolveSchema.js'
import { dispatchFormSubmit, findForms, selectForm } from './elements/dispatchForm.js'
import { loadTableRecords } from './elements/dispatchTable.js'
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
    globals: cfg.globals.map(G => ({
      label: G.label, slug: G.getSlug(), icon: G.icon,
    })),
    pages: cfg.pages.map(P => ({
      label: P.getLabel(), slug: P.getSlug(), icon: P.icon,
    })),
    theme,
    themeEditor: cfg.themeEditor ?? false,
  }
}

/**
 * Pull the page's raw `Element[]` out of `Page.schema(ctx)`. The handler
 * needs the live tree (not the serialized meta) so it can locate `Form`
 * instances and run their lifecycle hooks server-side.
 */
async function callPageSchema(PageClass: typeof Page, ctx: SchemaContext): Promise<Element[]> {
  return Promise.resolve(PageClass.schema(ctx))
}

/**
 * Read the request body as a `Record<string, unknown>`. The hono adapter
 * auto-parses JSON, but `application/x-www-form-urlencoded` and
 * `multipart/form-data` need a manual fall-through to Hono's own parser.
 */
async function readFormBody(req: AppRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return { ...(req.body as Record<string, unknown>) }
  }
  const raw = req.raw as { req?: { parseBody?: () => Promise<Record<string, unknown>> } } | undefined
  if (raw?.req?.parseBody) {
    try {
      const parsed = await raw.req.parseBody()
      return parsed && typeof parsed === 'object' ? { ...parsed } : {}
    } catch {
      return {}
    }
  }
  return {}
}

/** Strip framework meta keys (`_formId`, `_method`) from a parsed body. */
function splitMeta(body: Record<string, unknown>): {
  values: Record<string, unknown>
  formId: string | undefined
} {
  const { _formId, _method: _omitMethod, ...rest } = body
  return {
    values: rest,
    formId: typeof _formId === 'string' ? _formId : undefined,
  }
}

/** Mark every Form on the page with its action URL so the rendered <form> posts to itself. */
function tagFormActions(elements: ReadonlyArray<Element>, action: string): void {
  for (const form of findForms(elements)) {
    if (!form.getAction()) form.action(action)
  }
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
  for (const R of cfg.resources) {
    const slug  = R.getSlug()
    const pages = R.resolvePages()

    // Index — GET ${base}/${slug}
    if (pages.index) {
      const PageClass = pages.index
      router.get(`${base}/${slug}`, async (req) => {
        const ctx: SchemaContext = { mode: 'table', basePath: base }
        const elements = await callPageSchema(PageClass, ctx)
        await loadTableRecords(elements, req.query)
        const schemaData = await resolveSchema(elements, ctx)
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

    // Create — GET ${base}/${slug}/create
    if (pages.create) {
      const PageClass = pages.create
      const createUrl = `${base}/${slug}/create`

      router.get(createUrl, async () => {
        const ctx: SchemaContext = { mode: 'create', basePath: base }
        const elements = await callPageSchema(PageClass, ctx)
        tagFormActions(elements, createUrl)
        const schemaData = await resolveSchema(elements, ctx)
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

      // Create — POST ${base}/${slug}/create
      router.post(createUrl, async (req, res) => {
        const body = await readFormBody(req)
        const { values, formId } = splitMeta(body)

        const ctx: SchemaContext = { mode: 'create', basePath: base }
        const elements = await callPageSchema(PageClass, ctx)
        tagFormActions(elements, createUrl)
        const form = selectForm(findForms(elements), formId)
        if (!form) {
          res.status(404)
          return res.send('No form found on page')
        }

        const result = await dispatchFormSubmit(form, values, { values })

        if (!result.ok) {
          form.withValues(values).withErrors(result.errors)
          const schemaData = await resolveSchema(elements, ctx)
          res.status(422)
          return view('pilotiq.resource-create', {
            panel:     panelInfo(pilotiq),
            page:      PageClass.toMeta(),
            resource:  { label: R.labelSingular, slug, icon: R.icon },
            mode:      'create' as const,
            basePath:  base,
            layout:    cfg.layout,
            schemaData,
            hasErrors: true,
          })
        }

        const recordId = (result.record as { id?: unknown })?.id
        const fallback = recordId !== undefined ? `${base}/${slug}/${String(recordId)}/edit` : `${base}/${slug}`
        return res.redirect(result.redirect ?? fallback, 303)
      })
    }

    // View — GET ${base}/${slug}/:id (literal `create` matches first via
    // Hono's literal-over-param routing, so `:id` only catches everything else.)
    if (pages.view) {
      const PageClass = pages.view

      router.get(`${base}/${slug}/:id`, async (req) => {
        const recordId = req.params['id']!
        // Hono routes both `/create` and `/:id` against this slot; only the
        // literal `create` segment hits the create route. Defensive guard:
        if (recordId === 'create') return // handled by create route
        const ctx: SchemaContext = { mode: 'view', recordId, basePath: base }
        const elements = await callPageSchema(PageClass, ctx)
        const schemaData = await resolveSchema(elements, ctx)
        return view('pilotiq.resource-view', {
          panel:    panelInfo(pilotiq),
          page:     PageClass.toMeta(),
          resource: { label: R.labelSingular, slug, icon: R.icon },
          mode:     'view' as const,
          recordId,
          basePath: base,
          layout:   cfg.layout,
          schemaData,
        })
      })

      // Delete — POST ${base}/${slug}/:id/delete
      router.post(`${base}/${slug}/:id/delete`, async (req, res) => {
        const recordId = req.params['id']!
        try {
          await R.deleteRecord(recordId)
        } catch (err) {
          res.status(500)
          return res.send(err instanceof Error ? err.message : 'Delete failed')
        }
        return res.redirect(`${base}/${slug}`, 303)
      })
    }

    // Edit — GET ${base}/${slug}/:id/edit
    if (pages.edit) {
      const PageClass = pages.edit

      router.get(`${base}/${slug}/:id/edit`, async (req) => {
        const recordId = req.params['id']!
        const editUrl  = `${base}/${slug}/${recordId}/edit`
        const ctx: SchemaContext = { mode: 'edit', recordId, basePath: base }

        const elements = await callPageSchema(PageClass, ctx)
        tagFormActions(elements, editUrl)

        // Locate the primary form, load the record, and fill values.
        const form = findForms(elements)[0]
        let record: unknown = undefined
        if (form?.getLoadRecord()) {
          try {
            record = await form.getLoadRecord()!(recordId, { values: {} })
          } catch {
            // Sentinel/missing record — fall through with empty form.
          }
          if (record != null) {
            const fill = form.getFillFromRecord()
            const values = fill ? fill(record) : { ...(record as Record<string, unknown>) }
            form.withValues(values)
          }
        }

        const schemaData = await resolveSchema(
          elements,
          record !== undefined ? { ...ctx, record } : ctx,
        )
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

      // Edit — POST ${base}/${slug}/:id/edit
      router.post(`${base}/${slug}/:id/edit`, async (req, res) => {
        const recordId = req.params['id']!
        const editUrl  = `${base}/${slug}/${recordId}/edit`
        const body = await readFormBody(req)
        const { values, formId } = splitMeta(body)

        const ctx: SchemaContext = { mode: 'edit', recordId, basePath: base }
        const elements = await callPageSchema(PageClass, ctx)
        tagFormActions(elements, editUrl)
        const form = selectForm(findForms(elements), formId)
        if (!form) {
          res.status(404)
          return res.send('No form found on page')
        }

        // Try to load the record so validators with cross-field rules see it.
        let record: unknown = undefined
        if (form.getLoadRecord()) {
          try { record = await form.getLoadRecord()!(recordId, { values }) } catch { /* ignore */ }
        }

        const result = await dispatchFormSubmit(
          form,
          values,
          record !== undefined ? { values, record } : { values },
        )

        if (!result.ok) {
          form.withValues(values).withErrors(result.errors)
          const schemaData = await resolveSchema(
            elements,
            record !== undefined ? { ...ctx, record } : ctx,
          )
          res.status(422)
          return view('pilotiq.resource-edit', {
            panel:     panelInfo(pilotiq),
            page:      PageClass.toMeta(),
            resource:  { label: R.labelSingular, slug, icon: R.icon },
            mode:      'edit' as const,
            recordId,
            basePath:  base,
            layout:    cfg.layout,
            schemaData,
            hasErrors: true,
          })
        }

        return res.redirect(result.redirect ?? editUrl, 303)
      })
    }
  }

  // ── Globals (singletons — 2-segment, no /:id) ────────
  for (const G of cfg.globals) {
    const slug    = G.getSlug()
    const editUrl = `${base}/${slug}`
    const pages   = G.resolvePages()

    if (pages.edit) {
      const PageClass = pages.edit

      router.get(editUrl, async () => {
        const ctx: SchemaContext = { mode: 'edit', basePath: base }
        const elements = await callPageSchema(PageClass, ctx)
        tagFormActions(elements, editUrl)

        // Singletons: load the record (no id) and pre-fill form values.
        const form = findForms(elements)[0]
        let record: unknown = undefined
        if (form?.getLoadRecord()) {
          try { record = await form.getLoadRecord()!('', { values: {} }) } catch { /* ignore */ }
          if (record != null) {
            const fill = form.getFillFromRecord()
            const values = fill ? fill(record) : { ...(record as Record<string, unknown>) }
            form.withValues(values)
          }
        }

        const schemaData = await resolveSchema(
          elements,
          record !== undefined ? { ...ctx, record } : ctx,
        )
        return view('pilotiq.slug', {
          pageType: 'global',
          panel:    panelInfo(pilotiq),
          page:     PageClass.toMeta(),
          global:   { label: G.label, labelSingular: G.labelSingular, slug, icon: G.icon },
          basePath: base,
          layout:   cfg.layout,
          schemaData,
        })
      })

      router.post(editUrl, async (req, res) => {
        const body = await readFormBody(req)
        const { values, formId } = splitMeta(body)

        const ctx: SchemaContext = { mode: 'edit', basePath: base }
        const elements = await callPageSchema(PageClass, ctx)
        tagFormActions(elements, editUrl)
        const form = selectForm(findForms(elements), formId)
        if (!form) {
          res.status(404)
          return res.send('No form found on page')
        }

        // Provide the existing singleton record to the lifecycle context
        // so cross-field validators / mutateData see prior state.
        let record: unknown = undefined
        if (form.getLoadRecord()) {
          try { record = await form.getLoadRecord()!('', { values }) } catch { /* ignore */ }
        }

        const result = await dispatchFormSubmit(
          form,
          values,
          record !== undefined ? { values, record } : { values },
        )

        if (!result.ok) {
          form.withValues(values).withErrors(result.errors)
          const schemaData = await resolveSchema(
            elements,
            record !== undefined ? { ...ctx, record } : ctx,
          )
          res.status(422)
          return view('pilotiq.slug', {
            pageType:  'global',
            panel:     panelInfo(pilotiq),
            page:      PageClass.toMeta(),
            global:    { label: G.label, labelSingular: G.labelSingular, slug, icon: G.icon },
            basePath:  base,
            layout:    cfg.layout,
            schemaData,
            hasErrors: true,
          })
        }

        return res.redirect(result.redirect ?? editUrl, 303)
      })
    }

    // Optional view page when the user opts in via pages().view
    if (pages.view) {
      const PageClass = pages.view
      router.get(`${base}/${slug}/view`, async () => {
        const ctx: SchemaContext = { mode: 'view', basePath: base }
        const elements = await callPageSchema(PageClass, ctx)
        const schemaData = await resolveSchema(elements, ctx)
        return view('pilotiq.resource-view', {
          panel:    panelInfo(pilotiq),
          page:     PageClass.toMeta(),
          global:   { label: G.label, labelSingular: G.labelSingular, slug, icon: G.icon },
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
    const pageUrl  = `${base}/${pageSlug}`

    router.get(pageUrl, async () => {
      const ctx: SchemaContext = {}
      const elements = await callPageSchema(PageClass, ctx)
      tagFormActions(elements, pageUrl)
      const schemaData = await resolveSchema(elements, ctx)
      return view('pilotiq.slug', {
        pageType: 'page',
        panel:    panelInfo(pilotiq),
        page:     PageClass.toMeta(),
        schemaData,
        basePath: base,
        layout:   cfg.layout,
      })
    })

    // Custom pages can also accept submits when their schema includes a Form.
    router.post(pageUrl, async (req, res) => {
      const body = await readFormBody(req)
      const { values, formId } = splitMeta(body)

      const ctx: SchemaContext = {}
      const elements = await callPageSchema(PageClass, ctx)
      tagFormActions(elements, pageUrl)
      const form = selectForm(findForms(elements), formId)
      if (!form) {
        res.status(404)
        return res.send('No form found on page')
      }

      const result = await dispatchFormSubmit(form, values, { values })

      if (!result.ok) {
        form.withValues(values).withErrors(result.errors)
        const schemaData = await resolveSchema(elements, ctx)
        res.status(422)
        return view('pilotiq.slug', {
          pageType:  'page',
          panel:     panelInfo(pilotiq),
          page:      PageClass.toMeta(),
          schemaData,
          basePath:  base,
          layout:    cfg.layout,
          hasErrors: true,
        })
      }

      return res.redirect(result.redirect ?? pageUrl, 303)
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

// ─── Lifecycle helpers exported for tests ────────────────
export { dispatchFormSubmit, findForms, selectForm }
export { loadTableRecords, parseTableQuery, findTables } from './elements/dispatchTable.js'
export type { Form }
