import { Element } from '../schema/Element.js'
import { Table, type TableContext, type SortDirection } from './Table.js'
import type { Filter } from '../filters/Filter.js'
import { Action } from '../actions/Action.js'

export interface QueryParams {
  search?: string
  sort?:   string  // "col:dir" or "col"
  page?:   string | number
  perPage?: string | number
  /** Filter values keyed by filter name. Any URL query key not in the
   * reserved set above is treated as a candidate filter value. */
  [key: string]: unknown
}

/** Reserved query keys consumed by the framework — anything else is a filter. */
const RESERVED_QUERY_KEYS = new Set(['search', 'sort', 'page', 'perPage'])

/**
 * Pull filter values out of a flat query-string record. A key matches a
 * filter when its name is registered on the table and the value is a
 * non-empty string. Unknown / empty / reserved keys are dropped.
 */
export function parseFilterValues(
  query:   QueryParams,
  filters: ReadonlyArray<Filter>,
): Record<string, string> {
  if (filters.length === 0) return {}
  const filterNames = new Set(filters.map(f => f.name))
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(query)) {
    if (RESERVED_QUERY_KEYS.has(key)) continue
    if (!filterNames.has(key)) continue
    if (typeof val === 'string' && val !== '') out[key] = val
  }
  return out
}

/**
 * Parse the URL `?sort=col[:asc|:desc]&search=&page=&perPage=` query string
 * into a normalized `TableContext` payload. Unknown / malformed values
 * round to the nearest sane default — pagination floors to 1, perPage
 * to a positive integer when present. Whitespace is trimmed.
 */
export function parseTableQuery(q: QueryParams = {}): {
  search:  string | undefined
  sort:    { column: string; direction: SortDirection } | undefined
  page:    number | undefined
  perPage: number | undefined
} {
  const search = typeof q.search === 'string' && q.search.trim() !== ''
    ? q.search.trim()
    : undefined

  let sort: { column: string; direction: SortDirection } | undefined
  if (typeof q.sort === 'string' && q.sort.trim() !== '') {
    const [colRaw, dirRaw] = q.sort.split(':')
    const column = colRaw?.trim()
    if (column) {
      const direction: SortDirection = dirRaw?.trim() === 'desc' ? 'desc' : 'asc'
      sort = { column, direction }
    }
  }

  const pageRaw = q.page
  const page = pageRaw !== undefined
    ? Math.max(1, Math.floor(Number(pageRaw)) || 1)
    : undefined

  const perPageRaw = q.perPage
  const perPage = perPageRaw !== undefined && Number(perPageRaw) > 0
    ? Math.floor(Number(perPageRaw))
    : undefined

  return { search, sort, page, perPage }
}

/** Walk an Element tree and return every `Table` instance in document order. */
export function findTables(elements: ReadonlyArray<Element>): Table[] {
  const tables: Table[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (el instanceof Table) tables.push(el)
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
    }
  }
  walk(elements)
  return tables
}

/**
 * For every `Table` on the page that has a `records()` handler, run it
 * with the parsed `TableContext` and seed the table's render-time state
 * (rows, total, sort, search, page).
 *
 * Tables without a `records()` handler are left untouched — `toMeta()`
 * will emit them with no rows, which the renderer falls back to as
 * "No records yet."
 *
 * `pathname` is the absolute route the page lives at (e.g.
 * `/admin/articles`). Sort, search, and pagination links in the rendered
 * table prefix with it so SPA navigation has a real pathname to route
 * against — Vike's client-side router doesn't resolve `?qs`-only
 * relative hrefs against the current URL.
 */
export async function loadTableRecords(
  elements: ReadonlyArray<Element>,
  query:    QueryParams = {},
  pathname?: string,
): Promise<void> {
  const tables = findTables(elements)
  if (tables.length === 0) return

  const { search, sort, page, perPage } = parseTableQuery(query)

  await Promise.all(tables.map(async (table) => {
    // Carry per-table defaults forward when the URL didn't override them.
    const effectiveSort    = sort    ?? table.getDefaultSort()
    const effectivePerPage = perPage ?? table.getPerPage()
    const effectivePage    = page    ?? 1

    // Parse filter values from the URL query. Mirror them back onto the
    // Filter elements so the renderer can show the active selection, and
    // pass them through TableContext for the records handler to consume.
    const tableFilters = table.getFilters()
    const filterValues = parseFilterValues(query, tableFilters)
    for (const filter of tableFilters) {
      const v = filterValues[filter.name]
      if (v !== undefined) filter.withValue(v)
    }

    const ctx: TableContext = {
      ...(search !== undefined           ? { search }                       : {}),
      ...(effectiveSort !== undefined    ? { sort: effectiveSort }          : {}),
      ...(effectivePerPage !== undefined ? { perPage: effectivePerPage }    : {}),
      ...(Object.keys(filterValues).length > 0 ? { filters: filterValues } : {}),
      page: effectivePage,
    }

    const handler = table.getRecords()
    if (handler) {
      const result = await handler(ctx)
      const rawRows = Array.isArray(result) ? result : result.rows
      const total   = Array.isArray(result) ? rawRows.length : (result.total ?? rawRows.length)

      // Per-row visibility evaluation for row-placement actions with rules.
      // Static row actions (no rules) are always visible/enabled, so we
      // skip stamping on rows when none of the table's row actions opt in.
      const rowActionsWithRules = (table.getChildren() ?? [])
        .filter((c): c is Action =>
          c instanceof Action
          && c.getPlacement() === 'row'
          && c.hasVisibilityRules(),
        )

      const rows = rowActionsWithRules.length === 0
        ? rawRows
        : rawRows.map(row => {
            const visibleActions: string[] = []
            const disabledActions: string[] = []
            for (const a of rowActionsWithRules) {
              const { visible, disabled } = a.evaluate({ record: row })
              if (visible)  visibleActions.push(a.name)
              if (disabled) disabledActions.push(a.name)
            }
            return {
              ...(row as Record<string, unknown>),
              _visibleActions:  visibleActions,
              _disabledActions: disabledActions,
            }
          })

      table.withRows(rows, total)
    }

    // Mirror the resolved context back onto the table so the renderer can
    // produce sort/search/page links without re-parsing the URL.
    if (effectiveSort)  table.withSort(effectiveSort.column, effectiveSort.direction)
    if (search !== undefined) table.withSearch(search)
    table.withPage(effectivePage)
    if (pathname) table.withCurrentPath(pathname)
  }))
}
