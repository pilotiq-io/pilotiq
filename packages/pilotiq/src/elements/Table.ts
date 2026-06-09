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
  /** Drill-in scope when the user clicked a group heading. Carries the
   * resolved `TableGroup` instance + the bucket key (the same value
   * `getKeyFromRecordUsing` would produce). Set by `loadTableRecords`
   * after reconciling `?<prefix>groupKey=`. The model adapter calls
   * `group.resolveScoper()(q, key)` after filters but before pagination;
   * user-supplied `Table.records(fn)` handlers can branch on this for
   * cross-table joins or non-default narrowing. */
  groupScope?: {
     
    group: import('./TableGroup.js').TableGroup<any>
    key:   string
  }
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
  /**
   * Cross-page column summaries — `SummaryResult[]` per column name, computed
   * by the records handler via a second aggregate query over the full
   * filtered set (`modelTableRecords` does this for model-backed tables).
   * `loadTableRecords` prefers these over the per-page `<tfoot>` computation;
   * columns absent here (un-aggregatable / custom handler) fall back to
   * per-page. Sparse — omitted entirely when no column has summarizers.
   */
  summaries?: Record<string, SummaryResult[]>
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

/**
 * Per-row card content function for `contentLayout('cards')` (and the
 * responsive `stackOnMobile` fallback). Returns an `Element[]` rendered
 * inside the card; resolved via `resolveSchema` per-row in
 * `loadTableRecords` and stamped onto `row._cardChildren`.
 *
 * Receives `(record, auto, ctx)`:
 * - `record` — the row.
 * - `auto` — the elements pilotiq built automatically from the columns +
 *   the resource's record-identity attributes (title / image / description
 *   + `Label · value` lines). Return `[...auto, extra]` to **extend** the
 *   default card; ignore it (single-arg handler) to **replace** it.
 * - `ctx` — the current `TableContext`.
 *
 * Omitting `cardSchema` entirely renders `auto` as-is.
 *
 * Typical content: `Image`, `Heading`, `Text`, `Icon`, `Badge`-style
 * `Entry` primitives, plus layout primitives like `Group / Split / Grid`.
 * Display-only — `Form` / `Field` / `Filter` / `Action` inside the card
 * schema is unsupported in v1.
 */
export type CardSchemaHandler<R = unknown> = (
  record: R,
  auto:   Element[],
  ctx:    TableContext<R>,
) => Element[] | Promise<Element[]>

/**
 * Responsive grid column counts for `contentLayout('cards')`. Each
 * breakpoint maps to its Tailwind container query (`@sm` = ≥40rem etc.);
 * `default` is the base (no media query). Unspecified breakpoints inherit
 * the next-smaller. v1 caps each value at 12 to match the grid's column
 * limits — values outside `[1, 12]` clamp.
 */
export interface CardsPerRow {
  default?: number
  sm?:      number
  md?:      number
  lg?:      number
  xl?:      number
  '2xl'?:   number
}

/**
 * Table content-layout mode. `'table'` (default) renders the classic
 * `<thead>` + `<tbody>` HTML table. `'cards'` hides the header row and
 * renders each row as a card in a CSS grid. Columns still drive search /
 * sort / filter / group / summarize semantics in cards mode; only the
 * row-level rendering differs.
 */
export type ContentLayout = 'table' | 'cards'

/** Breakpoint at which `stackOnMobile` flips from card-per-row (below) to
 *  the classic table (at/above). Tailwind's `sm` / `md` / `lg`. */
export type StackBreakpoint = 'sm' | 'md' | 'lg'

/**
 * Where filters render relative to the table.
 * - `'modal'` (default) — chrome-only popover above the table, opened by
 *   the toolbar Filters button.
 * - `'above-content'` — inline strip rendered between the header bar and
 *   the table; every filter widget is always visible.
 * - `'above-content-collapsible'` — same strip, hidden behind the toolbar
 *   Filters button. Open / closed state persists per table path.
 * - `'below-content'` — inline strip rendered after the table (under the
 *   pagination row).
 *
 * Filament v5's sidebar positions (`BeforeContent` / `AfterContent`)
 * reshape the page rather than the table chrome and are deferred until a
 * consumer asks.
 */
export type FiltersLayout =
  | 'modal'
  | 'above-content'
  | 'above-content-collapsible'
  | 'below-content'

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

  /** The drilled-in group key for this request. When set, the renderer
   * suppresses group banding (no heading rows, no per-group summaries),
   * shows a "Drilled into <Label>: <Key>" chip above the table with an
   * × to clear, and the records have already been narrowed to that
   * bucket server-side via `TableGroup.scopeQueryByKey`. Sparse —
   * omitted unless `?<prefix>groupKey=<value>` is present AND the named
   * group exists AND is `scopable`. */
  activeGroupKey?: string

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

  /** Tier-3 — set when `Resource.deferLoading = true`. The SSR pass
   * skips `Table.records()` so the client paints a skeleton on first
   * frame and fetches rows from `tableUrl` after mount. URL chrome
   * (current sort / search / page / group) still mirrors so the
   * skeleton frame doesn't reset user-visible state. */
  deferred?: true

  /** Stamped server-side at render time alongside `deferred`. The
   * renderer GETs this URL with the page's current query string to
   * fetch rows after mount. Empty when `deferLoading` is off. */
  tableUrl?: string

  /** Tier-3 — when set, the table's URL state (search / sort / page /
   * perPage / group / filter values) is namespaced under the identifier
   * so multiple tables on one page don't fight over `?search=` etc.
   * `?orders_search=foo&invoices_sort=date:desc`. Off by default — bare
   * keys are still used when no identifier is set. Custom-page-only:
   * resource list pages have one table by default and don't need it. */
  queryStringIdentifier?: string

  /** Content-layout mode. Absent = `'table'` (classic HTML table); when
   * `'cards'` the renderer hides the column header row and arranges rows
   * as cards in a CSS grid. Per-row card content is stamped on each row
   * under `_cardChildren: ElementMeta[]` by `loadTableRecords`. Columns
   * still drive search / sort / filter / group / summarize semantics. */
  contentLayout?: 'cards'

  /** Responsive card column counts for `contentLayout: 'cards'`. Renderer
   * maps each breakpoint to a `@container`-scoped Tailwind grid class. */
  cardsPerRow?: CardsPerRow

  /** Responsive fallback — when set, the table renders as a classic table
   * at/above this breakpoint and as one card per row below it (closes the
   * mobile horizontal-scroll problem). Distinct from `contentLayout: 'cards'`
   * (cards at every breakpoint). The per-row card content is stamped on
   * `_cardChildren` the same way; with no `cardSchema` it's auto-built from
   * the columns. Absent = no responsive switch (table + horizontal scroll). */
  stackOnMobile?: StackBreakpoint

  /** Filter layout position. Absent = `'modal'` (current popover behavior).
   * The renderer swaps the toolbar Filters button for an inline strip in
   * the matching slot when set. See `FiltersLayout` for the full enum. */
  filtersLayout?: Exclude<FiltersLayout, 'modal'>

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
  // Variance-relaxed — covariant `TableGroup<R>[]` ergonomics
  // matter more than tight invariance against the table's `R` parameter.
  private _groups:        TableGroup<any>[] = []   
  private _activeGroup?:  string
  private _activeGroupKey?: string
  private _summaries?:    Record<string, SummaryResult[]>
  private _groupSummaries?: Record<string, Record<string, SummaryResult[]>>
  private _reorderableColumn?: string
  private _reorderUrl?:   string
  private _deferred = false
  private _tableUrl?:     string
  private _queryStringIdentifier?: string
  private _contentLayout: ContentLayout = 'table'
  private _cardSchema?:   CardSchemaHandler<R>
  private _cardsPerRow?:  CardsPerRow
  private _stackOnMobile?: StackBreakpoint
  private _filtersLayout: FiltersLayout = 'modal'

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
    const nonColumns = existing.filter(el => el.getType() !== 'column')
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
    const nonFilters = existing.filter(el => el.getType() !== 'filter')
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

  /** Mark this table as deferred — the SSR pass skips `records()` and
   * the client fetches rows from `tableUrl` after mount. Set by
   * `resourceIndexData` when `Resource.deferLoading = true`; user code
   * doesn't typically call this directly. */
  withDeferred(v: boolean = true): this {
    this._deferred = v
    return this
  }

  /** Stamp the deferred-load fetch URL. Set alongside `withDeferred`
   * by `tagTableUrls` during `resourceIndexData`. */
  withTableUrl(url: string): this {
    this._tableUrl = url
    return this
  }

  /**
   * Namespace this table's URL state under an identifier so multiple
   * tables on the same page don't collide on `?search=` / `?sort=` /
   * `?page=` / filter keys. With `queryStringIdentifier('orders')`, every
   * key is read and written as `orders_<key>` (e.g. `?orders_search=foo`,
   * `?orders_sort=date:desc`, `?orders_status=open`). Off by default —
   * resource list pages have one Table and don't need a prefix.
   *
   * The empty string is rejected (would silently disable namespacing
   * while implying it's on); identifiers must match `[A-Za-z0-9_-]+`
   * so they don't smuggle reserved characters into URL keys.
   */
  queryStringIdentifier(id: string): this {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      throw new Error(
        `Table.queryStringIdentifier: invalid id ${JSON.stringify(id)} — must match /^[A-Za-z0-9_-]+$/`,
      )
    }
    this._queryStringIdentifier = id
    return this
  }

  /**
   * Pick the content layout for this table. `'table'` (default) renders
   * the classic `<thead>` + `<tbody>` HTML table. `'cards'` hides the
   * column header row and renders each row as a card in a CSS grid; the
   * per-row content comes from `cardSchema(...)`.
   *
   * Columns still drive search / sort / filter / group / summarize
   * semantics in cards mode — they're just not painted as table headers.
   * The top-bar gains a "Sort by" dropdown built from `Column.sortable()`
   * columns since column headers (the usual sort affordance) are hidden.
   */
  contentLayout(layout: ContentLayout): this {
    this._contentLayout = layout
    return this
  }

  /** Sugar for `contentLayout('cards')`. */
  cards(): this { return this.contentLayout('cards') }

  /**
   * Per-row card content. Returns an `Element[]` rendered inside a card,
   * resolved server-side per row in `loadTableRecords` and stamped on
   * `row._cardChildren`. **Optional** — without it, cards mode renders an
   * auto-card built from the columns + the resource's record-identity
   * attributes. The handler receives `(record, auto, ctx)`: return
   * `[...auto, extra]` to extend that default, or ignore `auto` to replace
   * it entirely.
   *
   * Display-only — `Form / Field / Filter / Action` inside the card
   * schema is unsupported in v1. Reuse `Heading`, `Text`, `Image`, `Icon`,
   * `Group / Split / Grid`, and the read-only `Entry` family
   * (`TextEntry / BadgeEntry / IconEntry / ImageEntry / KeyValueEntry /
   * ColorEntry / ComponentEntry`) for content.
   */
  cardSchema(fn: CardSchemaHandler<R>): this {
    this._cardSchema = fn
    return this
  }

  /**
   * Responsive grid column counts in cards mode. Each entry maps to a
   * Tailwind container query (`@sm` = ≥40rem, etc.). Unspecified
   * breakpoints inherit the next-smaller; `default` is the base.
   * Values clamp to `[1, 12]`. Default `{ default: 1, sm: 2, lg: 3 }`.
   */
  cardsPerRow(opts: CardsPerRow): this {
    this._cardsPerRow = opts
    return this
  }

  /**
   * Responsive fallback — render as a classic table at/above `breakpoint`
   * and as one card per row below it (kills the mobile horizontal scroll).
   * Opt-in; breakpoint defaults to `'md'`. The mobile card uses the same
   * content as `contentLayout('cards')` — an auto-card built from the
   * columns + the resource's record-identity attributes, or the
   * `cardSchema` when one is set. Leaves desktop unchanged.
   */
  stackOnMobile(breakpoint: StackBreakpoint = 'md'): this {
    this._stackOnMobile = breakpoint
    return this
  }

  /**
   * Where filters render relative to the table. Default `'modal'` keeps
   * the toolbar Filters button + popover. The three inline modes
   * (`'above-content'` / `'above-content-collapsible'` / `'below-content'`)
   * lay every filter widget out as a horizontal strip in place of the
   * popover.
   */
  filtersLayout(layout: FiltersLayout): this {
    this._filtersLayout = layout
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

  /** Render-time setter — the drilled-in group key for this request,
   * after `?<prefix>groupKey=` was reconciled against a `scopable`
   * group. Set by `loadTableRecords`. Empty string / undefined both
   * clear, since drill-in needs an actual key to scope against. */
  withActiveGroupKey(key: string | undefined): this {
    if (key === undefined || key === '') delete this._activeGroupKey
    else this._activeGroupKey = key
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
   
  getGroups(): TableGroup<any>[] { return this._groups }
  getActiveGroup(): string | undefined { return this._activeGroup }
  getActiveGroupKey(): string | undefined { return this._activeGroupKey }
  /** Resolve the active column to a `TableGroup` instance. Returns the
   * matching registered group, or — when the active column is set but
   * not registered (bare-column form) — synthesizes a no-metadata group
   * so the dispatcher has a uniform shape to work with. */
   
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
  isDeferred(): boolean { return this._deferred }
  getTableUrl(): string | undefined { return this._tableUrl }
  getQueryStringIdentifier(): string | undefined { return this._queryStringIdentifier }
  getContentLayout(): ContentLayout { return this._contentLayout }
  isCardsLayout(): boolean { return this._contentLayout === 'cards' }
  getCardSchema(): CardSchemaHandler<R> | undefined { return this._cardSchema }
  getCardsPerRow(): CardsPerRow | undefined { return this._cardsPerRow }
  getStackOnMobile(): StackBreakpoint | undefined { return this._stackOnMobile }
  getFiltersLayout(): FiltersLayout { return this._filtersLayout }

  /** Convenience: the `Column` children only.
   * Structural `getType()` rather than `instanceof Column` — under Vite SSR
   * module duplication the children's class identity can differ from this
   * module's `Column` import, and `instanceof` would silently drop every
   * column. (Same reason as the dispatchTable guards.) */
  getColumns(): Column[] {
    return (this._children ?? []).filter((el): el is Column => el.getType() === 'column')
  }

  /** Convenience: the `Filter` children only. Structural check — see getColumns. */
  getFilters(): Filter[] {
    return (this._children ?? []).filter((el): el is Filter => el.getType() === 'filter')
  }

  // ─── Serialization ────────────────────────────────────

  getType(): string { return 'table' }

  override toMeta(): TableMeta {
    const searchable = this.getColumns().some(c => c.isSearchable())
    // Cards mode no longer requires a `cardSchema` — without one, each row
    // renders an auto-card built from the columns + record-identity
    // attributes (see `buildAutoCard`). A `cardSchema` extends or replaces it.
    const cardsPerRow = this._cardsPerRow !== undefined
      ? clampCardsPerRow(this._cardsPerRow)
      : undefined
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
      ...(this._activeGroupKey !== undefined ? { activeGroupKey: this._activeGroupKey } : {}),
      ...(this._reorderableColumn !== undefined ? { reorderable: true as const, reorderableColumn: this._reorderableColumn } : {}),
      ...(this._reorderUrl   !== undefined ? { reorderUrl:  this._reorderUrl  } : {}),
      ...(this._deferred                   ? { deferred:    true as const   } : {}),
      ...(this._tableUrl     !== undefined ? { tableUrl:    this._tableUrl   } : {}),
      ...(this._queryStringIdentifier !== undefined
        ? { queryStringIdentifier: this._queryStringIdentifier } : {}),
      ...(this._contentLayout === 'cards' ? { contentLayout: 'cards' as const } : {}),
      ...(cardsPerRow !== undefined ? { cardsPerRow } : {}),
      ...(this._stackOnMobile !== undefined ? { stackOnMobile: this._stackOnMobile } : {}),
      ...(this._filtersLayout !== 'modal' ? { filtersLayout: this._filtersLayout } : {}),
      ...(this._rows         !== undefined ? { rows:        this._rows }        : {}),
      ...(this._total        !== undefined ? { total:       this._total }       : {}),
      ...(this._currentSort  !== undefined ? { currentSort: this._currentSort } : {}),
      ...(this._currentSearch !== undefined ? { search:     this._currentSearch } : {}),
      ...(this._currentPage  !== undefined ? { currentPage: this._currentPage } : {}),
      ...(this._currentPath  !== undefined ? { currentPath: this._currentPath } : {}),
    }
  }
}

const CARDS_PER_ROW_KEYS = ['default', 'sm', 'md', 'lg', 'xl', '2xl'] as const

function clampCardsPerRow(opts: CardsPerRow): CardsPerRow {
  const out: CardsPerRow = {}
  for (const key of CARDS_PER_ROW_KEYS) {
    const v = opts[key]
    if (v === undefined) continue
    const n = Math.floor(Number(v))
    if (!Number.isFinite(n)) continue
    out[key] = Math.min(12, Math.max(1, n))
  }
  return out
}
