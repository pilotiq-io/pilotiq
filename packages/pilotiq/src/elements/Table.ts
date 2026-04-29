import { Element, type ElementMeta } from '../schema/Element.js'
import { Column } from '../Column.js'
import { Action } from '../actions/Action.js'
import { Filter } from '../filters/Filter.js'

export type SortDirection = 'asc' | 'desc'

export interface TableContext<R = unknown> {
  request?: unknown
  search?:  string
  sort?:    { column: string; direction: SortDirection }
  page?:    number
  perPage?: number
  records?: R[]
  /** Active filter values keyed by filter name (e.g. `{ status: 'published' }`).
   * Empty / unsupplied filters are absent. */
  filters?: Record<string, string>
  [key: string]: unknown
}

export type TableQueryHandler<Q = unknown> = (
  query: Q,
  ctx:   TableContext,
) => Q | Promise<Q>

/**
 * User-supplied row loader. Returns the records to render plus an optional
 * `total` for pagination. When `total` is omitted the framework treats
 * `rows.length` as the total.
 */
export interface TableRecordsResult<R = unknown> {
  rows:   R[]
  total?: number
}

export type TableRecordsHandler<R = unknown> = (
  ctx: TableContext<R>,
) => TableRecordsResult<R> | R[] | Promise<TableRecordsResult<R> | R[]>

export interface TableMeta extends ElementMeta {
  type:        'table'
  defaultSort?: { column: string; direction: SortDirection }
  perPage?:    number
  searchable:  boolean

  // Render-time state — populated by the framework after `records()` runs.
  rows?:        unknown[]
  total?:       number
  currentSort?: { column: string; direction: SortDirection }
  search?:      string
  currentPage?: number
  /** Absolute pathname the table lives at (e.g. `/admin/articles`). The
   * renderer prefixes sort/pagination/search hrefs with this so SPA
   * navigation resolves against the right route — Vike's client-side
   * router doesn't follow `?qs`-only relative links. */
  currentPath?: string
}

/**
 * Table container. Children are typically `Column[]` plus header / row /
 * bulk Actions. The query hook stays server-side; toMeta emits the
 * configured sort/pagination state, the searchable flag, and (after the
 * framework runs `records()`) the resolved rows + pagination state.
 */
export class Table<R = unknown, Q = unknown> extends Element {
  private _query?:        TableQueryHandler<Q>
  private _records?:      TableRecordsHandler<R>
  private _defaultSort?:  { column: string; direction: SortDirection }
  private _perPage?:      number

  // Render-time state
  private _rows?:         R[]
  private _total?:        number
  private _currentSort?:  { column: string; direction: SortDirection }
  private _currentSearch?: string
  private _currentPage?:  number
  private _currentPath?:  string

  private constructor() { super() }

  static make<R = unknown, Q = unknown>(): Table<R, Q> {
    return new Table<R, Q>()
  }

  // ─── Children ─────────────────────────────────────────

  /** Set children directly — typically a mix of Columns and Actions. */
  schema(elements: Element[]): this {
    this._children = elements
    return this
  }

  /** Shorthand: replace the column children. Existing actions are preserved. */
  columns(cols: Column[]): this {
    const existing = this._children ?? []
    const nonColumns = existing.filter(el => !(el instanceof Column))
    this._children = [...cols, ...nonColumns]
    return this
  }

  /** Shorthand: append actions to the children. Placement on each action is
   * preserved as-is; use the slot variants below (`recordActions`,
   * `headerActions`, `bulkActions`) when you want the table to assign
   * placement automatically. */
  actions(acts: Action[]): this {
    const existing = this._children ?? []
    this._children = [...existing, ...acts]
    return this
  }

  /** Per-row actions slot — rendered in a DropdownMenu on each row.
   * Stamps `placement: 'row'` on each action so callers don't need
   * `Action.make(...).row()` boilerplate. */
  recordActions(acts: Action[]): this {
    return this.actions(acts.map(a => a.placement('row')))
  }

  /** Header actions slot — rendered top-right of the table. */
  headerActions(acts: Action[]): this {
    return this.actions(acts.map(a => a.placement('header')))
  }

  /** Bulk actions slot — shown in a toolbar when rows are selected. */
  bulkActions(acts: Action[]): this {
    return this.actions(acts.map(a => a.placement('bulk')))
  }

  /** Shorthand: replace the filter children. Existing columns/actions stay. */
  filters(filters: Filter[]): this {
    const existing = this._children ?? []
    const nonFilters = existing.filter(el => !(el instanceof Filter))
    this._children = [...nonFilters, ...filters]
    return this
  }

  // ─── Lifecycle config ────────────────────────────────

  /** Adapter-flavored query builder hook. Reserved for ORM adapters in Phase 3+. */
  query(fn: TableQueryHandler<Q>): this { this._query = fn; return this }

  /** Row loader — receives a `TableContext` and returns rows (and optional total). */
  records(fn: TableRecordsHandler<R>): this { this._records = fn; return this }

  defaultSort(column: string, direction: SortDirection = 'asc'): this {
    this._defaultSort = { column, direction }
    return this
  }

  paginate(perPage: number): this { this._perPage = perPage; return this }

  // ─── Render-time state ────────────────────────────────

  /** Attach loaded rows + total. Called by the framework after `records()` runs. */
  withRows(rows: R[], total?: number): this {
    this._rows = rows
    if (total !== undefined) this._total = total
    return this
  }

  withSort(column: string, direction: SortDirection): this {
    this._currentSort = { column, direction }
    return this
  }

  withSearch(query: string): this { this._currentSearch = query; return this }
  withPage(page: number): this { this._currentPage = page; return this }
  withCurrentPath(path: string): this { this._currentPath = path; return this }

  // ─── Getters ──────────────────────────────────────────

  getQuery(): TableQueryHandler<Q> | undefined { return this._query }
  getRecords(): TableRecordsHandler<R> | undefined { return this._records }
  getDefaultSort(): { column: string; direction: SortDirection } | undefined { return this._defaultSort }
  getPerPage(): number | undefined { return this._perPage }
  getRows(): R[] | undefined { return this._rows }
  getTotal(): number | undefined { return this._total }
  getCurrentSort(): { column: string; direction: SortDirection } | undefined { return this._currentSort }
  getCurrentSearch(): string | undefined { return this._currentSearch }
  getCurrentPage(): number | undefined { return this._currentPage }
  getCurrentPath(): string | undefined { return this._currentPath }

  /** Convenience: the `Column` children only. */
  getColumns(): Column[] {
    return (this._children ?? []).filter((el): el is Column => el instanceof Column)
  }

  /** Convenience: the `Filter` children only. */
  getFilters(): Filter[] {
    return (this._children ?? []).filter((el): el is Filter => el instanceof Filter)
  }

  // ─── Serialization ────────────────────────────────────

  getType(): string { return 'table' }

  override toMeta(): TableMeta {
    const searchable = this.getColumns().some(c => c.isSearchable())
    return {
      type:       'table',
      searchable,
      ...(this._defaultSort   ? { defaultSort:  this._defaultSort } : {}),
      ...(this._perPage !== undefined ? { perPage: this._perPage } : {}),
      ...(this._rows         !== undefined ? { rows:        this._rows }        : {}),
      ...(this._total        !== undefined ? { total:       this._total }       : {}),
      ...(this._currentSort  !== undefined ? { currentSort: this._currentSort } : {}),
      ...(this._currentSearch !== undefined ? { search:     this._currentSearch } : {}),
      ...(this._currentPage  !== undefined ? { currentPage: this._currentPage } : {}),
      ...(this._currentPath  !== undefined ? { currentPath: this._currentPath } : {}),
    }
  }
}
