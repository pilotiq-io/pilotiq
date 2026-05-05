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
import { resourceBasePath, globalBasePath, pageBasePath, clusterBasePath } from './clusterPaths.js'
import type { ClusterClass } from './Cluster.js'
import { Element } from './schema/Element.js'
import { Field } from './fields/Field.js'
import { resolveSchema, type RenderContext, type SchemaContext } from './schema/resolveSchema.js'
import { isServerDataElement, type ServerDataElement } from './schema/ServerDataElement.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { applyStateUpdate, findForms, findWizardStepFields, loadRelationRows, selectFormById } from './elements/dispatchForm.js'
import { isRepeaterField, RepeaterField } from './fields/RepeaterField.js'
import { isBuilderField, BuilderField } from './fields/BuilderField.js'
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
  modelSave, modelLoadRecord, modelRelationTableRecords, findRecord, getPrimaryKey,
  getRelationType,
  getMorphRelationDescriptor,
  type ModelLike, type ModelQuery,
} from './orm/modelDefaults.js'
import { normalizeRelationMode, type RelationMode } from './RelationManager.js'

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
  // expose nav items. Clusters compose: a child gated through its
  // cluster's `canAccess` returning false drops the child even when the
  // child's own predicate would have passed.
  const [resourceAccess, globalAccess, pageAccess, clusterAccess] = await Promise.all([
    Promise.all(cfg.resources.map(R => safeAccess(() => R.canAccess(user)))),
    Promise.all(cfg.globals.map(G => safeAccess(() => G.canAccess(user)))),
    Promise.all(cfg.pages.map(P => safeAccess(() => P.canAccess(user)))),
    Promise.all(cfg.clusters.map(C => safeAccess(() => C.canAccess(user)))),
  ])

  // Identity-keyed so two clusters that happen to share a `.name`
  // (minifier collisions, hot-reload duplicate imports) don't clobber.
  const clusterAccessByClass = new Map<ClusterClass, boolean>()
  cfg.clusters.forEach((C, i) => clusterAccessByClass.set(C, !!clusterAccess[i]))

  const firstChildUrlByCluster = new Map<ClusterClass, string>()
  const recordChildUrl = (cluster: ClusterClass, url: string) => {
    if (!firstChildUrlByCluster.has(cluster)) firstChildUrlByCluster.set(cluster, url)
  }

  for (let i = 0; i < cfg.resources.length; i++) {
    const R = cfg.resources[i]!
    if (!resourceAccess[i]) continue
    if (R.cluster && !clusterAccessByClass.get(R.cluster)) continue
    const url = resourceBasePath(base, R)
    if (R.cluster) recordChildUrl(R.cluster, url)
    const item: RawNavItem = {
      name:  R.name,
      label: R.getNavigationLabel(),
      url,
      icon:  serializeIcon(R.getNavigationIcon(), R.name),
      _idx:  idx++,
    }
    if (R.navigationGroup        !== undefined) item.group        = R.navigationGroup
    if (R.navigationSort         !== undefined) item.sort         = R.navigationSort
    // Cluster nesting wins over `navigationParentItem`. Both being set
    // is a misconfiguration; cluster placement is the structural one.
    if (R.cluster)                              item.parent       = R.cluster.name
    else if (R.navigationParentItem !== undefined) item.parent    = R.navigationParentItem
    if (R.navigationBadgeColor   !== 'default') item.badgeColor   = R.navigationBadgeColor
    if (R.navigationBadge)                       pushBadge.push({ item, handler: R.navigationBadge })
    raw.push(item)
  }

  for (let i = 0; i < cfg.globals.length; i++) {
    if (!globalAccess[i]) continue
    const G = cfg.globals[i]!
    if (G.cluster && !clusterAccessByClass.get(G.cluster)) continue
    // Globals default `navigationGroup` to `'Settings'`. Allow `null` as
    // an explicit opt-out → render at top level.
    const group = G.navigationGroup === null ? undefined : G.navigationGroup
    const url = globalBasePath(base, G)
    if (G.cluster) recordChildUrl(G.cluster, url)
    const item: RawNavItem = {
      name:  G.name,
      label: G.getNavigationLabel(),
      url,
      icon:  serializeIcon(G.getNavigationIcon(), G.name),
      _idx:  idx++,
    }
    if (group                    !== undefined) item.group        = group
    if (G.navigationSort         !== undefined) item.sort         = G.navigationSort
    if (G.cluster)                              item.parent       = G.cluster.name
    else if (G.navigationParentItem !== undefined) item.parent    = G.navigationParentItem
    if (G.navigationBadgeColor   !== 'default') item.badgeColor   = G.navigationBadgeColor
    if (G.navigationBadge)                       pushBadge.push({ item, handler: G.navigationBadge })
    raw.push(item)
  }

  for (let i = 0; i < cfg.pages.length; i++) {
    if (!pageAccess[i]) continue
    const P = cfg.pages[i]!
    if (P.cluster && !clusterAccessByClass.get(P.cluster)) continue
    // The dashboard page collapses its nav URL to `${base}` so the
    // sidebar entry deep-links to the panel root rather than
    // `${base}/${P.getSlug()}` (which would 404 — the slug route skips
    // the dashboard page at boot).
    const isDashboard = cfg.dashboardPage === P
    const url = isDashboard ? base : pageBasePath(base, P)
    if (P.cluster && !isDashboard) recordChildUrl(P.cluster, url)
    const item: RawNavItem = {
      name:  P.name,
      label: P.getNavigationLabel(),
      url,
      icon:  serializeIcon(P.getNavigationIcon(), P.name),
      _idx:  idx++,
    }
    if (P.navigationGroup        !== undefined) item.group        = P.navigationGroup
    if (P.navigationSort         !== undefined) item.sort         = P.navigationSort
    if (P.cluster && !isDashboard)              item.parent       = P.cluster.name
    else if (P.navigationParentItem !== undefined) item.parent    = P.navigationParentItem
    if (P.navigationBadgeColor   !== 'default') item.badgeColor   = P.navigationBadgeColor
    if (P.navigationBadge)                       pushBadge.push({ item, handler: P.navigationBadge })
    raw.push(item)
  }

  // Clusters render as first-class nav items. Each gets a URL pointing
  // at its `landingPage` (when set + accessible) or its first accessible
  // child. Clusters whose every child was gated out are dropped silently
  // — same posture as `navigationParentItem` with no resolvable parent.
  for (let i = 0; i < cfg.clusters.length; i++) {
    if (!clusterAccess[i]) continue
    const C = cfg.clusters[i]!
    let url: string | undefined
    if (C.landingPage) {
      const lpIdx = cfg.pages.indexOf(C.landingPage)
      if (lpIdx !== -1 && pageAccess[lpIdx]) {
        url = cfg.dashboardPage === C.landingPage ? base : pageBasePath(base, C.landingPage)
      }
    }
    if (url === undefined) url = firstChildUrlByCluster.get(C)
    if (url === undefined) continue   // empty cluster — drop entirely
    const item: RawNavItem = {
      name:  C.name,
      label: C.getNavigationLabel(),
      url,
      icon:  serializeIcon(C.getNavigationIcon(), C.name),
      _idx:  idx++,
    }
    if (C.navigationGroup        !== undefined) item.group        = C.navigationGroup
    if (C.navigationSort         !== undefined) item.sort         = C.navigationSort
    if (C.navigationParentItem   !== undefined) item.parent       = C.navigationParentItem
    if (C.navigationBadgeColor   !== 'default') item.badgeColor   = C.navigationBadgeColor
    if (C.navigationBadge)                       pushBadge.push({ item, handler: C.navigationBadge })
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

// Marks every Table on the page deferred and stamps the URL the
// renderer will fetch from after mount. Must run BEFORE `loadTableRecords`
// so the records handler short-circuits.
export function tagTableDeferred(
  elements: ReadonlyArray<Element>,
  url:      string,
): void {
  for (const table of findTables(elements)) {
    table.withDeferred(true)
    table.withTableUrl(url)
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

/**
 * Adapter-package async-resolve walker. Stamps the per-form mentions URL
 * on every field that ducks like a "rich text with at least one async
 * mention provider". The duck-typed contract lives here (as opposed to
 * importing from `@pilotiq/tiptap`) so pilotiq core stays adapter-free —
 * any future field type with an async-resolve trigger can satisfy the
 * same shape and pick up URL stamping for free.
 *
 * Contract:
 *   - `getType() === 'richtext'`  (fast filter)
 *   - `hasAsyncMentions(): boolean`
 *   - `withMentionsUrl(url: string): unknown`
 *
 * Walks every form on the page so the URL builder can mint a per-form
 * URL (mirrors `tagFormStateUrls / tagFormWizardUrls`). The route handler
 * uses formId in the URL to select the form; the body carries `field`
 * + `trigger` + `query`. One URL per (form, scope), reused across every
 * async-mention field on that form.
 */
interface AsyncMentionFieldLike {
  hasAsyncMentions(): boolean
  withMentionsUrl(url: string): unknown
}

function isAsyncMentionField(el: Element): el is Element & AsyncMentionFieldLike {
  if (el.getType() !== 'richtext') return false
  const candidate = el as unknown as Partial<AsyncMentionFieldLike>
  return typeof candidate.hasAsyncMentions === 'function'
      && typeof candidate.withMentionsUrl  === 'function'
}

export function tagRichTextMentionUrls(
  elements:   ReadonlyArray<Element>,
  urlBuilder: (formId: string) => string,
): void {
  for (const form of findForms(elements)) {
    const url = urlBuilder(form.getFormId())
    let stampedAny = false
    const visit = (els: ReadonlyArray<Element>): void => {
      for (const el of els) {
        // Don't cross into nested forms — each form gets its own URL.
        if (el !== form && el.getType() === 'form') continue
        if (isAsyncMentionField(el) && el.hasAsyncMentions()) {
          el.withMentionsUrl(url)
          stampedAny = true
        }
        // Builder.getChildren() returns undefined to keep the field-level
        // walkers from treating heterogeneous rows as flat children. Manual
        // descent into each block's schema covers the URL-stamping path
        // without changing the no-cross posture for save/coerce.
        if (isBuilderField(el)) {
          for (const block of (el as BuilderField).getBlocks()) visit(block.getSchema())
          continue
        }
        const children = el.getChildren()
        if (children) visit(children)
      }
    }
    const children = form.getChildren()
    if (children) visit(children)
    void stampedAny // silence unused — kept locally for readability
  }
}

function formHasLiveField(form: Form): boolean {
  let found = false
  const visit = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (found) return
      // Either a server-side `live()` (drives a roundtrip) OR a
      // client-side `afterStateUpdatedJs(body)` (JS-only) is enough to
      // mount the controlled-form path: the FormStateProvider holds the
      // values map either path needs, and the client gates the actual
      // network POST on `live` separately. Cost of the over-stamp for
      // JS-only forms is one unused endpoint URL per form — endpoint
      // never gets hit because the client only POSTs on `live`.
      if (el instanceof Field && (el.isLive() || el.getAfterStateUpdatedJs() !== undefined)) {
        found = true
        return
      }
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

/**
 * Walk the form's top-level Repeaters and replace `values[fieldName]`
 * with rows fetched from `parent.related(name)` for any
 * relationship-backed Repeater. Each loaded row stamps `__id` to the
 * child's primary key so the renderer can round-trip identity through
 * a hidden input and the save-side diff can match submitted rows back
 * to existing records.
 *
 * No-op when the parent record is null (create mode), when no
 * relationship-backed Repeaters exist on the form, or when the
 * resource has no `R.model` (relation queries need it).
 *
 * Mutates and returns a fresh values object — never the input.
 */
export async function applyRelationshipRepeaterFill(
  form:        Form,
  values:      Record<string, unknown>,
  record:      unknown,
  parentModel: ModelLike | undefined,
): Promise<Record<string, unknown>> {
  if (record == null) return values
  if (!parentModel)  return values
  const repeaters = findRelationshipRepeaters(form.getChildren() ?? [])
  if (repeaters.length === 0) return values

  const out: Record<string, unknown> = { ...values }
  for (const repeater of repeaters) {
    const cfg = repeater.getRelationship()!
    let rows: unknown[]
    try {
      rows = await loadRelationRows(parentModel, record, cfg.name)
    } catch {
      // Failed lookup (e.g. missing `relations` map on a test stub)
      // — fall back to whatever value applyFillPipeline produced
      // rather than wiping the field. Better to render stale data
      // than to silently empty the row list.
      continue
    }

    // The child model is opaque here — we don't have the full
    // descriptor at this seam, so use the configured override or
    // peek the parent's relations map for the FK column. Strip it
    // (and the PK) from each row's payload so the inner schema
    // doesn't surface them as form values. For morphMany the
    // attachment is two columns instead of one — strip both.
    const pkColumn   = pickChildPrimaryKey(parentModel, cfg.name) ?? 'id'
    const fkColumn   = cfg.foreignKey ?? pickChildForeignKey(parentModel, cfg.name)
    const morph      = getMorphRelationDescriptor(parentModel, cfg.name)
    const morphIdCol = morph ? `${morph.morphName}Id`   : undefined
    const morphTyCol = morph ? `${morph.morphName}Type` : undefined

    out[repeater.name] = rows.map(row => {
      const r = (row && typeof row === 'object') ? { ...(row as Record<string, unknown>) } : {}
      const pkValue = r[pkColumn]
      delete r[pkColumn]
      if (fkColumn)   delete r[fkColumn]
      if (morphIdCol) delete r[morphIdCol]
      if (morphTyCol) delete r[morphTyCol]
      const stamped: Record<string, unknown> = { ...r }
      if (pkValue !== undefined && pkValue !== null) {
        stamped['__id'] = String(pkValue)
      }
      return stamped
    })
  }
  return out
}

/** Walk the form's children for top-level relationship-backed Repeaters. */
function findRelationshipRepeaters(elements: ReadonlyArray<Element>): RepeaterField[] {
  const out: RepeaterField[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (isRepeaterField(el)) {
        const r = el as RepeaterField
        if (r.getRelationship()) out.push(r)
        // Don't dive into Repeater children — relationship-on-relationship
        // isn't supported in v1.
        continue
      }
      // Don't dive into Builder children either — relationship-backed
      // Builders are resolved separately by `findRelationshipBuilders`.
      if (isBuilderField(el)) continue
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
    }
  }
  walk(elements)
  return out
}

/**
 * Walk the form's top-level Builders and replace `values[fieldName]` with
 * rows fetched from `parent.related(name)` for any relationship-backed
 * Builder. Each loaded row stamps `__id` (child PK) + `type` (block
 * discriminator) + `data` (per-block JSON payload) so the renderer can
 * round-trip the heterogeneous envelope.
 *
 * Mirrors `applyRelationshipRepeaterFill`. No-op when the parent record
 * is null (create mode), the resource has no `R.model`, or no
 * relationship-backed Builders exist on the form.
 */
export async function applyRelationshipBuilderFill(
  form:        Form,
  values:      Record<string, unknown>,
  record:      unknown,
  parentModel: ModelLike | undefined,
): Promise<Record<string, unknown>> {
  if (record == null) return values
  if (!parentModel)  return values
  const builders = findRelationshipBuilders(form.getChildren() ?? [])
  if (builders.length === 0) return values

  const out: Record<string, unknown> = { ...values }
  for (const builder of builders) {
    const cfg = builder.getRelationship()!
    let rows: unknown[]
    try {
      rows = await loadRelationRows(parentModel, record, cfg.name)
    } catch {
      // Failed lookup (e.g. missing `relations` map on a test stub) —
      // fall back to whatever value applyFillPipeline produced rather
      // than wiping the field. Better stale than silently empty.
      continue
    }

    const pkColumn   = pickChildPrimaryKey(parentModel, cfg.name) ?? 'id'
    const fkColumn   = cfg.foreignKey ?? pickChildForeignKey(parentModel, cfg.name)
    const typeColumn = cfg.typeColumn ?? 'type'
    const dataColumn = cfg.dataColumn ?? 'data'

    out[builder.name] = rows.map(row => {
      const r = (row && typeof row === 'object') ? { ...(row as Record<string, unknown>) } : {}
      const pkValue   = r[pkColumn]
      const blockType = typeof r[typeColumn] === 'string' ? (r[typeColumn] as string) : ''
      const dataRaw   = r[dataColumn]
      const blockData = parseBuilderDataPayload(dataRaw)

      const stamped: Record<string, unknown> = {
        type: blockType,
        data: blockData,
      }
      if (pkValue !== undefined && pkValue !== null) {
        stamped['__id'] = String(pkValue)
      }
      // Non-`type` / `data` / FK / PK columns aren't surfaced — the
      // JSON envelope is the source of truth for per-block fields. If
      // a user denormalizes a column, they handle it via per-block
      // mutate hooks, not by leaking the column into row values.
      void fkColumn
      return stamped
    })
  }
  return out
}

/**
 * Normalize the JSON payload column into a plain object. Prisma
 * hydrates `Json` columns to objects; some adapters return strings.
 * Anything that isn't a parseable object falls back to `{}` so the
 * inner schema renders fresh defaults.
 */
function parseBuilderDataPayload(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // fall through to {}
    }
  }
  return {}
}

/** Walk the form's children for top-level relationship-backed Builders. */
function findRelationshipBuilders(elements: ReadonlyArray<Element>): BuilderField[] {
  const out: BuilderField[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (isBuilderField(el)) {
        const b = el as BuilderField
        if (b.getRelationship()) out.push(b)
        continue
      }
      // Don't dive into Repeater children either — both array-row
      // boundaries are walker stops here.
      if (isRepeaterField(el)) continue
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
    }
  }
  walk(elements)
  return out
}

/** Read the child model's PK column from the parent's relations map, when present. */
function pickChildPrimaryKey(parentModel: ModelLike, name: string): string | undefined {
  const relations = (parentModel as unknown as Record<string, unknown>)['relations']
  if (!relations || typeof relations !== 'object') return undefined
  const entry = (relations as Record<string, unknown>)[name]
  if (!entry || typeof entry !== 'object') return undefined
  const e = entry as Record<string, unknown>
  if (typeof e['model'] !== 'function') return undefined
  try {
    const child = (e['model'] as () => ModelLike)()
    return getPrimaryKey(child)
  } catch {
    return undefined
  }
}

/** Read the FK column from the parent's relations map, when present. */
function pickChildForeignKey(parentModel: ModelLike, name: string): string | undefined {
  const relations = (parentModel as unknown as Record<string, unknown>)['relations']
  if (!relations || typeof relations !== 'object') return undefined
  const entry = (relations as Record<string, unknown>)[name]
  if (!entry || typeof entry !== 'object') return undefined
  const e = entry as Record<string, unknown>
  return typeof e['foreignKey'] === 'string' ? (e['foreignKey'] as string) : undefined
}

// ─── Plan #15 server-data widgets ─────────────────────────────

/** Wire-shape of the per-widget data map shipped to the client.
 *  Lazy elements stamp `null` (renderer paints skeleton + fetches);
 *  eager elements stamp their resolved payload. Errors stamp
 *  `{ error: '<message>' }` so the renderer can surface a per-widget
 *  failure without blanking the page. */
export type ServerDataMap = Record<string, unknown>

/**
 * Plan #15 — collect every `ServerDataElement` in the schema tree and
 * resolve their `getServerData(ctx)` payloads in parallel. Returns a
 * map keyed by element id, ready to ship as `viewProps._widgetData`.
 *
 * Lazy elements (default — `lazy(false)` opts out) skip the hook and
 * stamp `null` so the renderer paints a skeleton and fetches the
 * payload via `POST {base}/_widget/:id` on mount. Eager elements
 * resolve synchronously and ship the data with the page.
 *
 * Per-widget errors are caught and surfaced as `{ error: '...' }` —
 * one flaky `getStats()` shouldn't 500 the entire dashboard.
 *
 * Visibility is **not** re-evaluated here. The schema resolver
 * (`resolveSchema → evaluateVisibility`) drops hidden layout elements
 * before any widget code runs. Widgets inside still-rendered branches
 * always resolve (or stamp lazy null).
 */
export async function resolveServerDataElements(
  elements: ReadonlyArray<Element>,
  ctx:      RenderContext,
): Promise<ServerDataMap> {
  const widgets = collectServerDataElements(elements)
  if (widgets.length === 0) return {}
  const out: ServerDataMap = {}
  await Promise.all(widgets.map(async (el) => {
    const id = el.getId()
    if (el.isLazy()) {
      out[id] = null  // sentinel — renderer paints skeleton, fetches on mount
      return
    }
    try {
      out[id] = await el.resolveServerData(ctx)
    } catch (err) {
      out[id] = { error: err instanceof Error ? err.message : 'Widget failed to load' }
    }
  }))
  return out
}

/** Walk the tree collecting every `ServerDataElement`. Walks into
 *  containers but stops at Form/Repeater/Builder boundaries — widgets
 *  inside an editable form don't make sense in v1. */
function collectServerDataElements(elements: ReadonlyArray<Element>): ServerDataElement[] {
  const out: ServerDataElement[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (isServerDataElement(el)) {
        out.push(el)
        // Don't recurse into a widget's children — `View` etc. are leaves
        // for v1 (no nested widgets inside widgets).
        continue
      }
      // Skip walkers that imply per-row resolution — widgets inside
      // Repeater/Builder rows don't have a stable id space.
      const type = el.getType()
      if (type === 'form' || type === 'repeater' || type === 'builder' || type === 'table' || type === 'tableWidget') continue
      const children = el.getChildren()
      if (children) walk(children)
    }
  }
  walk(elements)
  return out
}

/**
 * Plan #15 — stamp the polling-endpoint URL on every `ServerDataElement`
 * in the tree. Mirrors `tagFormStateUrls / tagTableReorderUrls`. Walks
 * with the same boundaries as `collectServerDataElements` so the wire
 * stays in sync (no orphan widgets without URLs and vice versa).
 *
 * `urlBuilder(id)` typically produces `${base}/_widget/${id}` for
 * dashboard widgets and `${base}/${pageSlug}/_widget/${id}` for
 * custom-page widgets — the route handlers for both shapes are wired up
 * in `routes.ts` (see Phase A.4).
 */
export function tagWidgetUrls(
  elements:   ReadonlyArray<Element>,
  urlBuilder: (id: string) => string,
): void {
  for (const widget of collectServerDataElements(elements)) {
    if (widget.getWidgetUrl()) continue // user-set wins
    widget.withWidgetUrl(urlBuilder(widget.getId()))
  }
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
    tagFormStateUrls(elements, formId => `${cfg.path}/_form/${formId}/state`)
    tagFormWizardUrls(elements, formId => `${cfg.path}/_form/${formId}/wizard`)
    tagRichTextMentionUrls(elements, formId => `${cfg.path}/_form/${formId}/mentions`)
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
  const schemaData = await resolveSchema(elements, ctx)

  return {
    panel:    await panelInfo(pilotiq, req),
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
  const R = cfg.resources.find(r => r.getSlug() === slug)
  if (!R) return null

  const pages = R.resolvePages()
  if (!pages.index) return null
  const PageClass = pages.index

  const indexUrl = resourceBasePath(cfg.path, R)
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'table', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagActionDispatch(elements, indexUrl)
  // Plan #15 — resource-scope widget polling URL. Stamped before the
  // schema resolves so each widget's meta carries its endpoint.
  tagWidgetUrls(elements, id => `${indexUrl}/_widget/${id}`)
  // Mark the active tab + parallel-eval badges + stamp per-tab URLs
  // before the table records run — `loadTableRecords` walks the schema
  // for the active tab and splices its `modifyQuery` predicate into the
  // ORM chain alongside filters.
  await resolveActiveTab(elements, query, indexUrl)
  if (R.deferLoading) tagTableDeferred(elements, `${indexUrl}/_table`)
  await loadTableRecords(elements, query, indexUrl, user, {
    canEdit: (u, record) => R.canEdit(u, record),
  })
  tagTableReorderUrls(elements, `${indexUrl}/_reorder`)
  tagCellEditUrls(elements, indexUrl)
  const widgetData = await resolveServerDataElements(elements, ctx)
  const schemaData = await resolveSchema(elements, ctx)

  return {
    pageType: 'resource',
    panel:    await panelInfo(pilotiq, req),
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
  const R = cfg.resources.find(r => r.getSlug() === slug)
  if (!R) return null

  const pages = R.resolvePages()
  if (!pages.index) return null
  const PageClass = pages.index

  const indexUrl = resourceBasePath(cfg.path, R)
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'table', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagActionDispatch(elements, indexUrl)
  await resolveActiveTab(elements, query, indexUrl)
  await loadTableRecords(elements, query, indexUrl, user, {
    canEdit: (u, record) => R.canEdit(u, record),
  })
  tagTableReorderUrls(elements, `${indexUrl}/_reorder`)
  tagCellEditUrls(elements, indexUrl)
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
  const R = cfg.resources.find(r => r.getSlug() === slug)
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
  tagFormStateUrls(elements, formId => `${resourceBase}/_form/${formId}/state`)
  tagFormWizardUrls(elements, formId => `${resourceBase}/_form/${formId}/wizard`)
  tagRichTextMentionUrls(elements, formId => `${resourceBase}/_form/${formId}/mentions`)
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

  const resourceBase = resourceBasePath(cfg.path, R)
  const editUrl = `${resourceBase}/${recordId}/edit`
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'edit', recordId, basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, editUrl)
  tagActionDispatch(elements, editUrl)
  tagFormStateUrls(elements, formId => `${resourceBase}/${recordId}/_form/${formId}/state`)
  tagFormWizardUrls(elements, formId => `${resourceBase}/${recordId}/_form/${formId}/wizard`)
  tagRichTextMentionUrls(elements, formId => `${resourceBase}/${recordId}/_form/${formId}/mentions`)

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
      form.withValues(withBuilders)
    } else if (prefill?.values) {
      form.withValues(prefill.values)
    }
    if (prefill?.errors) form.withErrors(prefill.errors)
  }

  // Plan #11 — when the resource has relation managers, prepend a
  // navigation strip so users can drill into each manager's table
  // without leaving the parent record context. The "Edit" tab is
  // active here.
  const relationTabsEl = buildRelationTabs(R, recordId, cfg.path, '__edit')
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
function autoWireManagerForm(form: Form, Related: ResourceClass): void {
  const RelatedModel = Related.model
  if (!RelatedModel) return
  if (!form.getSave())       form.save(modelSave(RelatedModel))
  if (!form.getLoadRecord()) form.loadRecord(modelLoadRecord(Related))
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
  // manager's can*). Cluster gate composes with R.canAccess — both
  // must pass when the parent resource is inside a cluster.
  if (R.cluster && !await safePolicy(() => R.cluster!.canAccess(user))) return { ok: false, status: 403 }
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

  const parentRecord = await findRecord(R, scope.recordId, { user }).catch(() => undefined)
  if (!parentRecord) return null

  if (!await safePolicy(() => R.canEdit(user, parentRecord))) return { ok: false, status: 403 }

  // Read the relation type off the parent's relations map once,
  // normalize to the six-way `RelationMode` the manager-side logic
  // uses. `belongsToMany` / `morphToMany` (owning polymorphic) /
  // `morphedByMany` (inverse polymorphic) all flip into pivot-mutation
  // mode (attach / detach / sync — same accessor surface), `morphMany|
  // morphOne` collapses to `'morphMany'` (parent-side polymorphic —
  // auto-fills morph columns on create), `morphTo` is the child-side
  // polymorphic (no auto-actions; requires explicit `M.relatedResource`).
  // Everything else collapses to `'hasMany'`.
  const relationType = getRelationType(R.model, scope.relationship)
  const mode: RelationMode = normalizeRelationMode(relationType)

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
      return buildRelationListData(pilotiq, R, M, Related, parentRecord, scope, req, user, mode)
    case 'relation-create':
      return buildRelationCreateData(pilotiq, R, M, Related!, parentRecord, scope, req, user, mode)
    case 'relation-edit':
      return buildRelationEditData(pilotiq, R, M, Related!, parentRecord, scope, req, user, mode)
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
  mode: RelationMode,
): Promise<RelationManagerResult> {
  if (!await safeManagerPolicy(M, 'canViewAny', Related, user, parentRecord)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const resourceBase = resourceBasePath(base, R)
  const listUrl = `${resourceBase}/${scope.recordId}/${scope.relationship}`

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
    mode,
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

  const tabs = buildRelationTabs(R, scope.recordId, base, scope.relationship)
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
  mode: RelationMode,
): Promise<RelationManagerResult> {
  if (!await safeManagerPolicy(M, 'canCreate', Related, user, parentRecord)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const resourceBase = resourceBasePath(base, R)
  const createUrl = `${resourceBase}/${scope.recordId}/${scope.relationship}/create`

  const managerCtx: RelationManagerContext = {
    basePath:     base,
    parentSlug:   scope.slug,
    parentId:     scope.recordId,
    relationship: scope.relationship,
    parentRecord,
    related:      Related,
    mode,
  }
  const form = M.form(Form.make(), managerCtx)
  if (Related.model) autoWireManagerForm(form, Related)

  const elements: Element[] = [form]
  tagFormActions(elements, createUrl)

  if (scope.prefill) {
    if (scope.prefill.values) form.withValues(scope.prefill.values)
    if (scope.prefill.errors) form.withErrors(scope.prefill.errors)
  }

  const tabs = buildRelationTabs(R, scope.recordId, base, scope.relationship)
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
  mode: RelationMode,
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

  const child = await findRecord(Related, scope.childId, { user }).catch(() => undefined)
  if (!child) return null

  if (!await safeManagerPolicy(M, 'canEdit', Related, user, parentRecord, child)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const resourceBase = resourceBasePath(base, R)
  const editUrl = `${resourceBase}/${scope.recordId}/${scope.relationship}/${scope.childId}/edit`

  const managerCtx: RelationManagerContext = {
    basePath:     base,
    parentSlug:   scope.slug,
    parentId:     scope.recordId,
    relationship: scope.relationship,
    parentRecord,
    related:      Related,
    mode,
  }
  const form = M.form(Form.make(), managerCtx)
  autoWireManagerForm(form, Related)

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

  const tabs = buildRelationTabs(R, scope.recordId, base, scope.relationship)
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
 * strip surfaces the per-record sub-navigation: View, Edit, plus one
 * tab per `R.relations()` manager. `activeKey` selects which tab the
 * renderer highlights — `'__view'` / `'__edit'` for the parent tabs,
 * the manager's relationship key for a manager tab.
 *
 * Sub-nav follow-up (2026-05-03 cont'd) — emit BOTH `__view` and
 * `__edit` as sibling tabs (Filament-style record sub-navigation)
 * instead of one parent tab whose label depends on mode. Tabs are
 * dropped when the corresponding page role isn't registered (a
 * Resource overriding `pages()` to omit `view` or `edit` shouldn't
 * surface a tab that 404s).
 *
 * Returns `undefined` when the resource has no relation managers — the
 * caller can then skip the prepend entirely so resources without
 * relations stay shape-compatible with their existing schemaData.
 * (View+Edit sub-nav alone isn't worth a tab strip; users navigate
 * those via headerActions or the back link.)
 */
function buildRelationTabs(
  R:         ResourceClass,
  recordId:  string,
  basePath:  string,
  activeKey: string,
): RelationTabs | undefined {
  const managers = R.relations()
  if (managers.length === 0) return undefined

  const resourceBase = resourceBasePath(basePath, R)
  const pages = R.resolvePages()
  const tabs: RelationTabMeta[] = []

  // View tab — only when the resource has a ViewPage registered.
  // Defaults always include one; users who pruned ViewPage in their
  // `static pages()` override get no broken link.
  if (pages.view) {
    tabs.push(relationTab({
      key:       '__view',
      label:     'View',
      url:       `${resourceBase}/${recordId}`,
      active:    activeKey === '__view',
      icon:      R.icon as IconValue | undefined,
      iconOwner: R.name,
    }))
  }

  // Edit tab — same defensive check.
  if (pages.edit) {
    tabs.push(relationTab({
      key:       '__edit',
      label:     'Edit',
      url:       `${resourceBase}/${recordId}/edit`,
      active:    activeKey === '__edit',
      // Re-use the resource icon so when ViewPage is pruned, Edit
      // still carries the visual identity. When both are present, the
      // icon repeats — acceptable; the labels disambiguate.
      icon:      R.icon as IconValue | undefined,
      iconOwner: R.name,
    }))
  }

  for (const M of managers) {
    let rel = ''
    try { rel = M.getRelationship() } catch { continue }
    const icon = M.getIcon()
    tabs.push(relationTab({
      key:    rel,
      label:  M.getLabel(),
      url:    `${resourceBase}/${recordId}/${rel}`,
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
        try { record = await findRecord(R, scope.recordId, { user }) } catch { /* ignore */ }
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
        try { record = await findRecord(R, scope.recordId, { user }) } catch { /* ignore */ }
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

// ─── Async-mention resolve data builder ──────────────────────

export interface MentionResolveRequest {
  formId:  string
  field:   string
  trigger: string
  query:   string
}

/** Wire-side shape for a single resolved item — mirrors `MentionItem` from
 *  `@pilotiq/tiptap`. Pilotiq core doesn't import that package, so the
 *  duck-typed shape lives here. */
export interface MentionResolveItem {
  id:     string
  label:  string
  group?: string
}

export interface MentionResolveSuccess {
  ok:    true
  items: MentionResolveItem[]
}

export interface MentionResolveError {
  ok:     false
  status: 404 | 422
  error:  string
}

interface AsyncMentionResolverField {
  resolveMention(
    trigger: string,
    query:   string,
    ctx:     { user?: unknown; record?: unknown; request?: unknown },
  ): Promise<MentionResolveItem[] | null>
}

function isMentionResolverField(el: Element): el is Element & AsyncMentionResolverField {
  if (el.getType() !== 'richtext') return false
  const candidate = el as unknown as Partial<AsyncMentionResolverField>
  return typeof candidate.resolveMention === 'function'
}

/**
 * Walk a form's tree looking for the named field. Descends into Repeater /
 * Builder rows when the requested name carries the row-prefix shape:
 *
 *   - Repeater rows: `<repeaterName>.<index>.<innerPath>` — looks up
 *     `<innerPath>` against the Repeater's template schema. Field config
 *     (providers, async resolver) is shared across rows, so any row index
 *     resolves to the same template field.
 *   - Builder rows: `<builderName>.<index>.data.<innerPath>` — looks up
 *     `<innerPath>` against every block's schema; first match wins. Block
 *     schemas often share leaf names — if two blocks define a RichTextField
 *     with the same name and different async-mention providers, only the
 *     first block in declaration order is reachable here. Authors needing
 *     per-block resolution should give the leaves distinct names.
 *
 * Mirrors the boundary-stopping posture of `findFieldByName` inside
 * `dispatchForm.ts` for top-level matches — only the dotted-prefix branch
 * crosses into row schemas.
 */
function findRichTextFieldByName(
  elements: ReadonlyArray<Element>,
  name:     string,
): (Element & AsyncMentionResolverField) | undefined {
  for (const el of elements) {
    if (isMentionResolverField(el) && (el as unknown as { name: string }).name === name) {
      return el
    }
    if (isRepeaterField(el)) {
      const inner = stripRepeaterRowPrefix(name, (el as RepeaterField).name)
      if (inner !== undefined) {
        const hit = findRichTextFieldByName((el as RepeaterField).getInnerSchema(), inner)
        if (hit) return hit
      }
      continue
    }
    if (isBuilderField(el)) {
      const inner = stripBuilderRowPrefix(name, (el as BuilderField).name)
      if (inner !== undefined) {
        for (const block of (el as BuilderField).getBlocks()) {
          const hit = findRichTextFieldByName(block.getSchema(), inner)
          if (hit) return hit
        }
      }
      continue
    }
    const children = el.getChildren()
    if (children && children.length > 0) {
      const hit = findRichTextFieldByName(children, name)
      if (hit) return hit
    }
  }
  return undefined
}

/**
 * `items.0.body` → `body`. Returns `undefined` when the path doesn't match
 * the `<repeaterName>.<digits>.<rest>` shape so the walker keeps searching
 * other branches instead of misinterpreting an unrelated dotted name.
 */
function stripRepeaterRowPrefix(path: string, repeaterName: string): string | undefined {
  const parts = path.split('.')
  if (parts.length < 3) return undefined
  if (parts[0] !== repeaterName) return undefined
  if (!/^\d+$/.test(parts[1] ?? '')) return undefined
  return parts.slice(2).join('.')
}

/**
 * `blocks.0.data.heading` → `heading`. The literal `data` segment matches
 * Builder's wire shape (`{ __id, type, data: {…} }`) and distinguishes a
 * Builder leaf from a Repeater leaf at the same depth.
 */
function stripBuilderRowPrefix(path: string, builderName: string): string | undefined {
  const parts = path.split('.')
  if (parts.length < 4) return undefined
  if (parts[0] !== builderName) return undefined
  if (!/^\d+$/.test(parts[1] ?? '')) return undefined
  if (parts[2] !== 'data') return undefined
  return parts.slice(3).join('.')
}

/**
 * Resolve one async-mention round-trip. Locates the page's schema, finds
 * the form by `formId` and the RichTextField by `field`, calls its
 * `resolveMention(trigger, query, ctx)`. Returns `{ ok, items }`, a 404
 * when the form / field / trigger isn't present, or `null` for a missing
 * page (the route handler turns `null` into a 404 too).
 *
 * The dispatcher is duck-typed against the contract in `@pilotiq/tiptap`'s
 * `RichTextField` — pilotiq core never imports the adapter. Any future
 * field-type that ships an async-resolve trigger can implement the same
 * shape and pick up routing for free.
 */
export async function mentionResolveData(
  pilotiq: Pilotiq,
  scope:   FormStateScope,
  body:    MentionResolveRequest,
  req?:    unknown,
): Promise<MentionResolveSuccess | MentionResolveError | null> {
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
        try { record = await findRecord(R, scope.recordId, { user }) } catch { /* ignore */ }
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

  const field = findRichTextFieldByName(form.getChildren() ?? [], body.field)
  if (!field) {
    return { ok: false, status: 404, error: `Rich-text field "${body.field}" not found on form "${body.formId}"` }
  }

  let items: MentionResolveItem[] | null
  try {
    items = await field.resolveMention(body.trigger, body.query, {
      ...(record !== undefined ? { record } : {}),
      ...(user   !== null      ? { user   } : {}),
      request: req,
    })
  } catch (err) {
    return {
      ok:     false,
      status: 422,
      error:  err instanceof Error ? err.message : 'Mention resolver threw',
    }
  }

  if (items === null) {
    return { ok: false, status: 404, error: `No mention provider for trigger "${body.trigger}" on field "${body.field}"` }
  }

  return { ok: true, items }
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
    try { record = await findRecord(R, recordId, { user }) } catch { /* ignore */ }
  }

  // Plan #11 — prepend the relation tabs strip with the "Details" tab
  // active when the resource has relation managers configured.
  const relationTabsEl = buildRelationTabs(R, recordId, cfg.path, '__view')
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

  const editUrl = globalBasePath(cfg.path, G)
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'edit', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, editUrl)
  tagFormStateUrls(elements, formId => `${editUrl}/_form/${formId}/state`)
  tagFormWizardUrls(elements, formId => `${editUrl}/_form/${formId}/wizard`)
  tagRichTextMentionUrls(elements, formId => `${editUrl}/_form/${formId}/mentions`)

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

  const pageUrl = pageBasePath(cfg.path, PageClass)
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({}, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, pageUrl)
  tagFormStateUrls(elements, formId => `${pageUrl}/_form/${formId}/state`)
  tagFormWizardUrls(elements, formId => `${pageUrl}/_form/${formId}/wizard`)
  tagRichTextMentionUrls(elements, formId => `${pageUrl}/_form/${formId}/mentions`)
  tagActionDispatch(elements, pageUrl)
  // Page-scope polling URL (mirrors `${base}/${pageSlug}/_widget/:id`
  // route registered in routes.ts).
  tagWidgetUrls(elements, id => `${pageUrl}/_widget/${id}`)
  const widgetData = await resolveServerDataElements(elements, ctx)
  const schemaData = await resolveSchema(elements, ctx)

  return {
    pageType: 'page',
    panel:    await panelInfo(pilotiq, req),
    page:     PageClass.toMeta(),
    schemaData,
    _widgetData: widgetData,
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
  const layoutCtx: import('./schema/Element.js').LayoutContext = {}
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
