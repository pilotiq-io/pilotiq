/**
 * Table grouping option. Owned by `Table` (not an `Element` — doesn't
 * sit in the schema tree). Each `TableGroup` defines one column the
 * table can band rows by, plus optional chrome (label, collapsibility,
 * record-derived title and description, date bucketing).
 *
 * Multiple `TableGroup`s can live on a single table via `Table.groups([…])`
 * — the renderer mounts a "Group by" dropdown above the table when more
 * than one is registered. The active selection round-trips through the
 * URL via the reserved `?group=` key.
 */

export type TableGroupTitleHandler<R = unknown> = (
  record: R,
) => string | undefined

export type TableGroupDescriptionHandler<R = unknown> = (
  record: R,
) => string | undefined

/**
 * Per-record key resolver. The returned string is what `scopeQueryByKey`
 * receives at drill-in time. Default resolution = the raw column value
 * cast to string (or `YYYY-MM-DD` when `.date()` is on). Override when the
 * stable bucket key differs from what the column literally stores —
 * e.g. when grouping by an enum object whose `.value` is the persisted
 * column.
 */
export type TableGroupKeyHandler<R = unknown> = (
  record: R,
) => string | undefined

/**
 * Query scoper applied when the user clicks a group heading to drill into
 * a single group. Receives the raw model query and the resolved group key
 * (the same value `getKeyFromRecordUsing` produced). Should narrow the
 * query to records belonging to that group. Default narrows by exact-match
 * `where(column, '=', key)`; date groups install a whole-day range default.
 */
export type TableGroupQueryScoper<Q = unknown> = (
  query: Q,
  key:   string,
) => Q

/**
 * Comparator on resolved group keys. Receives the same string values that
 * the dispatcher stamps onto `_groupValue` (so for `date()` groups the keys
 * are `YYYY-MM-DD`, not raw timestamps). Return < 0 to put `a` first, > 0
 * to put `b` first, 0 to keep insertion order. The empty-bucket-last rule
 * is still applied AFTER your comparator — the empty bucket stays at the
 * bottom regardless of what you return for it.
 */
export type TableGroupKeyComparator = (a: string, b: string) => number

export interface TableGroupMeta {
  column:        string
  label:         string
  collapsible?:  true
  collapsed?:    true
  /** Server-side date bucketing is on (column read as a date, grouped
   * by day). Renderer doesn't need to do anything special — `_groupValue`
   * already arrives as `YYYY-MM-DD` and `_groupTitle` carries the
   * formatted display text. */
  date?:         true
  /** Heading is clickable — renderer wraps the title text in a real
   * `<a href>` that sets `?<prefix>groupKey=<value>` to drill into a
   * single group. Sparse: omitted unless the user opted in (directly
   * via `.scopable(true)` or implicitly by calling `.scopeQueryByKey()`
   * / `.getKeyFromRecordUsing()`). */
  scopable?:     true
}

export class TableGroup<R = unknown> {
  private _column:        string
  private _label?:        string
  private _collapsible    = false
  private _collapsed      = false
  private _titleFn?:       TableGroupTitleHandler<R>
  private _descriptionFn?: TableGroupDescriptionHandler<R>
  private _date           = false
  private _keyComparator?: TableGroupKeyComparator
  private _scopable       = false
  private _scopeFn?:       TableGroupQueryScoper<unknown>
  private _keyFn?:         TableGroupKeyHandler<R>

  private constructor(column: string) {
    this._column = column
  }

  static make<R = unknown>(column: string): TableGroup<R> {
    return new TableGroup<R>(column)
  }

  /** Display label in the group selector dropdown. Falls back to the
   * column name when omitted. */
  label(text: string): this { this._label = text; return this }

  /** Allow individual groups to be folded. Adds a chevron in the heading row. */
  collapsible(v: boolean = true): this { this._collapsible = v; return this }

  /** Start collapsed by default. Per-group state is persisted client-
   * side in localStorage; this just seeds the initial state. */
  collapsed(v: boolean = true): this { this._collapsed = v; return this }

  /** Custom heading text per row. Receives the full record. Falls back
   * to the raw column value when omitted. Stamped per row server-side
   * as `_groupTitle`. */
  getTitleFromRecordUsing(fn: TableGroupTitleHandler<R>): this {
    this._titleFn = fn
    return this
  }

  /** Subtitle below the title. Stamped per row as `_groupDescription`. */
  getDescriptionFromRecordUsing(fn: TableGroupDescriptionHandler<R>): this {
    this._descriptionFn = fn
    return this
  }

  /** Sugar for grouping by day — the column is read as a date and
   * bucketed to `YYYY-MM-DD`. Uses `_groupValue` for the bucket key
   * (so stable-sort still works) and a default title formatter ("May
   * 4, 2026"). User-supplied title formatter wins. */
  date(v: boolean = true): this { this._date = v; return this }

  /**
   * Override the alphabetic ordering of group buckets with a custom
   * comparator on resolved group keys. Useful for pinning enums in a
   * meaningful order (e.g. `'draft' → 'published' → 'archived'`).
   *
   * The empty-bucket-last rule still runs AFTER this comparator — rows
   * with no group value always sort to the bottom regardless of what
   * the comparator returns for the empty key. Pass an array of keys
   * for the convenient case via the `orderByKeys` helper below.
   *
   * Example:
   * ```ts
   * TableGroup.make('status').orderUsing(orderByKeys([
   *   'draft', 'published', 'archived',
   * ]))
   * ```
   */
  orderUsing(comparator: TableGroupKeyComparator): this {
    this._keyComparator = comparator
    return this
  }

  /**
   * Make the group heading clickable — clicking it drills the table into
   * just that group's rows, suppressing the banded layout. Opt-in: most
   * tables stay in the banded view. Auto-armed whenever the user calls
   * `.scopeQueryByKey(fn)` or `.getKeyFromRecordUsing(fn)` since neither
   * is meaningful without the drill-in affordance; pass `.scopable(false)`
   * explicitly to opt back out after the fact.
   */
  scopable(v: boolean = true): this {
    this._scopable = v
    return this
  }

  /**
   * Narrow the query to a single group's rows when the user drills in.
   * Receives the raw model query and the resolved group key (same value
   * `getKeyFromRecordUsing` produces). Default narrows by exact-match
   * `where(column, '=', key)`; date groups install a whole-day range
   * default. Auto-arms `.scopable(true)` since a custom scoper without
   * a clickable heading would never fire.
   *
   * ```ts
   * TableGroup.make('status').scopeQueryByKey((q, key) =>
   *   q.where('status', '=', key).where('archived', '=', false),
   * )
   * ```
   */
  scopeQueryByKey<Q = unknown>(fn: TableGroupQueryScoper<Q>): this {
    this._scopeFn  = fn as TableGroupQueryScoper<unknown>
    this._scopable = true
    return this
  }

  /**
   * Override the per-record key resolver. The returned string is the
   * stable bucket key — it round-trips through `?<prefix>groupKey=` on
   * drill-in and lands as the second arg of `scopeQueryByKey`. Default
   * = the raw column value cast to string (or `YYYY-MM-DD` when
   * `.date()` is on). Auto-arms `.scopable(true)`.
   */
  getKeyFromRecordUsing(fn: TableGroupKeyHandler<R>): this {
    this._keyFn    = fn
    this._scopable = true
    return this
  }

  // ─── Getters ──────────────────────────────────────────

  getColumn(): string { return this._column }
  /** Resolved label — `.label(text)` if set, else the column name. */
  getLabel(): string { return this._label ?? this._column }
  isCollapsible(): boolean { return this._collapsible }
  isCollapsed():   boolean { return this._collapsed }
  getTitleHandler():       TableGroupTitleHandler<R>       | undefined { return this._titleFn }
  getDescriptionHandler(): TableGroupDescriptionHandler<R> | undefined { return this._descriptionFn }
  isDate(): boolean { return this._date }
  getKeyComparator(): TableGroupKeyComparator | undefined { return this._keyComparator }
  isScopable(): boolean { return this._scopable }
  getKeyHandler(): TableGroupKeyHandler<R> | undefined { return this._keyFn }

  /**
   * Resolve the active scoper. Returns the user-supplied function when
   * set; otherwise installs a default:
   *
   * - **Date groups** (`.date()`): whole-day range over the column —
   *   `(q, key) => q.where(col, '>=', key + ' 00:00:00').where(col, '<=', key + ' 23:59:59')`.
   *   Strings are picked over `Date` instances so the default composes
   *   with ORMs that accept date-string literals; consumers wanting
   *   sub-day buckets / timezone-aware ranges supply their own scoper.
   * - **Plain groups**: exact-match — `(q, key) => q.where(col, '=', key)`.
   *
   * Note: the default uses `where(col, '>=', …)` 3-arg form. Adapter that
   * only supports 2-arg `where(col, value)` need to detect the comparison
   * argument shape — every ORM pilotiq ships against today supports the
   * 3-arg form via `ModelQuery.where`.
   */
  resolveScoper<Q = unknown>(): TableGroupQueryScoper<Q> {
    if (this._scopeFn) return this._scopeFn as TableGroupQueryScoper<Q>
    const col = this._column
    if (this._date) {
      return ((q: { where: (...args: unknown[]) => unknown }, key: string) => {
        // Empty key clears the bucket — fall back to a no-op so a stale
        // groupKey doesn't accidentally filter the table to zero rows.
        if (key === '') return q
        return (q
          .where(col, '>=', `${key} 00:00:00`) as typeof q)
          .where(col, '<=', `${key} 23:59:59`)
      }) as unknown as TableGroupQueryScoper<Q>
    }
    return ((q: { where: (...args: unknown[]) => unknown }, key: string) =>
      q.where(col, '=', key)) as unknown as TableGroupQueryScoper<Q>
  }

  /**
   * Derive the stable bucket key for a record. User-supplied handler
   * wins; otherwise falls back to the column's raw value cast to string
   * (or the `YYYY-MM-DD` bucket when `.date()` is on). Unparseable /
   * null values resolve to `''` so they cluster under the empty bucket.
   */
  resolveKey(record: R): string {
    if (this._keyFn) {
      try {
        const k = this._keyFn(record)
        return k === undefined ? '' : String(k)
      } catch {
        return ''
      }
    }
    const raw = (record as Record<string, unknown>)[this._column]
    if (this._date) return bucketDateValue(raw)
    return raw == null || raw === '' ? '' : String(raw)
  }

  toMeta(): TableGroupMeta {
    return {
      column: this._column,
      label:  this.getLabel(),
      ...(this._collapsible ? { collapsible: true as const } : {}),
      ...(this._collapsed   ? { collapsed:   true as const } : {}),
      ...(this._date        ? { date:        true as const } : {}),
      ...(this._scopable    ? { scopable:    true as const } : {}),
    }
  }
}

/**
 * Bucket a date-like value to a `YYYY-MM-DD` key. Used by `TableGroup.date()`
 * to compute the stable-sort key for `_groupValue`. Returns `''` for
 * unparseable inputs so they cluster under the empty bucket (which the
 * dispatcher already pushes to the bottom).
 */
export function bucketDateValue(raw: unknown): string {
  if (raw == null || raw === '') return ''
  const d = raw instanceof Date ? raw : new Date(raw as string | number)
  if (Number.isNaN(d.getTime())) return ''
  // ISO date in UTC. Tables that need timezone-aware buckets should
  // override via `.getTitleFromRecordUsing` and roll their own bucket.
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Convenience comparator factory for `TableGroup.orderUsing(...)`. Returns
 * a comparator that sorts the supplied keys in declaration order, with any
 * unknown keys falling through to alphabetic ordering AFTER the listed ones.
 *
 * Use it to pin enum-like values without writing a manual switch:
 *
 * ```ts
 * TableGroup.make('status').orderUsing(orderByKeys(['draft', 'published']))
 * ```
 *
 * The empty bucket is unaffected — `dispatchTable` always sinks empty groups
 * to the bottom regardless of what your comparator returns for them.
 */
export function orderByKeys(keys: ReadonlyArray<string>): TableGroupKeyComparator {
  const rank = new Map<string, number>()
  keys.forEach((k, i) => rank.set(k, i))
  return (a, b) => {
    const ra = rank.get(a)
    const rb = rank.get(b)
    if (ra !== undefined && rb !== undefined) return ra - rb
    if (ra !== undefined) return -1
    if (rb !== undefined) return  1
    return a < b ? -1 : a > b ? 1 : 0
  }
}

/**
 * Default title formatter used when `TableGroup.date()` is on but the
 * user didn't supply `getTitleFromRecordUsing`. Returns "May 4, 2026"-
 * style text, or the raw bucket key if the date is unparseable.
 */
export function formatDateBucketTitle(raw: unknown): string {
  if (raw == null || raw === '') return ''
  const d = raw instanceof Date ? raw : new Date(raw as string | number)
  if (Number.isNaN(d.getTime())) return String(raw)
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'UTC',
    }).format(d)
  } catch {
    return bucketDateValue(raw)
  }
}
