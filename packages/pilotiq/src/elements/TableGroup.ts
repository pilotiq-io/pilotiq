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
}

export class TableGroup<R = unknown> {
  private _column:        string
  private _label?:        string
  private _collapsible    = false
  private _collapsed      = false
  private _titleFn?:       TableGroupTitleHandler<R>
  private _descriptionFn?: TableGroupDescriptionHandler<R>
  private _date           = false

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

  // ─── Getters ──────────────────────────────────────────

  getColumn(): string { return this._column }
  /** Resolved label — `.label(text)` if set, else the column name. */
  getLabel(): string { return this._label ?? this._column }
  isCollapsible(): boolean { return this._collapsible }
  isCollapsed():   boolean { return this._collapsed }
  getTitleHandler():       TableGroupTitleHandler<R>       | undefined { return this._titleFn }
  getDescriptionHandler(): TableGroupDescriptionHandler<R> | undefined { return this._descriptionFn }
  isDate(): boolean { return this._date }

  toMeta(): TableGroupMeta {
    return {
      column: this._column,
      label:  this.getLabel(),
      ...(this._collapsible ? { collapsible: true as const } : {}),
      ...(this._collapsed   ? { collapsed:   true as const } : {}),
      ...(this._date        ? { date:        true as const } : {}),
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
