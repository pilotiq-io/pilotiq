import { Element } from '../schema/Element.js'
import { Table, type TableContext, type SortDirection } from './Table.js'

export interface QueryParams {
  search?: string
  sort?:   string  // "col:dir" or "col"
  page?:   string | number
  perPage?: string | number
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
 */
export async function loadTableRecords(
  elements: ReadonlyArray<Element>,
  query:    QueryParams = {},
): Promise<void> {
  const tables = findTables(elements)
  if (tables.length === 0) return

  const { search, sort, page, perPage } = parseTableQuery(query)

  await Promise.all(tables.map(async (table) => {
    // Carry per-table defaults forward when the URL didn't override them.
    const effectiveSort    = sort    ?? table.getDefaultSort()
    const effectivePerPage = perPage ?? table.getPerPage()
    const effectivePage    = page    ?? 1

    const ctx: TableContext = {
      ...(search !== undefined      ? { search }                : {}),
      ...(effectiveSort !== undefined  ? { sort: effectiveSort } : {}),
      ...(effectivePerPage !== undefined ? { perPage: effectivePerPage } : {}),
      page: effectivePage,
    }

    const handler = table.getRecords()
    if (handler) {
      const result = await handler(ctx)
      const rows  = Array.isArray(result) ? result : result.rows
      const total = Array.isArray(result) ? rows.length : (result.total ?? rows.length)
      table.withRows(rows, total)
    }

    // Mirror the resolved context back onto the table so the renderer can
    // produce sort/search/page links without re-parsing the URL.
    if (effectiveSort)  table.withSort(effectiveSort.column, effectiveSort.direction)
    if (search !== undefined) table.withSearch(search)
    table.withPage(effectivePage)
  }))
}
