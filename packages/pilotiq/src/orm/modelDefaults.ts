import type { Column } from '../Column.js'
import type { Table, TableRecordsHandler, TableRecordsResult } from '../elements/Table.js'
import type { SaveHandler, LoadRecordHandler, FormContext } from '../elements/Form.js'

/**
 * SQL-style operators understood by `ModelLike.query()`. Mirrors the
 * `WhereOperator` set from `@rudderjs/contracts` so any rudder Model is
 * structurally assignable to `ModelLike` — but pilotiq doesn't import
 * `@rudderjs/contracts` here to keep this file dependency-light.
 */
export type ModelWhereOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'IN' | 'NOT IN'

/**
 * Eloquent-style query builder pilotiq drives when it auto-generates
 * `Table.records()` / `Form.save()` / `Form.loadRecord()` from a
 * Resource's `static model`. Any query builder that satisfies this shape
 * works — the rudder `QueryBuilder<T>` from `@rudderjs/contracts` does,
 * and so does anything user-supplied with the same method names.
 */
export interface ModelQuery {
  where(column: string, value: unknown): ModelQuery
  where(column: string, operator: ModelWhereOperator, value: unknown): ModelQuery
  orWhere(column: string, value: unknown): ModelQuery
  orWhere(column: string, operator: ModelWhereOperator, value: unknown): ModelQuery
  orderBy(column: string, direction?: 'ASC' | 'DESC'): ModelQuery
  paginate(page: number, perPage?: number): Promise<{ data: unknown[]; total: number }>
}

/**
 * Structural shape pilotiq calls to wire ORM defaults. A class extending
 * `@rudderjs/orm`'s `Model` satisfies this automatically via its static
 * methods. Users with a different ORM can build their own object.
 */
export interface ModelLike {
  /** Primary-key column name. Defaults to `'id'`. */
  primaryKey?: string

  find(id: string | number):                                 Promise<unknown>
  create(data: Record<string, unknown>):                     Promise<unknown>
  update(id: string | number, data: Record<string, unknown>): Promise<unknown>
  delete(id: string | number):                               Promise<void>
  query():                                                   ModelQuery
}

/** Read the configured primary key (default `'id'`) off a `ModelLike`. */
export function getPrimaryKey(M: ModelLike): string {
  return M.primaryKey ?? 'id'
}

/**
 * Default `Form.save` handler for resources with `static model = …`.
 * Discriminates create vs update by reading the primary-key off
 * `ctx.record` (set by the route handler in edit mode after `loadRecord`
 * + `fillFromRecord`). Create mode has no `ctx.record`, so we hit
 * `model.create(data)`.
 */
export function modelSave(M: ModelLike): SaveHandler {
  return async (data: Record<string, unknown>, ctx: FormContext): Promise<unknown> => {
    const pk       = getPrimaryKey(M)
    const existing = ctx.record as Record<string, unknown> | undefined
    const id       = existing?.[pk] as string | number | undefined
    if (id !== undefined && id !== null) {
      return M.update(id, data)
    }
    return M.create(data)
  }
}

/** Default `Form.loadRecord` handler for resources with `static model = …`. */
export function modelLoadRecord(M: ModelLike): LoadRecordHandler {
  return async (id: string): Promise<unknown> => M.find(id)
}

/**
 * Build a default `Table.records` handler from a `ModelLike` plus the
 * `Table` instance the page just configured. Reads the column children
 * to drive search (any `Column.searchable()` joins via `LIKE`/`orWhere`)
 * and sort fallback (`Table.defaultSort()` when the URL didn't override).
 *
 * The handler hits `model.query().paginate(page, perPage)` once per
 * page render — search/sort/pagination all push down to the ORM rather
 * than loading everything and slicing in memory.
 */
export function modelTableRecords(M: ModelLike, table: Table): TableRecordsHandler {
  // Snapshot the column-derived config at handler-construction time so
  // we don't re-walk the children on every request.
  const columns: Column[]    = table.getColumns()
  const searchable: string[] = columns.filter(c => c.isSearchable()).map(c => c.name)
  const filters             = table.getFilters()

  return async (ctx): Promise<TableRecordsResult> => {
    let q = M.query()

    if (ctx.search && searchable.length > 0) {
      const needle = `%${ctx.search}%`
      searchable.forEach((col, i) => {
        q = i === 0
          ? q.where(col, 'LIKE', needle)
          : q.orWhere(col, 'LIKE', needle)
      })
    }

    // Apply filters. Each Filter contributes a `where` clause with type
    // coercion based on its `kind` — boolean filters cast '1'/'true' to
    // a real boolean. Custom `Filter.query(fn)` overrides the default.
    const filterValues = ctx.filters ?? {}
    for (const filter of filters) {
      const value = filterValues[filter.name]
      if (value === undefined || value === '') continue
      const customQuery = filter.getQuery()
      if (customQuery) {
        q = customQuery(q, value)
      } else if (filter.getKind() === 'boolean') {
        const bool = value === '1' || value === 'true' || value === 'yes' || value === 'on'
        q = q.where(filter.name, bool)
      } else {
        q = q.where(filter.name, value)
      }
    }

    if (ctx.sort) {
      q = q.orderBy(ctx.sort.column, ctx.sort.direction === 'desc' ? 'DESC' : 'ASC')
    }

    const page    = ctx.page    ?? 1
    const perPage = ctx.perPage ?? table.getPerPage() ?? 15

    const result = await q.paginate(page, perPage)
    return { rows: result.data, total: result.total }
  }
}
