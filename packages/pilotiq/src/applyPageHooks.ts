/**
 * Splice resolved render-hook metas into a resolved page schema at the
 * role-specific positions Filament's docs document. The Day 2 half of
 * `docs/plans/render-hooks.md` — Day 1 wired the chrome / panelInfo
 * subset; this file covers the page-role slots.
 *
 * Operates at the **meta level** — call after `resolveSchema()` has run
 * over the page's `Element[]`. The hook fns themselves were resolved
 * server-side via `resolvePageHooks()` (which does its own fail-closed
 * + scope filtering); this helper just inserts the resulting metas at
 * the right positions in the tree.
 *
 * Splicing is **top-level only** — Tables / Forms nested inside a
 * Group / Section won't receive the table.before / form.before hooks.
 * Acceptable for v1 (the typical resource page has the Table or Form
 * at the top of its schema).
 */
import type { ElementMeta } from './schema/Element.js'
import type { RenderHookMap, RenderHookName } from './RenderHook.js'

/**
 * Page role used to pick which slot positions apply. Mirrors the
 * per-builder data fn that owns the role.
 */
export type PageRole =
  | 'dashboard'
  | 'list'
  | 'create'
  | 'edit'
  | 'view'
  | 'global-edit'
  | 'global-view'
  | 'page'
  | 'relation-list'
  | 'relation-create'
  | 'relation-view'
  | 'relation-edit'
  | 'search'

/** Universal slots available on every page role. */
const PAGE_BOUNDS: readonly RenderHookName[] = [
  'panels::page.start',
  'panels::page.end',
]

/**
 * Slot names a builder needs to resolve for its role. Returned in a
 * stable order so the builder can pass straight to `resolvePageHooks()`.
 */
export function pageHooksFor(role: PageRole): readonly RenderHookName[] {
  switch (role) {
    case 'list':
      return [
        ...PAGE_BOUNDS,
        'panels::resource.pages.list-records.table.before',
        'panels::resource.pages.list-records.table.after',
        'panels::resource.pages.list-records.tabs.end',
        'panels::resource.pages.list-records.header.actions.before',
        'panels::resource.pages.list-records.header.actions.after',
      ]
    case 'create':
      return [
        ...PAGE_BOUNDS,
        'panels::resource.pages.create-record.form.before',
        'panels::resource.pages.create-record.form.after',
        'panels::resource.pages.create-record.header.actions.before',
        'panels::resource.pages.create-record.header.actions.after',
      ]
    case 'edit':
      return [
        ...PAGE_BOUNDS,
        'panels::resource.pages.edit-record.form.before',
        'panels::resource.pages.edit-record.form.after',
        'panels::resource.pages.edit-record.header.actions.before',
        'panels::resource.pages.edit-record.header.actions.after',
      ]
    case 'view':
      return [
        ...PAGE_BOUNDS,
        'panels::resource.pages.view-record.start',
        'panels::resource.pages.view-record.end',
        'panels::resource.pages.view-record.header.actions.before',
        'panels::resource.pages.view-record.header.actions.after',
      ]
    case 'search':
      return [
        ...PAGE_BOUNDS,
        'panels::global-search.results.before',
        'panels::global-search.results.after',
      ]
    default:
      return PAGE_BOUNDS
  }
}

/**
 * Map a resource page role to its `header.actions.before / .after`
 * slot pair. Returns `undefined` for non-resource roles where the
 * concept doesn't apply.
 */
function headerActionSlotsFor(
  role: PageRole,
): readonly [RenderHookName, RenderHookName] | undefined {
  switch (role) {
    case 'list':
      return [
        'panels::resource.pages.list-records.header.actions.before',
        'panels::resource.pages.list-records.header.actions.after',
      ]
    case 'create':
      return [
        'panels::resource.pages.create-record.header.actions.before',
        'panels::resource.pages.create-record.header.actions.after',
      ]
    case 'edit':
      return [
        'panels::resource.pages.edit-record.header.actions.before',
        'panels::resource.pages.edit-record.header.actions.after',
      ]
    case 'view':
      return [
        'panels::resource.pages.view-record.header.actions.before',
        'panels::resource.pages.view-record.header.actions.after',
      ]
    default:
      return undefined
  }
}

/**
 * Splice a `RenderHookMap` into a resolved page schema at the
 * role-specific positions. Returns a new `ElementMeta[]`; the input
 * isn't mutated.
 *
 * Position semantics:
 *   - `panels::page.start` / `panels::page.end` — top / bottom of the
 *     returned array (wraps every other slot).
 *   - `list-records.table.before` / `.after` — immediately around the
 *     first top-level `'table'` meta. Inserted into the page array as
 *     siblings of the Table.
 *   - `list-records.tabs.end` — appended into the first top-level
 *     `'listTabs'` meta's `children` array.
 *   - `create-record.form.before` / `.after` and
 *     `edit-record.form.before` / `.after` — around the first
 *     top-level `'form'` meta.
 *   - `view-record.start` / `.end` — wraps the entire page schema
 *     (same as `page.start` / `page.end` but inside the universal
 *     bounds — view-record start fires AFTER `page.start` and view-record
 *     end fires BEFORE `page.end`).
 *   - `global-search.results.before` / `.after` — wraps the entire
 *     page schema (search has no canonical inner anchor in v1).
 */
export function applyPageHooks(
  schemaData: readonly ElementMeta[],
  hooks:      RenderHookMap | undefined,
  role:       PageRole,
): ElementMeta[] {
  if (!hooks || Object.keys(hooks).length === 0) return [...schemaData]

  let result: ElementMeta[] = [...schemaData]

  // Role-specific anchor splices — run BEFORE the universal page.start/end
  // wrap so the wrapping happens around them.
  if (role === 'list') {
    result = spliceAroundType(
      result,
      'table',
      hooks['panels::resource.pages.list-records.table.before'],
      hooks['panels::resource.pages.list-records.table.after'],
    )
    result = appendIntoChildrenOfType(
      result,
      'listTabs',
      hooks['panels::resource.pages.list-records.tabs.end'],
    )
  }

  if (role === 'create') {
    result = spliceAroundType(
      result,
      'form',
      hooks['panels::resource.pages.create-record.form.before'],
      hooks['panels::resource.pages.create-record.form.after'],
    )
  }

  if (role === 'edit') {
    result = spliceAroundType(
      result,
      'form',
      hooks['panels::resource.pages.edit-record.form.before'],
      hooks['panels::resource.pages.edit-record.form.after'],
    )
  }

  if (role === 'view') {
    result = wrap(
      result,
      hooks['panels::resource.pages.view-record.start'],
      hooks['panels::resource.pages.view-record.end'],
    )
  }

  if (role === 'search') {
    result = wrap(
      result,
      hooks['panels::global-search.results.before'],
      hooks['panels::global-search.results.after'],
    )
  }

  // Resource-page header actions — splice into the first top-level
  // Heading's children alongside built-in actions. Slot is action-only
  // by convention (the heading renderer filters children to action /
  // actionGroup); non-action contributions are silently skipped at
  // render time.
  const headerSlots = headerActionSlotsFor(role)
  if (headerSlots) {
    result = spliceHeadingActions(
      result,
      hooks[headerSlots[0]],
      hooks[headerSlots[1]],
    )
  }

  // Universal page.start / page.end wrap everything else.
  result = wrap(
    result,
    hooks['panels::page.start'],
    hooks['panels::page.end'],
  )

  return result
}

/** Insert `before`/`after` immediately around the first top-level meta
 *  whose `type` matches. No-op when neither slot has content; no-op
 *  when the type isn't found (the slot's content is dropped — better
 *  than a confusing trailing splice). */
function spliceAroundType(
  metas:  ElementMeta[],
  type:   string,
  before: ElementMeta[] | undefined,
  after:  ElementMeta[] | undefined,
): ElementMeta[] {
  if ((!before || before.length === 0) && (!after || after.length === 0)) {
    return metas
  }
  const result: ElementMeta[] = []
  let inserted = false
  for (const m of metas) {
    if (!inserted && m.type === type) {
      if (before && before.length > 0) result.push(...before)
      result.push(m)
      if (after  && after.length  > 0) result.push(...after)
      inserted = true
    } else {
      result.push(m)
    }
  }
  return result
}

/**
 * Splice `before` / `after` into the first top-level `'heading'` meta's
 * `children` array — the slot the heading renderer uses to mount the
 * page-title's right-aligned action chips. No-op when neither slot has
 * content; drops silently when no heading anchor exists (custom
 * headers carry their own action layout).
 */
function spliceHeadingActions(
  metas:  ElementMeta[],
  before: ElementMeta[] | undefined,
  after:  ElementMeta[] | undefined,
): ElementMeta[] {
  const hasBefore = before && before.length > 0
  const hasAfter  = after  && after.length  > 0
  if (!hasBefore && !hasAfter) return metas
  let mutated = false
  return metas.map(m => {
    if (!mutated && m.type === 'heading') {
      mutated = true
      return {
        ...m,
        children: [
          ...(hasBefore ? before : []),
          ...(m.children ?? []),
          ...(hasAfter  ? after  : []),
        ],
      }
    }
    return m
  })
}

/** Append `toAppend` into the first top-level meta whose `type`
 *  matches, on its `children` array. No-op when the type isn't found. */
function appendIntoChildrenOfType(
  metas:    ElementMeta[],
  type:     string,
  toAppend: ElementMeta[] | undefined,
): ElementMeta[] {
  if (!toAppend || toAppend.length === 0) return metas
  let mutated = false
  return metas.map(m => {
    if (!mutated && m.type === type) {
      mutated = true
      return { ...m, children: [...(m.children ?? []), ...toAppend] }
    }
    return m
  })
}

/** Concat `before`/`after` around the array. Cheap shorthand; spreads
 *  empty / undefined slots without touching the original array's
 *  identity when both are absent. */
function wrap(
  metas:  ElementMeta[],
  before: ElementMeta[] | undefined,
  after:  ElementMeta[] | undefined,
): ElementMeta[] {
  const hasBefore = before && before.length > 0
  const hasAfter  = after  && after.length  > 0
  if (!hasBefore && !hasAfter) return metas
  return [
    ...(hasBefore ? before : []),
    ...metas,
    ...(hasAfter  ? after  : []),
  ]
}
