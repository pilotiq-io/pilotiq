import { Element, type ElementMeta } from '../schema/Element.js'
import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Function evaluated once per row at meta-build to derive a human-readable
 * label for the collapsed-row header. Called with the row's submitted values
 * (or `{}` on a fresh blank row); should return a short string. Errors are
 * swallowed and the renderer falls back to the row index.
 */
export type RepeaterItemLabel = (row: Record<string, unknown>) => string

/**
 * Resolved metadata for a single Repeater row. `id` is a stable identifier
 * scoped to the form render — survives reorder + clone client-side and is
 * round-tripped through a hidden `__id` value on submit so the renderer
 * keeps stable React keys across SSR / SPA / partial-resolve cycles.
 *
 * `children` is the resolved inner schema (resolved with row-scoped values).
 * Renderers iterate `rows` and feed each `children` array to `SchemaRenderer`.
 */
export interface RepeaterRowMeta {
  id:        string
  children:  ElementMeta[]
  itemLabel?: string
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
  cloneable?:       boolean
  addActionLabel?:  string
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
  private _cloneable        = false
  private _addActionLabel?:  string
  private _itemLabel?:       RepeaterItemLabel

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

  /** Show duplicate-row button per row. */
  cloneable(value: boolean = true): this { this._cloneable = value; return this }

  /**
   * Function evaluated per row for the collapsed-row header. The result
   * lands on `RepeaterRowMeta.itemLabel`; renderers fall back to the row
   * index when missing or when the function throws.
   */
  itemLabel(fn: RepeaterItemLabel): this { this._itemLabel = fn; return this }

  /** Custom label for the "Add row" button. Default `'Add'`. */
  addActionLabel(label: string): this { this._addActionLabel = label; return this }

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
  isCloneable(): boolean                  { return this._cloneable }
  getItemLabel(): RepeaterItemLabel | undefined { return this._itemLabel }
  getAddActionLabel(): string | undefined { return this._addActionLabel }

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
    if (this._cloneable)                     meta.cloneable       = true
    if (this._addActionLabel !== undefined)  meta.addActionLabel  = this._addActionLabel
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
