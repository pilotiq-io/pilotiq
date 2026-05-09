import { Element, type ElementMeta } from './schema/Element.js'
import { Summarizer, type SummarizerMeta } from './summarizers/Summarizer.js'
import type { SanitizeConfig } from './schema/sanitize.js'
import type {
  Validator,
  ValidatorContext,
  SerializedRule,
} from './validation/Validator.js'

/** Cell content alignment. Maps to text-{start|center|end} on the cell. */
export type ColumnAlignment = 'start' | 'center' | 'end'

/** Visual variant. The default `text` covers most cases — formatters
 * (dateTime / money / since / numeric / limit) layer on top.
 * `badge` / `icon` / `boolean` / `image` are subclasses that change
 * how the cell is *rendered* rather than just *formatted*.
 * `textInput` / `toggle` / `select` are inline-edit subclasses — the
 * renderer mounts an interactive control that PATCHes a single column
 * via `POST {base}/{slug}/:id/_cell/:column`. */
export type ColumnType =
  | 'text' | 'badge' | 'icon' | 'boolean' | 'image' | 'color'
  | 'textInput' | 'toggle' | 'select'

/** Per-row predicate for `Column.disabled(fn)` — evaluated server-side
 * inside `loadTableRecords` so the renderer just reads the result. */
export type ColumnDisabledFn = (record: Record<string, unknown>) => boolean

/** Context handed to `Column.beforeStateUpdated / afterStateUpdated`
 *  hooks on editable cell columns. `record` is the row as loaded
 *  *before* the update; `user` is the resolved panel user. */
export interface CellStateHookContext {
  record: Record<string, unknown>
  user?:  unknown
}

/** Hook signature for `Column.beforeStateUpdated / afterStateUpdated`.
 *  Return value is ignored — these are side-effect hooks. Throw an
 *  Error to halt the PATCH; the thrown message lands under `errors._cell`
 *  in the 422 response so the renderer can surface it next to the cell. */
export type CellStateHook = (
  value: unknown,
  ctx:   CellStateHookContext,
) => void | Promise<void>

/** SelectColumn option shape — mirrors `SelectField`'s static option form. */
export interface ColumnSelectOption {
  value: string
  label: string
}

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
  | { kind: 'words';    words: number }

/** Rich-text column kind — server-rendered HTML stamped per row.
 * Markdown values run through `marked` first; HTML values pass straight
 * to `sanitize-html`. Both honor `_sanitize` (default `true`). */
export type ColumnRichTextKind = 'markdown' | 'html'

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
  /** Render array values one-per-line (each item separated by `<br>`).
   * Composes with `bulleted()` — when both are set, `bulleted()` wins
   * and the renderer mounts a `<ul>` with bullet markers instead. */
  listWithLineBreaks?: true
  /** Render array values as a `<ul>` bullet list. Wins over
   * `listWithLineBreaks()` when both are set. */
  bulleted?: true
  /** Mounts a copy-to-clipboard trigger after the cell value. The string
   * is the toast message shown after a successful copy (default
   * `"Copied!"` when bare `.copyable()` is used). */
  copyMessage?: string
  /** Server-rendered rich-text discriminator. When set, the renderer
   * reads the rendered HTML from `row._formatted[col.name]` and
   * dangerouslySetsInnerHTML it (matches the existing Tiptap richtext
   * cell path). The kind drives server-side rendering — `markdown` runs
   * through `marked` first; `html` is passthrough. Sanitization applies
   * to both unless the column opts out. */
  richText?: ColumnRichTextKind
  /**
   * Per-column record-URL behavior. The default (absent) means the cell
   * inherits the table's `recordUrl` for click navigation. `false` opts
   * the column out — clicks on this column's cell don't navigate anywhere.
   * `true` means the column has its own URL handler; the resolved URL
   * is stamped onto each row under `row._columnRecordUrls[columnName]`.
   */
  recordUrl?: boolean
  // ─── Editable cell columns (TextInput / Toggle / Select) ───
  /** Confirmation message — when set, the renderer gates the PATCH
   * behind a Dialog confirm before firing. */
  confirm?: string
  /** Static disable. Per-row disable (`disabled(fn)`) lands on the row
   * under `row._cellDisabled[columnName]` — not on the column meta. */
  disabled?: true
  /** Mirrored validator descriptors — same shape as `FieldMeta.rules`,
   * for client-side hint rendering. The actual rules run server-side
   * inside the `_cell` route. */
  rules?: SerializedRule[]
  /** Default debounce (ms) for committed-after-typing PATCHes on
   * `TextInputColumn`. Stamped on the meta only when explicitly set;
   * the renderer falls back to its own default. */
  debounceMs?: number
  // Subclass-specific extras land in `_extra` to keep the meta typed.
  // BadgeColumn — value-to-color map.
  badgeColors?: Record<string, string>
  // IconColumn — value-to-{icon,color} map.
  iconOptions?: Record<string, { icon: string; color?: string }>
  // ImageColumn — sizing.
  imageSize?:  number
  imageShape?: 'square' | 'circle'
  // ColorColumn — swatch shape + value-text suppression.
  colorShape?:     'rounded' | 'square' | 'circle'
  colorHideValue?: true
  // TextInputColumn.
  inputType?:        'text' | 'number' | 'email' | 'url' | 'tel'
  inputPlaceholder?: string
  inputStep?:        number
  inputMin?:         number
  inputMax?:         number
  // ToggleColumn.
  toggleOnColor?:  ColumnColor
  toggleOffColor?: ColumnColor
  toggleOnIcon?:   string
  toggleOffIcon?:  string
  // SelectColumn.
  selectOptions?:  ColumnSelectOption[]
  selectNullable?: true
  /** Hide the placeholder option once a value is set. Default: keep
   * showing it so users can clear the value (matches Filament). */
  selectablePlaceholder?: false
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

  // Rich-display chrome (Filament-parity Tier-2). All optional, all
  // emit-only-when-set — the wire shape stays tidy on the bare-text path.
  protected _listWithLineBreaks = false
  protected _bulleted = false
  protected _copyMessage?: string
  // Rich-text rendering — either `'markdown'` or `'html'`. The dispatcher
  // server-renders the cell + stamps `_formatted[name] / _richtextCells[name]`.
  protected _richText?: ColumnRichTextKind
  protected _sanitize: boolean | SanitizeConfig = true

  // ─── Editable cell columns (TextInput / Toggle / Select) ───
  // Per-cell PATCH validators — same shape as Field validators. Only
  // consulted when the column is editable (the route handler reads
  // them server-side). Inert on read-only columns.
  protected _required = false
  protected _validators: Validator[] = []
  protected _confirm?: string
  protected _staticDisabled = false
  protected _disabledFn?: ColumnDisabledFn
  protected _beforeStateUpdated?: CellStateHook
  protected _afterStateUpdated?:  CellStateHook

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

  /**
   * Truncate the cell to `n` words with an ellipsis. Splits on whitespace
   * runs (`/\s+/`) — empty lead/trail tokens collapse so a value like
   * `"  hello world  "` truncates the same as `"hello world"`. Composes
   * mutually-exclusively with `limit()` and `characters()` (each
   * formatter overwrites the previous one — last call wins).
   */
  words(n: number): this {
    this._format = { kind: 'words', words: n }
    return this
  }

  /**
   * Filament-parity alias for `limit(n)`. Same wire shape — both call
   * sites read better depending on whether you're capping by character
   * count or word count.
   */
  characters(n: number): this { return this.limit(n) }

  /**
   * Render array values one-per-line. Non-array values pass through
   * unchanged. Composes with `bulleted()` — when both are set,
   * `bulleted()` wins (bullet list is the strictly richer presentation;
   * line breaks become implicit).
   */
  listWithLineBreaks(v = true): this { this._listWithLineBreaks = v; return this }

  /**
   * Render array values as a `<ul>` bullet list. Non-array values pass
   * through unchanged. Wins over `listWithLineBreaks()` when both are
   * set.
   */
  bulleted(v = true): this { this._bulleted = v; return this }

  /**
   * Mount a copy-to-clipboard trigger next to the cell value. The
   * `message` (default `"Copied!"`) is the toast shown after a
   * successful copy. The button copies the rendered cell text — for
   * rich-text cells (`markdown() / html()`) the underlying source is
   * copied instead of the rendered HTML so users get the version they
   * can re-edit. Bare `copyMessage()` opts in with the default copy.
   */
  copyMessage(message?: string): this {
    this._copyMessage = message ?? 'Copied!'
    return this
  }

  /**
   * Render the cell's value as Markdown — server-runs through `marked`
   * (already a dep of pilotiq from `Markdown` prime) and the result
   * lands as sanitized HTML in `row._formatted[name]` with
   * `_richtextCells[name] = true`. The renderer recognizes the flag and
   * mounts the cell via `dangerouslySetInnerHTML` against the same
   * `prose-sm` container the Tiptap richtext path uses.
   *
   * Mutually exclusive with `html()` — the last call wins. Pair with
   * `.allowRaw()` / `.sanitize({ allowedTags: [...] })` to relax the
   * default-secure allowlist for admin-trusted content.
   */
  markdown(v = true): this {
    if (v) this._richText = 'markdown'
    else delete this._richText
    return this
  }

  /**
   * Render the cell's value as raw HTML — passes straight through
   * `sanitize-html` against the default-secure allowlist (no Markdown
   * conversion). Mutually exclusive with `markdown()`.
   */
  html(v = true): this {
    if (v) this._richText = 'html'
    else delete this._richText
    return this
  }

  /**
   * Sanitization control for `markdown()` / `html()` cells. Default
   * `true` — runs the rendered HTML through `DEFAULT_SANITIZE_CONFIG`
   * before the wire shape ships. Pass `false` (or call `.allowRaw()`)
   * to disable; pass a `sanitize-html` config to widen the allowlist
   * (e.g. legacy CMS content with embedded media). Mirrors the
   * `Markdown` / `Html` prime APIs so authors can carry the same
   * intuition into a column context.
   */
  sanitize(v: boolean | SanitizeConfig = true): this {
    this._sanitize = v
    return this
  }

  /** Sugar — opt out of the default-secure sanitizer. */
  allowRaw(): this { this._sanitize = false; return this }

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

  // ─── Editable cell columns ────────────────────────────
  // These are no-ops on read-only column types but live on the base so
  // subclass authors don't need to redeclare. `isEditable()` derives
  // from `_columnType` — TextInputColumn / ToggleColumn / SelectColumn
  // call `setColumnType()` in their `make()` factory.

  /** Mark the value as required for inline edits. Auto-contributes a
   * required check unless `validate(required())` is already present
   * (matches `Field.required()` semantics — see `hasRequiredValidator`). */
  required(v = true): this { this._required = v; return this }

  /**
   * Attach one or more server-side validators. Reuses the same `Validator`
   * type used by `Field.validate()` so existing rules (`required`, `email`,
   * `minLength`, `unique`, …) work unchanged. Validators run inside the
   * `POST {…}/_cell/:column` route before `R.model.update`; on failure
   * the response is `422 { ok:false, errors: { value: string[] } }`.
   */
  validate(v: Validator | Validator[]): this {
    if (Array.isArray(v)) this._validators.push(...v)
    else this._validators.push(v)
    return this
  }

  /**
   * Gate the PATCH behind a confirm dialog. Renderer opens a Dialog with
   * `message` before firing the network call; cancel rolls back the
   * optimistic local state.
   */
  confirm(message: string): this { this._confirm = message; return this }

  /**
   * Run a hook on the server BEFORE the editable cell's value is written
   * to the database. Receives the coerced + validated value plus the
   * current row as `{ record, user }`. Use for cross-cell invariants,
   * audit-log writes that must precede the update, or async availability
   * checks that the schema-level validators don't cover. Throw an Error
   * to halt — the thrown message lands under the reserved `_cell` error
   * key in the 422 response.
   */
  beforeStateUpdated(fn: CellStateHook): this { this._beforeStateUpdated = fn; return this }

  /**
   * Run a hook on the server AFTER the editable cell's value is written
   * to the database. Same context shape as `beforeStateUpdated`. Use for
   * notifications, broadcast events, or follow-up writes that should
   * fire only on a confirmed save. Throwing here returns 422 with the
   * message under `_cell` — the row is already updated, so prefer
   * surfacing the error and letting the user retry rather than rolling
   * back manually.
   */
  afterStateUpdated(fn: CellStateHook): this { this._afterStateUpdated = fn; return this }

  getBeforeStateUpdated(): CellStateHook | undefined { return this._beforeStateUpdated }
  getAfterStateUpdated():  CellStateHook | undefined { return this._afterStateUpdated }

  /**
   * Render the inline-edit control disabled. Pass `true` (or call with no
   * args) for static disable; pass a `(record) => boolean` predicate for
   * per-row disable — evaluated server-side inside `loadTableRecords`,
   * stashed under `row._cellDisabled[columnName]`.
   *
   * Independent from `R.canEdit(user, record)` — the auth check fires
   * regardless and a forbidden record never sees an editable affordance.
   */
  disabled(value: boolean | ColumnDisabledFn = true): this {
    if (typeof value === 'function') {
      this._disabledFn = value
      this._staticDisabled = false
    } else {
      this._staticDisabled = value
      delete this._disabledFn
    }
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
  /** True when a built-in `format` spec (`dateTime / since / money /
   *  numeric / limit`) is configured. Used by walkers that want to skip
   *  columns the user has already chosen formatting for. */
  hasFormat(): boolean { return this._format !== undefined }
  getRecordUrlHandler(): ColumnRecordUrlHandler | undefined {
    return typeof this._recordUrl === 'function' ? this._recordUrl : undefined
  }
  hasRecordUrlHandler(): boolean { return typeof this._recordUrl === 'function' }
  isRecordUrlDisabled(): boolean { return this._recordUrl === false }
  getSummarizers(): ReadonlyArray<Summarizer> { return this._summarizers }
  hasSummarizers(): boolean { return this._summarizers.length > 0 }

  /** Rich-text discriminator. Used by `dispatchTable` to decide whether
   * to server-render the cell value through `marked` + `sanitize-html`. */
  getRichTextKind(): ColumnRichTextKind | undefined { return this._richText }
  isRichText(): boolean { return this._richText !== undefined }
  getSanitize(): boolean | SanitizeConfig { return this._sanitize }

  // ─── Editable getters ─────────────────────────────────

  /** True for `TextInputColumn / ToggleColumn / SelectColumn`. The route
   * handler + `dispatchTable` per-row stamping consult this. */
  isEditable(): boolean {
    return this._columnType === 'textInput'
      || this._columnType === 'toggle'
      || this._columnType === 'select'
  }

  /** Resolve per-row disable for an editable cell. Returns `true` when
   * the static flag is set or the optional predicate returns truthy.
   * Errors in the predicate fail closed (disabled) — silently swallowing
   * a save attempt is the worse outcome here. */
  isDisabledFor(record: Record<string, unknown>): boolean {
    if (this._staticDisabled) return true
    if (this._disabledFn) {
      try { return Boolean(this._disabledFn(record)) }
      catch { return true }
    }
    return false
  }

  isRequired(): boolean { return this._required }
  getValidators(): ReadonlyArray<Validator> { return this._validators }

  /** Run the column's validators against a candidate value. Mirrors
   * `Field.runValidators` — including the implicit required check when
   * `_required` is set without an explicit `required()` validator. */
  async runValidators(value: unknown, ctx?: ValidatorContext): Promise<string[]> {
    const errors: string[] = []
    if (this._required && !this.hasRequiredValidator()) {
      if (value === undefined || value === null || value === '') {
        errors.push('This field is required')
      }
    }
    for (const v of this._validators) {
      const result = await v(value, ctx)
      if (result) errors.push(result)
    }
    return errors
  }

  private hasRequiredValidator(): boolean {
    return this._validators.some(v => v.serialized?.rule === 'required')
  }

  /** Serialized rule descriptors mirrored to the client. */
  protected getSerializedRules(): SerializedRule[] {
    const rules: SerializedRule[] = []
    if (this._required && !this.hasRequiredValidator()) {
      rules.push({ rule: 'required', message: 'This field is required' })
    }
    for (const v of this._validators) {
      if (v.serialized) rules.push(v.serialized)
    }
    return rules
  }

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
    if (this._listWithLineBreaks)        meta.listWithLineBreaks = true
    if (this._bulleted)                  meta.bulleted = true
    if (this._copyMessage !== undefined) meta.copyMessage = this._copyMessage
    if (this._richText !== undefined)    meta.richText = this._richText
    if (this._recordUrl === false)        meta.recordUrl = false
    else if (typeof this._recordUrl === 'function') meta.recordUrl = true
    // Editable cell columns — chrome that the renderer needs to mount
    // the right inline control. Per-row `_cellEditable / _cellEditUrls /
    // _cellDisabled` are stamped onto each row by `loadTableRecords` +
    // `tagCellEditUrls` and aren't part of the column's static meta.
    if (this.isEditable()) {
      if (this._confirm !== undefined) meta.confirm = this._confirm
      if (this._staticDisabled) meta.disabled = true
      const rules = this.getSerializedRules()
      if (rules.length > 0) meta.rules = rules
    }
    this.serializeExtras(meta)
    return meta
  }

  /** Hook for subclasses to add columnType-specific fields to the meta. */
  protected serializeExtras(_meta: ColumnMeta): void {}
}
