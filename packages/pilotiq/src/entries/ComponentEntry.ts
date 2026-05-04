import { Entry, type EntryMeta } from './Entry.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Escape-hatch infolist entry. Hands rendering off to a user-supplied
 * React component registered via `registerEntryComponents()`. Useful
 * when the built-in entries (Text/Badge/Icon/Image/KeyValue/Color) don't
 * fit — a coordinates map, an audit-trail timeline, an embedded chart.
 *
 * Two usage patterns mirror the `View` widget shape:
 *
 * **Subclass form** — extend `ComponentEntry` so the component reference
 * lives as a static on a stable class:
 *
 *   import { ComponentEntry } from '@pilotiq/pilotiq'
 *   export class CoordinatesMap extends ComponentEntry {
 *     static componentName = 'CoordinatesMap'
 *   }
 *
 *   // bootstrap/providers.ts
 *   registerEntryComponents({ CoordinatesMap })
 *
 *   // Resource.detail()
 *   CoordinatesMap.make('location').label('Where')
 *
 * **Fluent form** — for one-off cases where a subclass is overkill:
 *
 *   ComponentEntry.make('location').component('CoordinatesMap')
 *
 * The component receives `{ value, record }` as its sole props — `value`
 * is the entry's resolved state value (honors `.state(path | fn)` like
 * any other entry) and `record` is the full loaded record. Components
 * are looked up at render through the entry-component registry (see
 * `@pilotiq/pilotiq/entries`).
 */
export class ComponentEntry extends Entry {
  /**
   * Component name used to look up the registered React component at
   * render time. Subclasses set this as a static; the fluent form sets
   * it via `.component(name)`.
   *
   * (Despite the name, this is a *string key* into the runtime registry,
   * not a component reference itself — keeps `ComponentEntry` shippable
   * through `viewProps` and avoids the `_components.ts` manifest walker,
   * mirroring the `View` widget convention.)
   */
  static componentName?: string

  protected _componentName?: string

  // Public for `make()`'s `new this(name)` factory call from subclasses —
  // a protected ctor here breaks `class Foo extends ComponentEntry {}; Foo.make('x')`
  // because the typeof Foo signature wouldn't satisfy `new (name) => ComponentEntry`.
  constructor(name: string) {
    super(name)
  }

  static make(
    this: new (name: string) => ComponentEntry,
    name: string,
  ): ComponentEntry {
    return new this(name)
  }

  /** Set / override the registered component name. */
  component(name: string): this {
    this._componentName = name
    return this
  }

  protected override getEntryType(): string { return 'component' }

  /** Resolve the effective component name (instance > static > fallback to entry name). */
  getComponentName(): string {
    if (this._componentName) return this._componentName
    const ctor = this.constructor as { componentName?: string }
    if (ctor.componentName) return ctor.componentName
    // Last resort — use the entry's `name`, mirroring `View.getId()`'s
    // fallback. The renderer surfaces a "component not registered" error
    // when the registry doesn't carry it.
    return this._name
  }

  /**
   * Builds the wire meta with `entryType: 'component'` plus the
   * registered component-name lookup key. Inherits `value`, `label`,
   * chrome, and `_formatted` from `Entry.toMeta` — the renderer wraps
   * the user component in `<EntryShell>` for label / helperText / tooltip
   * / copyable parity with every other entry leaf.
   */
  override toMeta(ctx?: RenderContext): EntryMeta & { component: string } {
    const meta = super.toMeta(ctx) as EntryMeta
    return { ...meta, component: this.getComponentName() }
  }
}
