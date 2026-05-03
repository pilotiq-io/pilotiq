import { type ElementMeta, type LayoutContext } from '../schema/Element.js'
import { Block, type BlockMeta } from '../schema/Block.js'
import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'
import type { Action, ActionMeta } from '../actions/Action.js'
import {
  RowButton,
  type RowButtonKind,
  type RowButtonsMeta,
} from './RowButton.js'
import {
  serializeRowButtons,
  normalizeGridConfig,
  type RepeaterGridConfig,
} from './RepeaterField.js'

/**
 * Function evaluated once per row at meta-build to derive a human-readable
 * label for the collapsed-row header. Receives the row's raw `data` body
 * and the row's resolved `type`. Errors are swallowed and the renderer
 * falls back to the block's label + row index.
 */
export type BuilderItemLabel = (
  data: Record<string, unknown>,
  blockName: string,
) => string

/**
 * Per-row visibility rule. Same shape as `Repeater.itemHidden(rule)`:
 * either a literal `boolean` or a callback receiving a row-scoped
 * `LayoutContext` (`row.blockType` exposes the block name). Truthy
 * hides the row; the renderer keeps inputs mounted via `display: none`
 * so values + `__id` round-trip on submit.
 *
 * Throwing → row stays visible (fail-closed-as-visible — same posture as
 * Repeater).
 */
export type BuilderItemHiddenRule =
  | boolean
  | ((ctx: LayoutContext) => boolean | Promise<boolean>)

/** Position of the `Add block` button under the field's row stack. */
export type BuilderAddActionAlignment = 'start' | 'center' | 'end'

/**
 * Resolved per-row metadata. `id` mirrors Repeater's stable id round-trip;
 * `type` carries the block discriminator so the renderer knows which
 * picker option produced this row. `children` is the row's resolved
 * inner schema (the matching block's `schema()` resolved against
 * row-scoped values). `unknownType` is set when the row's submitted
 * `type` doesn't match any registered block — the renderer falls back
 * to a "missing block" placeholder; values still round-trip.
 */
export interface BuilderRowMeta {
  id:           string
  type:         string
  children:     ElementMeta[]
  itemLabel?:   string
  hidden?:      boolean
  unknownType?: boolean
  /**
   * Resolved per-row action metas for `extraItemActions(...)`. Same shape
   * as `RepeaterRowMeta.extraActions` — see RepeaterField for the row
   * dispatch contract. Field-level only in v1; per-block actions stay
   * deferred to a future polish (`Block.extraItemActions(...)`).
   */
  extraActions?: ActionMeta[]
}

export interface BuilderFieldMeta extends FieldMeta {
  fieldType:           'builder'
  rows:                BuilderRowMeta[]
  /** Picker entries — every block registered via `.blocks([…])`. */
  blocks:              BlockMeta[]
  minItems?:           number
  maxItems?:           number
  defaultBlock?:       string
  reorderable?:        boolean
  reorderableWithButtons?: boolean
  collapsible?:        boolean
  defaultCollapsed?:   boolean
  /**
   * Set when `Builder.accordion()` is configured. The renderer replaces
   * the per-row collapsed map with a single "open row id" slot — picking
   * row N collapses every other row. Implies `collapsible: true`. See
   * `RepeaterFieldMeta.accordion` for the shared semantics.
   */
  accordion?:          boolean
  cloneable?:          boolean
  addable?:            boolean
  deletable?:          boolean
  /**
   * Set when `Builder.addBetween()` is configured. The renderer mounts a
   * thin "+" insertion zone above each row (and at the very top) — clicking
   * it opens a compact picker that inserts the picked block at that
   * index. The bottom `Add block` button stays — `addBetween` is additive,
   * not a replacement. Respects `addable === false` and the field-level
   * `maxItems` cap; per-block `Block.maxItems` already filters the picker.
   */
  addBetween?:         boolean
  addActionLabel?:     string
  addActionAlignment?: BuilderAddActionAlignment
  blockPickerColumns?: number
  blockNumbers?:       boolean
  blockIcons?:         boolean
  itemNumbers?:        boolean
  /**
   * Set when `Builder.grid(...)` is configured. Lays the ROWS themselves
   * in an n-column grid — distinct from a Block's inner `Block.columns(n)`,
   * which grids fields *inside* a single row. Accepts the scalar form
   * (`grid(2)`) or a responsive object (`grid({ default: 1, md: 2 })`) —
   * see `RepeaterFieldMeta.grid` for the shared semantics.
   */
  grid?:               RepeaterGridConfig
  /**
   * Per-slot chrome overrides for the seven built-in row buttons. Same
   * shape as `RepeaterFieldMeta.buttons`; see `RowButton` for the
   * customizer. Authors set these via `.addAction(RowButton.make()…)` etc.
   */
  buttons?:            RowButtonsMeta
}

/**
 * Heterogeneous-row Repeater. The author registers N block-types via
 * `.blocks([Block.make('heading').schema([…]), …])`; the rendered form
 * lets the end user pick from those types when adding rows.
 *
 * Storage on the parent record is `[{ __id, type, data: {…} }, …]` — a
 * `{ type, data }` envelope per row. JSON-friendly, collision-free with
 * any inner field name, mirrors Filament. See `docs/plans/builder-field.md`
 * for the wire-format details.
 */
export class BuilderField extends Field {
  private _blocks:                Block[] = []
  private _blocksByName:          Map<string, Block> = new Map()
  private _minItems?:             number
  private _maxItems?:             number
  private _defaultBlock?:         string
  private _reorderable            = false
  private _reorderableWithButtons = false
  private _collapsible            = false
  private _defaultCollapsed       = false
  private _accordion              = false
  private _cloneable              = false
  private _addable                = true
  private _deletable              = true
  private _addBetween             = false
  private _itemNumbers            = false
  private _blockNumbers           = false
  private _blockIcons             = true
  private _blockPickerColumns?:   number
  private _addActionLabel?:       string
  private _addActionAlignment:    BuilderAddActionAlignment = 'start'
  private _itemLabel?:            BuilderItemLabel
  private _itemHidden?:           BuilderItemHiddenRule
  private _extraItemActions:      Action[] = []
  private _grid?:                 RepeaterGridConfig
  private _buttons:               { [K in RowButtonKind]?: RowButton } = {}

  private constructor(name: string) {
    super(name, 'builder')
  }

  static make(name: string): BuilderField {
    return new BuilderField(name)
  }

  /** Register the block types the user can pick from. Order = picker order. */
  blocks(blocks: Block[]): this {
    this._blocks       = blocks
    this._blocksByName = new Map(blocks.map(b => [b.name, b]))
    return this
  }

  /** Validator + client gate. */
  minItems(n: number): this { this._minItems = n; return this }
  maxItems(n: number): this { this._maxItems = n; return this }

  /**
   * Block name auto-selected when adding a row without explicitly opening
   * the picker (e.g. when there's only one block type, or for "quick add"
   * UX). Defaults to undefined → picker always opens.
   */
  defaultBlock(name: string): this { this._defaultBlock = name; return this }

  reorderable(value: boolean = true): this { this._reorderable = value; return this }

  /**
   * Force button-only reorder (Up / Down arrows on each row). When `false`
   * (default), reorderable rows use HTML5 drag-and-drop with the buttons
   * as a keyboard fallback. Mirrors Filament's
   * `reorderableWithButtons(bool)`.
   */
  reorderableWithButtons(value: boolean = true): this {
    this._reorderableWithButtons = value
    return this
  }

  collapsible(value: boolean = true): this { this._collapsible = value; return this }
  collapsed(value: boolean = true):   this { this._defaultCollapsed = value; return this }

  /**
   * Accordion mode: only one row open at a time. Picking a different row
   * collapses the currently-open one. Pair with `collapsed()` to start
   * with every row collapsed (default is "first row open"). Auto-arms
   * `collapsible()` since the accordion ergonomic is meaningless on a
   * non-collapsible builder. Mirrors `RepeaterField.accordion()`.
   */
  accordion(value: boolean = true): this {
    this._accordion = value
    if (value) this._collapsible = true
    return this
  }

  cloneable(value: boolean = true):   this { this._cloneable = value; return this }

  /**
   * Hide the `Add block` button. `maxItems` is the validator gate; this is
   * the separate UX gate (e.g. read-only on a published record). Default `true`.
   */
  addable(value: boolean = true): this { this._addable = value; return this }

  /**
   * Hide the per-row delete button. `minItems` is the validator gate; this
   * is the UX gate. Default `true`.
   */
  deletable(value: boolean = true): this { this._deletable = value; return this }

  /**
   * Mount inline `+ Insert` zones above each row (and at the very top)
   * so the user can insert a new block between existing rows without
   * scrolling to the field's bottom `Add block` button. Mirrors
   * Filament's `addBetweenAction()` affordance. Additive — the bottom
   * `Add block` button stays. Respects `addable === false` and
   * `maxItems`; per-block `Block.maxItems` already filters the picker.
   */
  addBetween(value: boolean = true): this { this._addBetween = value; return this }

  /** Position of the `Add block` button. */
  addActionAlignment(a: BuilderAddActionAlignment): this {
    this._addActionAlignment = a
    return this
  }

  addActionLabel(label: string): this { this._addActionLabel = label; return this }

  /** Grid column count for the picker dropdown. Default 1. */
  blockPickerColumns(n: number): this { this._blockPickerColumns = n; return this }

  /** Show 1-based numbering on each row's header. */
  blockNumbers(value: boolean = true): this { this._blockNumbers = value; return this }

  /** Show the block's icon in each row's header. Default `true`. */
  blockIcons(value: boolean = true): this { this._blockIcons = value; return this }

  /** Alias of `blockNumbers` for users coming from Repeater (parity flag). */
  itemNumbers(value: boolean = true): this { this._itemNumbers = value; return this }

  itemLabel(fn: BuilderItemLabel): this { this._itemLabel = fn; return this }

  itemHidden(rule: BuilderItemHiddenRule): this { this._itemHidden = rule; return this }

  /**
   * Per-row action buttons rendered alongside clone/delete in each row's
   * header. Field-level only in v1 — applies to every block. Per-block
   * variants (`Block.extraItemActions(...)`) deferred. See
   * `RepeaterField.extraItemActions` for the dispatch contract; the only
   * Builder-specific note is that `ctx.row` exposes `blockType` so a
   * single handler can branch by block.
   */
  extraItemActions(actions: Action[]): this {
    this._extraItemActions = actions
    return this
  }

  /**
   * Lay the ROWS themselves in an n-column grid. Distinct from
   * `Block.columns(n)`, which grids fields *inside* a single block's
   * body. Accepts the scalar form (`grid(2)`) or a responsive object
   * (`grid({ default: 1, md: 2 })`). See `RepeaterField.grid()` for
   * the shared semantics — same renderer behavior, same drag-indicator
   * caveat.
   */
  grid(config: RepeaterGridConfig): this {
    const normalized = normalizeGridConfig(config)
    if (normalized === undefined) delete this._grid
    else this._grid = normalized
    return this
  }

  /**
   * Customize the bottom Add button's chrome. Equivalent to
   * `addActionLabel()` plus icon / color / tooltip overrides; the
   * customizer wins when both are set (it ships under `meta.buttons.add`
   * which the renderer reads after `addActionLabel`).
   */
  addAction(b: RowButton): this { this._buttons.add = b; return this }

  /** Customize the per-row clone button. */
  cloneAction(b: RowButton): this { this._buttons.clone = b; return this }

  /** Customize the per-row trash button. */
  deleteAction(b: RowButton): this { this._buttons.delete = b; return this }

  /** Customize the per-row Up arrow. */
  moveUpAction(b: RowButton): this { this._buttons.moveUp = b; return this }

  /** Customize the per-row Down arrow. */
  moveDownAction(b: RowButton): this { this._buttons.moveDown = b; return this }

  /**
   * Customize the drag-grip handle (label → aria-label, tooltip → title,
   * icon swaps the glyph, color re-tones the handle). The grip isn't a
   * real `<button>` so click semantics don't apply.
   */
  reorderAction(b: RowButton): this { this._buttons.reorder = b; return this }

  /** Customize the per-row collapse chevron. */
  collapseAction(b: RowButton): this { this._buttons.collapse = b; return this }

  // ─── Read-only access ────────────────────────────────

  override getChildren(): undefined {
    // Builder rows are addressed per-row via `getBlocks()` + dotted paths.
    // Never return them as flat children — the parent walkers must stop
    // at the Builder boundary, just like RepeaterField.
    return undefined
  }

  getBlocks(): Block[]                          { return this._blocks }
  getBlock(name: string): Block | undefined     { return this._blocksByName.get(name) }
  getMinItems():                  number | undefined { return this._minItems       }
  getMaxItems():                  number | undefined { return this._maxItems       }
  getDefaultBlock():              string | undefined { return this._defaultBlock   }
  isReorderable():                boolean            { return this._reorderable    }
  isReorderableWithButtons():     boolean            { return this._reorderableWithButtons }
  isCollapsible():                boolean            { return this._collapsible    }
  isDefaultCollapsed():           boolean            { return this._defaultCollapsed }
  isAccordion():                  boolean            { return this._accordion      }
  isCloneable():                  boolean            { return this._cloneable      }
  isAddable():                    boolean            { return this._addable        }
  isDeletable():                  boolean            { return this._deletable      }
  isAddBetween():                 boolean            { return this._addBetween     }
  showsBlockNumbers():            boolean            { return this._blockNumbers || this._itemNumbers }
  showsBlockIcons():              boolean            { return this._blockIcons     }
  getBlockPickerColumns():        number | undefined { return this._blockPickerColumns }
  getAddActionLabel():            string | undefined { return this._addActionLabel }
  getAddActionAlignment():        BuilderAddActionAlignment { return this._addActionAlignment }
  getItemLabel():                 BuilderItemLabel | undefined      { return this._itemLabel  }
  getItemHidden():                BuilderItemHiddenRule | undefined { return this._itemHidden }
  getExtraItemActions():          Action[]                          { return this._extraItemActions }
  getGrid():                      RepeaterGridConfig | undefined    { return this._grid }
  /** The configured customizer for a given slot, or `undefined`. */
  getButton(kind: RowButtonKind): RowButton | undefined             { return this._buttons[kind] }

  // ─── Meta ────────────────────────────────────────────

  /**
   * Bare meta — `rows` and per-row resolved children are populated by
   * `resolveBuilderRows` in `schema/resolveSchema.ts`. The `blocks` array
   * (picker entries) ships unconditionally; the picker UI needs it before
   * the user has added any rows.
   */
  override toMeta(ctx?: RenderContext): BuilderFieldMeta {
    const base = this.buildMeta(ctx)
    const meta: BuilderFieldMeta = {
      ...base,
      fieldType: 'builder',
      rows:      [],
      blocks:    this._blocks.map(b => b.toMeta()),
    }
    if (this._minItems          !== undefined) meta.minItems          = this._minItems
    if (this._maxItems          !== undefined) meta.maxItems          = this._maxItems
    if (this._defaultBlock      !== undefined) meta.defaultBlock      = this._defaultBlock
    if (this._reorderable)                     meta.reorderable       = true
    if (this._reorderableWithButtons)          meta.reorderableWithButtons = true
    if (this._collapsible)                     meta.collapsible       = true
    if (this._defaultCollapsed)                meta.defaultCollapsed  = true
    if (this._accordion)                       meta.accordion         = true
    if (this._cloneable)                       meta.cloneable         = true
    if (this._addable === false)               meta.addable           = false
    if (this._deletable === false)             meta.deletable         = false
    if (this._addBetween)                      meta.addBetween        = true
    if (this._blockNumbers)                    meta.blockNumbers      = true
    if (this._blockIcons === false)            meta.blockIcons        = false
    if (this._itemNumbers)                     meta.itemNumbers       = true
    if (this._blockPickerColumns !== undefined) meta.blockPickerColumns = this._blockPickerColumns
    if (this._addActionLabel    !== undefined) meta.addActionLabel    = this._addActionLabel
    if (this._addActionAlignment !== 'start')  meta.addActionAlignment = this._addActionAlignment
    if (this._grid              !== undefined) meta.grid              = this._grid
    const buttons = serializeRowButtons(this._buttons)
    if (buttons !== undefined)                 meta.buttons           = buttons
    return meta
  }
}

export const Builder = BuilderField

/**
 * Structural Builder check — Vite's SSR module cache can load this
 * package via two paths during a single dev session, so `instanceof
 * BuilderField` can silently return false across module copies. The
 * structural check matches `getType() === 'field'` (Field's discriminator)
 * + `fieldType === 'builder'`. Same posture as `isRepeaterField`.
 */
export function isBuilderField(el: { getType(): string; fieldType?: string }): boolean {
  return el.getType() === 'field' && el['fieldType'] === 'builder'
}
