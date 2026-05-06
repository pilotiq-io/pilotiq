/**
 * Render hooks — named slots scattered through the panel chrome where
 * apps can inject arbitrary `Element[]` (or async resolvers) without
 * forking AppShell / layouts / page renderers.
 *
 * The closed name union is the v1 contract: extending it requires
 * editing this file. Deliberate — keeps autocomplete useful and prevents
 * typos from silently no-op'ing. Loosens to a `string` overload only
 * when a real consumer needs custom names.
 *
 * Scope semantics:
 *   - No scope → runs at every site of the named slot.
 *   - With scope → at least one of `scope.resource` / `scope.page` /
 *     `scope.global` must reference-equal the active route's identifier.
 *
 * Plan: docs/plans/render-hooks.md
 */
import type { Element, ElementMeta } from './schema/Element.js'
import type { ResourceClass } from './Resource.js'
import type { GlobalClass } from './Global.js'
import type { Page } from './Page.js'
import { resolveSchema, type RenderContext } from './schema/resolveSchema.js'

/**
 * Closed union of every render-hook slot pilotiq's chrome and page-role
 * renderers mount. Names ported verbatim from Filament's literal hook
 * names so user docs / community snippets transfer 1:1.
 */
export type RenderHookName =
  // ─── Chrome — head ──────────────────────────────────
  | 'panels::head.start'
  | 'panels::head.end'
  | 'panels::scripts'
  | 'panels::styles'
  // ─── Chrome — body ──────────────────────────────────
  | 'panels::body.start'
  | 'panels::body.end'
  // ─── Chrome — topbar ────────────────────────────────
  | 'panels::topbar.start'
  | 'panels::topbar.end'
  // ─── Chrome — sidebar ───────────────────────────────
  | 'panels::sidebar.start'
  | 'panels::sidebar.nav.start'
  | 'panels::sidebar.nav.end'
  | 'panels::sidebar.footer'
  // ─── Chrome — user menu ─────────────────────────────
  | 'panels::user-menu.before'
  | 'panels::user-menu.after'
  // ─── Chrome — page footer ───────────────────────────
  | 'panels::footer'
  // ─── Page-level ─────────────────────────────────────
  | 'panels::page.start'
  | 'panels::page.end'
  | 'panels::resource.pages.list-records.table.before'
  | 'panels::resource.pages.list-records.table.after'
  | 'panels::resource.pages.list-records.tabs.end'
  | 'panels::resource.pages.create-record.form.before'
  | 'panels::resource.pages.create-record.form.after'
  | 'panels::resource.pages.edit-record.form.before'
  | 'panels::resource.pages.edit-record.form.after'
  | 'panels::resource.pages.view-record.start'
  | 'panels::resource.pages.view-record.end'
  | 'panels::global-search.results.before'
  | 'panels::global-search.results.after'

/**
 * Chrome slots resolved once per `panelInfo()` call and shipped under
 * `panel.renderHooks`. Page-role hooks ride on the per-builder
 * `viewProps.renderHooks` slot to keep `panelInfo()`'s payload from
 * ballooning when only a list-page hook fires.
 */
export const CHROME_HOOK_NAMES = [
  'panels::head.start',
  'panels::head.end',
  'panels::scripts',
  'panels::styles',
  'panels::body.start',
  'panels::body.end',
  'panels::topbar.start',
  'panels::topbar.end',
  'panels::sidebar.start',
  'panels::sidebar.nav.start',
  'panels::sidebar.nav.end',
  'panels::sidebar.footer',
  'panels::user-menu.before',
  'panels::user-menu.after',
  'panels::footer',
] as const satisfies readonly RenderHookName[]

/** Page-role slot names that the per-page-role builders own. */
export const PAGE_HOOK_NAMES = [
  'panels::page.start',
  'panels::page.end',
  'panels::resource.pages.list-records.table.before',
  'panels::resource.pages.list-records.table.after',
  'panels::resource.pages.list-records.tabs.end',
  'panels::resource.pages.create-record.form.before',
  'panels::resource.pages.create-record.form.after',
  'panels::resource.pages.edit-record.form.before',
  'panels::resource.pages.edit-record.form.after',
  'panels::resource.pages.view-record.start',
  'panels::resource.pages.view-record.end',
  'panels::global-search.results.before',
  'panels::global-search.results.after',
] as const satisfies readonly RenderHookName[]

/**
 * Context passed to every render-hook callback. `user` is the resolved
 * `Pilotiq.user(req => …)` return value (or `null`). `resource` /
 * `page` / `global` carry whichever class is active for the request, so
 * a generic chrome hook can branch on the route without registering a
 * scoped hook for every Resource.
 */
export interface RenderHookContext {
  user:      unknown
  basePath:  string
  url:       string
  resource?: ResourceClass
  page?:     typeof Page
  global?:   GlobalClass
  recordId?: string
}

/** Hook callback. Returns the elements to mount at the slot. */
export type RenderHookFn = (ctx: RenderHookContext) => Element[] | Promise<Element[]>

/**
 * Filter the slot to only fire when the active route matches one of the
 * scope keys (OR within the object). Omit to run everywhere.
 */
export interface RenderHookScope {
  resource?: ResourceClass
  page?:     typeof Page
  global?:   GlobalClass
}

/** Internal storage shape — one entry per `Pilotiq.renderHook()` call. */
export interface RenderHookEntry {
  name:   RenderHookName
  fn:     RenderHookFn
  scope?: RenderHookScope
}

/**
 * Wire shape shipped to the renderer. Sparse — only names that produced
 * non-empty content land in the map. The renderer mounts a slot at
 * every supported position; missing keys render nothing.
 */
export type RenderHookMap = Partial<Record<RenderHookName, ElementMeta[]>>

/**
 * Decide whether a hook entry should fire for the current context.
 * Scope is OR'd within the object; an empty / missing scope always
 * matches.
 */
function scopeMatches(entry: RenderHookEntry, ctx: RenderHookContext): boolean {
  const scope = entry.scope
  if (!scope || (!scope.resource && !scope.page && !scope.global)) return true
  if (scope.resource && ctx.resource === scope.resource) return true
  if (scope.page     && ctx.page     === scope.page)     return true
  if (scope.global   && ctx.global   === scope.global)   return true
  return false
}

/**
 * Resolve a set of render-hook names against the panel's registered
 * entries. Returns a sparse map — names with no matching entries are
 * omitted from the result.
 *
 * Throwing hooks fail closed: their slot's contribution drops; other
 * hooks at the same slot still ship. Same posture as `Resource.canAccess`
 * and `navigationBadge()`.
 */
export async function resolveRenderHooks(
  entries: readonly RenderHookEntry[],
  names: readonly RenderHookName[],
  ctx: RenderHookContext,
): Promise<RenderHookMap> {
  if (entries.length === 0 || names.length === 0) return {}

  const wanted = new Set<RenderHookName>(names)
  const matching = entries.filter(e => wanted.has(e.name) && scopeMatches(e, ctx))
  if (matching.length === 0) return {}

  // Resolve each entry's `fn` in parallel. Errors swallow per-entry —
  // one flaky hook doesn't blank the page.
  const resolved = await Promise.all(
    matching.map(async entry => {
      try {
        const els = await entry.fn(ctx)
        return { name: entry.name, els: Array.isArray(els) ? els : [] }
      } catch (err) {
        console.warn(`[pilotiq] render hook ${entry.name} threw:`, err)
        return { name: entry.name, els: [] as Element[] }
      }
    }),
  )

  // Bucket by name, preserving registration order (matching is in the
  // order entries were registered; the `filter` above is stable).
  const buckets = new Map<RenderHookName, Element[]>()
  for (const r of resolved) {
    if (r.els.length === 0) continue
    const cur = buckets.get(r.name)
    if (cur) cur.push(...r.els)
    else     buckets.set(r.name, [...r.els])
  }
  if (buckets.size === 0) return {}

  // Walk every bucket through the schema resolver so the wire shape
  // matches every other Element[] payload — nested visibility, async
  // toMeta(), etc. all just work. `RenderContext.user` is duck-typed
  // (`name`/`email`/...); pilotiq treats user as opaque so cast through.
  const renderCtx: RenderContext = {}
  if (ctx.user !== null && typeof ctx.user === 'object') {
    renderCtx.user = ctx.user as { name?: string; email?: string; [key: string]: unknown }
  }
  const out: RenderHookMap = {}
  await Promise.all(
    [...buckets.entries()].map(async ([name, els]) => {
      const metas = await resolveSchema(els, renderCtx)
      if (metas.length > 0) out[name] = metas
    }),
  )
  return out
}
