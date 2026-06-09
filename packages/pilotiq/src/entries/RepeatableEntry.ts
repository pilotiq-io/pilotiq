import { Element, type ElementMeta } from '../schema/Element.js'
import { Entry, type EntryMeta } from './Entry.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Header descriptor for `RepeatableEntry.table([...])` mode. One entry per
 * inner schema element, in declaration order — column[i] is the header for
 * `schema[i]`. Mirrors `RepeaterTableColumn` so the two surfaces read the
 * same; kept as a separate type so future divergences (e.g. `width()` on a
 * read-only column) can land here without touching the form-side field.
 *
 * `alignment` aligns header text + cell contents (cells use `text-*`).
 * `width` is a raw CSS width string passed to `<col style="width: …">`.
 */
export interface RepeatableEntryTableColumn {
  label:       string
  alignment?:  'left' | 'center' | 'right'
  width?:      string
}

/**
 * One resolved row of a `RepeatableEntry`. `id` is a stable per-row key
 * (read from the row's `id`-ish field if present, otherwise the row index)
 * so React reconciliation behaves on reorder. `children` is the resolved
 * inner schema, scoped to this row's record.
 */
export interface RepeatableEntryRowMeta {
  id:       string
  children: ElementMeta[]
}

export interface RepeatableEntryMeta extends EntryMeta {
  rows:        RepeatableEntryRowMeta[]
  /** Column count for the inner schema *inside* one card (mirrors
   *  `Repeater.columns`). Ignored under `table` mode. */
  columns?:    number
  /** Number of cards across (≥ 2). Ignored under `table` mode. */
  grid?:       number
  /** Compact `<table>` layout — supplied headers map 1:1 to inner schema
   *  fields by declaration order. Mutually exclusive with `columns / grid`
   *  (the renderer picks the most specific layout — `table > grid > stack`). */
  table?:      { columns: RepeatableEntryTableColumn[] }
  /** When `false`, strips the outer card chrome — useful when each row is
   *  already self-contained (e.g. a single `Section.aside()` per row). */
  contained?:  boolean
}

/**
 * Read-only sibling of `RepeaterField`. Renders an array stored on the
 * record (`ctx.record[name]`) as a stack of cards (default), an n-column
 * grid (`grid(n)`), or a compact HTML table (`table([…])`), with the inner
 * schema resolved once per row against that row's record.
 *
 * Each row's children resolve with `ctx.record` set to the row's data, so
 * inner entries (`TextEntry / BadgeEntry / IconEntry / ImageEntry / …`) read
 * their state via the same `record[name]` lookup they use everywhere else.
 *
 * `RepeatableEntry` does not coerce or validate — the value at
 * `ctx.record[name]` is read as-is. Non-array / null / undefined / empty-
 * array values render the inherited `default()` placeholder.
 *
 * @example
 * RepeatableEntry.make('lineItems').schema([
 *   TextEntry.make('description'),
 *   TextEntry.make('quantity').numeric(),
 *   TextEntry.make('total').money('USD'),
 * ]).table([
 *   { label: 'Item' },
 *   { label: 'Qty', alignment: 'right' },
 *   { label: 'Total', alignment: 'right' },
 * ])
 */
export class RepeatableEntry extends Entry {
  protected override _children: Element[] = []

  private _columns?:      number
  private _grid?:         number
  private _tableColumns?: RepeatableEntryTableColumn[]
  private _contained     = true

  private constructor(name: string) {
    super(name)
  }

  static make(name: string): RepeatableEntry {
    return this.configured(new RepeatableEntry(name))
  }

  protected override getEntryType(): string { return 'repeatable' }

  /** Inner schema rendered per row. */
  schema(elements: Element[]): this {
    this._children = elements
    return this
  }

  /** Grid column count for the inner schema *inside* one card (mirrors
   *  `Repeater.columns`). Ignored under table mode. */
  columns(n: number): this { this._columns = n; return this }

  /**
   * Lay the rows themselves in an n-column grid. Mirrors `Repeater.grid(n)`
   * but read-only and v1 only takes a fixed integer (the responsive object
   * form on Repeater is a form-side ergonomic — defer until asked).
   *
   * `n < 2` resets to vertical stack (the default).
   */
  grid(n: number): this {
    if (n >= 2) this._grid = n
    else delete this._grid
    return this
  }

  /**
   * Compact `<table>` layout — one `<tr>` per row, one `<td>` per inner
   * entry, with the supplied headers above. Columns map 1:1 to inner
   * schema entries by declaration order.
   *
   * Mutually exclusive with `columns / grid` at render time (the renderer
   * dispatches `table > grid > stack`). Pass an empty array to clear.
   */
  table(columns: RepeatableEntryTableColumn[]): this {
    if (columns.length === 0) delete this._tableColumns
    else this._tableColumns = columns
    return this
  }

  /**
   * Toggle the outer card chrome. `contained(false)` drops the card border
   * + padding so each row sits flush — useful when the inner schema brings
   * its own visual container (a `Section.aside()` per row, say).
   */
  contained(v = true): this { this._contained = v; return this }

  // ─── Read-only access for the resolver ──────────────────

  override getChildren(): Element[] | undefined {
    return this._children.length > 0 ? this._children : undefined
  }

  /** Direct access to the inner schema — used by `resolveRepeatableRows`. */
  getInnerSchema(): Element[] { return this._children }

  getColumns():      number | undefined                    { return this._columns }
  getGrid():         number | undefined                    { return this._grid }
  getTableColumns(): RepeatableEntryTableColumn[] | undefined { return this._tableColumns }
  isContained():     boolean                               { return this._contained }

  override async toMeta(ctx?: RenderContext): Promise<RepeatableEntryMeta> {
    const meta = await Promise.resolve(super.toMeta(ctx)) as RepeatableEntryMeta
    meta.rows = []
    if (this._columns      !== undefined) meta.columns = this._columns
    if (this._grid         !== undefined) meta.grid    = this._grid
    if (this._tableColumns !== undefined) meta.table   = { columns: this._tableColumns }
    if (!this._contained)                 meta.contained = false
    return meta
  }
}

/** Read a row's stable id off common conventions; falls back to the row
 *  index when the row carries no id-ish field. Mirrors `readRowId` over in
 *  `resolveSchema.ts` but inlined here so the entry layer doesn't depend on
 *  Repeater internals. */
export function readRepeatableRowId(row: unknown, fieldName: string, index: number): string {
  if (row && typeof row === 'object' && !Array.isArray(row)) {
    const r = row as Record<string, unknown>
    const candidate = r['id'] ?? r['__id'] ?? r['uuid']
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      return String(candidate)
    }
  }
  return `${fieldName}-${index}`
}
