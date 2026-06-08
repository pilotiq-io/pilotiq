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
    /**
     * Present only when the row lives inside a `BuilderField` — the row's
     * block name (the `type` discriminator). Lets a single `itemHidden` /
     * `itemCanDelete` / `itemCanClone` / `itemCanReorder` rule branch by
     * block without checking `values` shape. Always `undefined` for
     * `RepeaterField` rows (which are homogeneous).
     */
    blockType?: string
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

  // ─── Global defaults — `configureUsing()` (Filament parity) ─────

  /**
   * Register a global default configurator for this element class. The
   * callback runs at `.make()` time on every freshly-created instance of
   * this class (and its subclasses), AFTER the framework's built-in
   * defaults but BEFORE any per-instance setters — so a global default set
   * here is overridden by an explicit `.columnSpan(2)` on one instance.
   * Mirrors Filament's `Component::configureUsing`.
   *
   * Configurators are keyed by class NAME on `globalThis`, so a
   * registration survives Vite SSR module duplication (a second module copy
   * of the class still resolves the same registry — see
   * `feedback_vite_ssr_module_dup_instanceof` for why module-scoped state is
   * unsafe here). Multiple registrations on one class stack in call order;
   * ancestor-class configurators run before descendant-class ones so the
   * more specific class wins.
   *
   * v1 is wired on `Field` + `Column` subclasses (the primitives most
   * commonly configured app-wide). Other Element subclasses can opt in by
   * funnelling their `make()` through `this.configured(...)`.
   *
   * @example
   * TextColumn.configureUsing(c => c.toggleable())
   * TextField.configureUsing(f => f.columnSpan(1).maxLength(255))
   */
  static configureUsing<I extends Element>(
    // Infer the instance type `I` from the class's `prototype` rather than a
    // construct signature — subclass constructors are protected/private, so a
    // `new (...) => I` bound would reject them. `name` is the registry key.
    this: { name: string; prototype: I },
    fn:   (el: I) => void,
  ): void {
    const reg = configuratorRegistry()
    const list = reg.get(this.name) ?? []
    list.push(fn as Configurator)
    reg.set(this.name, list)
  }

  /**
   * Apply every registered configurator to a freshly-made instance, walking
   * the prototype chain so ancestor-class configurators run before
   * descendant-class ones (specific wins on conflicting defaults). Every
   * wired `make()` factory funnels its new instance through this. No-op (and
   * allocation-free) when nothing is registered. Public so subclass `make()`
   * statics can call `this.configured(new X(...))`.
   */
  static configured<T extends Element>(instance: T): T {
    const reg = configuratorRegistry()
    if (reg.size === 0) return instance
    const chain: string[] = []
    let proto: unknown = Object.getPrototypeOf(instance)
    while (proto) {
      const ctor = (proto as { constructor?: { name?: string } }).constructor
      if (!ctor || !ctor.name || ctor.name === 'Object') break
      chain.push(ctor.name)
      proto = Object.getPrototypeOf(proto)
    }
    // chain = [Concrete, …, Element]; apply Element→Concrete (reverse) so
    // the most specific class's configurators run last and win.
    for (let i = chain.length - 1; i >= 0; i--) {
      const list = reg.get(chain[i]!)
      if (list) for (const fn of list) fn(instance)
    }
    return instance
  }

  /** Test seam — clear all registered configurators, or just one class's. */
  static resetConfigurators(className?: string): void {
    const reg = configuratorRegistry()
    if (className === undefined) reg.clear()
    else reg.delete(className)
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

/** A `configureUsing` callback. Receives the freshly-made element. */
type Configurator = (el: Element) => void

/**
 * `globalThis`-backed registry of `configureUsing` callbacks keyed by class
 * name. Lives on `globalThis` (not module scope) so registrations survive
 * Vite SSR module duplication — a second bundled copy of `Element` resolves
 * the same Map. Same posture as rudder's cross-bundle singletons.
 */
function configuratorRegistry(): Map<string, Configurator[]> {
  const KEY = '__pilotiq_element_configurators__'
  const g = globalThis as Record<string, unknown>
  let reg = g[KEY] as Map<string, Configurator[]> | undefined
  if (!reg) { reg = new Map<string, Configurator[]>(); g[KEY] = reg }
  return reg
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
