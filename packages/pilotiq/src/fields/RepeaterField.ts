import { Element, type ElementMeta, type LayoutContext } from '../schema/Element.js'
import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'
import type { Action, ActionMeta } from '../actions/Action.js'

/**
 * Function evaluated once per row at meta-build to derive a human-readable
 * label for the collapsed-row header. Called with the row's submitted values
 * (or `{}` on a fresh blank row); should return a short string. Errors are
 * swallowed and the renderer falls back to the row index.
 */
export type RepeaterItemLabel = (row: Record<string, unknown>) => string

/**
 * Header descriptor for `Repeater.table([...])` mode. One entry per inner
 * schema field, in declaration order — column[i] is the header for
 * `schema[i]`. Object literal (not a class) to keep the surface lean;
 * promote to a builder class if we ever need chaining or async resolvers.
 *
 * `alignment` aligns header text + cell contents (cells use `text-*`).
 * `width` is a raw CSS width string passed to `<col style="width: …">`.
 * `required` adds a red asterisk after the header label — purely visual,
 * doesn't affect validation (the inner field's own `required()` does).
 */
export interface RepeaterTableColumn {
  label:       string
  alignment?:  'left' | 'center' | 'right'
  width?:      string
  required?:   boolean
}

/**
 * Per-row visibility rule. Either a literal `boolean` or a callback receiving
 * a row-scoped `LayoutContext`. The context's `values / $get / $set / row` are
 * row-local; `record / user` mirror the parent form's render context.
 *
 * Returning truthy hides the row. The renderer keeps hidden rows mounted with
 * `display: none` so their inputs (and `__id`) round-trip through FormData
 * unchanged — visibility is purely UX, never a data filter.
 *
 * Throwing predicates fail-closed-as-visible (i.e. row stays visible) and log
 * a warning. We choose the inverse posture from `Element.evaluateVisibility`
 * because a misbehaving `itemHidden` should not silently hide rows the user
 * thinks they're editing.
 */
export type RepeaterItemHiddenRule =
  | boolean
  | ((ctx: LayoutContext) => boolean | Promise<boolean>)

/**
 * Resolved metadata for a single Repeater row. `id` is a stable identifier
 * scoped to the form render — survives reorder + clone client-side and is
 * round-tripped through a hidden `__id` value on submit so the renderer
 * keeps stable React keys across SSR / SPA / partial-resolve cycles.
 *
 * `children` is the resolved inner schema (resolved with row-scoped values).
 * Renderers iterate `rows` and feed each `children` array to `SchemaRenderer`.
 *
 * `hidden` is set when `itemHidden(rule)` resolved truthy for this row; the
 * renderer keeps the row mounted but hides its chrome + body so values still
 * round-trip on submit.
 */
export interface RepeaterRowMeta {
  id:        string
  children:  ElementMeta[]
  itemLabel?: string
  hidden?:   boolean
  /**
   * Resolved per-row action metas for `extraItemActions(...)`. Empty or
   * absent when the field has no extra actions, OR when every action's
   * visibility rule resolved false for this row. The renderer mounts these
   * in the row header alongside clone/delete; clicking dispatches the
   * action with `_rowPath = "<fieldName>.<index>"` so the server can
   * reconstruct the row-scoped handler context.
   */
  extraActions?: ActionMeta[]
}

export interface RepeaterFieldMeta extends FieldMeta {
  fieldType:        'repeater'
  rows:             RepeaterRowMeta[]
  /** Zero-row blueprint for the client's Add button. */
  template:         ElementMeta[]
  columns?:         number
  minItems?:        number
  maxItems?:        number
  defaultItems?:    number
  reorderable?:     boolean
  collapsible?:     boolean
  defaultCollapsed?: boolean
  /**
   * Set when `Repeater.accordion()` is configured. The renderer replaces
   * the per-row collapsed map with a single "open row id" slot — picking
   * row N collapses every other row. Implies `collapsible: true` (the
   * accordion ergonomic only makes sense over a collapsible repeater).
   */
  accordion?:       boolean
  cloneable?:       boolean
  addActionLabel?:  string
  /**
   * Set when `Repeater.simple(field)` is configured. Tells the renderer
   * to drop the per-row chrome (header, clone, collapse) and lay the
   * single inner field out flush with a trash button on each row. The
   * wire format is unchanged — `<name>.<i>.<innerName>` — only the
   * stored shape differs (`[v]` instead of `[{name: v}]`).
   */
  simple?:          boolean
  /**
   * Set when `Repeater.grid(n)` is configured (n ≥ 2). Lays the ROWS
   * themselves in an n-column grid (different from `columns(n)` which
   * grids the inner schema *inside* a row). Useful for tile-style
   * pickers / member cards / icon palettes. Renderer swaps the outer
   * `flex flex-col` container for a CSS grid and skips the drag-drop
   * indicator in grid mode (the horizontal bar reads wrong across
   * grid cells); button reorder still works.
   */
  grid?:            number
  /**
   * Set when `Repeater.table([...])` is configured. Renders rows as
   * `<tr>` and inner fields as `<td>`, with the supplied column
   * headers in a `<thead>`. Useful for compact uniform-row repeaters.
   * Mutually exclusive with `simple` (single-field shape conflicts)
   * and with `grid` (different layout); collapsible/accordion are
   * meaningless on `<tr>` rows so the renderer ignores them. The
   * inner schema's field labels are suppressed via `[&_label]:sr-only`
   * so headers carry the labelling. `clone / delete / extraActions`
   * land in a final actions cell when configured.
   */
  table?:           {
    columns: RepeaterTableColumn[]
  }
}

/**
 * Array-of-subschema field. The author composes an inner schema once via
 * `.schema([...])`; the rendered form lets the end user add / remove /
 * reorder rows of that schema.
 *
 * Storage on the parent record is a plain array of objects:
 * `[{ field1, field2 }, …]`. No special wrapper, no `position` column,
 * no per-row identity persistence.
 *
 * `toMeta` resolves the inner schema once per submitted row, plus a
 * zero-row template for the client's Add button. `coerceFormValues` and
 * `validateSchema` recurse into the rows using `<name>.<i>.<childName>`
 * dotted keys for both flat form-encoded bodies and JSON bodies.
 *
 * Plan #14.
 */
export class RepeaterField extends Field {
  protected override _children: Element[] = []

  private _columns?:         number
  private _minItems?:        number
  private _maxItems?:        number
  private _defaultItems     = 1
  private _reorderable      = false
  private _collapsible      = false
  private _defaultCollapsed = false
  private _accordion        = false
  private _cloneable        = false
  private _addActionLabel?:  string
  private _itemLabel?:       RepeaterItemLabel
  private _itemHidden?:      RepeaterItemHiddenRule
  private _extraItemActions: Action[] = []
  private _simple           = false
  private _grid?:            number
  private _tableColumns?:    RepeaterTableColumn[]

  private constructor(name: string) {
    super(name, 'repeater')
  }

  static make(name: string): RepeaterField {
    return new RepeaterField(name)
  }

  /** Inner schema rendered per row. Each row resolves these elements. */
  schema(elements: Element[]): this {
    this._children = elements
    return this
  }

  /**
   * Single-field "flat array" Repeater. Storage shape changes from
   * `[{ <innerName>: value }]` to `[value, value, …]` — handy for
   * keyword/alias/alt-domain lists where the row is just one input.
   *
   * Wire format on the form stays the same `<name>.<i>.<innerName>` shape
   * (the inner field's name is opaque to the consumer); the flat shape
   * shows up only in the saved record (after coerce → unwrap) and in the
   * loaded record (re-wrapped on the way into `resolveRepeaterRows`).
   *
   * Validators run against the wrapped shape so per-field rules
   * (`required`, `unique`, custom validators) work the same as in a
   * regular Repeater. The chrome strips down: no per-row header, no
   * collapse, no clone — just an inline trash button on each row plus
   * the bottom Add button. Reorder still works when `reorderable()`
   * is set.
   *
   * Calling `simple()` replaces the inner schema with the single field —
   * pass any prior `schema(...)` you'd called as wasted; `simple()` is
   * the schema for these rows.
   */
  simple(field: Field): this {
    this._simple = true
    this._children = [field]
    return this
  }

  /** Grid column count for the inner schema (passed through to client). */
  columns(n: number): this { this._columns = n; return this }

  /** Number of empty rows to render initially when no values exist. */
  defaultItems(n: number): this { this._defaultItems = n; return this }

  /** Validator + client gate: at least `n` rows on submit. */
  minItems(n: number): this { this._minItems = n; return this }

  /** Validator + client gate: at most `n` rows on submit. */
  maxItems(n: number): this { this._maxItems = n; return this }

  /** Show drag handle + keyboard reorder controls per row. */
  reorderable(value: boolean = true): this { this._reorderable = value; return this }

  /** Show collapse chevron per row. */
  collapsible(value: boolean = true): this { this._collapsible = value; return this }

  /** Render rows collapsed by default (requires `collapsible()`). */
  collapsed(value: boolean = true): this { this._defaultCollapsed = value; return this }

  /**
   * Accordion mode: only one row open at a time. Picking a different row
   * collapses the currently-open one. Pair with `collapsed()` to start
   * with every row collapsed (default is "first row open"). Auto-arms
   * `collapsible()` since the accordion ergonomic is meaningless on a
   * non-collapsible repeater.
   */
  accordion(value: boolean = true): this {
    this._accordion = value
    if (value) this._collapsible = true
    return this
  }

  /** Show duplicate-row button per row. */
  cloneable(value: boolean = true): this { this._cloneable = value; return this }

  /**
   * Function evaluated per row for the collapsed-row header. The result
   * lands on `RepeaterRowMeta.itemLabel`; renderers fall back to the row
   * index when missing or when the function throws.
   */
  itemLabel(fn: RepeaterItemLabel): this { this._itemLabel = fn; return this }

  /**
   * Per-row visibility predicate. Evaluated against a row-scoped
   * `LayoutContext` (`values / $get / $set / row` all row-local). Returning
   * truthy hides the row from the user; the renderer keeps inputs mounted
   * via `display: none` so values round-trip through FormData on submit.
   *
   * Throwing → row stays visible + warn (inverse of layout `visible()` —
   * a misbehaving rule shouldn't silently hide data the user is editing).
   */
  itemHidden(rule: RepeaterItemHiddenRule): this { this._itemHidden = rule; return this }

  /** Custom label for the "Add row" button. Default `'Add'`. */
  addActionLabel(label: string): this { this._addActionLabel = label; return this }

  /**
   * Lay the ROWS themselves in an `n`-column grid — different from
   * `columns(n)` which grids the inner schema *inside* a row. Pass
   * `n >= 2`; values below 2 reset to no-grid (vertical stack, the
   * default).
   *
   * In grid mode the renderer keeps reorder buttons working but
   * suppresses the horizontal drop indicator (which doesn't read
   * across grid cells). Drag-and-drop itself still moves rows; the
   * cursor is the only feedback.
   */
  grid(n: number): this {
    if (n >= 2) this._grid = n
    else delete this._grid
    return this
  }

  /**
   * Render rows as a compact HTML table — one `<tr>` per row, one
   * `<td>` per inner field, with the supplied column headers above.
   * Columns map 1:1 to `schema()` fields in declaration order.
   *
   * Pass an empty array to turn table mode off (handy for toggling via
   * a config value). Mutually exclusive with `simple()` (single-field
   * shape conflicts) and `grid()` (different layout) — the field
   * applies whichever was set last; renderer ignores collapsible /
   * accordion in table mode (`<tr>` rows can't collapse). The inner
   * schema's field labels render `sr-only` so headers carry the
   * labelling; clone / delete / `extraItemActions` land in a final
   * actions cell when configured.
   */
  table(columns: RepeaterTableColumn[]): this {
    if (columns.length === 0) delete this._tableColumns
    else this._tableColumns = columns
    return this
  }

  /**
   * Per-row action buttons rendered in each row's header alongside the
   * built-in clone/delete strip. Useful for "Mark featured", "Send test",
   * "Run preview", etc. — handler-style only in v1 (no `.href(…)` or
   * `.method(…)`-style row actions; no modal-form actions either).
   *
   * Each action's handler receives a row-scoped `ActionContext` with
   * `ctx.row = { index, id, values }` (the row's submitted values, not
   * the parent record). Visibility rules (`visible / hidden / disabled`)
   * are evaluated per row at meta-build with `{ values, record, user }`
   * — `values` is the row's data, `record` mirrors the parent form's
   * record (same as inner-field condition callbacks).
   *
   * Actions register one per row; the dispatcher uses `_rowPath` from the
   * submit body to know which row was triggered. Naming collisions
   * between row actions and page-level actions are NOT allowed (the
   * server's `findActions` walker treats row-scoped actions separately
   * via `findRowExtraActions`, but listing the same name in both spots
   * is undefined behavior).
   */
  extraItemActions(actions: Action[]): this {
    this._extraItemActions = actions
    return this
  }

  // ─── Read-only access for resolver / coercion / validation ──

  override getChildren(): Element[] | undefined {
    return this._children.length > 0 ? this._children : undefined
  }

  /** Direct access to the inner schema — used by coercion + validation. */
  getInnerSchema(): Element[] { return this._children }

  getColumns(): number | undefined        { return this._columns }
  getDefaultItems(): number               { return this._defaultItems }
  getMinItems(): number | undefined       { return this._minItems }
  getMaxItems(): number | undefined       { return this._maxItems }
  isReorderable(): boolean                { return this._reorderable }
  isCollapsible(): boolean                { return this._collapsible }
  isDefaultCollapsed(): boolean           { return this._defaultCollapsed }
  isAccordion(): boolean                  { return this._accordion }
  isCloneable(): boolean                  { return this._cloneable }
  getItemLabel(): RepeaterItemLabel | undefined { return this._itemLabel }
  getItemHidden(): RepeaterItemHiddenRule | undefined { return this._itemHidden }
  getAddActionLabel(): string | undefined { return this._addActionLabel }
  getExtraItemActions(): Action[] { return this._extraItemActions }
  isSimple(): boolean { return this._simple }
  getGrid(): number | undefined { return this._grid }
  getTableColumns(): RepeaterTableColumn[] | undefined { return this._tableColumns }
  isTable(): boolean { return this._tableColumns !== undefined }
  /**
   * The single inner field of a `simple()` repeater. Returns `undefined`
   * outside simple mode (or when the inner schema hasn't been set yet).
   * Used by the wrap/unwrap helpers in `dispatchForm` and `resolveSchema`
   * — internal contract is "the simple inner field's name is the wrapping
   * key for `[v]` ↔ `[{name: v}]` transforms".
   */
  getSimpleInnerField(): Field | undefined {
    if (!this._simple) return undefined
    const first = this._children[0]
    if (first instanceof Field) return first
    return undefined
  }

  // ─── Meta ──────────────────────────────────────────────

  /**
   * Build the bare Repeater meta — base FieldMeta + per-Repeater config
   * keys. Rows + template are populated by the resolver in step 2 (an
   * `ElementResolver` registered for `'field'` is the wrong shape since
   * Repeater needs ctx.values per-row; the resolver special-cases
   * Repeater inline). Until then this returns an empty rows/template
   * pair so the type stays stable.
   */
  override toMeta(ctx?: RenderContext): RepeaterFieldMeta {
    const base = this.buildMeta(ctx)
    const meta: RepeaterFieldMeta = {
      ...base,
      fieldType: 'repeater',
      rows:      [],
      template:  [],
      defaultItems: this._defaultItems,
    }
    if (this._columns         !== undefined) meta.columns         = this._columns
    if (this._minItems        !== undefined) meta.minItems        = this._minItems
    if (this._maxItems        !== undefined) meta.maxItems        = this._maxItems
    if (this._reorderable)                   meta.reorderable     = true
    if (this._collapsible)                   meta.collapsible     = true
    if (this._defaultCollapsed)              meta.defaultCollapsed = true
    if (this._accordion)                     meta.accordion       = true
    if (this._cloneable)                     meta.cloneable       = true
    if (this._addActionLabel !== undefined)  meta.addActionLabel  = this._addActionLabel
    if (this._simple)                        meta.simple          = true
    if (this._grid !== undefined)            meta.grid            = this._grid
    if (this._tableColumns !== undefined)    meta.table           = { columns: this._tableColumns }
    return meta
  }
}

export const Repeater = RepeaterField

/**
 * Structural Repeater check — Vite's SSR module cache can load this
 * package via two paths during a single dev session, so `instanceof
 * RepeaterField` can silently return false across module copies. The
 * structural check uses the serialized type discriminator + the
 * `fieldType` property name, both of which are stable strings.
 *
 * Mirrors the pattern documented in
 * `feedback_vite_ssr_module_dup_instanceof.md`.
 */
export function isRepeaterField(el: { getType(): string; fieldType?: string }): boolean {
  return el.getType() === 'field' && el['fieldType'] === 'repeater'
}
