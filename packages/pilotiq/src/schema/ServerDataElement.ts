import { Element, type ElementMeta } from './Element.js'
import type { RenderContext } from './resolveSchema.js'

/**
 * Element subclasses that compute their render-time payload from the
 * server. Plan #15 widgets — `Stat / StatsOverview / Chart / Table /
 * View` extend this. The contract is intentionally tiny:
 *
 *   - identity: every element carries an id (`Stat.make(id)` / inferred
 *     class name fallback) so the polling endpoint can find it,
 *   - hook:     `resolveServerData(ctx)` returns whatever JSON-clean
 *     payload the renderer should consume,
 *   - flags:    `poll(seconds)`, `lazy(bool=true)` shape the wire.
 *
 * `pageData.resolveServerDataElements` walks every page-data builder's
 * tree, collects elements where `isServerDataElement()` is true, and
 * runs `resolveServerData(ctx)` in parallel — except for lazy ones,
 * which paint a skeleton client-side and fetch via the polling endpoint
 * on mount. Results land on a single `_widgetData[id]` map alongside
 * `schemaData` so the renderer can look up its payload by id.
 *
 * Subclasses don't need to call `super.toMeta()` — the resolver stamps
 * `serverData / poll / lazy / id` onto the meta after the subclass's own
 * `toMeta()` runs. This keeps subclass meta authoring focused on the
 * widget's own surface (label, type, columns, …).
 */
export abstract class ServerDataElement extends Element {
  protected _id?: string
  protected _poll?: number
  // Default lazy=true (matches Filament v5's `$isLazy = true` default).
  // `undefined` is treated as `true` everywhere; explicit `false` opts
  // out (synchronous server-side resolve, ships data on first paint).
  protected _lazy?: boolean

  /**
   * Stable identifier. Required so the polling endpoint can find this
   * element after re-walking the schema. Subclasses that use a fluent
   * factory (`Chart.make('posts-chart')`) pass an explicit id; subclasses
   * that don't (e.g. `View`, where the user extends with `class
   * ContributionMap extends View {}`) fall back to the constructor's
   * class name via `getId()`.
   */
  getId(): string {
    if (this._id) return this._id
    const ctor = this.constructor as { name?: string }
    return ctor.name ?? 'widget'
  }

  /** Set an explicit id. Useful when two instances of the same subclass
   *  appear on the same page (e.g. two `View.component(X)` widgets). */
  id(value: string): this {
    this._id = value
    return this
  }

  /** Polling interval in seconds. Number-only by design (cleaner than
   *  Filament's '30s' string). Zero / negative / non-finite values are
   *  ignored. */
  poll(seconds: number): this {
    if (Number.isFinite(seconds) && seconds > 0) this._poll = seconds
    return this
  }

  getPoll(): number | undefined {
    return this._poll
  }

  /**
   * Opt out of (or back into) lazy loading. Default is lazy: the server
   * paints a skeleton on first render and the client fetches the
   * payload via the polling endpoint on mount. `lazy(false)` makes the
   * server resolve `getServerData(ctx)` synchronously and ship the
   * payload with the page.
   */
  lazy(value: boolean = true): this {
    this._lazy = value
    return this
  }

  /** True when this element should ship lazy (skeleton + first-paint
   *  fetch). Default is true; unset === true. */
  isLazy(): boolean {
    return this._lazy !== false
  }

  /** Discriminator that pageData / routes use to find server-data
   *  elements without `instanceof` (Vite SSR module-cache duplication
   *  trap — same posture as `findForms`). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- structural marker
  isServerDataElement(): true { return true }

  /**
   * Compute this element's render-time payload. Receives the same
   * `RenderContext` the resolver builds (record/user/values/$get/...).
   * Implementations should return a JSON-clean value — the resolver
   * stamps it under `_widgetData[id]` for the renderer to consume.
   *
   * May throw — `resolveServerDataElements` swallows the throw and
   * stamps `_widgetData[id] = { error: '...' }` so a single failing
   * widget doesn't blank the whole dashboard. The polling-endpoint
   * path handles errors symmetrically.
   */
  abstract resolveServerData(ctx: RenderContext): Promise<unknown>
}

/**
 * Structural type guard — Vite SSR module-cache duplication breaks
 * `instanceof` across module-graph entries (see
 * `feedback_vite_ssr_module_dup_instanceof.md`). Matches the
 * `findForms / findActions / isRepeaterField / isBuilderField` pattern.
 */
export function isServerDataElement(el: Element): el is ServerDataElement {
  const probe = el as unknown as { isServerDataElement?: () => unknown }
  return typeof probe.isServerDataElement === 'function' && probe.isServerDataElement() === true
}

/**
 * Stamp `serverData / id / poll / lazy` onto an element's meta after
 * subclass `toMeta()` runs. Called by `resolveSchema` for every
 * `ServerDataElement`. Subclasses keep their `toMeta()` clean — they
 * only emit their own surface (label, kind, columns, …).
 *
 * Only stamps `lazy: true` when explicit; undefined-default ships as
 * `lazy: true` since the renderer treats absent as true. Keeps the wire
 * compact for the synchronous case (`lazy(false)` → no key emitted, but
 * `_widgetData[id]` already carries the payload).
 */
export function stampServerDataMeta(el: ServerDataElement, meta: ElementMeta): void {
  meta['serverData'] = true
  meta['id']         = el.getId()
  const poll = el.getPoll()
  if (poll !== undefined) meta['poll'] = poll
  // Always emit `lazy` so the renderer doesn't have to fall back through
  // a default — explicit > implicit on the wire.
  meta['lazy'] = el.isLazy()
}
