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
import type { Pilotiq, PilotiqConfig } from './Pilotiq.js'
import { PilotiqRegistry } from './PilotiqRegistry.js'
import type { Page } from './Page.js'
import type { ResourceClass, NavigationBadgeColor } from './Resource.js'
import type { GlobalClass } from './Global.js'
import { Element } from './schema/Element.js'
import { Field } from './fields/Field.js'
import { resolveSchema, type SchemaContext } from './schema/resolveSchema.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { applyStateUpdate, findForms, findWizardStepFields, selectFormById } from './elements/dispatchForm.js'
import { validateSchema } from './validation/index.js'
import { searchAllResources, type GlobalSearchResult } from './search.js'
import { loadTableRecords, findTables, type QueryParams } from './elements/dispatchTable.js'
import { findActions, findRowExtraActions } from './elements/dispatchAction.js'
import { Filter } from './filters/Filter.js'
import { TrashedFilter } from './filters/TrashedFilter.js'
import { ListTabs } from './elements/ListTabs.js'
import { ListTab } from './Tab.js'
import { resolveTheme } from './theme/resolve.js'
import type { ThemeMeta } from './theme/types.js'
import { consumeFlashedNotifications } from './notifications/flash.js'
import { serializeIcon, type SerializedIcon, type IconValue } from './icons/types.js'
import {
  RelationManager,
  safeManagerPolicy as safeManagerPolicyImpl,
  type ManagerCanMethod as ManagerCanMethodType,
  type RelationManagerContext,
} from './RelationManager.js'
import { RelationTabs, relationTab, type RelationTabMeta } from './schema/RelationTabs.js'
import {
  modelSave, modelLoadRecord, modelRelationTableRecords, getPrimaryKey,
  type ModelLike, type ModelQuery,
} from './orm/modelDefaults.js'

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

/** Plan #6 — stamp the panel-wide upload URL so `FileUpload` fields
 *  emit it on their meta. Single URL for the whole panel; no per-field
 *  variation. The route is always registered (see `_uploads` in
 *  `routes.ts`) — meta is stamped regardless of whether an adapter is
 *  configured so the renderer can show a clear error rather than
 *  silently breaking. The companion `hasUploadAdapter` flag distinguishes
 *  "URL exists but adapter missing" so fields with optional upload
 *  affordances (e.g. `MarkdownField`'s `attachFiles` button) can hide
 *  themselves rather than render a broken control. */
function uploadCtx<C extends SchemaContext>(ctx: C, cfg: PilotiqConfig): C {
  return {
    ...ctx,
    uploadUrl: `${cfg.path}/_uploads`,
    ...(cfg.uploads ? { hasUploadAdapter: true } : {}),
  }
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
 * Plan #5 — stamp the partial-resolve endpoint URL on every form whose
 * descendants include at least one `live()` field. The client uses
 * `FormMeta.stateUrl` to flip into controlled-state mode; forms without
 * any live fields stay uncontrolled (zero-cost legacy path).
 *
 * `urlBuilder(formId)` lets the caller compose a per-form URL — the
 * endpoint shape is `${base}/${slug}/_form/${formId}/state` so each
 * form on a multi-form page gets its own route segment.
 */
export function tagFormStateUrls(
  elements:   ReadonlyArray<Element>,
  urlBuilder: (formId: string) => string,
): void {
  for (const form of findForms(elements)) {
    if (formHasLiveField(form)) {
      form.withStateUrl(urlBuilder(form.getFormId()))
    }
  }
}

/**
 * Reorderable rows — stamp the POST-reorder URL on every `Table` that
 * has `Table.reorderable()` set. The renderer reads `TableMeta.reorderUrl`
 * to wire the drop handler; tables that aren't reorderable skip wiring
 * entirely. Same shape as `tagFormStateUrls` so the call site stays
 * consistent.
 */
export function tagTableReorderUrls(
  elements: ReadonlyArray<Element>,
  url:      string,
): void {
  for (const table of findTables(elements)) {
    if (table.isReorderable() && !table.getReorderUrl()) {
      table.withReorderUrl(url)
    }
  }
}

/**
 * Editable cell columns — walk every table on the page and stamp
 * `_cellEditUrls[colName]` per row, but only on rows that already
 * carry a `_cellEditable[colName]` marker (set by `loadTableRecords`
 * after `R.canEdit(user, row)` passed). The dispatcher stays
 * URL-shape-agnostic; URL building lives here parallel to
 * `tagFormStateUrls / tagTableReorderUrls`.
 *
 * `idOf` extracts the per-row primary key. Defaults to reading `id` —
 * works for the rudder ORM convention. Resources with a different
 * primary-key column should pass an override (none in v1).
 */
export function tagCellEditUrls(
  elements:  ReadonlyArray<Element>,
  resourceUrl: string,
  idOf:      (row: Record<string, unknown>) => unknown = row => row['id'],
): void {
  for (const table of findTables(elements)) {
    const rows = table.getRows() as ReadonlyArray<Record<string, unknown>> | undefined
    if (!rows || rows.length === 0) continue
    // Optimisation: skip the table when none of its columns are editable.
    const editable = (table.getChildren() ?? []).some(c => c instanceof Column && c.isEditable())
    if (!editable) continue
    for (const row of rows) {
      const editableMap = row['_cellEditable'] as Record<string, true> | undefined
      if (!editableMap) continue
      const id = idOf(row)
      if (id === undefined || id === null || id === '') continue
      const urls: Record<string, string> = {}
      for (const colName of Object.keys(editableMap)) {
        urls[colName] = `${resourceUrl}/${encodeURIComponent(String(id))}/_cell/${encodeURIComponent(colName)}`
      }
      ;(row as Record<string, unknown>)['_cellEditUrls'] = urls
    }
  }
}

/**
 * Plan #8 — stamp the wizard step-validate endpoint URL on every form
 * whose descendants include a `Wizard` element. `FormMeta.wizardUrl` is
 * what the client posts to on Next-button clicks; forms without a wizard
 * descendant skip wiring.
 */
export function tagFormWizardUrls(
  elements:   ReadonlyArray<Element>,
  urlBuilder: (formId: string) => string,
): void {
  for (const form of findForms(elements)) {
    if (formHasWizard(form)) {
      form.withWizardUrl(urlBuilder(form.getFormId()))
    }
  }
}

function formHasLiveField(form: Form): boolean {
  let found = false
  const visit = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (found) return
      if (el instanceof Field && el.isLive()) { found = true; return }
      const children = el.getChildren()
      if (children) visit(children)
    }
  }
  const children = form.getChildren()
  if (children) visit(children)
  return found
}

function formHasWizard(form: Form): boolean {
  let found = false
  const visit = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (found) return
      if (el.getType() === 'wizard') { found = true; return }
      const children = el.getChildren()
      if (children) visit(children)
    }
  }
  const children = form.getChildren()
  if (children) visit(children)
  return found
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
  // Row-scoped extraItemActions (Repeater/Builder). Stamped here too so
  // the client can POST to the same `_action/:name` route — the renderer
  // attaches `_rowPath=<fieldName>.<index>` per click; the server's
  // dispatcher uses that to walk into the right row when building
  // `ctx.row`. See `findRowExtraActions` in `dispatchAction.ts`.
  for (const { action } of findRowExtraActions(elements)) {
    if (!action.getHandler()) continue
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
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'table', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
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
  const R = cfg.resources.find(r => r.getSlug() === slug)
  if (!R) return null
  const pages = R.resolvePages()
  if (!pages.create) return null
  const PageClass = pages.create

  const createUrl = `${cfg.path}/${slug}/create`
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'create', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, createUrl)
  tagActionDispatch(elements, createUrl)
  tagFormStateUrls(elements, formId => `${cfg.path}/${slug}/_form/${formId}/state`)
  tagFormWizardUrls(elements, formId => `${cfg.path}/${slug}/_form/${formId}/wizard`)
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
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'edit', recordId, basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, editUrl)
  tagActionDispatch(elements, editUrl)
  tagFormStateUrls(elements, formId => `${cfg.path}/${slug}/${recordId}/_form/${formId}/state`)
  tagFormWizardUrls(elements, formId => `${cfg.path}/${slug}/${recordId}/_form/${formId}/wizard`)

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

  // Plan #11 — when the resource has relation managers, prepend a
  // navigation strip so users can drill into each manager's table
  // without leaving the parent record context. The "Edit" tab is
  // active here.
  const relationTabsEl = buildRelationTabs(R, recordId, cfg.path, '__edit', 'edit')
  if (relationTabsEl) elements.unshift(relationTabsEl)

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

// ─── Plan #11 relation-manager data builder ─────────────────

/**
 * Plan #11 — three scopes a single relation-manager URL space resolves to:
 *
 *   list:    GET    {base}/{slug}/:id/{rel}
 *   create:  GET    {base}/{slug}/:id/{rel}/create
 *   edit:    GET    {base}/{slug}/:id/{rel}/{childId}/edit
 *
 * Each carries enough state for `relationManagerData` to load the right
 * parent + (for edit) child + form/table context. Submit-side handlers
 * live in `routes.ts` and reuse `dispatchFormSubmit`.
 */
export type RelationManagerScope =
  | { kind: 'relation-list';   slug: string; recordId: string; relationship: string; query?: Record<string, string> }
  | { kind: 'relation-create'; slug: string; recordId: string; relationship: string; prefill?: { values?: Record<string, unknown>; errors?: Record<string, string[]> } }
  | { kind: 'relation-edit';   slug: string; recordId: string; relationship: string; childId: string; prefill?: { values?: Record<string, unknown>; errors?: Record<string, string[]> } }

/**
 * Failure outcomes the data builder discriminates back to the route
 * handler, which decides between 403 / 404 / HTML / JSON shapes.
 *
 *   `null`            — unknown panel / parent / manager / child;
 *                        route returns 404
 *   `{ ok: false, status: 403 }` — policy denied; route returns 403
 *
 * Success returns the schemaData payload directly (a record, not
 * tagged) for parity with `resourceIndexData / resourceCreateData`.
 */
export type RelationManagerResult =
  | Record<string, unknown>
  | { ok: false; status: 403 }
  | null

/**
 * Discover the related Resource for a manager. Order:
 *   1. `M.relatedResource` explicit override (skip discovery).
 *   2. Rudder ORM convention: walk
 *      `R.model.relations[manager.relationship].model()` and find
 *      `cfg.resources[i].model === relatedModel`.
 *   3. Otherwise undefined — caller must error or fall back.
 *
 * A returned Resource is the one whose `model` backs the related
 * table. Callers use it for `Related.model.find(childId)`,
 * `Related.canEdit(user, child)`, and the auto-wired form save handler.
 */
export function findRelatedResource(
  M:   typeof RelationManager,
  R:   ResourceClass,
  cfg: ReturnType<Pilotiq['getConfig']>,
): ResourceClass | undefined {
  if (M.relatedResource) return M.relatedResource
  const ParentModel = R.model as unknown as { relations?: Record<string, { model?: () => unknown }> } | undefined
  if (!ParentModel) return undefined
  const def = ParentModel.relations?.[M.getRelationship()]
  const RelatedModel = typeof def?.model === 'function' ? def.model() : undefined
  if (!RelatedModel) return undefined
  return cfg.resources.find(r => (r.model as unknown) === RelatedModel)
}

/** Find a registered manager on a Resource by its relationship key.
 *  Throws on unknown manager — so the route can 404 cleanly. */
function findManager(
  R:            ResourceClass,
  relationship: string,
): typeof RelationManager | undefined {
  return R.relations().find(M => {
    try { return M.getRelationship() === relationship } catch { return false }
  })
}

/**
 * Verify a child record actually belongs to the given parent under the
 * declared relationship. Anti-IDOR — without this an attacker can swap
 * the `:childId` segment to load any related-model row regardless of
 * whether it's actually owned by the parent.
 *
 * Strategy: re-resolve the parent's relation query and check whether
 * the child's primary key shows up in `where(pk, '=', childId).paginate(1, 1)`.
 * Yes, it's a second round-trip — but it's the single point of trust
 * for IDOR safety, and it fits naturally into the same query path
 * `modelRelationTableRecords` uses.
 */
async function childBelongsToParent(
  parentModel:  ModelLike,
  parent:       unknown,
  relationship: string,
  childPk:      string,
  childId:      string,
): Promise<boolean> {
  try {
    const q: ModelQuery = (parentModel.relatedQuery
      ? parentModel.relatedQuery(parent, relationship)
      : (parent as { related: (n: string) => ModelQuery }).related(relationship))
    const result = await q.where(childPk, '=', childId).paginate(1, 1)
    return result.total > 0
  } catch {
    return false
  }
}

/**
 * Auto-wire the manager's table records loader against the parent's
 * relation query when the user didn't set `Table.records()` themselves.
 * Mirrors `defaultPages`'s wiring of `Table.records()` from `R.model`
 * for the resource list page.
 */
function autoWireManagerTable(
  table:        Table,
  parentModel:  ModelLike,
  parent:       unknown,
  relationship: string,
): void {
  if (table.getRecords()) return  // user wired it explicitly
  table.records(modelRelationTableRecords(parentModel, parent, relationship, table))
}

/**
 * Plan #13 polish — auto-inject `TrashedFilter` on a relation manager's
 * table when the **related** Resource opts into soft deletes. Mirrors the
 * resource-list pattern in `defaultPages.applyTableDefaults`. The check
 * is on the related Resource (not the manager), because soft-delete is a
 * model-level capability — if the child model supports trashing, the
 * manager's table should expose the toggle.
 *
 * No-op when:
 *   - the related Resource hasn't set `softDeletes = true`
 *   - the user already attached a `TrashedFilter` in `M.table()`
 */
function injectManagerTrashedFilter(
  table:   Table,
  Related: ResourceClass | undefined,
): void {
  if (!Related?.softDeletes) return
  const children = table.getChildren() ?? []
  const hasTrashed = children.some(c => c instanceof TrashedFilter)
  if (hasTrashed) return
  const existing = children.filter(c => c instanceof Filter) as Filter[]
  table.filters([...existing, TrashedFilter.make()])
}

/**
 * Auto-wire the manager's form save + loadRecord handlers against the
 * **related** Resource's `model` when the user didn't set them. The
 * route handler is responsible for stamping the parent context
 * (parent, parentRecord, parentId, relationship) onto the
 * `FormContext` so user-supplied `mutateDataBeforeCreate` etc. can
 * read them.
 */
function autoWireManagerForm(form: Form, RelatedModel: ModelLike): void {
  if (!form.getSave())       form.save(modelSave(RelatedModel))
  if (!form.getLoadRecord()) form.loadRecord(modelLoadRecord(RelatedModel))
}

async function safePolicy(fn: () => Promise<boolean> | boolean): Promise<boolean> {
  try { return Boolean(await fn()) } catch { return false }
}

/** Plan #11 — authorization predicate names a `RelationManager` carries.
 *  Re-exported from `RelationManager.ts`. */
export type ManagerCanMethod = ManagerCanMethodType

/** Plan #11 — authorize a relation-manager action with sensible defaults.
 *  Re-exported from `RelationManager.ts` so external callers (route
 *  handlers, third-party plugins) keep their existing import path. */
export const safeManagerPolicy = safeManagerPolicyImpl

/**
 * Plan #11 — render data for the three relation-manager URL scopes.
 * Mirrors the resource* builders' shape so routes and Vike +data hooks
 * consume identical props. Authorization runs inline (parent
 * `canAccess + canEdit(parent)` then manager-scoped predicate); IDOR
 * check on `relation-edit` runs against the parent's relation query.
 *
 * Returns:
 *   - `null` when panel / parent / manager / child don't exist.
 *   - `{ ok: false, status: 403 }` when authorization denies.
 *   - the props record on success (route picks SSR view / SPA prop
 *     downstream).
 */
export async function relationManagerData(
  pilotiq: Pilotiq,
  scope:   RelationManagerScope,
  req?:    unknown,
): Promise<RelationManagerResult> {
  const cfg = pilotiq.getConfig()

  const R = cfg.resources.find(r => r.getSlug() === scope.slug)
  if (!R) return null

  const M = findManager(R, scope.relationship)
  if (!M) return null

  const user = await pilotiq.resolveUser(req)

  // Layer 1: parent access. canAccess gates the resource entirely;
  // canEdit gates managing its relations (managers are read-write
  // surfaces — read-only inline views opt in by overriding the
  // manager's can*).
  if (!await safePolicy(() => R.canAccess(user))) return { ok: false, status: 403 }

  if (!R.model) {
    // Without a model on the parent we can't load the parent record,
    // and without that we can't IDOR-check children. Point users at
    // the missing wiring rather than silent 500s.
    throw new Error(
      `[Pilotiq] Resource "${R.name}" has relations(${M.name}) but no static model. ` +
      `Set Resource.model = … to enable relation managers, or remove the manager.`,
    )
  }

  const parentRecord = await R.model.find(scope.recordId).catch(() => undefined)
  if (!parentRecord) return null

  if (!await safePolicy(() => R.canEdit(user, parentRecord))) return { ok: false, status: 403 }

  const Related = findRelatedResource(M, R, cfg)
  // Related Resource is required for: edit/create form auto-wire,
  // child loading on edit, related URL generation. Throw when missing
  // *only* if we'd otherwise need it — for `relation-list` it's
  // optional (the table can be hand-wired by the user).
  const needRelated = scope.kind !== 'relation-list'
  if (needRelated && !Related) {
    throw new Error(
      `[Pilotiq] RelationManager ${M.name} on ${R.name} could not resolve its related Resource. ` +
      `Set static relatedResource on the manager, or ensure the parent's model declares relations[${JSON.stringify(M.getRelationship())}].`,
    )
  }

  switch (scope.kind) {
    case 'relation-list':
      return buildRelationListData(pilotiq, R, M, Related, parentRecord, scope, req, user)
    case 'relation-create':
      return buildRelationCreateData(pilotiq, R, M, Related!, parentRecord, scope, req, user)
    case 'relation-edit':
      return buildRelationEditData(pilotiq, R, M, Related!, parentRecord, scope, req, user)
  }
}

async function buildRelationListData(
  pilotiq: Pilotiq,
  R: ResourceClass,
  M: typeof RelationManager,
  Related: ResourceClass | undefined,
  parentRecord: unknown,
  scope: Extract<RelationManagerScope, { kind: 'relation-list' }>,
  req: unknown,
  user: unknown,
): Promise<RelationManagerResult> {
  if (!await safeManagerPolicy(M, 'canViewAny', Related, user, parentRecord)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const listUrl = `${base}/${scope.slug}/${scope.recordId}/${scope.relationship}`

  // Build a single Table by piping a fresh Table through M.table(table, ctx).
  // Context lets the user wire `Action.relationCreate / relationEdit /
  // relationDelete(M, ctx)` factories inside `static table()` to template
  // URLs without threading basePath / parentId by hand.
  const managerCtx: RelationManagerContext = {
    basePath:     base,
    parentSlug:   scope.slug,
    parentId:     scope.recordId,
    relationship: scope.relationship,
    parentRecord,
    related:      Related,
  }
  const table = M.table(Table.make(), managerCtx)
  autoWireManagerTable(table, R.model as ModelLike, parentRecord, scope.relationship)
  injectManagerTrashedFilter(table, Related)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'table',
    basePath: base,
    record:   parentRecord,
  }, user), cfg)

  const elements: Element[] = [table]
  tagActionDispatch(elements, listUrl)
  await loadTableRecords(elements, scope.query ?? {}, listUrl, user)

  const tabs = buildRelationTabs(R, scope.recordId, base, scope.relationship, 'edit')
  if (tabs) elements.unshift(tabs)

  const schemaData = await resolveSchema(elements, ctx)

  return {
    pageType: 'relation-list',
    panel:    await panelInfo(pilotiq, req),
    resource: { name: R.name, label: R.label, labelSingular: R.labelSingular, slug: scope.slug, icon: serializeIcon(R.icon, R.name) },
    relation: {
      name:          M.name,
      label:         M.getLabel(),
      labelSingular: M.getLabelSingular(),
      relationship:  scope.relationship,
      icon:          M.getIcon() ? serializeIcon(M.getIcon()!, M.name) : undefined,
      relatedSlug:   Related?.getSlug(),
    },
    parent: {
      id:    scope.recordId,
      title: deriveParentTitle(R, parentRecord),
    },
    basePath: base,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
  }
}

async function buildRelationCreateData(
  pilotiq: Pilotiq,
  R: ResourceClass,
  M: typeof RelationManager,
  Related: ResourceClass,
  parentRecord: unknown,
  scope: Extract<RelationManagerScope, { kind: 'relation-create' }>,
  req: unknown,
  user: unknown,
): Promise<RelationManagerResult> {
  if (!await safeManagerPolicy(M, 'canCreate', Related, user, parentRecord)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const createUrl = `${base}/${scope.slug}/${scope.recordId}/${scope.relationship}/create`

  const managerCtx: RelationManagerContext = {
    basePath:     base,
    parentSlug:   scope.slug,
    parentId:     scope.recordId,
    relationship: scope.relationship,
    parentRecord,
    related:      Related,
  }
  const form = M.form(Form.make(), managerCtx)
  if (Related.model) autoWireManagerForm(form, Related.model)

  const elements: Element[] = [form]
  tagFormActions(elements, createUrl)

  if (scope.prefill) {
    if (scope.prefill.values) form.withValues(scope.prefill.values)
    if (scope.prefill.errors) form.withErrors(scope.prefill.errors)
  }

  const tabs = buildRelationTabs(R, scope.recordId, base, scope.relationship, 'edit')
  if (tabs) elements.unshift(tabs)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'create',
    basePath: base,
    record:   parentRecord,
  }, user), cfg)

  const schemaData = await resolveSchema(elements, ctx)

  return {
    pageType: 'relation-create',
    panel:    await panelInfo(pilotiq, req),
    resource: { name: R.name, label: R.labelSingular, slug: scope.slug, icon: serializeIcon(R.icon, R.name) },
    relation: {
      name:          M.name,
      label:         M.getLabel(),
      labelSingular: M.getLabelSingular(),
      relationship:  scope.relationship,
      icon:          M.getIcon() ? serializeIcon(M.getIcon()!, M.name) : undefined,
      relatedSlug:   Related.getSlug(),
    },
    parent: {
      id:    scope.recordId,
      title: deriveParentTitle(R, parentRecord),
    },
    mode:     'create' as const,
    basePath: base,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
    ...(scope.prefill?.errors ? { hasErrors: true } : {}),
  }
}

async function buildRelationEditData(
  pilotiq: Pilotiq,
  R: ResourceClass,
  M: typeof RelationManager,
  Related: ResourceClass,
  parentRecord: unknown,
  scope: Extract<RelationManagerScope, { kind: 'relation-edit' }>,
  req: unknown,
  user: unknown,
): Promise<RelationManagerResult> {
  if (!Related.model) {
    throw new Error(
      `[Pilotiq] Cannot load child record for ${M.name}: Related Resource ${Related.name} has no static model.`,
    )
  }
  const childPk = getPrimaryKey(Related.model)

  // IDOR check first — confirm the child actually belongs to the
  // parent under this relationship before doing anything else. Guards
  // against URL tampering swapping `:childId`.
  const belongs = await childBelongsToParent(
    R.model as ModelLike, parentRecord, scope.relationship, childPk, scope.childId,
  )
  if (!belongs) return null

  const child = await Related.model.find(scope.childId).catch(() => undefined)
  if (!child) return null

  if (!await safeManagerPolicy(M, 'canEdit', Related, user, parentRecord, child)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const editUrl = `${base}/${scope.slug}/${scope.recordId}/${scope.relationship}/${scope.childId}/edit`

  const managerCtx: RelationManagerContext = {
    basePath:     base,
    parentSlug:   scope.slug,
    parentId:     scope.recordId,
    relationship: scope.relationship,
    parentRecord,
    related:      Related,
  }
  const form = M.form(Form.make(), managerCtx)
  autoWireManagerForm(form, Related.model)

  const elements: Element[] = [form]
  tagFormActions(elements, editUrl)

  // Prefill values: explicit prefill (re-render after 422) wins,
  // otherwise pipe the loaded child through Form's fill pipeline.
  if (scope.prefill?.values) {
    form.withValues(scope.prefill.values)
    if (scope.prefill.errors) form.withErrors(scope.prefill.errors)
  } else if (child != null) {
    const values = await applyFillPipeline(form, child)
    form.withValues(values)
  }

  const tabs = buildRelationTabs(R, scope.recordId, base, scope.relationship, 'edit')
  if (tabs) elements.unshift(tabs)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'edit',
    basePath: base,
    record:   child,
    recordId: scope.childId,
  }, user), cfg)

  const schemaData = await resolveSchema(elements, ctx)

  return {
    pageType: 'relation-edit',
    panel:    await panelInfo(pilotiq, req),
    resource: { name: R.name, label: R.labelSingular, slug: scope.slug, icon: serializeIcon(R.icon, R.name) },
    relation: {
      name:          M.name,
      label:         M.getLabel(),
      labelSingular: M.getLabelSingular(),
      relationship:  scope.relationship,
      icon:          M.getIcon() ? serializeIcon(M.getIcon()!, M.name) : undefined,
      relatedSlug:   Related.getSlug(),
    },
    parent: {
      id:    scope.recordId,
      title: deriveParentTitle(R, parentRecord),
    },
    mode:     'edit' as const,
    childId:  scope.childId,
    basePath: base,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
    ...(scope.prefill?.errors ? { hasErrors: true } : {}),
  }
}

/**
 * Plan #11 — build the `RelationTabs` strip for a parent record. The
 * first tab is the parent's Edit (or View) page, followed by one tab
 * per `R.relations()` manager. `activeKey` selects which tab the
 * renderer highlights; pass `'__edit'` / `'__view'` for the parent
 * tabs or the manager's relationship key for a manager tab.
 *
 * Returns `undefined` when the resource has no relation managers — the
 * caller can then skip the prepend entirely so resources without
 * relations stay shape-compatible with their existing schemaData.
 */
function buildRelationTabs(
  R:         ResourceClass,
  recordId:  string,
  basePath:  string,
  activeKey: string,
  mode:      'edit' | 'view' = 'edit',
): RelationTabs | undefined {
  const managers = R.relations()
  if (managers.length === 0) return undefined

  const slug = R.getSlug()
  const tabs: RelationTabMeta[] = []

  // Parent tab — always first. URL depends on mode (Edit vs View).
  const parentKey = mode === 'view' ? '__view' : '__edit'
  tabs.push(relationTab({
    key:       parentKey,
    label:     mode === 'view' ? 'Details' : 'Edit',
    url:       mode === 'view'
                  ? `${basePath}/${slug}/${recordId}`
                  : `${basePath}/${slug}/${recordId}/edit`,
    active:    activeKey === parentKey,
    icon:      R.icon as IconValue | undefined,
    iconOwner: R.name,
  }))

  for (const M of managers) {
    let rel = ''
    try { rel = M.getRelationship() } catch { continue }
    const icon = M.getIcon()
    tabs.push(relationTab({
      key:    rel,
      label:  M.getLabel(),
      url:    `${basePath}/${slug}/${recordId}/${rel}`,
      active: activeKey === rel,
      ...(icon !== undefined ? { icon, iconOwner: M.name } : {}),
    }))
  }

  return RelationTabs.make(tabs)
}

/** Pull a human-readable title off a parent record for breadcrumb /
 *  page-title use. Falls back through `recordTitleAttribute` →
 *  `name` → `title` → primary key value → 'Record'. */
function deriveParentTitle(R: ResourceClass, record: unknown): string {
  const r = record as Record<string, unknown>
  const attr = R.recordTitleAttribute
  if (attr && r[attr] != null) return String(r[attr])
  if (r['name']  != null) return String(r['name'])
  if (r['title'] != null) return String(r['title'])
  if (R.model) {
    const pk = getPrimaryKey(R.model)
    if (r[pk] != null) return String(r[pk])
  }
  return 'Record'
}

// ─── Plan #5 partial-resolve data builder ────────────────────

export type FormStateScope =
  | { kind: 'resource-create'; slug: string }
  | { kind: 'resource-edit';   slug: string; recordId: string }
  | { kind: 'global-edit';     slug: string }
  | { kind: 'page';            pageSlug: string }

export interface FormStateRequest {
  formId:  string
  changed: string
  values:  Record<string, unknown>
}

export interface FormStateResult {
  ok:    true
  form:  Record<string, unknown>      // resolved FormMeta
  dirty: string[]
}

export interface FormStateError {
  ok:     false
  status: 404 | 422
  error:  string
}

/**
 * Plan #5 — handle a partial-resolve roundtrip from a `live()` field.
 *
 * Locates the page's schema, finds the targeted form by `formId`, runs
 * `applyStateUpdate` to apply the changed value + run
 * `afterStateUpdated`, then re-resolves the form's children with the
 * mutated values + bound `$get / $set` so dependent options /
 * conditional visibility re-evaluate. Returns the resolved FormMeta the
 * client uses to replace its rendered form.
 *
 * Returns `null` when the route prefix doesn't resolve to a real
 * resource/global/page — the route handler turns this into a 404. The
 * inner `{ status: 422 }` failure is for "form found but `changed`
 * field doesn't exist on it" — also a client-side bug.
 */
export async function formStateData(
  pilotiq: Pilotiq,
  scope:   FormStateScope,
  body:    FormStateRequest,
  req?:    unknown,
): Promise<FormStateResult | FormStateError | null> {
  const cfg = pilotiq.getConfig()
  const user = await pilotiq.resolveUser(req)

  let PageClass: typeof Page | undefined
  let mode: 'create' | 'edit'
  let record: unknown = undefined
  let recordId: string | undefined
  let baseCtxExtras: Record<string, unknown> = {}

  if (scope.kind === 'resource-create' || scope.kind === 'resource-edit') {
    const R = cfg.resources.find(r => r.getSlug() === scope.slug)
    if (!R) return null
    const pages = R.resolvePages()
    if (scope.kind === 'resource-create') {
      if (!pages.create) return null
      PageClass = pages.create
      mode = 'create'
    } else {
      if (!pages.edit) return null
      PageClass = pages.edit
      mode = 'edit'
      recordId = scope.recordId
      baseCtxExtras = { recordId }
      if (R.model) {
        try { record = await R.model.find(scope.recordId) } catch { /* ignore */ }
      } else if (recordId) {
        record = { id: recordId }
      }
    }
  } else if (scope.kind === 'global-edit') {
    const G = cfg.globals.find(g => g.getSlug() === scope.slug)
    if (!G) return null
    const pages = G.resolvePages()
    if (!pages.edit) return null
    PageClass = pages.edit
    mode = 'edit'
  } else {
    const P = cfg.pages.find(p => p.getSlug() === scope.pageSlug)
    if (!P) return null
    PageClass = P
    // Custom pages don't have a record/edit-mode concept — pass mode
    // 'edit' so resolveSchema treats fields as form inputs (not table
    // cells / view-mode read-only).
    mode = 'edit'
  }

  if (!PageClass) return null

  const baseCtx: SchemaContext = uploadCtx(userCtx({ mode, basePath: cfg.path, ...baseCtxExtras }, user), cfg)
  const elements = await callPageSchema(PageClass, baseCtx)
  const form = selectFormById(findForms(elements), body.formId)
  if (!form) return { ok: false, status: 404, error: `Form "${body.formId}" not found on page` }

  const update = await applyStateUpdate(form, body.values, body.changed, {
    ...(record  !== undefined ? { record } : {}),
    ...(user    !== null      ? { user   } : {}),
    request: req,
  })
  if (!update) {
    return { ok: false, status: 422, error: `Field "${body.changed}" not found on form "${body.formId}"` }
  }

  // Re-resolve the form with the mutated values bound. We bind
  // `$get / $set` against the post-update values map so further
  // resolve-time logic (SelectField.options(fn), reactive
  // visibility) reads current state.
  const $get = (name: string): unknown => update.values[name]
  // $set on the resolve pass is a no-op — only afterStateUpdated
  // mutations survive into the response. Resolve-time `$set` would
  // race against the client's view of the world.
  const $set = (_name: string, _v: unknown): void => { /* intentional no-op */ }

  const resolveCtx = {
    ...baseCtx,
    values: update.values,
    $get,
    $set,
    changed: body.changed,
    ...(record !== undefined ? { record } : {}),
  }
  // Snapshot values onto the form so its FormMeta carries them.
  form.withValues(update.values)
  const resolved = await resolveSchema([form], resolveCtx)
  const formMeta = resolved[0]
  if (!formMeta || formMeta.type !== 'form') {
    return { ok: false, status: 422, error: 'Form re-resolved to non-form meta' }
  }

  return { ok: true, form: formMeta, dirty: update.dirty }
}

// ─── Plan #8 wizard step-validate data builder ────────────────

export interface FormWizardRequest {
  formId: string
  step:   number
  values: Record<string, unknown>
}

export interface FormWizardSuccess {
  ok: true
}

export interface FormWizardFailure {
  ok:     false
  status: 404 | 422
  error?: string
  errors?: Record<string, string[]>
}

/**
 * Plan #8 — handle a Wizard step-validate POST. Locates the form by id,
 * walks to the Wizard descendant, validates only the fields inside step
 * `step` against `values`. Returns `{ ok: true }` on success or
 * `{ ok: false, status: 422, errors }` when fields fail validation.
 *
 * Errors are keyed by field name, same shape as the form-submit 422 path,
 * so the client (`FormStateApi.applyErrors`) can surface them in-place.
 */
export async function formWizardData(
  pilotiq: Pilotiq,
  scope:   FormStateScope,
  body:    FormWizardRequest,
  req?:    unknown,
): Promise<FormWizardSuccess | FormWizardFailure | null> {
  const cfg = pilotiq.getConfig()
  const user = await pilotiq.resolveUser(req)

  let PageClass: typeof Page | undefined
  let mode: 'create' | 'edit'
  let record: unknown = undefined
  let baseCtxExtras: Record<string, unknown> = {}

  if (scope.kind === 'resource-create' || scope.kind === 'resource-edit') {
    const R = cfg.resources.find(r => r.getSlug() === scope.slug)
    if (!R) return null
    const pages = R.resolvePages()
    if (scope.kind === 'resource-create') {
      if (!pages.create) return null
      PageClass = pages.create
      mode = 'create'
    } else {
      if (!pages.edit) return null
      PageClass = pages.edit
      mode = 'edit'
      baseCtxExtras = { recordId: scope.recordId }
      if (R.model) {
        try { record = await R.model.find(scope.recordId) } catch { /* ignore */ }
      } else {
        record = { id: scope.recordId }
      }
    }
  } else if (scope.kind === 'global-edit') {
    const G = cfg.globals.find(g => g.getSlug() === scope.slug)
    if (!G) return null
    const pages = G.resolvePages()
    if (!pages.edit) return null
    PageClass = pages.edit
    mode = 'edit'
  } else {
    const P = cfg.pages.find(p => p.getSlug() === scope.pageSlug)
    if (!P) return null
    PageClass = P
    mode = 'edit'
  }

  if (!PageClass) return null

  const baseCtx: SchemaContext = uploadCtx(userCtx({ mode, basePath: cfg.path, ...baseCtxExtras }, user), cfg)
  const elements = await callPageSchema(PageClass, baseCtx)
  const form = selectFormById(findForms(elements), body.formId)
  if (!form) return { ok: false, status: 404, error: `Form "${body.formId}" not found on page` }

  const formChildren = form.getChildren() ?? []
  const stepFields = findWizardStepFields(formChildren, body.step)
  if (!stepFields) return { ok: false, status: 404, error: `Step ${body.step} not found on form "${body.formId}"` }

  const errors = await validateSchema(stepFields, body.values, record)
  if (Object.keys(errors).length > 0) {
    return { ok: false, status: 422, errors }
  }
  return { ok: true }
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
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'view', recordId, basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  // For the view page we want the record threaded into resolveSchema so
  // factory-attached visibility predicates see it. Resource.detail()
  // already runs against the loaded record in user code; here we mirror
  // that into ctx.record for the action eval pass.
  let record: unknown = undefined
  if (R.model) {
    try { record = await R.model.find(recordId) } catch { /* ignore */ }
  }

  // Plan #11 — prepend the relation tabs strip with the "Details" tab
  // active when the resource has relation managers configured.
  const relationTabsEl = buildRelationTabs(R, recordId, cfg.path, '__view', 'view')
  if (relationTabsEl) elements.unshift(relationTabsEl)

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
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'edit', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, editUrl)
  tagFormStateUrls(elements, formId => `${cfg.path}/${slug}/_form/${formId}/state`)
  tagFormWizardUrls(elements, formId => `${cfg.path}/${slug}/_form/${formId}/wizard`)

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
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'view', basePath: cfg.path }, user), cfg)
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
  const ctx: SchemaContext = uploadCtx(userCtx({}, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, pageUrl)
  tagFormStateUrls(elements, formId => `${cfg.path}/${pageSlug}/_form/${formId}/state`)
  tagFormWizardUrls(elements, formId => `${cfg.path}/${pageSlug}/_form/${formId}/wizard`)
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

// ─── Plan #12 global search data builder ─────────────────────

/**
 * Resolve the user via `pilotiq.resolveUser(req)` and run the
 * panel-wide search. Mirrors the formStateData/formWizardData
 * shape so the `/_search` route handler stays a thin wrapper.
 */
export async function searchData(
  pilotiq: Pilotiq,
  query:   string,
  req?:    unknown,
): Promise<{ ok: true; results: GlobalSearchResult[] }> {
  const user = await pilotiq.resolveUser(req)
  const results = await searchAllResources(pilotiq, query, user)
  return { ok: true, results }
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

    case '/pages/(pilotiq)/relation-list': {
      const slug         = routeParams['slug']
      const id           = routeParams['id']
      const relationship = routeParams['relationship']
      if (!slug || !id || !relationship) return null
      const out = await relationManagerData(panel, {
        kind: 'relation-list', slug, recordId: id, relationship,
        query: search as Record<string, string>,
      })
      // Tagged failure shapes (`{ ok: false, status: 403 }`) leak straight
      // through to the +Page renderer, which can branch on the shape.
      // For Plan #11 we let null short-circuit the SPA render the same
      // way the resource builders do.
      return out === null ? null : (out as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/relation-create': {
      const slug         = routeParams['slug']
      const id           = routeParams['id']
      const relationship = routeParams['relationship']
      if (!slug || !id || !relationship) return null
      const out = await relationManagerData(panel, {
        kind: 'relation-create', slug, recordId: id, relationship,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/relation-edit': {
      const slug         = routeParams['slug']
      const id           = routeParams['id']
      const relationship = routeParams['relationship']
      const childId      = routeParams['childId']
      if (!slug || !id || !relationship || !childId) return null
      const out = await relationManagerData(panel, {
        kind: 'relation-edit', slug, recordId: id, relationship, childId,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    default:
      return null
  }
}
