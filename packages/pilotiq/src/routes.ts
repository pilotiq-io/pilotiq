import type { Router } from '@rudderjs/router'
import type { AppRequest } from '@rudderjs/contracts'
import { view } from '@rudderjs/view'
import type { Pilotiq } from './Pilotiq.js'
import type { Form } from './elements/Form.js'
import { resolveSchema, type SchemaContext } from './schema/resolveSchema.js'
import { dispatchFormSubmit, findForms, selectForm } from './elements/dispatchForm.js'
import { dispatchAction, findActions, parseActionBody, type ResolveRecord } from './elements/dispatchAction.js'
import {
  panelInfo, callPageSchema, tagFormActions, tagActionDispatch,
  dashboardData, resourceIndexData, resourceCreateData, resourceEditData,
  resourceViewData, globalEditData, globalViewData, customPageData,
} from './pageData.js'
import type { ThemeConfig } from './theme/types.js'
import { presets } from './theme/presets.js'
import { baseColors } from './theme/base-colors.js'
import { HUE_NAMES } from './theme/colors.js'
import { migrateThemeOverrides } from './theme/migrate.js'
import { radiusMap } from './theme/radius.js'

/** True when the client wants a JSON response (modal-form action submitting
 * via fetch), false for a browser-style form post that wants a 303 redirect.
 * Both action endpoints honor this so confirm/handler buttons (form-post)
 * keep working unchanged while modal dialogs use fetch. */
function wantsJson(req: AppRequest): boolean {
  const headers = req.headers ?? {}
  const accept = headers['accept'] ?? headers['Accept'] ?? ''
  return accept.includes('application/json')
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

export function registerPilotiqRoutes(
  router: Router,
  pilotiq: Pilotiq,
): void {
  const cfg = pilotiq.getConfig()
  const base = cfg.path

  // ── Dashboard (1-segment) ─────────────────────────────
  router.get(base, async () => {
    return view('pilotiq.dashboard', await dashboardData(pilotiq))
  })

  // ── Resource routes ───────────────────────────────────
  for (const R of cfg.resources) {
    const slug  = R.getSlug()
    const pages = R.resolvePages()

    // Index — GET ${base}/${slug}
    if (pages.index) {
      const PageClass = pages.index
      const indexUrl  = `${base}/${slug}`
      router.get(indexUrl, async (req) => {
        const data = await resourceIndexData(pilotiq, slug, req.query)
        return view('pilotiq.slug', data ?? {})
      })

      // Action dispatch — POST ${base}/${slug}/_action/:actionName
      router.post(`${indexUrl}/_action/:actionName`, async (req, res) => {
        const actionName = req.params['actionName']!
        const json = wantsJson(req)
        const body  = await readFormBody(req)
        const input = parseActionBody(body)

        const ctx: SchemaContext = { mode: 'table', basePath: base }
        const elements = await callPageSchema(PageClass, ctx)
        tagActionDispatch(elements, indexUrl)
        const action = findActions(elements).find(a => a.name === actionName)
        if (!action) {
          if (json) { res.status(404); return res.json({ ok: false, error: `Action "${actionName}" not found` }) }
          res.status(404)
          return res.send(`Action "${actionName}" not found on ${R.label}`)
        }

        const resolveRecord: ResolveRecord | undefined = R.model
          ? (id: string) => R.model!.find(id)
          : undefined

        const result = await dispatchAction(action, { ...input, request: req }, resolveRecord)
        if (!result.ok) {
          if (json) {
            res.status(result.errors ? 422 : 500)
            return res.json({ ok: false, error: result.error, ...(result.errors ? { errors: result.errors } : {}) })
          }
          res.status(500)
          return res.send(result.error)
        }
        const redirect = result.redirect ?? indexUrl
        if (json) return res.json({ ok: true, redirect })
        return res.redirect(redirect, 303)
      })
    }

    // Create — GET ${base}/${slug}/create
    if (pages.create) {
      const PageClass = pages.create
      const createUrl = `${base}/${slug}/create`

      router.get(createUrl, async () => {
        const data = await resourceCreateData(pilotiq, slug)
        return view('pilotiq.resource-create', data ?? {})
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
          // Re-render through the same builder so the page is identical to GET,
          // just with values + errors prefilled.
          const data = await resourceCreateData(pilotiq, slug, { values, errors: result.errors })
          res.status(422)
          return view('pilotiq.resource-create', data ?? {})
        }

        const recordId = (result.record as { id?: unknown })?.id
        const fallback = recordId !== undefined ? `${base}/${slug}/${String(recordId)}/edit` : `${base}/${slug}`
        return res.redirect(result.redirect ?? fallback, 303)
      })
    }

    // View — GET ${base}/${slug}/:id (literal `create` matches first via
    // Hono's literal-over-param routing, so `:id` only catches everything else.)
    if (pages.view) {
      router.get(`${base}/${slug}/:id`, async (req) => {
        const recordId = req.params['id']!
        // Hono routes both `/create` and `/:id` against this slot; only the
        // literal `create` segment hits the create route. Defensive guard:
        if (recordId === 'create') return // handled by create route
        const data = await resourceViewData(pilotiq, slug, recordId)
        return view('pilotiq.resource-view', data ?? {})
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
        const data = await resourceEditData(pilotiq, slug, recordId)
        return view('pilotiq.resource-edit', data ?? {})
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
          const data = await resourceEditData(pilotiq, slug, recordId, { values, errors: result.errors })
          res.status(422)
          return view('pilotiq.resource-edit', data ?? {})
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
        const data = await globalEditData(pilotiq, slug)
        return view('pilotiq.slug', data ?? {})
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
          const data = await globalEditData(pilotiq, slug, { values, errors: result.errors })
          res.status(422)
          return view('pilotiq.slug', data ?? {})
        }

        return res.redirect(result.redirect ?? editUrl, 303)
      })
    }

    // Optional view page when the user opts in via pages().view
    if (pages.view) {
      router.get(`${base}/${slug}/view`, async () => {
        const data = await globalViewData(pilotiq, slug)
        return view('pilotiq.resource-view', data ?? {})
      })
    }
  }

  // ── Custom pages (2-segment, slug route) ──────────────
  for (const PageClass of cfg.pages) {
    const pageSlug = PageClass.getSlug()
    const pageUrl  = `${base}/${pageSlug}`

    router.get(pageUrl, async () => {
      const data = await customPageData(pilotiq, pageSlug)
      return view('pilotiq.slug', data ?? {})
    })

    // Action dispatch — POST ${base}/${pageSlug}/_action/:actionName
    router.post(`${pageUrl}/_action/:actionName`, async (req, res) => {
      const actionName = req.params['actionName']!
      const json = wantsJson(req)
      const body  = await readFormBody(req)
      const input = parseActionBody(body)

      const ctx: SchemaContext = {}
      const elements = await callPageSchema(PageClass, ctx)
      tagActionDispatch(elements, pageUrl)
      const action = findActions(elements).find(a => a.name === actionName)
      if (!action) {
        if (json) { res.status(404); return res.json({ ok: false, error: `Action "${actionName}" not found` }) }
        res.status(404)
        return res.send(`Action "${actionName}" not found on page`)
      }

      const result = await dispatchAction(action, { ...input, request: req })
      if (!result.ok) {
        if (json) {
          res.status(result.errors ? 422 : 500)
          return res.json({ ok: false, error: result.error, ...(result.errors ? { errors: result.errors } : {}) })
        }
        res.status(500)
        return res.send(result.error)
      }
      const redirect = result.redirect ?? pageUrl
      if (json) return res.json({ ok: true, redirect })
      return res.redirect(redirect, 303)
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
