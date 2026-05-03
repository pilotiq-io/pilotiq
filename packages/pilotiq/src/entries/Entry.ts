import { Element, type ElementMeta } from '../schema/Element.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Per-record formatter callback. Receives the resolved state value and the
 * full record; returns the rendered string. Runs server-side at resolve
 * time — output is stamped on `EntryMeta._formatted` so the renderer can
 * skip re-running the format spec.
 */
export type EntryFormatStateHandler = (
  value:  unknown,
  record: Record<string, unknown>,
) => string

/** Built-in formatters — same shape as `ColumnFormat` so the renderer
 *  reuses `applyColumnFormat()` unchanged. */
export type EntryFormat =
  | { kind: 'dateTime'; pattern?: string }
  | { kind: 'since' }
  | { kind: 'money';    currency: string; locale?: string }
  | { kind: 'numeric';  decimals?: number; locale?: string }
  | { kind: 'limit';    chars: number }

export type EntryWeight = 'normal' | 'medium' | 'semibold' | 'bold'
export type EntryColor  = 'default' | 'muted' | 'primary' | 'destructive' | 'success' | 'warning' | 'info'
export type EntrySize   = 'xs' | 'sm' | 'base' | 'lg' | 'xl'

/**
 * JSON shape sent to the client for every entry. Subclasses extend the
 * union via `entryType` (`'text' | 'badge' | 'icon' | 'image'`) and
 * tack on subclass-specific keys without further widening.
 */
export interface EntryMeta extends ElementMeta {
  type:        'entry'
  entryType:   string
  name:        string
  label:       string
  value:       unknown
  inlineLabel?: boolean
  default?:    string
  helperText?: string
  tooltip?:    string
  weight?:     EntryWeight
  color?:      EntryColor
  size?:       EntrySize
  format?:     EntryFormat
  copyable?:   { label?: string }
  /**
   * Server-evaluated `formatStateUsing` output. The renderer prefers this
   * over re-applying `format` when present (mirrors the `Column._formatted`
   * convention from Plan #2).
   */
  _formatted?: string
  lineClamp?:  number
  wrap?:       boolean
}

/**
 * Read-only sibling of `Field`. Renders a label-value pair on `ViewPage`
 * (or anywhere `Resource.detail()` returns elements).
 *
 * Entries resolve their value from `ctx.record[name]` at meta-build time
 * — they're inert templates with no input components, no validators, no
 * submit chrome. The cosmetic surface (`color / weight / size / tooltip`)
 * mirrors the `Column` chrome so rows of a table and detail-page entries
 * stay visually consistent.
 *
 * Subclasses set the `entryType` discriminator (`'text' | 'badge' | …`)
 * which the renderer dispatches on; everything else lives on the base.
 */
export abstract class Entry extends Element {
  protected _name: string
  protected _label?: string
  protected _inlineLabel = false
  protected _default?: string
  protected _helperText?: string
  protected _tooltip?: string
  protected _weight?: EntryWeight
  protected _color?:  EntryColor
  protected _size?:   EntrySize
  protected _format?: EntryFormat
  protected _formatState?: EntryFormatStateHandler
  protected _copyable?: { label?: string }
  protected _lineClamp?: number
  protected _wrap = false

  protected constructor(name: string) {
    super()
    this._name = name
  }

  /** Subclasses set the wire-side discriminator (`'text' | 'badge' | …`). */
  protected abstract getEntryType(): string

  getType(): string { return 'entry' }
  getName(): string { return this._name }

  // ─── Chrome ───────────────────────────────────────────

  /** Override the auto-derived label. Default = startCase of `name`. */
  label(text: string): this { this._label = text; return this }

  /** Render label to the left of the value rather than above it. */
  inlineLabel(v = true): this { this._inlineLabel = v; return this }

  /** Fallback string when the resolved value is null / undefined / empty. */
  default(s: string): this { this._default = s; return this }
  /** Alias matching the field-side spelling. */
  placeholder(s: string): this { return this.default(s) }

  helperText(text: string): this { this._helperText = text; return this }
  tooltip(text: string): this   { this._tooltip = text; return this }

  weight(w: EntryWeight): this { this._weight = w; return this }
  color(c: EntryColor): this   { this._color = c; return this }
  size(s: EntrySize): this     { this._size = s; return this }

  /** Truncate the value with an ellipsis when it spills onto more than `n`
   *  lines (CSS `-webkit-line-clamp`). Mutually exclusive with `wrap()`. */
  lineClamp(n: number): this { this._lineClamp = n; return this }

  /** Allow the value to wrap onto multiple lines. Without this the value
   *  is rendered with `whitespace-nowrap`. */
  wrap(v = true): this { this._wrap = v; return this }

  // ─── Built-in formatters (mirrors Column) ─────────────

  dateTime(pattern?: string): this {
    this._format = pattern ? { kind: 'dateTime', pattern } : { kind: 'dateTime' }
    return this
  }

  since(): this {
    this._format = { kind: 'since' }
    return this
  }

  money(currency: string, locale?: string): this {
    this._format = locale ? { kind: 'money', currency, locale } : { kind: 'money', currency }
    return this
  }

  numeric(opts: { decimals?: number; locale?: string } = {}): this {
    this._format = {
      kind: 'numeric',
      ...(opts.decimals !== undefined ? { decimals: opts.decimals } : {}),
      ...(opts.locale   !== undefined ? { locale:   opts.locale   } : {}),
    }
    return this
  }

  limit(chars: number): this {
    this._format = { kind: 'limit', chars }
    return this
  }

  /** Per-record formatter — receives the resolved state value and the full
   *  record, returns the display string. Wins over `format` when both are
   *  set (output stamped on `_formatted`). */
  formatStateUsing(fn: EntryFormatStateHandler): this {
    this._formatState = fn
    return this
  }

  /** Render a copy-icon button next to the value. v1 copies via the
   *  client `navigator.clipboard.writeText` of the *raw* state value, or
   *  the formatted string when `formatStateUsing` is set. */
  copyable(label?: string): this {
    this._copyable = label !== undefined ? { label } : {}
    return this
  }

  // ─── Resolution ───────────────────────────────────────

  /** Read the state value out of the loaded record (or values map). Plain
   *  `record[name]`; nested-path support deferred to a follow-up. */
  resolveValue(ctx?: RenderContext): unknown {
    const record = ctx?.record as Record<string, unknown> | undefined
    if (record === undefined || record === null) return undefined
    return record[this._name]
  }

  /** Default label = startCase of the attribute name. */
  protected deriveLabel(): string {
    if (this._label !== undefined) return this._label
    if (!this._name) return ''
    return this._name
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]+/g, ' ')
      .replace(/^./, c => c.toUpperCase())
      .trim()
  }

  /**
   * Build the wire-side meta. Subclasses override to add type-specific
   * keys; all should call `super.toMeta(ctx)` first and spread.
   *
   * Async because `formatStateUsing` may want to await a lookup; v1
   * callers pass synchronous handlers but the contract leaves room.
   */
  toMeta(ctx?: RenderContext): EntryMeta | Promise<EntryMeta> {
    const value  = this.resolveValue(ctx)
    const record = (ctx?.record ?? {}) as Record<string, unknown>

    const meta: EntryMeta = {
      type:      'entry',
      entryType: this.getEntryType(),
      name:      this._name,
      label:     this.deriveLabel(),
      value,
    }
    if (this._inlineLabel)               meta.inlineLabel = true
    if (this._default !== undefined)     meta.default     = this._default
    if (this._helperText !== undefined)  meta.helperText  = this._helperText
    if (this._tooltip !== undefined)     meta.tooltip     = this._tooltip
    if (this._weight !== undefined)      meta.weight      = this._weight
    if (this._color  !== undefined)      meta.color       = this._color
    if (this._size   !== undefined)      meta.size        = this._size
    if (this._format !== undefined)      meta.format      = this._format
    if (this._copyable !== undefined)    meta.copyable    = this._copyable
    if (this._lineClamp !== undefined)   meta.lineClamp   = this._lineClamp
    if (this._wrap)                      meta.wrap        = true

    if (this._formatState) {
      try {
        meta._formatted = this._formatState(value, record)
      } catch {
        // Fail-soft — drop the formatted string and let the client fall
        // back to the raw value or built-in `format`. Matches the
        // posture of `Column.formatStateUsing` (errors don't crash the
        // page-data builder).
      }
    }

    return meta
  }
}

/** Type guard mirroring `isServerDataElement` / `isRepeaterField`. Lets
 *  walkers branch on entries without `instanceof`-tripping over Vite
 *  module-cache duplication (`feedback_vite_ssr_module_dup_instanceof`). */
export function isEntry(el: Element): el is Entry {
  return el.getType() === 'entry'
}
