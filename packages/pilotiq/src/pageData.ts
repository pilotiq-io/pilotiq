/**
 * Per-page-role data builders. The framework's GET route handlers and
 * Vike's auto-generated `+data.ts` hooks both call these to produce the
 * exact props the page renderer needs.
 *
 * Why this exists: SSR runs through the rudder router (which calls
 * `view(...)` and populates `pageContext.viewProps`). SPA navigation only
 * triggers Vike's `+data` hook — the rudder handler doesn't run, so the
 * data needs to come from the same builder. Routing both paths through a
 * single builder keeps them in sync.
 */
import type { Pilotiq } from './Pilotiq.js'
import { PilotiqRegistry } from './PilotiqRegistry.js'
import type { Page } from './Page.js'
import type { Element } from './schema/Element.js'
import { resolveSchema, type SchemaContext } from './schema/resolveSchema.js'
import { Form } from './elements/Form.js'
import { findForms } from './elements/dispatchForm.js'
import { loadTableRecords } from './elements/dispatchTable.js'
import { findActions } from './elements/dispatchAction.js'
import { resolveTheme } from './theme/resolve.js'
import type { ThemeMeta } from './theme/types.js'
import { consumeFlashedNotifications } from './notifications/flash.js'

// ─── Shared helpers ──────────────────────────────────────────

export function panelInfo(pilotiq: Pilotiq) {
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

export async function callPageSchema(PageClass: typeof Page, ctx: SchemaContext): Promise<Element[]> {
  return Promise.resolve(PageClass.schema(ctx))
}

/** Mark every Form on the page with its action URL so the rendered <form> posts to itself. */
export function tagFormActions(elements: ReadonlyArray<Element>, action: string): void {
  for (const form of findForms(elements)) {
    if (!form.getAction()) form.action(action)
  }
}

/**
 * Run the edit-mode fill pipeline on a loaded record:
 *   mutateFormDataBeforeFill  →  fillFromRecord  →  mutateFormDataAfterFill
 *
 * `fillFromRecord` defaults to `{ ...record }` when not configured. Both
 * mutators are optional and may be async. `ctx.record` is the loaded
 * record so mutators can read from fields the form doesn't surface.
 */
export async function applyFillPipeline<R>(
  form:   Form<R>,
  record: R,
): Promise<Record<string, unknown>> {
  const recordObj = record as unknown as Record<string, unknown>
  let values: Record<string, unknown> = { ...recordObj }

  const before = form.getMutateFormDataBeforeFill()
  if (before) values = await before(values, { values, record })

  const fill = form.getFillFromRecord()
  if (fill) values = fill(record)

  const after = form.getMutateFormDataAfterFill()
  if (after) values = await after(values, { values, record })

  return values
}

/** Stamp dispatchUrl on every handler-style Action so the client knows where to POST. */
export function tagActionDispatch(elements: ReadonlyArray<Element>, baseUrl: string): void {
  for (const action of findActions(elements)) {
    if (!action.getHandler()) continue
    if (action.getHref() || action.getMethod()) continue
    if (action.getDispatchUrl()) continue
    action.dispatchUrl(`${baseUrl}/_action/${action.name}`)
  }
}

// ─── Per-role data builders ──────────────────────────────────

export async function dashboardData(pilotiq: Pilotiq, req?: unknown): Promise<Record<string, unknown>> {
  const cfg = pilotiq.getConfig()
  const schemaData = await resolveSchema(cfg.schema, {})
  return {
    panel:    panelInfo(pilotiq),
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
  }
}

export async function resourceIndexData(
  pilotiq: Pilotiq,
  slug:    string,
  query:   Record<string, string> = {},
  req?:    unknown,
): Promise<Record<string, unknown> | null> {
  const cfg = pilotiq.getConfig()
  const R = cfg.resources.find(r => r.getSlug() === slug)
  if (!R) return null

  const pages = R.resolvePages()
  if (!pages.index) return null
  const PageClass = pages.index

  const indexUrl = `${cfg.path}/${slug}`
  const ctx: SchemaContext = { mode: 'table', basePath: cfg.path }
  const elements = await callPageSchema(PageClass, ctx)
  tagActionDispatch(elements, indexUrl)
  await loadTableRecords(elements, query, indexUrl)
  const schemaData = await resolveSchema(elements, ctx)

  return {
    pageType: 'resource',
    panel:    panelInfo(pilotiq),
    page:     PageClass.toMeta(),
    resource: { label: R.label, labelSingular: R.labelSingular, slug, icon: R.icon },
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
  }
}

export async function resourceCreateData(
  pilotiq: Pilotiq,
  slug:    string,
  prefill?: { values?: Record<string, unknown>; errors?: Record<string, string[]> },
  req?:    unknown,
): Promise<Record<string, unknown> | null> {
  const cfg = pilotiq.getConfig()
  const R = cfg.resources.find(r => r.getSlug() === slug)
  if (!R) return null
  const pages = R.resolvePages()
  if (!pages.create) return null
  const PageClass = pages.create

  const createUrl = `${cfg.path}/${slug}/create`
  const ctx: SchemaContext = { mode: 'create', basePath: cfg.path }
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, createUrl)
  if (prefill) {
    const form = findForms(elements)[0]
    if (form) {
      if (prefill.values) form.withValues(prefill.values)
      if (prefill.errors) form.withErrors(prefill.errors)
    }
  }
  const schemaData = await resolveSchema(elements, ctx)

  return {
    panel:    panelInfo(pilotiq),
    page:     PageClass.toMeta(),
    resource: { label: R.labelSingular, slug, icon: R.icon },
    mode:     'create' as const,
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
    ...(prefill?.errors ? { hasErrors: true } : {}),
  }
}

export async function resourceEditData(
  pilotiq:  Pilotiq,
  slug:     string,
  recordId: string,
  prefill?: { values?: Record<string, unknown>; errors?: Record<string, string[]> },
  req?:     unknown,
): Promise<Record<string, unknown> | null> {
  const cfg = pilotiq.getConfig()
  const R = cfg.resources.find(r => r.getSlug() === slug)
  if (!R) return null
  const pages = R.resolvePages()
  if (!pages.edit) return null
  const PageClass = pages.edit

  const editUrl = `${cfg.path}/${slug}/${recordId}/edit`
  const ctx: SchemaContext = { mode: 'edit', recordId, basePath: cfg.path }
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, editUrl)

  // Locate the primary form, load the record, fill values.
  const form = findForms(elements)[0]
  let record: unknown = undefined
  if (form?.getLoadRecord()) {
    try {
      record = await form.getLoadRecord()!(recordId, { values: prefill?.values ?? {} })
    } catch {
      // sentinel/missing record — fall through
    }
    if (!prefill?.values && record != null) {
      const values = await applyFillPipeline(form, record)
      form.withValues(values)
    } else if (prefill?.values) {
      form.withValues(prefill.values)
    }
    if (prefill?.errors) form.withErrors(prefill.errors)
  }

  const schemaData = await resolveSchema(
    elements,
    record !== undefined ? { ...ctx, record } : ctx,
  )

  return {
    panel:    panelInfo(pilotiq),
    page:     PageClass.toMeta(),
    resource: { label: R.labelSingular, slug, icon: R.icon },
    mode:     'edit' as const,
    recordId,
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
    ...(prefill?.errors ? { hasErrors: true } : {}),
  }
}

export async function resourceViewData(
  pilotiq:  Pilotiq,
  slug:     string,
  recordId: string,
  req?:     unknown,
): Promise<Record<string, unknown> | null> {
  const cfg = pilotiq.getConfig()
  const R = cfg.resources.find(r => r.getSlug() === slug)
  if (!R) return null
  const pages = R.resolvePages()
  if (!pages.view) return null
  const PageClass = pages.view

  const ctx: SchemaContext = { mode: 'view', recordId, basePath: cfg.path }
  const elements = await callPageSchema(PageClass, ctx)
  const schemaData = await resolveSchema(elements, ctx)

  return {
    panel:    panelInfo(pilotiq),
    page:     PageClass.toMeta(),
    resource: { label: R.labelSingular, slug, icon: R.icon },
    mode:     'view' as const,
    recordId,
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
  }
}

export async function globalEditData(
  pilotiq: Pilotiq,
  slug:    string,
  prefill?: { values?: Record<string, unknown>; errors?: Record<string, string[]> },
  req?:    unknown,
): Promise<Record<string, unknown> | null> {
  const cfg = pilotiq.getConfig()
  const G = cfg.globals.find(g => g.getSlug() === slug)
  if (!G) return null
  const pages = G.resolvePages()
  if (!pages.edit) return null
  const PageClass = pages.edit

  const editUrl = `${cfg.path}/${slug}`
  const ctx: SchemaContext = { mode: 'edit', basePath: cfg.path }
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, editUrl)

  const form = findForms(elements)[0]
  let record: unknown = undefined
  if (form?.getLoadRecord()) {
    try { record = await form.getLoadRecord()!('', { values: prefill?.values ?? {} }) } catch { /* ignore */ }
    if (!prefill?.values && record != null) {
      const values = await applyFillPipeline(form, record)
      form.withValues(values)
    } else if (prefill?.values) {
      form.withValues(prefill.values)
    }
    if (prefill?.errors) form.withErrors(prefill.errors)
  }

  const schemaData = await resolveSchema(
    elements,
    record !== undefined ? { ...ctx, record } : ctx,
  )

  return {
    pageType: 'global',
    panel:    panelInfo(pilotiq),
    page:     PageClass.toMeta(),
    global:   { label: G.label, labelSingular: G.labelSingular, slug, icon: G.icon },
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
    ...(prefill?.errors ? { hasErrors: true } : {}),
  }
}

export async function globalViewData(
  pilotiq: Pilotiq,
  slug:    string,
  req?:    unknown,
): Promise<Record<string, unknown> | null> {
  const cfg = pilotiq.getConfig()
  const G = cfg.globals.find(g => g.getSlug() === slug)
  if (!G) return null
  const pages = G.resolvePages()
  if (!pages.view) return null
  const PageClass = pages.view

  const ctx: SchemaContext = { mode: 'view', basePath: cfg.path }
  const elements = await callPageSchema(PageClass, ctx)
  const schemaData = await resolveSchema(elements, ctx)

  return {
    panel:    panelInfo(pilotiq),
    page:     PageClass.toMeta(),
    global:   { label: G.label, labelSingular: G.labelSingular, slug, icon: G.icon },
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
  }
}

export async function customPageData(
  pilotiq: Pilotiq,
  pageSlug: string,
  req?:    unknown,
): Promise<Record<string, unknown> | null> {
  const cfg = pilotiq.getConfig()
  const PageClass = cfg.pages.find(P => P.getSlug() === pageSlug)
  if (!PageClass) return null

  const pageUrl = `${cfg.path}/${pageSlug}`
  const ctx: SchemaContext = {}
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, pageUrl)
  tagActionDispatch(elements, pageUrl)
  const schemaData = await resolveSchema(elements, ctx)

  return {
    pageType: 'page',
    panel:    panelInfo(pilotiq),
    page:     PageClass.toMeta(),
    schemaData,
    basePath: cfg.path,
    layout:   cfg.layout,
    notifications: consumeFlashedNotifications(req),
  }
}

// ─── Vike +data dispatcher ───────────────────────────────────

export interface PageContextLike {
  urlPathname?: string
  urlOriginal?: string
  urlParsed?:   { search?: Record<string, string>; searchOriginal?: string }
  routeParams?: Record<string, string | undefined>
  pageId?:      string
}

/**
 * Single entry point Vike's `+data` hook calls. Inspects the page id and
 * route params, finds the panel via `PilotiqRegistry`, and dispatches to
 * the matching builder. Returns the same shape SSR's `viewProps` carries.
 */
export async function dispatchPageData(pageContext: PageContextLike): Promise<unknown | null> {
  const { pageId, routeParams = {} } = pageContext
  const search = pageContext.urlParsed?.search ?? {}
  const basePathParam = routeParams['basePath']
  const basePath = basePathParam ? `/${basePathParam}` : ''
  const panel = basePath ? PilotiqRegistry.findByPath(basePath) : null

  if (!panel) return null

  switch (pageId) {
    case '/pages/(pilotiq)/dashboard':
      return dashboardData(panel)

    case '/pages/(pilotiq)/slug': {
      // 2-segment URL: could be a resource list, a global edit, or a custom page.
      const slug = routeParams['slug']
      if (!slug) return null
      const cfg = panel.getConfig()
      if (cfg.resources.some(R => R.getSlug() === slug)) {
        return resourceIndexData(panel, slug, search)
      }
      if (cfg.globals.some(G => G.getSlug() === slug)) {
        return globalEditData(panel, slug)
      }
      return customPageData(panel, slug)
    }

    case '/pages/(pilotiq)/resource-create': {
      const slug = routeParams['slug']
      if (!slug) return null
      return resourceCreateData(panel, slug)
    }

    case '/pages/(pilotiq)/resource-edit': {
      const slug = routeParams['slug']
      const id = routeParams['id']
      if (!slug || !id) return null
      return resourceEditData(panel, slug, id)
    }

    case '/pages/(pilotiq)/resource-view': {
      const slug = routeParams['slug']
      const id = routeParams['id']
      if (!slug) return null
      // Globals also use this route under `/{slug}/view` — id will be 'view'.
      if (id === 'view') return globalViewData(panel, slug)
      if (!id) return null
      return resourceViewData(panel, slug, id)
    }

    default:
      return null
  }
}
