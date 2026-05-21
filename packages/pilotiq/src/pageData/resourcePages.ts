import type { Pilotiq } from '../Pilotiq.js'
import { PilotiqRegistry } from '../PilotiqRegistry.js'
import type { Page } from '../Page.js'
import type { ResourceClass } from '../Resource.js'
import { resourceBasePath } from '../clusterPaths.js'
import { Element } from '../schema/Element.js'
import { resolveSchema, type SchemaContext } from '../schema/resolveSchema.js'
import { Form } from '../elements/Form.js'
import { Table } from '../elements/Table.js'
import { Column } from '../Column.js'
import { ListTabs } from '../elements/ListTabs.js'
import { ListTab } from '../Tab.js'
import { TrashedFilter } from '../filters/TrashedFilter.js'
import { loadTableRecords } from '../elements/dispatchTable.js'
import { consumeFlashedNotifications } from '../notifications/flash.js'
import { serializeIcon } from '../icons/types.js'
import {
  findRecord, getPrimaryKey, modelLoadRecord, modelSave,
  type ModelLike,
} from '../orm/modelDefaults.js'
import {
  resourceCreateBreadcrumbs,
  resourceEditBreadcrumbs,
  resourceListBreadcrumbs,
  resourceViewBreadcrumbs,
} from './breadcrumbs.js'
import {
  applyEditPageHydrators,
  applyFillPipeline,
  applyRelationshipBuilderFill,
  applyRelationshipRepeaterFill,
  callPageSchema,
  resolveServerDataElements,
  tagActionDispatch,
  tagCellEditUrls,
  tagFieldAiUrls,
  tagFormActions,
  tagFormSubresourceUrls,
  tagTableDeferred,
  tagTableReorderUrls,
  tagWidgetUrls,
  uploadCtx,
  userCtx,
} from './helpers.js'
import { applyRoleHooks, panelInfo, type PanelInfoRoute } from './navigation.js'
import { findForms } from '../elements/dispatchForm.js'
import { buildRelationTabs, deriveParentTitle, safeBool } from './relationTabs.js'

// ─── Resource page builders ─────────────────────────────────
//
// Resource-scoped GET-route data builders: dashboard, list, table
// (deferred-load shell), create, edit, view, and the optional record
// sub-page roles. Each loads its own context (record / parent / etc.),
// resolves the page schema through `resolveSchema`, stamps URL-tag
// helpers for dispatch endpoints, and returns the wire-shape envelope
// the page renderer consumes.


/**
 * Per-row stamping spine shared by SSR `resourceIndexData` and the
 * deferred-load JSON endpoint `resourceTableData`. Both walk the same
 * Table tree and need the same dispatch / active-tab / reorder / cell-edit
 * URL stamps in the same order — running them through one helper keeps
 * the two paths in lock-step so any future addition (per-row chrome
 * stamp, etc.) lands on both surfaces.
 *
 * Widget URL stamping + the `tagTableDeferred` flag stay outside the
 * helper since only `resourceIndexData` mounts widgets / the deferred
 * skeleton — the JSON endpoint re-runs without the flag and never
 * collects widget metas.
 */
async function prepareResourceTable(
  elements: Element[],
  R:        ResourceClass,
  indexUrl: string,
  query:    Record<string, string>,
  user:     unknown,
): Promise<void> {
  tagActionDispatch(elements, indexUrl)
  // Mark the active tab + parallel-eval badges + stamp per-tab URLs
  // before the table records run — `loadTableRecords` walks the schema
  // for the active tab and splices its `modifyQuery` predicate into the
  // ORM chain alongside filters.
  await resolveActiveTab(elements, query, indexUrl)
  await loadTableRecords(elements, query, indexUrl, user, {
    canEdit: (u, record) => R.canEdit(u, record),
  })
  tagTableReorderUrls(elements, `${indexUrl}/_reorder`)
  tagCellEditUrls(elements, indexUrl)
}

export async function dashboardData(pilotiq: Pilotiq, req?: unknown): Promise<Record<string, unknown>> {
  const cfg = pilotiq.getConfig()
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ basePath: cfg.path }, user), cfg)

  // Plan #15 — when `panel.dashboard(P)` was called, resolve P's
  // schema instead of the builder-level `cfg.schema`. Page-scoped
  // schema means widget elements read like a regular custom page —
  // including action dispatch, form-state, and `_widget/:id` polling.
  let elements: Element[]
  if (cfg.dashboardPage) {
    elements = await callPageSchema(cfg.dashboardPage, ctx)
    tagFormActions(elements, cfg.path)
    tagFormSubresourceUrls(elements, cfg.path)
    tagActionDispatch(elements, cfg.path)
  } else {
    elements = []
    if (cfg.schema) {
      const def = cfg.schema
      elements = typeof def === 'function' ? await def(ctx) : def
    }
  }

  // Stamp polling URLs on every widget — panel-scope (no pageSlug
  // segment) for the dashboard. Done before schema resolve so the URL
  // rides on each widget's stamped meta.
  tagWidgetUrls(elements, id => `${cfg.path}/_widget/${id}`)

  const widgetData = await resolveServerDataElements(elements, ctx)
  const dashRoute: PanelInfoRoute = cfg.dashboardPage ? { page: cfg.dashboardPage } : {}
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, dashRoute),
    resolveSchema(elements, ctx).then(metas => applyRoleHooks(pilotiq, user, 'dashboard', metas, dashRoute)),
  ])

  return {
    panel,
    page:     cfg.dashboardPage ? cfg.dashboardPage.toMeta() : undefined,
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    _widgetData: widgetData,
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
  const R = pilotiq.findResource(slug)
  if (!R) return null

  const pages = R.resolvePages()
  if (!pages.index) return null
  const PageClass = pages.index

  const indexUrl = resourceBasePath(cfg.path, R)
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'table', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  // Plan #15 — resource-scope widget polling URL. Stamped before the
  // schema resolves so each widget's meta carries its endpoint.
  tagWidgetUrls(elements, id => `${indexUrl}/_widget/${id}`)
  if (R.deferLoading) tagTableDeferred(elements, `${indexUrl}/_table`)
  await prepareResourceTable(elements, R, indexUrl, query, user)
  const widgetData = await resolveServerDataElements(elements, ctx)

  const breadcrumbs = resourceListBreadcrumbs(cfg, R)
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const listRoute: PanelInfoRoute = { resource: R, page: PageClass }
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, listRoute),
    resolveSchema(elements, ctx).then(metas => applyRoleHooks(pilotiq, user, 'list', metas, listRoute)),
  ])

  return {
    pageType: 'resource',
    panel,
    page:     PageClass.toMeta(),
    resource: { name: R.name, label: R.label, labelSingular: R.labelSingular, slug, icon: serializeIcon(R.icon, R.name) },
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    _widgetData: widgetData,
    notifications: consumeFlashedNotifications(req),
  }
}

// Deferred-load JSON endpoint payload — `GET {base}/{slug}/_table`
// re-runs the list-page builder without the deferred flag, then returns
// every resolved `TableMeta` as a flat array. Returns null on missing
// resource / index page (route 404s).
export async function resourceTableData(
  pilotiq: Pilotiq,
  slug:    string,
  query:   Record<string, string> = {},
  req?:    unknown,
): Promise<{ tables: Record<string, unknown>[] } | null> {
  const cfg = pilotiq.getConfig()
  const R = pilotiq.findResource(slug)
  if (!R) return null

  const pages = R.resolvePages()
  if (!pages.index) return null
  const PageClass = pages.index

  const indexUrl = resourceBasePath(cfg.path, R)
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'table', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  await prepareResourceTable(elements, R, indexUrl, query, user)
  const schemaData = await resolveSchema(elements, ctx)

  const tables = collectTableMetas(schemaData)
  return { tables }
}

function collectTableMetas(
  metas: ReadonlyArray<Record<string, unknown>>,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const walk = (nodes: ReadonlyArray<Record<string, unknown>>): void => {
    for (const node of nodes) {
      if (node['type'] === 'table') out.push(node)
      const children = node['children']
      if (Array.isArray(children)) walk(children as Record<string, unknown>[])
    }
  }
  walk(metas)
  return out
}

/**
 * Walk the schema for `ListTabs` containers, pick the active tab from
 * `?tab=…` (defaulting to the tab marked `.default()` or the first one),
 * stamp render-time state (`active` flag, per-tab `?tab=` URL, and
 * resolved badge counts) onto each tab. The active tab's query/context
 * modifier is NOT applied here — `loadTableRecords` walks for the active
 * tab and splices in its modifier when it builds the records-handler
 * `TableContext`.
 *
 * No-op when the page has no `ListTabs`.
 */
export async function resolveActiveTab(
  elements:    ReadonlyArray<Element>,
  query:       Record<string, string>,
  currentPath: string,
): Promise<void> {
  const listTabs = findListTabs(elements)
  if (listTabs.length === 0) return

  for (const container of listTabs) {
    const children = (container.getChildren() ?? []).filter((c): c is ListTab => c.getType() === 'listTab')
    if (children.length === 0) continue

    // Default tab (used both for `?tab=` fallback and to omit the param
    // from the canonical URL of that tab — see `buildTabUrl`).
    const defaultTab = children.find(t => t.isDefault()) ?? children[0]!

    // Active tab: explicit `?tab=name` → default tab.
    const wanted = typeof query['tab'] === 'string' ? query['tab'] : undefined
    const active = (wanted && children.find(t => t.name === wanted)) || defaultTab

    // Stamp render-time state on each tab.
    children.forEach(t => {
      t.withActive(t === active)
      t.withUrl(buildTabUrl(currentPath, query, t.name, defaultTab.name))
    })

    // Resolve every tab's badge in parallel — failed handlers swallow
    // silently (badge omitted) so a flaky count never blanks the page.
    await Promise.all(children.map(async (tab) => {
      const handler = tab.getBadgeHandler()
      if (!handler) return
      try {
        const v = await handler()
        if (v === undefined || v === null) return
        tab.withResolvedBadge(String(v))
      } catch {
        // Per-tab badge errors stay silent.
      }
    }))
  }
}

function findListTabs(elements: ReadonlyArray<Element>): ListTabs[] {
  const out: ListTabs[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (el.getType() === 'listTabs') out.push(el as ListTabs)
      const children = el.getChildren()
      if (children) walk(children)
    }
  }
  walk(elements)
  return out
}

function buildTabUrl(
  pathname:       string,
  query:          Record<string, string>,
  tabName:        string,
  defaultTabName: string,
): string {
  // Carry forward search/sort/perPage + any filter values; reset page to 1
  // (tab change reshapes the result set, page numbers don't translate).
  // The default tab gets the canonical, paramless URL — visiting that URL
  // already lands on the default, so emitting `?tab=default` would just be
  // noise that bookmarks/share-links pick up.
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === '' || v === null) continue
    if (k === 'tab' || k === 'page') continue
    params.set(k, String(v))
  }
  if (tabName !== defaultTabName) params.set('tab', tabName)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export async function resourceCreateData(
  pilotiq: Pilotiq,
  slug:    string,
  prefill?: { values?: Record<string, unknown>; errors?: Record<string, string[]> },
  req?:    unknown,
): Promise<Record<string, unknown> | null> {
  const cfg = pilotiq.getConfig()
  const R = pilotiq.findResource(slug)
  if (!R) return null
  const pages = R.resolvePages()
  if (!pages.create) return null
  const PageClass = pages.create

  const resourceBase = resourceBasePath(cfg.path, R)
  const createUrl = `${resourceBase}/create`
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'create', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, createUrl)
  tagActionDispatch(elements, createUrl)
  tagFormSubresourceUrls(elements, resourceBase)
  if (prefill) {
    const form = findForms(elements)[0]
    if (form) {
      if (prefill.values) form.withValues(prefill.values)
      if (prefill.errors) form.withErrors(prefill.errors)
    }
  }

  const breadcrumbs = resourceCreateBreadcrumbs(cfg, R)
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const createRoute: PanelInfoRoute = { resource: R, page: PageClass }
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, createRoute),
    resolveSchema(elements, ctx).then(metas => applyRoleHooks(pilotiq, user, 'create', metas, createRoute)),
  ])

  return {
    panel,
    page:     PageClass.toMeta(),
    resource: { name: R.name, label: R.labelSingular, slug, icon: serializeIcon(R.icon, R.name) },
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
  const R = pilotiq.findResource(slug)
  if (!R) return null
  const pages = R.resolvePages()
  if (!pages.edit) return null
  const PageClass = pages.edit

  const resourceBase = resourceBasePath(cfg.path, R)
  const editUrl = `${resourceBase}/${recordId}/edit`
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'edit', recordId, basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, editUrl)
  tagActionDispatch(elements, editUrl)
  tagFormSubresourceUrls(elements, `${resourceBase}/${recordId}`)

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
      const withRelations  = await applyRelationshipRepeaterFill(form, values, record, R.model)
      const withBuilders   = await applyRelationshipBuilderFill(form, withRelations, record, R.model)
      // Hydrators run AFTER the standard fill pipeline so they overlay
      // on top of DB-row + relationship-row values. Skipped on the
      // prefill branch (validation-error round-trip) — overlaying there
      // would clobber the user's just-submitted input that the page is
      // re-displaying for them to fix.
      const hydrators = cfg.editPageHydrators ?? []
      const overlay = hydrators.length > 0
        ? await applyEditPageHydrators(hydrators, {
            resource:      R,
            recordId,
            currentValues: withBuilders,
          })
        : {}
      form.withValues(Object.keys(overlay).length > 0
        ? { ...withBuilders, ...overlay }
        : withBuilders)
    } else if (prefill?.values) {
      form.withValues(prefill.values)
    }
    if (prefill?.errors) form.withErrors(prefill.errors)
  }

  // Plan #11 — when the resource has relation managers, prepend a
  // navigation strip so users can drill into each manager's table
  // without leaving the parent record context. The "Edit" tab is
  // active here.
  const relationTabsEl = await buildRelationTabs(R, recordId, cfg.path, '__edit', user, record)
  if (relationTabsEl) elements.unshift(relationTabsEl)

  const recordTitle = record !== undefined && record !== null
    ? deriveParentTitle(R, record)
    : recordId
  const breadcrumbs = resourceEditBreadcrumbs(cfg, R, recordId, recordTitle)
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const editRoute: PanelInfoRoute = { resource: R, page: PageClass, recordId }
  const editCtx = record !== undefined ? { ...ctx, record } : ctx
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, editRoute),
    resolveSchema(elements, editCtx).then(metas => applyRoleHooks(pilotiq, user, 'edit', metas, editRoute)),
  ])

  tagFieldAiUrls(schemaData as Record<string, unknown>[], `${resourceBase}/${recordId}/_agents`)

  return {
    panel,
    page:     PageClass.toMeta(),
    resource: { name: R.name, label: R.labelSingular, slug, icon: serializeIcon(R.icon, R.name) },
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
  const R = pilotiq.findResource(slug)
  if (!R) return null
  const pages = R.resolvePages()
  if (!pages.view) return null
  const PageClass = pages.view

  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'view', recordId, basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  // For the view page we want the record threaded into resolveSchema so
  // factory-attached visibility predicates see it. Resource.detail()
  // already runs against the loaded record in user code; here we mirror
  // that into ctx.record for the action eval pass.
  let record: unknown = undefined
  if (R.model) {
    try { record = await findRecord(R, recordId, { user }) } catch { /* ignore */ }
  }

  // Plan #11 — prepend the relation tabs strip with the "Details" tab
  // active when the resource has relation managers configured.
  const relationTabsEl = await buildRelationTabs(R, recordId, cfg.path, '__view', user, record)
  if (relationTabsEl) elements.unshift(relationTabsEl)

  const recordTitle = record !== undefined && record !== null
    ? deriveParentTitle(R, record)
    : recordId
  const breadcrumbs = resourceViewBreadcrumbs(cfg, R, recordTitle)
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const viewRoute: PanelInfoRoute = { resource: R, page: PageClass, recordId }
  const viewCtx = record !== undefined ? { ...ctx, record } : ctx
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, viewRoute),
    resolveSchema(elements, viewCtx).then(metas => applyRoleHooks(pilotiq, user, 'view', metas, viewRoute)),
  ])

  return {
    panel,
    page:     PageClass.toMeta(),
    resource: { name: R.name, label: R.labelSingular, slug, icon: serializeIcon(R.icon, R.name) },
    mode:     'view' as const,
    recordId,
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
  }
}

/**
 * Custom record sub-page data builder. Mounted at
 * `${resourceBase}/${slug}/:id/${subPageSlug}` for each entry in
 * `Resource.pages().record`. Mirrors `resourceViewData`'s shape: load
 * the record, run R.canAccess + R.canView (parent-resource gates),
 * then SubPage.canAccess(user, record) (sub-page-specific gate),
 * then render the sub-page's schema with `ctx.record` set. Tab strip
 * carries the sub-page slug as the active key so the matching record
 * sub-page tab highlights.
 *
 * Returns:
 *   - `null` — resource / sub-page slug not found (404 upstream).
 *   - `{ ok: false, status: 403 }` — any gate fails or throws.
 *   - resolved page data — on success.
 */
export async function resourceRecordPageData(
  pilotiq:       Pilotiq,
  slug:          string,
  recordId:      string,
  subPageSlug:   string,
  req?:          unknown,
): Promise<Record<string, unknown> | null | { ok: false; status: 403 }> {
  const cfg = pilotiq.getConfig()
  const R = pilotiq.findResource(slug)
  if (!R) return null
  const recordPages = R.getRecordPages()
  const PageClass = recordPages[subPageSlug]
  if (!PageClass) return null

  const user = await pilotiq.resolveUser(req)

  // Load the parent record before gating so canView / SubPage.canAccess
  // can branch on record state. Sub-pages without a Resource.model
  // still get gated against an `undefined` record — the same posture as
  // resourceViewData when no model is bound.
  let record: unknown = undefined
  if (R.model) {
    try { record = await findRecord(R, recordId, { user }) } catch { /* ignore */ }
  }
  if (record === undefined || record === null) {
    // Distinguish "model bound but record missing" (route should 404)
    // from "no model bound" (treat record as `{ id: recordId }` so the
    // page can still render — same convention as the edit page).
    if (R.model) return null
    record = { id: recordId }
  }

  // Three gates: parent resource access + view, then the sub-page's own
  // canAccess. The route would have run R.canAccess upstream, but
  // re-running here makes resourceRecordPageData safe to call from
  // dispatchPageData (where the SPA path skips the route prelude).
  if (!await safeBool(() => R.canAccess(user))) return { ok: false, status: 403 }
  if (!await safeBool(() => R.canView(user, record))) return { ok: false, status: 403 }
  if (!await safeBool(() => PageClass.canAccess(user, record))) return { ok: false, status: 403 }

  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'view', recordId, basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)

  // Insert the relation-tabs strip with the sub-page slug active so the
  // matching tab highlights. `buildRelationTabs` evaluates per-tab
  // gating against `user + record` — record sub-page tabs are gated
  // alongside __view/__edit/managers.
  const relationTabsEl = await buildRelationTabs(R, recordId, cfg.path, subPageSlug, user, record)
  if (relationTabsEl) elements.unshift(relationTabsEl)

  const recordTitle = record !== undefined && record !== null
    ? deriveParentTitle(R, record)
    : recordId
  const breadcrumbs = resourceViewBreadcrumbs(cfg, R, recordTitle)
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const recordPageRoute: PanelInfoRoute = { resource: R, page: PageClass, recordId }
  const recordCtx = record !== undefined ? { ...ctx, record } : ctx
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, recordPageRoute),
    resolveSchema(elements, recordCtx).then(metas => applyRoleHooks(pilotiq, user, 'view', metas, recordPageRoute)),
  ])

  return {
    pageType: 'record-page' as const,
    panel,
    page:     PageClass.toMeta(),
    resource: { name: R.name, label: R.labelSingular, slug, icon: serializeIcon(R.icon, R.name) },
    mode:     'record' as const,
    recordId,
    subPage:  { slug: subPageSlug, label: PageClass.getLabel() },
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
  }
}
