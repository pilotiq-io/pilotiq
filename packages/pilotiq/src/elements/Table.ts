import { Element, type ElementMeta } from '../schema/Element.js'
import { Column } from '../Column.js'
import { Action } from '../actions/Action.js'
import { ActionGroup } from '../actions/ActionGroup.js'
import { Filter } from '../filters/Filter.js'
import type { SummaryResult } from '../summarizers/Summarizer.js'
import { TableGroup, type TableGroupMeta } from './TableGroup.js'

/** Either a plain `Action` or an `ActionGroup` (a labelled dropdown of
 * actions). Both can sit in any of the table action slots — the slot
 * stamps the placement automatically on whichever shape arrives. */
type ActionOrGroup = Action | ActionGroup

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
  /** Active list-page tab name (e.g. `'drafts'`). Set by
   * `pageData.resourceIndexData` from `?tab=` before records run. User-
   * supplied `Table.records(fn)` handlers can branch on this for custom
   * narrowing; the model adapter consults `tabQuery` instead. */
  tab?: string
  /** Active list-page tab's `modifyQuery` chain — applied alongside
   * filter `where` clauses in `modelTableRecords`. Set by the framework;
   * users configure it via `ListTab.modifyQuery(fn)`. */
  tabQuery?: (q: import('../orm/modelDefaults.js').ModelQuery) => import('../orm/modelDefaults.js').ModelQuery
  /** Whatever `Pilotiq.user(req => …)` returned for the current request.
   * Forwarded into `Resource.query(ctx)` by `modelTableRecords` so user-
   * installed scopes (tenant filters, etc.) see the same opaque user
   * shape that authorization predicates do. Absent on the dispatcher's
   * input ctx when no user resolver is configured. */
  user?: unknown
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

export interface TableEmptyState {
  heading?:     string
  description?: string
  icon?:        string
}

/**
 * Per-row URL function. Returns the destination URL for clicks on a
 * row's data cells — each data column wraps its content in a real
 * `<a href>` (Filament-style), so right-click / cmd-click / middle-click
 * "open in new tab" all work natively. Plain left-clicks are intercepted
 * for SPA navigation. Return `undefined` for rows that shouldn't be
 * clickable. Action and bulk-select cells are never wrapped.
 *
 * Per-column overrides: `Column.recordUrl(fn)` swaps in a different URL
 * for that column's cell, and `Column.recordUrl(false)` opts a column
 * out entirely.
 */
export type RecordUrlHandler<R = unknown> = (record: R) => string | undefined

/**
 * Per-row CSS class function. Returns extra Tailwind / CSS class names
 * appended to that row's `<tr>`. Useful for status-driven row tinting
 * ("destructive" when overdue, "warning" when stale). Result is appended
 * after the framework's own row classes (striped, cursor-pointer); user
 * classes win on equal specificity. Throwing or returning falsy stays
 * silent — the row just renders without extras.
 */
export type RecordClassesHandler<R = unknown> = (record: R) => string | undefined

export interface TableMeta extends ElementMeta {
  type:        'table'
  defaultSort?: { column: string; direction: SortDirection }
  perPage?:    number
  searchable:  boolean

  // Top-bar chrome
  heading?:     string
  description?: string
  striped?:     boolean
  emptyState?:  TableEmptyState
  /**
   * Distinct empty-state for the "filter/search active but no rows match"
   * case. When set AND a search query or one or more URL filter keys are
   * present, the renderer picks this shape over `emptyState`. When unset,
   * the renderer falls back to `emptyState` (or the framework defaults
   * — "No matching records" with a generic clear-filters hint).
   */
  filteredEmptyState?: TableEmptyState

  /**
   * Per-row URL stamped onto each row's data under the reserved
   * `_recordUrl` key (alongside the existing `_visibleActions` /
   * `_disabledActions` / `_formatted` keys). The renderer reads from
   * the row, not the table meta — `RecordUrlHandler` is server-side only.
   */
  recordUrl?:   true

  /**
   * Server-side per-row CSS marker — same convention as `recordUrl`.
   * Each row's `_recordClasses` carries the resolved string; this flag
   * is just a hint for the renderer to look for it.
   */
  recordClasses?: true

  /**
   * Auto-refresh interval in seconds. The client renderer kicks off a
   * `setInterval` that re-fetches the current URL via the SPA navigator
   * — pagination / sort / filter state is preserved because we re-visit
   * the same `pathname + search`. Hidden tabs pause to avoid hammering
   * the server in the background; resume on visibility change. Unset =
   * no polling.
   */
  pollInterval?: number

  /** The currently active group — the column rows are banded by. Set
   * each request from either `?group=` or `defaultGroup(...)`. The
   * renderer emits a heading row whenever `_groupValue` changes between
   * adjacent rows. Always a column name; the rich metadata (label /
   * collapsibility / etc.) lives on `groups` below. */
  defaultGroup?: string

  /** Group selector options. When 2+ groups are registered the renderer
   * mounts a "Group by" dropdown above the table; the user's selection
   * round-trips via `?group=`. Empty / absent means the bare-column form
   * (`Table.defaultGroup('col')` only). */
  groups?: TableGroupMeta[]

  /** Per-column summary results — keyed by column name, each entry is the
   * computed `SummaryResult[]` for that column's `summarize([…])`. Filled
   * in by `loadTableRecords` after `records()` runs. Renderer emits a
   * `<tfoot>` row when this is present. */
  summaries?: Record<string, SummaryResult[]>

  /** Per-group summaries — outer key = `_groupValue`, inner = column
   * name, value = `SummaryResult[]`. Computed only when an active group
   * is set AND at least one column has summarizers. Renderer emits an
   * inline summary row at the END of each group band, aligned to the
   * same columns as the global footer. */
  groupSummaries?: Record<string, Record<string, SummaryResult[]>>

  /** Drag-to-reorder is enabled on this table. The renderer adds a grip
   * handle column and binds HTML5 DnD on each `<tr>`. The actual sort
   * column the order is written back to lives on `reorderableColumn`. */
  reorderable?: true

  /** Name of the column the persisted order is written to. Defaults to
   * `'sort'` when `Table.reorderable()` is called without an argument.
   * Pilotiq's default `Table.records()` adapter uses this as the default
   * sort column when the URL doesn't override `?sort=…`. */
  reorderableColumn?: string

  /** Stamped server-side at render time. The renderer POSTs the new id
   * order here when a row is dropped. Absent when the route handler
   * hasn't tagged the table (panel boot will throw before that point if
   * `reorderable()` is set without a corresponding `model.reorder`). */
  reorderUrl?: string

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

  // Top-bar chrome
  private _heading?:      string
  private _description?:  string
  private _striped = false
  private _emptyState?:   TableEmptyState
  private _filteredEmptyState?: TableEmptyState

  // Render-time state
  private _rows?:         R[]
  private _total?:        number
  private _currentSort?:  { column: string; direction: SortDirection }
  private _currentSearch?: string
  private _currentPage?:  number
  private _currentPath?:  string
  private _recordUrl?:    RecordUrlHandler<R>
  private _recordClasses?: RecordClassesHandler<R>
  private _pollInterval?: number
  private _defaultGroup?: string
  // Variance-relaxed — Filament-style covariant `TableGroup<R>[]` ergonomics
  // matter more than tight invariance against the table's `R` parameter.
  private _groups:        TableGroup<any>[] = []  // eslint-disable-line @typescript-eslint/no-explicit-any
  private _activeGroup?:  string
  private _summaries?:    Record<string, SummaryResult[]>
  private _groupSummaries?: Record<string, Record<string, SummaryResult[]>>
  private _reorderableColumn?: string
  private _reorderUrl?:   string

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

  /** Shorthand: append actions to the children. Placement on each action /
   * group is preserved as-is; use the slot variants below
   * (`recordActions`, `headerActions`, `bulkActions`) when you want the
   * table to assign placement automatically. Both `Action` and
   * `ActionGroup` are accepted — groups render as dropdown triggers. */
  actions(acts: ActionOrGroup[]): this {
    const existing = this._children ?? []
    this._children = [...existing, ...acts]
    return this
  }

  /** Per-row actions slot — rendered in a DropdownMenu on each row.
   * Stamps `placement: 'row'` on each action so callers don't need
   * `Action.make(...).row()` boilerplate. */
  recordActions(acts: ActionOrGroup[]): this {
    return this.actions(acts.map(a => a.placement('row')))
  }

  /** Header actions slot — rendered top-right of the table. */
  headerActions(acts: ActionOrGroup[]): this {
    return this.actions(acts.map(a => a.placement('header')))
  }

  /** Bulk actions slot — shown in a toolbar when rows are selected. */
  bulkActions(acts: ActionOrGroup[]): this {
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

  // ─── Top-bar chrome ───────────────────────────────────

  /** Title rendered above the table (left of the header bar). */
  heading(s: string): this { this._heading = s; return this }

  /** Subtitle rendered under the heading. */
  description(s: string): this { this._description = s; return this }

  /** Alternating row backgrounds for visual scanning. */
  striped(v = true): this { this._striped = v; return this }

  /** Customize the "no records" placeholder. */
  emptyState(state: TableEmptyState): this {
    this._emptyState = state
    return this
  }

  /**
   * Customize the "no matching records" placeholder shown when a search
   * query or filter is active but the result set is empty. Distinct from
   * `emptyState(...)` so the two cases can read differently — empty
   * tables typically want a "create your first one" call to action,
   * while filtered-empty tables want a "clear filters / adjust search"
   * hint.
   *
   * Falls back to `emptyState(...)` (or the framework defaults) when
   * unset, so opting into the distinction is purely additive.
   */
  filteredEmptyState(state: TableEmptyState): this {
    this._filteredEmptyState = state
    return this
  }

  /**
   * Set a per-row URL — each data cell renders as a real `<a href>` so
   * "open in new tab" works natively (right-click / cmd-click / middle-
   * click). Plain left-clicks SPA-navigate via `useNavigate()`. Action
   * and bulk-select cells stay unwrapped, so clicking a row action only
   * fires the action — there's no overlapping row-level click handler.
   *
   * The URL is stamped onto each row under the reserved `_recordUrl`
   * key during `loadTableRecords` — same convention as
   * `_visibleActions` / `_formatted`.
   *
   * Per-column overrides: pair with `Column.recordUrl(fn)` to swap a
   * column-specific URL, or `Column.recordUrl(false)` to opt a column
   * out (e.g. a column whose cell content has its own click affordance).
   */
  recordUrl(fn: RecordUrlHandler<R>): this {
    this._recordUrl = fn
    return this
  }

  /**
   * Per-row CSS class hook. The handler runs server-side once per row,
   * after `records()` resolves; the result is stamped under the reserved
   * `_recordClasses` key on the row and appended to the rendered `<tr>`'s
   * className. Pair with semantic Tailwind tokens (`bg-destructive/10`,
   * `text-warning`) so theming stays consistent.
   */
  recordClasses(fn: RecordClassesHandler<R>): this {
    this._recordClasses = fn
    return this
  }

  /**
   * Auto-refresh the table at a regular interval. `seconds` is positive;
   * non-positive values silently disable polling. SPA-friendly — the
   * client navigates to `pathname + search` (the current URL) so sort /
   * filter / pagination state survive the refresh, and AppShell stays
   * mounted. Polling pauses while the document is hidden.
   */
  poll(seconds: number): this {
    if (seconds > 0) this._pollInterval = seconds
    return this
  }

  /**
   * Band rows by a column's value. Stable-sorts the rendered rows so
   * shared values cluster together, then stamps each row's `_groupValue`
   * — the renderer inserts a heading row whenever the value changes.
   *
   * Accepts either a bare column name or a `TableGroup` instance. When
   * passed a `TableGroup` it's auto-added to `groups([…])` if it isn't
   * registered already, so `defaultGroup(TableGroup.make('status').label('Status'))`
   * doesn't require repeating the registration.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultGroup(group: string | TableGroup<any>): this {
    if (typeof group === 'string') {
      this._defaultGroup = group
    } else {
      this._defaultGroup = group.getColumn()
      const already = this._groups.some(g => g.getColumn() === group.getColumn())
      if (!already) this._groups.push(group)
    }
    return this
  }

  /**
   * Register the available group options. The renderer mounts a "Group
   * by" dropdown above the table when 2+ groups are registered (or 1
   * group with rich metadata — label / collapsible / record-derived
   * title). The active selection round-trips through the URL via the
   * reserved `?group=` key.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  groups(items: TableGroup<any>[]): this {
    this._groups = items
    return this
  }

  /**
   * Enable drag-to-reorder. `column` names the model attribute the new
   * order is written back to (defaults to `'sort'`, matching Filament).
   * The route registers `POST {base}/{slug}/_reorder` — the renderer
   * POSTs `{ ids }` there on every drop. Boot panics when this is set
   * but `Resource.model.reorder` is missing.
   *
   * The reorder column also doubles as the default sort: when no
   * `defaultSort()` is configured and reorder is on, rows render
   * `(reorderColumn, asc)` so the visible order matches the persisted
   * order. URL `?sort=…` still wins.
   */
  reorderable(column: string = 'sort'): this {
    this._reorderableColumn = column
    return this
  }

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
  withSummaries(summaries: Record<string, SummaryResult[]>): this {
    this._summaries = summaries
    return this
  }
  /** Stamp per-group summary results. Outer key = `_groupValue`,
   * inner = column name. Set by `loadTableRecords` only when an active
   * group is set AND at least one column has summarizers. */
  withGroupSummaries(
    groupSummaries: Record<string, Record<string, SummaryResult[]>>,
  ): this {
    this._groupSummaries = groupSummaries
    return this
  }

  /** Stamp the reorder POST URL. Called by `tagTableReorderUrls` during
   * `resourceIndexData` so the renderer knows where to send drops. */
  withReorderUrl(url: string): this {
    this._reorderUrl = url
    return this
  }

  /** Render-time setter — the column rows are actually banded by for
   * this request, after `?group=` and `defaultGroup(...)` are reconciled.
   * Set by `loadTableRecords`. Empty string explicitly clears (URL
   * `?group=` overrode `defaultGroup`). */
  withActiveGroup(column: string | undefined): this {
    if (column === undefined) delete this._activeGroup
    else this._activeGroup = column
    return this
  }

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
  getRecordUrl(): RecordUrlHandler<R> | undefined { return this._recordUrl }
  getRecordClasses(): RecordClassesHandler<R> | undefined { return this._recordClasses }
  getPollInterval(): number | undefined { return this._pollInterval }
  getDefaultGroup(): string | undefined { return this._defaultGroup }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getGroups(): TableGroup<any>[] { return this._groups }
  getActiveGroup(): string | undefined { return this._activeGroup }
  /** Resolve the active column to a `TableGroup` instance. Returns the
   * matching registered group, or — when the active column is set but
   * not registered (bare-column form) — synthesizes a no-metadata group
   * so the dispatcher has a uniform shape to work with. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getActiveGroupInstance(): TableGroup<any> | undefined {
    const col = this._activeGroup
    if (!col) return undefined
    const found = this._groups.find(g => g.getColumn() === col)
    return found ?? TableGroup.make(col)
  }
  getSummaries(): Record<string, SummaryResult[]> | undefined { return this._summaries }
  getGroupSummaries(): Record<string, Record<string, SummaryResult[]>> | undefined { return this._groupSummaries }
  getReorderableColumn(): string | undefined { return this._reorderableColumn }
  isReorderable(): boolean { return this._reorderableColumn !== undefined }
  getReorderUrl(): string | undefined { return this._reorderUrl }

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
      ...(this._heading      !== undefined ? { heading:     this._heading      } : {}),
      ...(this._description  !== undefined ? { description: this._description  } : {}),
      ...(this._striped                    ? { striped:     true               } : {}),
      ...(this._emptyState   !== undefined ? { emptyState:  this._emptyState   } : {}),
      ...(this._filteredEmptyState !== undefined ? { filteredEmptyState: this._filteredEmptyState } : {}),
      ...(this._recordUrl    !== undefined ? { recordUrl:   true as const      } : {}),
      ...(this._recordClasses !== undefined ? { recordClasses: true as const   } : {}),
      ...(this._pollInterval !== undefined ? { pollInterval: this._pollInterval } : {}),
      // `defaultGroup` on the meta means "the column rows are actually
      // grouped by for this render". Prefer the render-time activeGroup
      // (set by `loadTableRecords` after reconciling `?group=` and the
      // configured default); fall back to the configured default when
      // no request-side reconciliation has happened (e.g. tests calling
      // `toMeta()` directly).
      ...(this._activeGroup !== undefined
        ? (this._activeGroup === ''
            ? {}
            : { defaultGroup: this._activeGroup })
        : (this._defaultGroup !== undefined
            ? { defaultGroup: this._defaultGroup }
            : {})),
      ...(this._groups.length > 0
        ? { groups: this._groups.map(g => g.toMeta()) }
        : {}),
      ...(this._summaries    !== undefined ? { summaries:    this._summaries    } : {}),
      ...(this._groupSummaries !== undefined ? { groupSummaries: this._groupSummaries } : {}),
      ...(this._reorderableColumn !== undefined ? { reorderable: true as const, reorderableColumn: this._reorderableColumn } : {}),
      ...(this._reorderUrl   !== undefined ? { reorderUrl:  this._reorderUrl  } : {}),
      ...(this._rows         !== undefined ? { rows:        this._rows }        : {}),
      ...(this._total        !== undefined ? { total:       this._total }       : {}),
      ...(this._currentSort  !== undefined ? { currentSort: this._currentSort } : {}),
      ...(this._currentSearch !== undefined ? { search:     this._currentSearch } : {}),
      ...(this._currentPage  !== undefined ? { currentPage: this._currentPage } : {}),
      ...(this._currentPath  !== undefined ? { currentPath: this._currentPath } : {}),
    }
  }
}
