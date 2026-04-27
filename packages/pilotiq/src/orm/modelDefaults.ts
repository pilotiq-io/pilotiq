import type { ModelLike } from '@rudderjs/contracts'
import type { Column } from '../Column.js'
import type { Table, TableRecordsHandler, TableRecordsResult } from '../elements/Table.js'
import type { SaveHandler, LoadRecordHandler, FormContext } from '../elements/Form.js'

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

    if (ctx.sort) {
      q = q.orderBy(ctx.sort.column, ctx.sort.direction === 'desc' ? 'DESC' : 'ASC')
    }

    const page    = ctx.page    ?? 1
    const perPage = ctx.perPage ?? table.getPerPage() ?? 15

    const result = await q.paginate(page, perPage)
    return { rows: result.data, total: result.total }
  }
}
