import { Element, type ElementMeta, type LayoutContext } from '../schema/Element.js'
import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'
import type { Action, ActionMeta } from '../actions/Action.js'
import type { ModelLike } from '../orm/modelDefaults.js'
import {
  RowButton,
  type RowButtonKind,
  type RowButtonsMeta,
} from './RowButton.js'

/**
 * Configuration for `Repeater.relationship(...)`. Stores rows in a real
 * `HasMany` relation on the parent record instead of serializing them
 * to a JSON column.
 *
 * `name` is the only required field — it must match a key on the
 * parent's `static relations` map (rudder ORM convention). The
 * `model` + `foreignKey` overrides exist for ORMs that don't follow
 * that convention; both default to discovery via the parent's
 * relations map at submit time.
 *
 * `orderColumn` is the integer column on the child model that
 * receives the row's 0-based index after each save. Omit when the
 * order doesn't need to round-trip through the database.
 */
export interface RepeaterRelationshipConfig {
  /** Relationship key on the parent (e.g. `'attachments'`). */
  name:         string
  /** Override the child model. Defaults to `parent.relations[name].model()`. */
  model?:       ModelLike
  /** Override the FK column on the child. Defaults to `parent.relations[name].foreignKey`. */
  foreignKey?:  string
  /** Optional integer column on the child to receive the row index. */
  orderColumn?: string
  /**
   * M2M only — pivot-table extra columns to surface as editable per-row
   * fields. Each name must match an inner-schema field's `name`; the
   * row's values for these names round-trip through the pivot row
   * (read via `accessor.withPivot(...)`, written via
   * `accessor.attach({ id: { … } })` for new rows and
   * `accessor.updatePivot(id, { … })` for existing rows). No-op (and
   * a clear error at submit time) on `hasMany` / `morphMany` modes.
   */
  pivotColumns?: string[]
}

/** Public meta — `model` + `foreignKey` are server-only and stay private. */
export interface RepeaterRelationshipMeta {
  name:         string
  orderColumn?: string
}

/**
 * Function evaluated once per row at meta-build to derive a human-readable
 * label for the collapsed-row header. Called with the row's submitted values
 * (or `{}` on a fresh blank row); should return a short string. Errors are
 * swallowed and the renderer falls back to the row index.
 */
export type RepeaterItemLabel = (row: Record<string, unknown>) => string

/**
 * Responsive column-count config for `Repeater.grid()` and `Builder.grid()`.
 * Keys map to the standard Tailwind breakpoints (sm/md/lg/xl/2xl). `default`
 * sets the column count below the smallest declared breakpoint and falls back
 * to 1 when omitted. Pass values ≥ 2 — anything lower is dropped at the field
 * level so the renderer sees only meaningful entries.
 *
 * Example: `.grid({ default: 1, md: 2, xl: 3 })` renders one column on mobile,
 * two from `md` up, three from `xl` up.
 */
export interface ResponsiveGridConfig {
  default?: number
  sm?:      number
  md?:      number
  lg?:      number
  xl?:      number
  '2xl'?:   number
}

/** Single-number form for `grid(n)` (current API) OR responsive object form. */
export type RepeaterGridConfig = number | ResponsiveGridConfig

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
 * Per-row capability gate. Evaluated against a row-scoped `LayoutContext`
 * (same shape as `itemHidden`'s rule). Resolving truthy keeps the
 * capability enabled (the matching row button stays mounted); resolving
 * falsy removes it. Throwing predicates fail-open — the capability stays
 * enabled and we log a warning, mirroring `itemHidden`'s posture so a
 * misbehaving rule doesn't silently lock the user out of editing data.
 *
 * Used by `itemCanDelete / itemCanClone / itemCanReorder`.
 */
export type RepeaterItemCanRule =
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
  /**
   * Per-row capability flags. Stamped only when the corresponding
   * `itemCan*(rule)` resolved falsy for this row — non-customized rows
   * pay zero serialization cost. The renderer reads these and skips the
   * matching button: `canDelete: false` removes the trash, `canClone: false`
   * removes the clone (no-op when `cloneable()` is off field-wide),
   * `canReorder: false` removes the drag grip and Up/Down arrows on this
   * row only (no-op when `reorderable()` is off).
   *
   * Capability gates are presentation, not authorization — they hide the
   * button but don't reject tampered POST bodies. For real authorization,
   * gate the parent form's lifecycle hooks.
   */
  canDelete?:  false
  canClone?:   false
  canReorder?: false
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
   * Set when `Repeater.grid(...)` is configured. Lays the ROWS themselves
   * in an n-column grid (different from `columns(n)` which grids the inner
   * schema *inside* a row). Useful for tile-style pickers / member cards /
   * icon palettes.
   *
   * Two shapes:
   *   - `number` (≥ 2) — fixed grid at every viewport.
   *   - `ResponsiveGridConfig` — `{ default?, sm?, md?, lg?, xl?, '2xl'? }`
   *     keyed by Tailwind breakpoint. The renderer emits a scoped
   *     `<style>` block with media queries per declared breakpoint.
   *
   * Renderer swaps the outer `flex flex-col` container for a CSS grid and
   * skips the drag-drop indicator in grid mode (the horizontal bar reads
   * wrong across grid cells); button reorder still works.
   */
  grid?:            RepeaterGridConfig
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
  /**
   * Set when `Repeater.relationship(...)` is configured. Tells diagnostics
   * (and any future client UI) that the row diff is persisted via a
   * `HasMany` relation rather than a JSON column on the parent. The wire
   * shape carries only `{ name, orderColumn? }` — `model` and
   * `foreignKey` stay server-only.
   */
  relationship?:    RepeaterRelationshipMeta
  /**
   * Per-slot chrome overrides for the seven built-in row buttons (add /
   * clone / delete / moveUp / moveDown / reorder / collapse). Authors set
   * these via `.addAction(RowButton.make()…)` etc.; the renderer merges
   * each override on top of its hardcoded default (icon + tooltip + color
   * + aria-label). Absent slots fall through to defaults — non-customized
   * Repeaters pay zero serialization cost.
   */
  buttons?:         RowButtonsMeta
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
  private _itemCanDelete?:   RepeaterItemCanRule
  private _itemCanClone?:    RepeaterItemCanRule
  private _itemCanReorder?:  RepeaterItemCanRule
  private _extraItemActions: Action[] = []
  private _simple           = false
  private _grid?:            RepeaterGridConfig
  private _tableColumns?:    RepeaterTableColumn[]
  private _buttons:          { [K in RowButtonKind]?: RowButton } = {}
  private _relationship?:    RepeaterRelationshipConfig

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
    if (this._relationship) {
      throw new Error(
        `[Pilotiq] Repeater "${this.name}": simple() is incompatible with relationship() — flat-array storage can't round-trip through child records.`,
      )
    }
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

  /**
   * Per-row gate for the trash button. Resolving truthy keeps the trash
   * button visible (default); resolving falsy hides it on that row only.
   * Useful for "this row is finalized — only the others can be removed".
   *
   * Predicate sees the same row-scoped `LayoutContext` as `itemHidden`
   * (`values / $get / $set / row` are row-local, `record / user` mirror
   * the parent form). Throwing predicates fail-open — the button stays
   * visible and we log a warning, mirroring `itemHidden`'s posture.
   *
   * Presentation only. Tampered POST bodies that delete a gated row will
   * still go through; gate the parent form's lifecycle hooks for real
   * authorization.
   */
  itemCanDelete(rule: RepeaterItemCanRule): this { this._itemCanDelete = rule; return this }

  /**
   * Per-row gate for the clone (`Duplicate row`) button. Resolving truthy
   * keeps it visible (default); resolving falsy hides it on that row only.
   * No-op when `cloneable()` is off field-wide.
   *
   * Same predicate shape, same fail-open posture as `itemCanDelete`.
   */
  itemCanClone(rule: RepeaterItemCanRule): this { this._itemCanClone = rule; return this }

  /**
   * Per-row gate for the reorder controls (drag grip + Up / Down arrows).
   * Resolving truthy keeps them visible (default); resolving falsy hides
   * them on that row only — pinning the row to its current position while
   * its neighbours stay reorderable. No-op when `reorderable()` is off
   * field-wide.
   *
   * Same predicate shape, same fail-open posture as `itemCanDelete`. Drag
   * targeting is unaffected — a non-pinned row can still drop at the
   * pinned row's slot, which is the right semantics (the OTHER row is the
   * one being moved). Pin both sides if you need a pair to stay adjacent.
   */
  itemCanReorder(rule: RepeaterItemCanRule): this { this._itemCanReorder = rule; return this }

  /** Custom label for the "Add row" button. Default `'Add'`. */
  addActionLabel(label: string): this { this._addActionLabel = label; return this }

  /**
   * Lay the ROWS themselves in an n-column grid — different from
   * `columns(n)` which grids the inner schema *inside* a row.
   *
   * Two forms:
   *   - `grid(2)` — fixed 2-column grid at every viewport.
   *   - `grid({ default: 1, md: 2, xl: 3 })` — responsive: column count
   *     changes at the named Tailwind breakpoint (sm 640px / md 768px /
   *     lg 1024px / xl 1280px / 2xl 1536px). `default` (or `1` when
   *     omitted) is the count below the smallest declared breakpoint.
   *
   * Pass `n >= 2` or an object with at least one breakpoint having a value
   * `>= 2`; otherwise the grid mode resets (vertical stack, the default).
   *
   * In grid mode the renderer keeps reorder buttons working but
   * suppresses the horizontal drop indicator (which doesn't read
   * across grid cells). Drag-and-drop itself still moves rows; the
   * cursor is the only feedback.
   */
  grid(config: RepeaterGridConfig): this {
    const normalized = normalizeGridConfig(config)
    if (normalized === undefined) delete this._grid
    else this._grid = normalized
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
   * Persist rows to a `HasMany` (or `MorphMany` / `MorphOne`) relation on
   * the parent record instead of serializing them to a JSON column. Each
   * row maps to a real child record; submit creates / updates / deletes
   * children against the relation transparently.
   *
   * For `morphMany`, the child also carries `<morphName>Id` +
   * `<morphName>Type` columns; the framework stamps both on every create
   * (and refuses to overwrite them on update) so a tampered POST body
   * can't reassign a row to a different polymorphic parent. The morph
   * shape is read off the parent's `static relations[name]` descriptor —
   * no `foreignKey` override applies.
   *
   * Pass either the relationship name as a string (the common case —
   * `model` + `foreignKey` are auto-discovered from the parent's
   * `static relations` map) or an object form for explicit overrides.
   *
   * Mutually exclusive with `simple()` (the flat `[v, v, …]` storage
   * shape can't round-trip through child records that need named
   * columns) and with `dehydrated(false)` (the field's whole purpose
   * is to write data — silently dropping it would be confusing).
   * Validators run unchanged.
   */
  relationship(arg: string | RepeaterRelationshipConfig): this {
    if (this._simple) {
      throw new Error(
        `[Pilotiq] Repeater "${this.name}": relationship() is incompatible with simple() — relationship-backed rows need named columns on the child model.`,
      )
    }
    if (this.isDehydrated() === false) {
      throw new Error(
        `[Pilotiq] Repeater "${this.name}": relationship() is incompatible with dehydrated(false) — the field's purpose is to persist data.`,
      )
    }
    this._relationship = typeof arg === 'string' ? { name: arg } : { ...arg }
    return this
  }

  /**
   * Sugar over `.relationship({ ..., orderColumn: col })`. Sets the
   * order column on an already-configured relationship; throws when
   * `relationship()` hasn't been called first so misconfiguration
   * surfaces eagerly.
   */
  orderColumn(col: string): this {
    if (!this._relationship) {
      throw new Error(
        `[Pilotiq] Repeater "${this.name}": orderColumn() requires relationship() to be configured first.`,
      )
    }
    this._relationship.orderColumn = col
    return this
  }

  /**
   * M2M only — declare pivot-table extra columns to surface as editable
   * per-row fields. Each entry must match an inner-schema field's `name`;
   * row values for those names load via `accessor.withPivot(...)`,
   * persist via `accessor.attach({ id: pivotData })` for new rows and
   * `accessor.updatePivot(id, pivotData)` for existing rows.
   *
   * Sugar over `.relationship({ ..., pivotColumns: cols })`. Like
   * `orderColumn()`, throws when `relationship()` hasn't been called
   * first. Empty array clears the projection.
   */
  pivotColumns(cols: string[]): this {
    if (!this._relationship) {
      throw new Error(
        `[Pilotiq] Repeater "${this.name}": pivotColumns() requires relationship() to be configured first.`,
      )
    }
    this._relationship.pivotColumns = [...cols]
    return this
  }

  /**
   * Customize the bottom Add button's chrome (label / icon / color /
   * tooltip). Equivalent to `addActionLabel()` plus icon + color
   * overrides — when both are set, this customizer wins (it ships under
   * `meta.buttons.add` which the renderer reads after `addActionLabel`).
   */
  addAction(b: RowButton): this { this._buttons.add = b; return this }

  /** Customize the per-row clone (`Duplicate row`) button. */
  cloneAction(b: RowButton): this { this._buttons.clone = b; return this }

  /** Customize the per-row trash (`Remove row`) button. */
  deleteAction(b: RowButton): this { this._buttons.delete = b; return this }

  /** Customize the per-row Up arrow. */
  moveUpAction(b: RowButton): this { this._buttons.moveUp = b; return this }

  /** Customize the per-row Down arrow. */
  moveDownAction(b: RowButton): this { this._buttons.moveDown = b; return this }

  /**
   * Customize the drag-grip handle. `label` becomes the `aria-label`,
   * `tooltip` becomes the `title` attribute, `icon` swaps the grip glyph,
   * `color` re-tones the handle. The grip isn't a real `<button>` (it's a
   * draggable `<span>`) so click semantics don't apply.
   */
  reorderAction(b: RowButton): this { this._buttons.reorder = b; return this }

  /** Customize the per-row collapse chevron. */
  collapseAction(b: RowButton): this { this._buttons.collapse = b; return this }

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
  getItemCanDelete():  RepeaterItemCanRule | undefined { return this._itemCanDelete  }
  getItemCanClone():   RepeaterItemCanRule | undefined { return this._itemCanClone   }
  getItemCanReorder(): RepeaterItemCanRule | undefined { return this._itemCanReorder }
  getAddActionLabel(): string | undefined { return this._addActionLabel }
  getExtraItemActions(): Action[] { return this._extraItemActions }
  isSimple(): boolean { return this._simple }
  getGrid(): RepeaterGridConfig | undefined { return this._grid }
  getTableColumns(): RepeaterTableColumn[] | undefined { return this._tableColumns }
  isTable(): boolean { return this._tableColumns !== undefined }
  /** Resolved relationship config (`undefined` when not configured). */
  getRelationship(): RepeaterRelationshipConfig | undefined { return this._relationship }
  isRelationship(): boolean { return this._relationship !== undefined }
  /** The configured customizer for a given slot, or `undefined`. */
  getButton(kind: RowButtonKind): RowButton | undefined { return this._buttons[kind] }
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
    if (this._relationship !== undefined) {
      const r: RepeaterRelationshipMeta = { name: this._relationship.name }
      if (this._relationship.orderColumn !== undefined) r.orderColumn = this._relationship.orderColumn
      meta.relationship = r
    }
    const buttons = serializeRowButtons(this._buttons)
    if (buttons !== undefined)               meta.buttons         = buttons
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

/**
 * Walk a sparse `{ [kind]: RowButton }` map and serialize only the slots
 * the user actually set. Returns `undefined` when nothing is configured so
 * `meta.buttons` stays absent for non-customized fields. Each slot's inner
 * meta is the result of `RowButton.toMeta()` — already JSON-safe and
 * already drops unset keys.
 *
 * Shared between Repeater + Builder so the wire shape stays identical
 * across both renderers.
 */
export function serializeRowButtons(
  buttons: { [K in RowButtonKind]?: RowButton },
): RowButtonsMeta | undefined {
  const out: RowButtonsMeta = {}
  let any = false
  for (const k of Object.keys(buttons) as RowButtonKind[]) {
    const b = buttons[k]
    if (b === undefined) continue
    out[k] = b.toMeta()
    any = true
  }
  return any ? out : undefined
}

const RESPONSIVE_BREAKPOINTS = ['default', 'sm', 'md', 'lg', 'xl', '2xl'] as const

/**
 * Coerce a user-supplied grid config into the shape stored on `_grid`.
 *
 * - `number` ≥ 2 → returned unchanged.
 * - `number` < 2 → `undefined` (resets the grid mode — mirrors the existing
 *   "passing 1 turns it off" sentinel).
 * - `ResponsiveGridConfig` → object with each declared breakpoint floored
 *   to an integer ≥ 2; entries below 2 are dropped. When no breakpoint
 *   survives the filter, returns `undefined` (no grid mode at any size).
 *   Single-entry results collapse to the bare number when the only
 *   surviving entry is `default` — that's exactly the scalar form.
 *
 * Shared with `Builder.grid()` so the two fields validate identically.
 */
export function normalizeGridConfig(
  config: RepeaterGridConfig,
): RepeaterGridConfig | undefined {
  if (typeof config === 'number') {
    return config >= 2 ? Math.floor(config) : undefined
  }
  const out: ResponsiveGridConfig = {}
  let breakpointCount = 0  // declared breakpoints other than `default`
  for (const k of RESPONSIVE_BREAKPOINTS) {
    const raw = config[k]
    if (typeof raw !== 'number') continue
    const n = Math.floor(raw)
    // `default` allows n=1 (explicit "vertical stack below the smallest
    // declared breakpoint"). Other breakpoints require n >= 2 — anything
    // smaller would just fall through to the previous rule.
    if (k === 'default' ? n < 1 : n < 2) continue
    out[k] = n
    if (k !== 'default') breakpointCount++
  }
  // No actual breakpoint overrides → no responsive behavior. Either
  // collapse to the scalar form (when default exists) or reset.
  if (breakpointCount === 0) {
    if (typeof out.default === 'number' && out.default >= 2) return out.default
    return undefined
  }
  return out
}
