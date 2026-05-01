/**
 * Context passed to layout-level `visible / hidden` rules. Mirrors
 * `ConditionContext` in `fields/Field.ts` (same shape) so authors can
 * destructure identically: `visible(({ $get }) => $get('kind') === 'a')`.
 *
 * Defined here (rather than importing from Field) so `Element` stays the
 * lowest-dependency module in the schema folder — Field already imports
 * from Element, not the other way around.
 */
export interface LayoutContext {
  record?: unknown
  values?: Record<string, unknown>
  $get?:   (name: string) => unknown
  $set?:   (name: string, value: unknown) => void
  user?:   unknown
  /**
   * Plan #14 — present only when this layout element is being resolved
   * inside a Repeater row. `row.index` is the row's position; `row.$get
   * / $set` are row-local. `ctx.values` is automatically scoped to the
   * row when present, so most callbacks just destructure `values`; `row`
   * is the explicit access path.
   */
  row?: {
    index: number
    $get:  (name: string) => unknown
    $set:  (name: string, value: unknown) => void
  }
}

/**
 * Layout-level visibility rule. Either a literal `boolean` (useful for
 * one-off feature flags) or a callback receiving a `LayoutContext`.
 * Callbacks may be async — the resolver awaits before deciding.
 *
 * Plan #8 adds this to every `Element` subclass except `Field` and
 * `Action`, which already own their own visibility paths
 * (`showWhen / hideWhen / hideFromMode` on Field; `.visible / .hidden` on
 * Action). The resolver only consults `_visibleRule` for layout
 * elements — see `resolveSchema.ts` for the gating logic.
 */
export type LayoutVisibilityRule =
  | boolean
  | ((ctx: LayoutContext) => boolean | Promise<boolean>)

/**
 * Positional control inside a `Grid` / `Split` parent. Emitted under
 * `meta._layout` and mapped to Tailwind utility classes (`col-span-*`,
 * `col-start-*`, `order-*`) by the renderer. Outside a grid/split the
 * keys are still emitted but the renderer ignores them.
 */
export interface LayoutPositioning {
  columnSpan?:  number
  columnStart?: number
  columnOrder?: number
}

/**
 * Base class for everything that can appear in a schema tree.
 *
 * `Field` (form input), `Action` (handler), and the display elements
 * (Text, Heading, Card, Section, Stat, ...) all extend this class. Container
 * elements populate `_children` to nest other Elements; leaves leave it
 * undefined.
 *
 * The contract is intentionally tiny — `getType()` to identify, `toMeta()`
 * to serialize. Everything else (visibility flags, validation, persistence)
 * is layered on by specialized subclasses (Phase 1.2+).
 */
export abstract class Element {
  protected _children?: Element[]

  // ─── Plan #8 layout-level state ───────────────────────
  protected _visibleRule?: LayoutVisibilityRule
  protected _columnSpan?:  number
  protected _columnStart?: number
  protected _columnOrder?: number

  /** Discriminator string. Used by the resolver and the client renderer. */
  abstract getType(): string

  /**
   * Serialize this element's own state (excluding children) to a JSON-safe
   * object. Children are handled by the resolver — do NOT inline them here.
   *
   * May return a Promise — reactive Field subclasses (Plan #5) compute
   * dependent options asynchronously by awaiting a user-supplied function.
   * The resolver awaits before merging children meta.
   */
  abstract toMeta(): Record<string, unknown> | Promise<Record<string, unknown>>

  /**
   * Children of a container element, or `undefined` for leaves. The resolver
   * walks this to build the nested meta tree.
   */
  getChildren(): Element[] | undefined {
    return this._children
  }

  // ─── Layout visibility (Plan #8) ──────────────────────

  /**
   * Show this element only when the predicate returns `true` (or is set
   * to `true` literally). Throwing predicates fail closed (treated as
   * `false`). The resolver evaluates this per resolve cycle and drops
   * the element from the meta tree when it returns false. Plan #8.
   *
   * Field subclasses use the existing `showWhen / hideWhen` API — this
   * setter on a Field is a no-op (Field's own visibility logic wins).
   * Action subclasses use the existing `.visible / .hidden` API.
   */
  visible(rule: LayoutVisibilityRule): this {
    this._visibleRule = rule
    return this
  }

  /**
   * Inverse of `visible()`. `hidden(true)` is the same as `visible(false)`;
   * `hidden(fn)` shows the element when `fn` returns `false`.
   */
  hidden(rule: LayoutVisibilityRule): this {
    if (typeof rule === 'boolean') {
      this._visibleRule = !rule
    } else {
      this._visibleRule = async (ctx) => !(await rule(ctx))
    }
    return this
  }

  hasVisibilityRule(): boolean {
    return this._visibleRule !== undefined
  }

  getVisibilityRule(): LayoutVisibilityRule | undefined {
    return this._visibleRule
  }

  /**
   * Resolve the visibility rule against a context. Returns `true` when no
   * rule is set. Async — callbacks may return a Promise. Throwing
   * callbacks resolve to `false` and log a warning, mirroring
   * `Action.evaluate`'s fail-closed posture.
   */
  async evaluateVisibility(ctx: LayoutContext = {}): Promise<boolean> {
    const rule = this._visibleRule
    if (rule === undefined) return true
    if (typeof rule === 'boolean') return rule
    try {
      return Boolean(await rule(ctx))
    } catch (err) {
      console.warn(`[pilotiq] visible() rule on ${this.getType()} threw:`, err)
      return false
    }
  }

  // ─── Layout positioning (Plan #8) ─────────────────────

  /**
   * Span `n` columns inside a parent `Grid` or `Split`. No-op when the
   * element isn't inside a grid container — the meta still emits the
   * hint, the renderer simply ignores it. Tailwind only generates
   * `col-span-1..N` for the parent's column count, so values larger
   * than the parent count are clamped at render.
   */
  columnSpan(n: number): this {
    this._columnSpan = n
    return this
  }

  /** Start at column `n` (1-indexed) inside a parent grid. */
  columnStart(n: number): this {
    this._columnStart = n
    return this
  }

  /** CSS `order` for reordering siblings on small viewports. */
  columnOrder(n: number): this {
    this._columnOrder = n
    return this
  }

  /**
   * Build the layout-positioning bag. Returns `undefined` when no
   * positioning method has been called — keeps `_layout` off the meta
   * for the common case where authors don't customize.
   */
  getLayoutPositioning(): LayoutPositioning | undefined {
    if (this._columnSpan  === undefined &&
        this._columnStart === undefined &&
        this._columnOrder === undefined) {
      return undefined
    }
    const out: LayoutPositioning = {}
    if (this._columnSpan  !== undefined) out.columnSpan  = this._columnSpan
    if (this._columnStart !== undefined) out.columnStart = this._columnStart
    if (this._columnOrder !== undefined) out.columnOrder = this._columnOrder
    return out
  }
}

/**
 * Resolved metadata — JSON-serializable, sent to the client via viewProps.
 *
 * `type` is the discriminator from `Element.getType()`. `children` (when
 * present) is the resolved meta tree of the element's children.
 */
export type ElementMeta = Record<string, unknown> & {
  type: string
  children?: ElementMeta[]
  /** Plan #8 — emitted only when the element used `columnSpan/Start/Order`. */
  _layout?: LayoutPositioning
}
