import type { Pilotiq } from '../Pilotiq.js'
import type { Page } from '../Page.js'
import { globalBasePath, pageBasePath } from '../clusterPaths.js'
import { Element } from '../schema/Element.js'
import { resolveSchema, type SchemaContext, type RenderContext } from '../schema/resolveSchema.js'
import { isServerDataElement, type ServerDataElement } from '../schema/ServerDataElement.js'
import { findForms } from '../elements/dispatchForm.js'
import { searchAllResources, type GlobalSearchResult } from '../search.js'
import { consumeFlashedNotifications } from '../notifications/flash.js'
import { serializeIcon } from '../icons/types.js'
import { pageHooksFor } from '../applyPageHooks.js'
import type { RenderHookMap } from '../RenderHook.js'
import {
  customPageBreadcrumbs,
  globalBreadcrumbs,
} from './breadcrumbs.js'
import {
  applyFillPipeline,
  callPageSchema,
  resolveServerDataElements,
  tagActionDispatch,
  tagFormActions,
  tagFormSubresourceUrls,
  tagWidgetUrls,
  uploadCtx,
  userCtx,
} from './helpers.js'
import { applyRoleHooks, panelInfo, resolvePageHooks, type PanelInfoRoute } from './navigation.js'

// ─── Misc page builders ─────────────────────────────────────
//
// Global edit/view, custom page, widget polling, global search. All
// take a `Pilotiq` instance + a tag (slug / pageSlug / query) and
// return the wire-shape envelope for their respective routes.




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

  const editUrl = globalBasePath(cfg.path, G)
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'edit', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, editUrl)
  tagFormSubresourceUrls(elements, editUrl)

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

  const breadcrumbs = globalBreadcrumbs(cfg, G)
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const globalEditRoute: PanelInfoRoute = { global: G, page: PageClass }
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'global-edit',
    await resolveSchema(
      elements,
      record !== undefined ? { ...ctx, record } : ctx,
    ),
    globalEditRoute,
  )

  return {
    pageType: 'global',
    panel:    await panelInfo(pilotiq, req, globalEditRoute),
    page:     PageClass.toMeta(),
    global:   { name: G.name, label: G.label, labelSingular: G.labelSingular, slug, icon: serializeIcon(G.icon, G.name) },
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

  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'view', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)

  const breadcrumbs = globalBreadcrumbs(cfg, G)
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const globalViewRoute: PanelInfoRoute = { global: G, page: PageClass }
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'global-view',
    await resolveSchema(elements, ctx),
    globalViewRoute,
  )

  return {
    panel:    await panelInfo(pilotiq, req, globalViewRoute),
    page:     PageClass.toMeta(),
    global:   { name: G.name, label: G.label, labelSingular: G.labelSingular, slug, icon: serializeIcon(G.icon, G.name) },
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

  const pageUrl = pageBasePath(cfg.path, PageClass)
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({}, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, pageUrl)
  tagFormSubresourceUrls(elements, pageUrl)
  tagActionDispatch(elements, pageUrl)
  // Page-scope polling URL (mirrors `${base}/${pageSlug}/_widget/:id`
  // route registered in routes.ts).
  tagWidgetUrls(elements, id => `${pageUrl}/_widget/${id}`)
  const resolvedWidgets = await resolveServerDataElements(elements, ctx)

  const breadcrumbs = customPageBreadcrumbs(cfg, PageClass)
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const customRoute: PanelInfoRoute = { page: PageClass }
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'page',
    await resolveSchema(elements, ctx),
    customRoute,
  )

  return {
    pageType: 'page',
    panel:    await panelInfo(pilotiq, req, customRoute),
    page:     PageClass.toMeta(),
    schemaData,
    _widgetData: resolvedWidgets,
    basePath: cfg.path,
    layout:   cfg.layout,
    notifications: consumeFlashedNotifications(req),
  }
}

// ─── Plan #15 widget polling data builder ────────────────────

/**
 * Scopes the polling endpoint resolves against. Mirrors the
 * form-state / wizard scope discriminator.
 *
 *   panel:    dashboard page (`POST {base}/_widget/:id`)
 *   page:     custom page    (`POST {base}/{pageSlug}/_widget/:id`)
 *   resource: list page      (`POST {base}/{slug}/_widget/:id`) —
 *             resolves the resource's index `Page.schema()` so widgets
 *             from `Resource.headerSchema()` / `footerSchema()` are
 *             reachable. Auth runs `R.canAccess + R.canViewAny` in
 *             front of the per-widget visibility check.
 */
export type WidgetScope =
  | { kind: 'panel' }
  | { kind: 'page';     pageSlug: string }
  | { kind: 'resource'; slug:     string }

export interface WidgetRequest {
  id:      string
  filter?: string
}

export interface WidgetSuccess {
  ok:        true
  data:      unknown
  timestamp: number
}

export interface WidgetFailure {
  ok:     false
  status: 403 | 404 | 500
  error:  string
}

/**
 * Plan #15 — re-resolve the active page's schema, find the widget by
 * id, fail-closed via `evaluateVisibility`, then run
 * `resolveServerData(ctx)` and return the payload.
 *
 *   - 404 when the page or widget id doesn't exist.
 *   - 403 when the layout-level `visible(rule)` says the widget is
 *     hidden (server doesn't show data for hidden surfaces).
 *   - 500 when the hook itself throws.
 *
 * `body.filter` rides along on `RenderContext.filter` so per-chart
 * filter dropdowns can re-fetch with the new filter value. Treated as
 * an opaque string — widget hooks decode it however they want.
 */
export async function widgetData(
  pilotiq: Pilotiq,
  scope:   WidgetScope,
  body:    WidgetRequest,
  req?:    unknown,
): Promise<WidgetSuccess | WidgetFailure> {
  const cfg = pilotiq.getConfig()
  const user = await pilotiq.resolveUser(req)

  let elements: Element[]
  let ctx: RenderContext

  if (scope.kind === 'panel') {
    if (!cfg.dashboardPage) return { ok: false, status: 404, error: 'No dashboard page registered' }
    ctx = uploadCtx(userCtx({ basePath: cfg.path }, user), cfg)
    elements = await callPageSchema(cfg.dashboardPage, ctx)
  } else if (scope.kind === 'page') {
    const P = cfg.pages.find(p => p.getSlug() === scope.pageSlug)
    if (!P) return { ok: false, status: 404, error: 'Page not found' }
    ctx = uploadCtx(userCtx({ basePath: cfg.path }, user), cfg)
    elements = await callPageSchema(P, ctx)
  } else {
    // Resource-scope: re-resolve the list page's schema so widgets from
    // `Resource.headerSchema()` / `footerSchema()` are reachable.
    const R = cfg.resources.find(r => r.getSlug() === scope.slug)
    if (!R) return { ok: false, status: 404, error: 'Resource not found' }
    const pages = R.resolvePages()
    if (!pages.index) return { ok: false, status: 404, error: 'Resource has no list page' }
    ctx = uploadCtx(userCtx({ mode: 'table', basePath: cfg.path }, user), cfg)
    elements = await callPageSchema(pages.index, ctx)
  }

  // Stamp the request's filter onto the render context so widget hooks
  // can branch on it. Opaque string — widgets decode their own format.
  if (body.filter !== undefined) ctx = { ...ctx, filter: body.filter } as RenderContext

  const widget = findWidgetById(elements, body.id)
  if (!widget) return { ok: false, status: 404, error: `Widget "${body.id}" not found` }

  // Layout-level visibility re-check — if the widget is hidden by a
  // visible(rule), refuse to ship data. Same fail-closed posture as
  // the schema resolver. (Parent-container `visible(false)` would
  // already drop the widget from the schema tree at SSR time, so a
  // direct hidden-widget probe here covers the visible-rule-only case.)
  const layoutCtx: import('../schema/Element.js').LayoutContext = {}
  if (user !== null && user !== undefined) layoutCtx.user = user
  if (!await widget.evaluateVisibility(layoutCtx)) {
    return { ok: false, status: 403, error: 'Widget hidden' }
  }

  try {
    const data = await widget.resolveServerData(ctx)
    return { ok: true, data, timestamp: Date.now() }
  } catch (err) {
    return {
      ok:     false,
      status: 500,
      error:  err instanceof Error ? err.message : 'Widget failed',
    }
  }
}

/** Walk the element tree looking for a server-data element with the
 *  given id. Same walker as `collectServerDataElements` but stops on
 *  first match. */
function findWidgetById(elements: ReadonlyArray<Element>, id: string): ServerDataElement | undefined {
  let found: ServerDataElement | undefined
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (found) return
      if (isServerDataElement(el)) {
        if (el.getId() === id) { found = el; return }
        continue
      }
      const type = el.getType()
      if (type === 'form' || type === 'repeater' || type === 'builder' || type === 'table' || type === 'tableWidget') continue
      const children = el.getChildren()
      if (children) walk(children)
    }
  }
  walk(elements)
  return found
}

// ─── Plan #12 global search data builder ─────────────────────

/**
 * Resolve the user via `pilotiq.resolveUser(req)` and run the
 * panel-wide search. Mirrors the formStateData/formWizardData
 * shape so the `/_search` route handler stays a thin wrapper.
 *
 * Also resolves the `panels::global-search.results.before/.after`
 * render hooks when the panel registered any — sparse, absent when
 * neither slot has registered fns. Sent as a `RenderHookMap` so the
 * client `<CommandPalette>` can mount `<RenderHookSlot>` above and
 * below the result list (same pattern chrome slots use).
 */
export async function searchData(
  pilotiq: Pilotiq,
  query:   string,
  req?:    unknown,
): Promise<{
  ok: true
  results: GlobalSearchResult[]
  renderHooks?: RenderHookMap
}> {
  const user = await pilotiq.resolveUser(req)
  const results = await searchAllResources(pilotiq, query, user)
  const cfg = pilotiq.getConfig()
  const out: { ok: true; results: GlobalSearchResult[]; renderHooks?: RenderHookMap } = {
    ok: true,
    results,
  }
  if (cfg.renderHooks && cfg.renderHooks.length > 0) {
    const hooks = await resolvePageHooks(
      pilotiq,
      user,
      pageHooksFor('search'),
      { url: `${cfg.path}/_search` },
    )
    if (Object.keys(hooks).length > 0) out.renderHooks = hooks
  }
  return out
}

