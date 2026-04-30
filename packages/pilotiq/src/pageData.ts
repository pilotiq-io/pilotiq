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
import type { ResourceClass, NavigationBadgeColor } from './Resource.js'
import type { GlobalClass } from './Global.js'
import type { Element } from './schema/Element.js'
import { resolveSchema, type SchemaContext } from './schema/resolveSchema.js'
import { Form } from './elements/Form.js'
import { findForms } from './elements/dispatchForm.js'
import { loadTableRecords, type QueryParams } from './elements/dispatchTable.js'
import { findActions } from './elements/dispatchAction.js'
import { ListTabs } from './elements/ListTabs.js'
import { ListTab } from './Tab.js'
import { resolveTheme } from './theme/resolve.js'
import type { ThemeMeta } from './theme/types.js'
import { consumeFlashedNotifications } from './notifications/flash.js'
import { serializeIcon, type SerializedIcon } from './icons/types.js'

// ─── Shared helpers ──────────────────────────────────────────

/**
 * Single nav-tree entry. `name` is the JS class name (`R.name` /
 * `G.name` / `P.name`) — also the lookup key into the build-time
 * `_components.ts` manifest the Vite plugin emits, so component-typed
 * icons resolve from the same identifier.
 */
export interface NavItem {
  name:        string
  label:       string
  url:         string
  icon?:       SerializedIcon
  group?:      string
  sort?:       number
  badge?:      string
  badgeColor?: NavigationBadgeColor
  children?:   NavItem[]
}

/**
 * Build the panel header summary + the unified navigation tree.
 *
 * Pipeline:
 *   1. flatten resources + globals + pages into raw NavItem records
 *   2. drop items whose `canAccess(user)` (Plan #10) returns false
 *   3. resolve `navigationParentItem` references → nest under parents
 *      (cycles broken with a console warn; dangling parents render at top level)
 *   4. sort within each grouping (top-level *and* every parent's children)
 *      by `navigationSort` ascending → registration order
 *   5. resolve every `navigationBadge()` in parallel via `Promise.all`;
 *      handler errors are swallowed (badge omitted) so a flaky count
 *      never blanks the page
 *
 * `req` is the active request; pilotiq calls `pilotiq.resolveUser(req)`
 * once and threads the user into every Resource/Global/Page `canAccess`
 * check. When `Pilotiq.user(fn)` isn't configured, user is `null` and the
 * default `canAccess` returns true → no items dropped.
 */
export async function panelInfo(pilotiq: Pilotiq, req?: unknown) {
  const cfg = pilotiq.getConfig()
  const merged = pilotiq.getMergedTheme()
  const theme: ThemeMeta | undefined = merged ? resolveTheme(merged) : undefined
  const user = await pilotiq.resolveUser(req)
  const navigation = await buildNavigation(pilotiq, user)
  return {
    name: cfg.name,
    branding: cfg.branding,
    navigation,
    theme,
    themeEditor: cfg.themeEditor ?? false,
  }
}

/** @internal Internal node before nesting; carries the registration index
 *  so we can stable-sort by it as the tie-breaker. */
interface RawNavItem extends NavItem {
  parent?: string
  /** Registration index across resources → globals → pages (in that order),
   *  so resources beat globals on a sort tie within the same group. */
  _idx: number
}

/** Run a `canAccess` check, swallowing throws as `false`. Used by
 *  `buildNavigation` to fail-closed on flaky auth predicates without
 *  blanking the page. */
async function safeAccess(fn: () => boolean | Promise<boolean>): Promise<boolean> {
  try {
    return Boolean(await fn())
  } catch {
    return false
  }
}

/** Plan #10 — stamp the resolved user onto a SchemaContext so action
 *  visibility predicates can see it during `resolveSchema`. The `user`
 *  field is opaque (whatever `Pilotiq.user(req => …)` returns); skipped
 *  when null/undefined to keep ctx tidy. */
function userCtx<C extends SchemaContext>(ctx: C, user: unknown): C {
  if (user === null || user === undefined) return ctx
  return { ...ctx, user: user as NonNullable<SchemaContext['user']> }
}

async function buildNavigation(pilotiq: Pilotiq, user: unknown): Promise<NavItem[]> {
  const cfg = pilotiq.getConfig()
  const base = cfg.path

  // Flatten + resolve badges in parallel. We build the raw list first so
  // every entry has its identity (`name`) and parent set; badges resolve
  // alongside.
  const raw: RawNavItem[] = []
  let idx = 0

  const pushBadge: Array<{ item: RawNavItem; handler: () => unknown }> = []

  // Plan #10 — pre-evaluate canAccess for every owner in parallel so we
  // can drop forbidden items before flattening. Failed predicates fail
  // closed (treated as `false`) so a thrown auth check doesn't accidentally
  // expose nav items.
  const [resourceAccess, globalAccess, pageAccess] = await Promise.all([
    Promise.all(cfg.resources.map(R => safeAccess(() => R.canAccess(user)))),
    Promise.all(cfg.globals.map(G => safeAccess(() => G.canAccess(user)))),
    Promise.all(cfg.pages.map(P => safeAccess(() => P.canAccess(user)))),
  ])

  for (let i = 0; i < cfg.resources.length; i++) {
    if (!resourceAccess[i]) continue
    const R = cfg.resources[i]!
    const item: RawNavItem = {
      name:  R.name,
      label: R.getNavigationLabel(),
      url:   `${base}/${R.getSlug()}`,
      icon:  serializeIcon(R.getNavigationIcon(), R.name),
      _idx:  idx++,
    }
    if (R.navigationGroup        !== undefined) item.group        = R.navigationGroup
    if (R.navigationSort         !== undefined) item.sort         = R.navigationSort
    if (R.navigationParentItem   !== undefined) item.parent       = R.navigationParentItem
    if (R.navigationBadgeColor   !== 'default') item.badgeColor   = R.navigationBadgeColor
    if (R.navigationBadge)                       pushBadge.push({ item, handler: R.navigationBadge })
    raw.push(item)
  }

  for (let i = 0; i < cfg.globals.length; i++) {
    if (!globalAccess[i]) continue
    const G = cfg.globals[i]!
    // Globals default `navigationGroup` to `'Settings'`. Allow `null` as
    // an explicit opt-out → render at top level.
    const group = G.navigationGroup === null ? undefined : G.navigationGroup
    const item: RawNavItem = {
      name:  G.name,
      label: G.getNavigationLabel(),
      url:   `${base}/${G.getSlug()}`,
      icon:  serializeIcon(G.getNavigationIcon(), G.name),
      _idx:  idx++,
    }
    if (group                    !== undefined) item.group        = group
    if (G.navigationSort         !== undefined) item.sort         = G.navigationSort
    if (G.navigationParentItem   !== undefined) item.parent       = G.navigationParentItem
    if (G.navigationBadgeColor   !== 'default') item.badgeColor   = G.navigationBadgeColor
    if (G.navigationBadge)                       pushBadge.push({ item, handler: G.navigationBadge })
    raw.push(item)
  }

  for (let i = 0; i < cfg.pages.length; i++) {
    if (!pageAccess[i]) continue
    const P = cfg.pages[i]!
    const item: RawNavItem = {
      name:  P.name,
      label: P.getNavigationLabel(),
      url:   `${base}/${P.getSlug()}`,
      icon:  serializeIcon(P.getNavigationIcon(), P.name),
      _idx:  idx++,
    }
    if (P.navigationGroup        !== undefined) item.group        = P.navigationGroup
    if (P.navigationSort         !== undefined) item.sort         = P.navigationSort
    if (P.navigationParentItem   !== undefined) item.parent       = P.navigationParentItem
    if (P.navigationBadgeColor   !== 'default') item.badgeColor   = P.navigationBadgeColor
    if (P.navigationBadge)                       pushBadge.push({ item, handler: P.navigationBadge })
    raw.push(item)
  }

  await Promise.all(pushBadge.map(async ({ item, handler }) => {
    try {
      const v = await handler()
      if (v === undefined || v === null) return
      item.badge = String(v)
    } catch {
      // Per-badge errors stay silent.
    }
  }))

  return nestAndSort(raw)
}

/**
 * Resolve `parent` references → nest, drop cycles, sort within each
 * grouping, then strip internal scaffolding (`parent`, `_idx`).
 */
function nestAndSort(raw: RawNavItem[]): NavItem[] {
  const byName = new Map<string, RawNavItem>()
  for (const it of raw) byName.set(it.name, it)

  // Detect parent cycles: walk upwards from each item; any name seen
  // twice → cycle. Items in a cycle get treated as top-level.
  const inCycle = new Set<string>()
  for (const it of raw) {
    if (it.parent === undefined) continue
    const seen = new Set<string>([it.name])
    let cur: string | undefined = it.parent
    while (cur !== undefined) {
      if (seen.has(cur)) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn(`[Pilotiq] navigationParentItem cycle detected at "${it.name}" — rendering at top level.`)
        }
        inCycle.add(it.name)
        break
      }
      seen.add(cur)
      const parent = byName.get(cur)
      if (!parent) break
      cur = parent.parent
    }
  }

  const childrenOf = new Map<string, RawNavItem[]>()
  const top: RawNavItem[] = []
  for (const it of raw) {
    const parent = it.parent
    if (parent && byName.has(parent) && !inCycle.has(it.name)) {
      const list = childrenOf.get(parent) ?? []
      list.push(it)
      childrenOf.set(parent, list)
    } else {
      top.push(it)
    }
  }

  // Sort items in a sibling group by sort (asc), ties → registration order.
  const sortItems = (items: RawNavItem[]): RawNavItem[] => {
    return [...items].sort((a, b) => {
      const aHas = a.sort !== undefined, bHas = b.sort !== undefined
      if (aHas && bHas)  return a.sort! - b.sort! || a._idx - b._idx
      if (aHas)          return -1   // sorted items come before unsorted
      if (bHas)          return  1
      return a._idx - b._idx
    })
  }

  // Strip internals + recurse into children.
  const finalize = (items: RawNavItem[]): NavItem[] =>
    sortItems(items).map(it => {
      const kids = childrenOf.get(it.name)
      const { parent, _idx, ...rest } = it
      const out: NavItem = { ...rest }
      if (kids && kids.length > 0) out.children = finalize(kids)
      return out
    })

  return finalize(top)
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
    panel:    await panelInfo(pilotiq, req),
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
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = userCtx({ mode: 'table', basePath: cfg.path }, user)
  const elements = await callPageSchema(PageClass, ctx)
  tagActionDispatch(elements, indexUrl)
  // Mark the active tab + parallel-eval badges + stamp per-tab URLs
  // before the table records run — `loadTableRecords` walks the schema
  // for the active tab and splices its `modifyQuery` predicate into the
  // ORM chain alongside filters.
  await resolveActiveTab(elements, query, indexUrl)
  await loadTableRecords(elements, query, indexUrl, user)
  const schemaData = await resolveSchema(elements, ctx)

  return {
    pageType: 'resource',
    panel:    await panelInfo(pilotiq, req),
    page:     PageClass.toMeta(),
    resource: { name: R.name, label: R.label, labelSingular: R.labelSingular, slug, icon: serializeIcon(R.icon, R.name) },
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
  }
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
    const children = (container.getChildren() ?? []).filter((c): c is ListTab => c instanceof ListTab)
    if (children.length === 0) continue

    // Active tab: explicit `?tab=name` → tab marked `.default()` → first.
    const wanted = typeof query['tab'] === 'string' ? query['tab'] : undefined
    const active =
      (wanted && children.find(t => t.name === wanted)) ||
      children.find(t => t.isDefault()) ||
      children[0]!

    // Stamp render-time state on each tab.
    children.forEach(t => {
      t.withActive(t === active)
      t.withUrl(buildTabUrl(currentPath, query, t.name))
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
      if (el instanceof ListTabs) out.push(el)
      const children = el.getChildren()
      if (children) walk(children)
    }
  }
  walk(elements)
  return out
}

function buildTabUrl(
  pathname: string,
  query:    Record<string, string>,
  tabName:  string,
): string {
  // Carry forward search/sort/perPage + any filter values; reset page to 1
  // (tab change reshapes the result set, page numbers don't translate).
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === '' || v === null) continue
    if (k === 'tab' || k === 'page') continue
    params.set(k, String(v))
  }
  params.set('tab', tabName)
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
  const R = cfg.resources.find(r => r.getSlug() === slug)
  if (!R) return null
  const pages = R.resolvePages()
  if (!pages.create) return null
  const PageClass = pages.create

  const createUrl = `${cfg.path}/${slug}/create`
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = userCtx({ mode: 'create', basePath: cfg.path }, user)
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
    panel:    await panelInfo(pilotiq, req),
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
  const R = cfg.resources.find(r => r.getSlug() === slug)
  if (!R) return null
  const pages = R.resolvePages()
  if (!pages.edit) return null
  const PageClass = pages.edit

  const editUrl = `${cfg.path}/${slug}/${recordId}/edit`
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = userCtx({ mode: 'edit', recordId, basePath: cfg.path }, user)
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
    panel:    await panelInfo(pilotiq, req),
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
  const R = cfg.resources.find(r => r.getSlug() === slug)
  if (!R) return null
  const pages = R.resolvePages()
  if (!pages.view) return null
  const PageClass = pages.view

  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = userCtx({ mode: 'view', recordId, basePath: cfg.path }, user)
  const elements = await callPageSchema(PageClass, ctx)
  // For the view page we want the record threaded into resolveSchema so
  // factory-attached visibility predicates see it. Resource.detail()
  // already runs against the loaded record in user code; here we mirror
  // that into ctx.record for the action eval pass.
  let record: unknown = undefined
  if (R.model) {
    try { record = await R.model.find(recordId) } catch { /* ignore */ }
  }
  const schemaData = await resolveSchema(
    elements,
    record !== undefined ? { ...ctx, record } : ctx,
  )

  return {
    panel:    await panelInfo(pilotiq, req),
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
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = userCtx({ mode: 'edit', basePath: cfg.path }, user)
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
    panel:    await panelInfo(pilotiq, req),
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
  const ctx: SchemaContext = userCtx({ mode: 'view', basePath: cfg.path }, user)
  const elements = await callPageSchema(PageClass, ctx)
  const schemaData = await resolveSchema(elements, ctx)

  return {
    panel:    await panelInfo(pilotiq, req),
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

  const pageUrl = `${cfg.path}/${pageSlug}`
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = userCtx({}, user)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, pageUrl)
  tagActionDispatch(elements, pageUrl)
  const schemaData = await resolveSchema(elements, ctx)

  return {
    pageType: 'page',
    panel:    await panelInfo(pilotiq, req),
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
