import { ServerDataElement } from './ServerDataElement.js'
import type { RenderContext } from './resolveSchema.js'

/**
 * Plan #15 — `View` is the escape-hatch widget. Drops down to a
 * user-supplied React component, optionally fed by a server-side
 * `getData(ctx)` hook. Useful when the built-in widgets (Stat / Chart /
 * Table) don't fit — calendar heatmaps, custom map embeds, anything
 * one-off enough to not warrant a new built-in.
 *
 * Two usage patterns:
 *
 * **Subclass form** — extend `View` so the component reference + data
 * hook both live as statics on a stable class:
 *
 *   import { View } from '@pilotiq/pilotiq'
 *   export class ContributionMap extends View {
 *     static columnSpan = 3
 *     static componentName = 'CalendarHeatmap'
 *     static async getData(ctx) {
 *       return { days: await Activity.query().last(365).countByDay() }
 *     }
 *   }
 *
 *   // bootstrap/providers.ts
 *   registerWidgetComponents({ CalendarHeatmap })
 *
 *   // Page.schema()
 *   ContributionMap.make()
 *
 * **Fluent form** — for one-off cases where a subclass is overkill:
 *
 *   View.make('contribs')
 *     .component('CalendarHeatmap')
 *     .getData(async () => ({ days: ... }))
 *
 * The component receives `{ data }` as its sole prop (resolved from
 * `getData / resolveServerData`). Components are looked up at render
 * through the `widgets/registry` (see `registerWidgetComponents`).
 */

export type ViewDataHandler = (ctx: RenderContext) => unknown | Promise<unknown>

export class View extends ServerDataElement {
  /**
   * Component name used to look up the registered React component at
   * render time. Subclasses set this as a static; the fluent form sets
   * it via `.component(name)`.
   *
   * (Despite the name, this is a *string key* into the runtime registry,
   * not a component reference itself — keeps `View` shippable through
   * `viewProps` and avoids the `_components.ts` manifest walker.)
   */
  static componentName?: string

  /** Subclass-time getData hook. The fluent setter overrides this. */
  static getData?: ViewDataHandler

  // ─── Instance state (fluent overrides) ────────────────────
  private _componentName?: string
  private _getData?:       ViewDataHandler

  // Public for `make()`'s `new this(id)` factory call from subclasses —
  // a protected ctor here breaks `class Foo extends View {}; Foo.make()`
  // because the typeof Foo signature wouldn't satisfy `new (id?) => View`.
  constructor(id?: string) {
    super()
    if (id) this._id = id
  }

  /**
   * Factory. Optional id — when omitted, `getId()` falls back to the
   * subclass's class name (e.g. `ContributionMap`). Pass an explicit id
   * when two instances of the same subclass appear on the same page,
   * or for the bare `View.make('foo')` fluent form (no subclass to
   * derive a name from).
   */
  static make(this: new (id?: string) => View, id?: string): View {
    return ServerDataElement.configured(new this(id))
  }

  /** Set / override the registered component name. */
  component(name: string): this {
    this._componentName = name
    return this
  }

  /** Set / override the data handler. */
  getDataHandler(fn: ViewDataHandler): this {
    this._getData = fn
    return this
  }

  getType(): string { return 'view' }

  /** Resolve the effective component name (instance > static > fallback to id). */
  getComponentName(): string {
    if (this._componentName) return this._componentName
    const ctor = this.constructor as { componentName?: string }
    if (ctor.componentName) return ctor.componentName
    // Last resort — use the element's id so a subclass that forgets to
    // declare a `componentName` static still has a deterministic lookup
    // key. The renderer surfaces a "component not registered" error
    // when the registry doesn't carry it.
    return this.getId()
  }

  toMeta(): Record<string, unknown> {
    return {
      type:      'view' as const,
      component: this.getComponentName(),
    }
  }

  /**
   * Run the configured `getData(ctx)`. Falls back through:
   *   1. instance setter (`view.getDataHandler(fn)`),
   *   2. static method on the subclass (`static async getData(ctx) {…}`),
   *   3. `null` (View renders the component with `data: null`).
   */
  async resolveServerData(ctx: RenderContext): Promise<unknown> {
    if (this._getData) return this._getData(ctx)
    const ctor = this.constructor as { getData?: ViewDataHandler }
    if (ctor.getData) return ctor.getData(ctx)
    return null
  }
}
