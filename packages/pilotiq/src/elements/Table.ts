import { Element, type ElementMeta } from '../schema/Element.js'
import { Column } from '../Column.js'
import { Action } from '../actions/Action.js'

export type SortDirection = 'asc' | 'desc'

export interface TableContext<R = unknown> {
  request?: unknown
  search?: string
  sort?: { column: string; direction: SortDirection }
  page?: number
  perPage?: number
  [key: string]: unknown
}

export type TableQueryHandler<Q = unknown> = (
  query: Q,
  ctx: TableContext,
) => Q | Promise<Q>

export interface TableMeta extends ElementMeta {
  type:        'table'
  defaultSort?: { column: string; direction: SortDirection }
  perPage?:    number
  searchable:  boolean
}

/**
 * Table container. Children are typically `Column[]` plus header / row /
 * bulk Actions. The query handler stays server-side; toMeta emits the
 * configured sort/pagination state plus a derived `searchable` flag (any
 * column being searchable). Phase 2.1 ships shape + serialization;
 * dispatch lands in 2.5.
 */
export class Table<Q = unknown> extends Element {
  private _query?: TableQueryHandler<Q>
  private _defaultSort?: { column: string; direction: SortDirection }
  private _perPage?: number

  private constructor() { super() }

  static make<Q = unknown>(): Table<Q> {
    return new Table<Q>()
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

  /** Shorthand: append actions to the children. */
  actions(acts: Action[]): this {
    const existing = this._children ?? []
    this._children = [...existing, ...acts]
    return this
  }

  // ─── Static config ────────────────────────────────────

  query(fn: TableQueryHandler<Q>): this { this._query = fn; return this }

  defaultSort(column: string, direction: SortDirection = 'asc'): this {
    this._defaultSort = { column, direction }
    return this
  }

  paginate(perPage: number): this { this._perPage = perPage; return this }

  // ─── Getters ──────────────────────────────────────────

  getQuery(): TableQueryHandler<Q> | undefined { return this._query }
  getDefaultSort(): { column: string; direction: SortDirection } | undefined { return this._defaultSort }
  getPerPage(): number | undefined { return this._perPage }

  /** Convenience: the `Column` children only. */
  getColumns(): Column[] {
    return (this._children ?? []).filter((el): el is Column => el instanceof Column)
  }

  // ─── Serialization ────────────────────────────────────

  getType(): string { return 'table' }

  override toMeta(): TableMeta {
    const searchable = this.getColumns().some(c => c.isSearchable())
    return {
      type:       'table',
      searchable,
      ...(this._defaultSort ? { defaultSort: this._defaultSort } : {}),
      ...(this._perPage !== undefined ? { perPage: this._perPage } : {}),
    }
  }
}
