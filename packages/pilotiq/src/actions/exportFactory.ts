/**
 * Internals for the `Action.export` / `Action.bulkExport` factories.
 *
 * Lives in its own module to keep the cycle between `Action.ts` and
 * `Table.ts` honest — `Action.export` calls into here via dynamic
 * import inside the handler, so module-eval order never reads either
 * side's exports too early.
 *
 * The `R: { table?(t: any): any }` shape on `resolveExportColumns`
 * (and the matching parameter in `collectExportRows`) is the load-bearing
 * piece of this isolation: the real `Resource.table()` signature is
 * `(t: Table) => Table`, but importing `Table` here from a static-top
 * import would resurrect the cycle this file exists to break. Loosening
 * the parameter to `any` is the price — call sites in `Action.ts` are
 * typed against the proper `ResourceLike`, so the leak doesn't escape
 * this module. Don't widen `R`'s annotation; do narrow inside the body
 * if you need stricter local typing.
 */

import { Table } from '../elements/Table.js'
import { Column } from '../Column.js'
import type { ActionContext } from './Action.js'
import { encodeCsv, type CsvColumn } from '../io/csv.js'
import { parseTableQuery, type QueryParams } from '../elements/dispatchTable.js'

export type ExportFormat = 'csv' | 'json'

export type ExportColumnSpec =
  | string
  | {
      key:     string
      label?:  string
      format?: (value: unknown, record: Record<string, unknown>) => string
    }

export interface ExportOptions {
  /** Columns to include. Strings → bare `key` (label = key). Objects
   *  may add `label` and `format(value, record) => string`. When omitted,
   *  defaults to every `Column` returned by `R.table()` in declaration
   *  order, with header label = `Column.getLabel()`. */
  columns?: ExportColumnSpec[]
  /** Output filename. Function form receives the action context (so the
   *  filename can include the user, current filters, etc). Default:
   *  `${R.slug}-${YYYY-MM-DD}.${format}`. */
  filename?: string | ((ctx: ActionContext) => string)
  /** Output format. Default `'csv'`. */
  format?: ExportFormat
  /** Records scope:
   *  - `'all'`      — ignore the current URL state (filters/search/sort)
   *  - `'filtered'` — apply the current URL state (default; matches the
   *                   list page the user is looking at)
   *  - `'page'`     — only export the visible page
   *
   *  Bulk variant ignores `scope` and always uses `ctx.records`.
   */
  scope?: 'all' | 'filtered' | 'page'
  /** Hard cap on the row count. Aborts with an error notification when
   *  exceeded. Default `50_000`. */
  maxRows?: number
  /** Pagination chunk size when walking the records handler. Default
   *  `1_000`. */
  chunkSize?: number
}

interface ResolvedColumn {
  key:    string
  label:  string
  format?: (value: unknown, record: Record<string, unknown>) => string
}

const DEFAULT_MAX_ROWS  = 50_000
const DEFAULT_CHUNK     = 1_000

/**
 * Resolve the column spec into a uniform `{ key, label, format? }[]`,
 * defaulting to every `Column` child on `R.table(Table.make())` when
 * the spec is omitted.
 */
export function resolveExportColumns(
  spec:    ExportOptions['columns'],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  R:       { table?(t: any): any },
): ResolvedColumn[] {
  if (spec && spec.length > 0) {
    return spec.map(s => typeof s === 'string'
      ? { key: s, label: s }
      : { key: s.key, label: s.label ?? s.key, ...(s.format ? { format: s.format } : {}) })
  }
  const tableInst = R.table?.(Table.make())
  if (!tableInst) return []
  const cols: Column[] = tableInst.getColumns?.() ?? []
  return cols.map(c => ({ key: c.name, label: c.getLabel?.() ?? c.name }))
}

/**
 * Read the URL query record off `ctx.request`. Routes pass a Hono-like
 * request object whose `.query` is a `Record<string, string>`. Fall
 * back to `{}` when missing (programmatic dispatches in tests).
 */
export function readRequestQuery(ctx: ActionContext): QueryParams {
  const req = ctx.request as { query?: unknown } | undefined
  const q = req?.query
  if (q && typeof q === 'object') return q as QueryParams
  return {}
}

/**
 * Drive the table's `records()` handler in pages until we run out of
 * rows or hit `maxRows`. Returns the collected raw records (not yet
 * mapped to row objects).
 *
 * Scope behavior:
 *  - `'all'`:      empty TableContext (no filters/search/sort applied)
 *  - `'filtered'`: TableContext built from the URL query (filters /
 *                  search / sort all flow through)
 *  - `'page'`:     same as `'filtered'` but only the visible page
 */
export async function collectExportRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table:    any,
  ctx:      ActionContext,
  scope:    ExportOptions['scope'] = 'filtered',
  maxRows:  number = DEFAULT_MAX_ROWS,
  chunkSize: number = DEFAULT_CHUNK,
): Promise<unknown[]> {
  const handler = table.getRecords?.()
  if (!handler) {
    throw new Error('Resource table has no records() handler — cannot export. Set R.model or Table.records(fn).')
  }

  const baseCtx = scope === 'all' ? {} : buildTableCtxFromQuery(readRequestQuery(ctx), table)

  const collected: unknown[] = []
  let page = scope === 'page' ? (baseCtx.page ?? 1) : 1
  const effectivePerPage = scope === 'page' ? (baseCtx.perPage ?? chunkSize) : chunkSize

  while (collected.length <= maxRows) {
    const result = await handler({ ...baseCtx, page, perPage: effectivePerPage })
    const rows: unknown[] = Array.isArray(result) ? result : (result?.rows ?? [])
    collected.push(...rows)
    if (rows.length < effectivePerPage) break
    if (scope === 'page') break
    page++
  }

  return collected
}

/**
 * Build a `TableContext` from a URL-query record by reusing the same
 * parsing the list page does. Filters mirror onto the table's Filter
 * children so any `Filter.query()` overrides see them on subsequent
 * runs (defensive — `loadTableRecords` does the same).
 */
function buildTableCtxFromQuery(
  query: QueryParams,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
): {
  search?:  string
  sort?:    { column: string; direction: 'asc' | 'desc' }
  filters?: Record<string, string>
  page?:    number
  perPage?: number
} {
  const { search, sort, page, perPage } = parseTableQuery(query)

  const tableFilters = table.getFilters?.() ?? []
  const filterValues: Record<string, string> = {}
  const reserved = new Set(['search', 'sort', 'page', 'perPage', 'group', 'groupKey'])
  for (const f of tableFilters) {
    const name = f.name as string
    if (reserved.has(name)) continue
    const v = (query as Record<string, unknown>)[name]
    if (typeof v === 'string' && v !== '') filterValues[name] = v
  }
  for (const f of tableFilters) {
    const v = filterValues[f.name as string]
    if (v !== undefined && typeof f.withValue === 'function') f.withValue(v)
  }

  const out: ReturnType<typeof buildTableCtxFromQuery> = {}
  if (search !== undefined) out.search = search
  if (sort !== undefined)   out.sort   = sort
  if (Object.keys(filterValues).length > 0) out.filters = filterValues
  if (page !== undefined)    out.page    = page
  if (perPage !== undefined) out.perPage = perPage
  return out
}

/** Build a single CSV/JSON-shaped row by reading each resolved column's
 *  key off the record (with `format` applied when set). */
export function buildExportRow(
  record: unknown,
  cols:   ReadonlyArray<ResolvedColumn>,
): Record<string, unknown> {
  const r = record as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const col of cols) {
    const raw = r[col.key]
    out[col.key] = col.format ? col.format(raw, r) : raw
  }
  return out
}

/** Encode `rows` as the requested format. Object values that survive
 *  to here go through the CSV escape rules / `JSON.stringify`. */
export function encodeExport(
  rows:   ReadonlyArray<Record<string, unknown>>,
  cols:   ReadonlyArray<ResolvedColumn>,
  format: ExportFormat,
): { body: string; contentType: string } {
  if (format === 'json') {
    return { body: JSON.stringify(rows, null, 2), contentType: 'application/json' }
  }
  const csvCols: CsvColumn[] = cols.map(c => ({ key: c.key, label: c.label }))
  return { body: encodeCsv(rows, csvCols), contentType: 'text/csv; charset=utf-8' }
}

/** Default filename: `${slug}-${YYYY-MM-DD}.${ext}`. */
export function defaultExportFilename(slug: string, format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10)
  const ext  = format === 'json' ? 'json' : 'csv'
  return `${slug}-${date}.${ext}`
}
