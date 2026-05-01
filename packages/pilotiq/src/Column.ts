import { Element, type ElementMeta } from './schema/Element.js'
import { Summarizer, type SummarizerMeta } from './summarizers/Summarizer.js'

/** Cell content alignment. Maps to text-{start|center|end} on the cell. */
export type ColumnAlignment = 'start' | 'center' | 'end'

/** Visual variant. The default `text` covers most cases — formatters
 * (dateTime / money / since / numeric / limit) layer on top.
 * `badge` / `icon` / `boolean` / `image` are subclasses that change
 * how the cell is *rendered* rather than just *formatted*. */
export type ColumnType = 'text' | 'badge' | 'icon' | 'boolean' | 'image'

/** Font weight preset — maps to a Tailwind `font-*` class. */
export type ColumnWeight = 'normal' | 'medium' | 'semibold' | 'bold'

/** Color preset for the cell text. `muted` greys the value. */
export type ColumnColor = 'default' | 'muted' | 'primary' | 'destructive' | 'success' | 'warning' | 'info'

/** Built-in formatters serialized to the client. `kind` drives the
 * client-side switch; the rest of the fields carry per-kind options. */
export type ColumnFormat =
  | { kind: 'dateTime'; pattern?: string }
  | { kind: 'since' }
  | { kind: 'money';    currency: string; locale?: string }
  | { kind: 'numeric';  decimals?: number; locale?: string }
  | { kind: 'limit';    chars: number }

/** Per-row formatter callback. Returns the rendered cell content as a
 * string. Runs server-side inside `loadTableRecords` (the function
 * isn't serializable to the client). */
export type FormatStateHandler = (value: unknown, record: Record<string, unknown>) => string

/** Per-row record-URL callback. Returns the destination URL for clicks
 * on this column's cell, or `undefined` to skip linking that row. Runs
 * server-side inside `loadTableRecords`. */
export type ColumnRecordUrlHandler = (record: Record<string, unknown>) => string | undefined

export interface ColumnMeta extends ElementMeta {
  type:        'column'
  name:        string
  label:       string
  sortable:    boolean
  searchable:  boolean
  columnType?: ColumnType
  alignment?:  ColumnAlignment
  width?:      string
  default?:    string
  tooltip?:    string
  wrap?:       boolean
  lineClamp?:  number
  weight?:     ColumnWeight
  color?:      ColumnColor
  format?:     ColumnFormat
  /** True when a `formatStateUsing` callback is set. The renderer reads
   * formatted values out of `row._formatted[columnName]` instead of
   * re-applying the column's format spec. */
  hasFormatter?: boolean
  /** Per-column footer summarizers — kind + optional label. The actual
   * computed values for each summarizer land on the table meta under
   * `summaries[columnName]` (`SummaryResult[]`), not on the column. */
  summaries?: SummarizerMeta[]
  /**
   * Per-column record-URL behavior. The default (absent) means the cell
   * inherits the table's `recordUrl` for click navigation. `false` opts
   * the column out — clicks on this column's cell don't navigate anywhere.
   * `true` means the column has its own URL handler; the resolved URL
   * is stamped onto each row under `row._columnRecordUrls[columnName]`.
   */
  recordUrl?: boolean
  // Subclass-specific extras land in `_extra` to keep the meta typed.
  // BadgeColumn — value-to-color map.
  badgeColors?: Record<string, string>
  // IconColumn — value-to-{icon,color} map.
  iconOptions?: Record<string, { icon: string; color?: string }>
  // ImageColumn — sizing.
  imageSize?:  number
  imageShape?: 'square' | 'circle'
}

/**
 * Base column primitive — used directly for text cells (the most common
 * case) or extended into `BadgeColumn` / `IconColumn` / `BooleanColumn` /
 * `ImageColumn` for visual variants. Joins the schema tree as an
 * Element so it serializes through the same resolver pipeline as
 * Fields and display elements. Lives as a child of `Table`.
 */
export class Column extends Element {
  readonly name: string
  protected _label?: string
  protected _sortable = false
  protected _searchable = false

  // Visual / layout
  protected _columnType: ColumnType = 'text'
  protected _alignment?: ColumnAlignment
  protected _width?: string
  protected _default?: string
  protected _tooltip?: string
  protected _wrap = false
  protected _lineClamp?: number
  protected _weight?: ColumnWeight
  protected _color?: ColumnColor

  // Formatters
  protected _format?: ColumnFormat
  protected _formatState?: FormatStateHandler

  // Per-column record-URL override / opt-out. `false` disables linking
  // for this column; a function overrides the table's URL with a
  // column-specific one. Unset = inherit the table's recordUrl.
  protected _recordUrl?: false | ColumnRecordUrlHandler

  // Footer summarizers (Sum / Average / Count / Range). Computed by
  // `loadTableRecords` over the rendered rows; values land on the
  // table-level summaries map keyed by column name.
  protected _summarizers: Summarizer[] = []

  protected constructor(name: string) {
    super()
    this.name = name
  }

  static make(name: string): Column {
    return new Column(name)
  }

  // ─── Identity ─────────────────────────────────────────

  label(l: string): this { this._label = l; return this }
  sortable(v = true): this { this._sortable = v; return this }
  searchable(v = true): this { this._searchable = v; return this }

  // ─── Layout ───────────────────────────────────────────

  alignment(a: ColumnAlignment): this { this._alignment = a; return this }
  width(w: string): this { this._width = w; return this }

  /** Fallback string when the cell value is null / undefined / empty. */
  default(s: string): this { this._default = s; return this }
  /** Alias for `default()` to match the Filament spelling. */
  placeholder(s: string): this { return this.default(s) }

  tooltip(t: string): this { this._tooltip = t; return this }

  /** Render the cell with `whitespace-normal`; long content wraps onto
   * multiple lines instead of getting truncated. */
  wrap(v = true): this { this._wrap = v; return this }

  /** CSS line-clamp for multi-line truncation (replaces `wrap`). */
  lineClamp(n: number): this { this._lineClamp = n; return this }

  weight(w: ColumnWeight): this { this._weight = w; return this }
  color(c: ColumnColor): this { this._color = c; return this }

  // ─── Built-in formatters ──────────────────────────────

  /** Format a date / datetime value via `Intl.DateTimeFormat`. The
   * default pattern produces "Jan 1, 2026, 9:00 AM"-style output. */
  dateTime(pattern?: string): this {
    this._format = pattern ? { kind: 'dateTime', pattern } : { kind: 'dateTime' }
    return this
  }

  /** Render the value as relative time ("5 minutes ago"). */
  since(): this {
    this._format = { kind: 'since' }
    return this
  }

  /** Format the value as currency. `currency` is the ISO 4217 code
   * (e.g. 'USD', 'EUR'). */
  money(currency: string, locale?: string): this {
    this._format = locale ? { kind: 'money', currency, locale } : { kind: 'money', currency }
    return this
  }

  /** Format the value as a decimal number. */
  numeric(opts: { decimals?: number; locale?: string } = {}): this {
    this._format = {
      kind: 'numeric',
      ...(opts.decimals !== undefined ? { decimals: opts.decimals } : {}),
      ...(opts.locale   !== undefined ? { locale:   opts.locale   } : {}),
    }
    return this
  }

  /** Truncate the cell to `chars` characters with an ellipsis. */
  limit(chars: number): this {
    this._format = { kind: 'limit', chars }
    return this
  }

  /** Custom per-row formatter — runs server-side inside `loadTableRecords`
   * and stashes the resulting string on `row._formatted[name]`. Wins
   * over the built-in `format` spec when both are set. */
  formatStateUsing(fn: FormatStateHandler): this {
    this._formatState = fn
    return this
  }

  /**
   * Per-column record-URL behavior. Pass `false` to opt this column out
   * of the table's row-level `recordUrl` — clicks on this column's cell
   * won't navigate. Pass a function to override with a column-specific
   * URL. Without calling this, the column inherits the table's
   * `recordUrl`.
   *
   * Filament parity: matches `Tables\Columns\Column::url(...)` and
   * `->recordUrl(false)` semantics.
   */
  recordUrl(target: false | ColumnRecordUrlHandler): this {
    this._recordUrl = target
    return this
  }

  /**
   * Attach summarizers (Sum / Average / Count / Range) to this column.
   * They render in a `<tfoot>` row under the column. Values are computed
   * server-side over the rows currently on screen — per-page only in
   * v1; cross-page aggregation is deferred.
   */
  summarize(summarizers: Summarizer[]): this {
    this._summarizers = summarizers
    return this
  }

  // ─── Column-type setter (subclass internal) ───────────

  protected setColumnType(t: ColumnType): this {
    this._columnType = t
    return this
  }

  // ─── Getters ──────────────────────────────────────────

  getLabel(): string {
    return this._label ?? this.name.charAt(0).toUpperCase() + this.name.slice(1)
  }
  isSortable(): boolean { return this._sortable }
  isSearchable(): boolean { return this._searchable }
  getColumnType(): ColumnType { return this._columnType }
  getFormatStateHandler(): FormatStateHandler | undefined { return this._formatState }
  hasFormatter(): boolean { return this._formatState !== undefined }
  getRecordUrlHandler(): ColumnRecordUrlHandler | undefined {
    return typeof this._recordUrl === 'function' ? this._recordUrl : undefined
  }
  hasRecordUrlHandler(): boolean { return typeof this._recordUrl === 'function' }
  isRecordUrlDisabled(): boolean { return this._recordUrl === false }
  getSummarizers(): ReadonlyArray<Summarizer> { return this._summarizers }
  hasSummarizers(): boolean { return this._summarizers.length > 0 }

  // ─── Serialization ────────────────────────────────────

  override getType(): string { return 'column' }

  override toMeta(): ColumnMeta {
    const meta: ColumnMeta = {
      type:       'column',
      name:       this.name,
      label:      this.getLabel(),
      sortable:   this._sortable,
      searchable: this._searchable,
    }
    // Only emit columnType when non-default to keep meta tidy.
    if (this._columnType !== 'text') meta.columnType = this._columnType
    if (this._alignment !== undefined) meta.alignment = this._alignment
    if (this._width     !== undefined) meta.width     = this._width
    if (this._default   !== undefined) meta.default   = this._default
    if (this._tooltip   !== undefined) meta.tooltip   = this._tooltip
    if (this._wrap)                    meta.wrap      = true
    if (this._lineClamp !== undefined) meta.lineClamp = this._lineClamp
    if (this._weight    !== undefined) meta.weight    = this._weight
    if (this._color     !== undefined) meta.color     = this._color
    if (this._format    !== undefined) meta.format    = this._format
    if (this._formatState !== undefined) meta.hasFormatter = true
    if (this._summarizers.length > 0) meta.summaries = this._summarizers.map(s => s.toMeta())
    if (this._recordUrl === false)        meta.recordUrl = false
    else if (typeof this._recordUrl === 'function') meta.recordUrl = true
    this.serializeExtras(meta)
    return meta
  }

  /** Hook for subclasses to add columnType-specific fields to the meta. */
  protected serializeExtras(_meta: ColumnMeta): void {}
}
