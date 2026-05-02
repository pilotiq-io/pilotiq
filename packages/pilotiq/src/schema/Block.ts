import type { Element, ElementMeta } from './Element.js'

/**
 * Wire-format metadata for a single block type — what `BuilderField`
 * ships to the client so the block-picker UI can render the
 * `Add block` dropdown AND so the renderer can render a freshly-picked
 * block's empty children without an extra server roundtrip.
 *
 * The per-row resolved schema lives on each `BuilderRowMeta`; this is
 * the empty-row blueprint (`template`) used when the user picks the
 * block from the dropdown. Resolved server-side once per block via
 * `resolveBuilderRows` against `values: {}` so any inner-field
 * `default()` surfaces.
 */
export interface BlockMeta {
  name:      string
  label:     string
  icon?:     string
  columns?:  number
  maxItems?: number
  template:  ElementMeta[]
}

/**
 * Single block-type definition consumed by `BuilderField.blocks([…])`.
 * Mirrors Filament's `Block` primitive: a name, a label, an optional
 * icon, and an inner `schema()` rendered when a row of this type is
 * created.
 *
 * Not an `Element` — `Block` is a schema-author primitive (like `Tab`,
 * `Step`, `ListTab` minus the discriminator-driven layout role) held
 * by `BuilderField` and looked up per-row by name. Resolving each
 * row's children happens inside `resolveBuilderRows`, which calls
 * `resolveSchema` against `block.getSchema()` with row-scoped values.
 *
 * @example
 *   Block.make('heading')
 *     .label('Heading')
 *     .icon('heading')
 *     .schema([
 *       TextField.make('text').required(),
 *       SelectField.make('level').options({ h1: 'H1', h2: 'H2' }),
 *     ])
 *     .columns(2)
 *     .maxItems(1)  // only one Hero allowed per record
 */
export class Block {
  readonly name: string

  private _label?:    string
  private _icon?:     string
  private _columns?:  number
  private _maxItems?: number
  private _schema:    Element[] = []

  private constructor(name: string) {
    this.name = name
  }

  static make(name: string): Block {
    return new Block(name)
  }

  // ─── Builder ─────────────────────────────────────────

  label(l: string): this { this._label = l; return this }

  /**
   * Icon shown next to the block label in the picker dropdown and
   * (when `Builder.blockIcons()` is on) in each row's header. String-only
   * — resolved through the icon registry, mirroring `Section.icon` /
   * `Tab.icon`. Component-typed icons are reserved for top-level
   * (Resource / Global / Page) bindings that own a manifest entry.
   */
  icon(name: string): this { this._icon = name; return this }

  /** Inner form schema rendered when a row of this block type is added. */
  schema(elements: Element[]): this { this._schema = elements; return this }

  /** Grid column count for this block's inner schema. */
  columns(n: number): this { this._columns = n; return this }

  /**
   * Cap on how many rows of THIS block type may appear in a single
   * `BuilderField`. Validator + client-side gate (the picker greys out
   * the option once the cap is hit). Useful for "exactly one Hero" or
   * "at most three callouts".
   */
  maxItems(n: number): this { this._maxItems = n; return this }

  // ─── Read-only access ────────────────────────────────

  getLabel(): string {
    return this._label ?? this.name.charAt(0).toUpperCase() + this.name.slice(1)
  }
  getIcon():     string | undefined  { return this._icon     }
  getColumns():  number | undefined  { return this._columns  }
  getMaxItems(): number | undefined  { return this._maxItems }
  getSchema():   Element[]           { return this._schema   }

  // ─── Wire format ─────────────────────────────────────

  /**
   * Bare picker meta. The `template` field is filled in by the resolver
   * (it needs the surrounding `RenderContext` to walk the inner schema)
   * — the no-arg `toMeta()` ships an empty array as a stable shape so
   * non-resolver callers (e.g. unit tests, plain `Builder.toMeta()`)
   * don't crash on a missing field.
   */
  toMeta(): BlockMeta {
    const meta: BlockMeta = {
      name:     this.name,
      label:    this.getLabel(),
      template: [],
    }
    if (this._icon     !== undefined) meta.icon     = this._icon
    if (this._columns  !== undefined) meta.columns  = this._columns
    if (this._maxItems !== undefined) meta.maxItems = this._maxItems
    return meta
  }
}
