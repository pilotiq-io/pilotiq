import { ServerDataElement, type RenderContext } from '@pilotiq/pilotiq'
import {
  CHART_TYPES,
  type ChartColor,
  type ChartData,
  type ChartType,
} from './types.js'

/**
 * Plan #15 Phase C — `Chart` is the dashboard-chart widget. Subclasses
 * (recommended) declare type / label / data hook as statics; the fluent
 * form is fine for one-offs.
 *
 * Subclass form:
 *
 *   import { Chart } from '@pilotiq/recharts'
 *   export class PostsChart extends Chart {
 *     static override label = 'Posts per day'
 *     static override type  = 'line' as const
 *     static override color = 'primary'
 *     static override maxHeight = 320
 *     static override filters = {
 *       today: 'Today', week: 'Last 7 days', month: 'Last 30 days',
 *     }
 *     static override defaultFilter = 'week'
 *
 *     static override async getData(ctx) {
 *       return {
 *         labels:   [...],
 *         datasets: [{ label: 'Posts', data: [...] }],
 *       }
 *     }
 *   }
 *
 * Fluent form:
 *
 *   Chart.make('posts')
 *     .label('Posts per day')
 *     .type('line')
 *     .color('primary')
 *     .getData(async (ctx) => ({ labels: [...], datasets: [{...}] }))
 *
 * Wire-shape (`ChartMeta`):
 *   { type: 'chart', chartType, label?, color?, maxHeight?, options?,
 *     filters?, defaultFilter?, serverData, id, lazy[, poll][, widgetUrl] }
 *   _widgetData[id]: ChartData
 *
 * Lazy default = true (inherited from `ServerDataElement`).
 */

export type ChartDataHandler = (ctx: RenderContext) => ChartData | Promise<ChartData>

export class Chart extends ServerDataElement {
  // ─── Subclass-time defaults ────────────────────────────────
  /** Chart type. Must be one of `CHART_TYPES`. Subclasses override; the
   *  fluent setter overrides on top of the subclass static. Defaults to
   *  `'line'` when neither is set. */
  static type?:        ChartType
  static label?:       string
  static color?:       ChartColor
  static maxHeight?:   number
  /** Pass-through Recharts props the renderer spreads onto the chart's
   *  primary `<Line / Bar / Pie>` component. Escape hatch for tweaks
   *  beyond the curated fluent surface. */
  static options?:     Record<string, unknown>
  /** `{ key: human-label }` map for the per-chart filter dropdown. The
   *  selected key rides on `ctx.filter` so `getData` can branch on it. */
  static filters?:     Record<string, string>
  static defaultFilter?: string
  static getData?:     ChartDataHandler

  // ─── Instance state (fluent overrides) ─────────────────────
  private _type?:          ChartType
  private _label?:         string
  private _color?:         ChartColor
  private _maxHeight?:     number
  private _options?:       Record<string, unknown>
  private _filters?:       Record<string, string>
  private _defaultFilter?: string
  private _getData?:       ChartDataHandler

  // Public for subclass `new this(id)` (matches View / StatsOverview).
  constructor(id?: string) {
    super()
    if (id) this._id = id
  }

  static make(this: new (id?: string) => Chart, id?: string): Chart {
    return new this(id)
  }

  type(value: ChartType): this {
    if (!CHART_TYPES.includes(value)) {
      throw new Error(
        `Chart: unknown chart type "${value}". Allowed: ${CHART_TYPES.join(', ')}.`,
      )
    }
    this._type = value
    return this
  }

  label(text: string): this {
    this._label = text
    return this
  }

  color(value: ChartColor): this {
    this._color = value
    return this
  }

  /** Max chart height in pixels — caps the rendered surface so a tall
   *  card doesn't push the rest of the dashboard off-screen. */
  maxHeight(px: number): this {
    if (Number.isFinite(px) && px > 0) this._maxHeight = px
    return this
  }

  /** Raw props passed through to the renderer's primary chart component
   *  (`<Line>` / `<Bar>` / `<Pie>`). Escape hatch only — prefer the
   *  curated fluent surface where possible. */
  options(props: Record<string, unknown>): this {
    this._options = props
    return this
  }

  filters(map: Record<string, string>): this {
    this._filters = map
    return this
  }

  defaultFilter(key: string): this {
    this._defaultFilter = key
    return this
  }

  /** Fluent override for the `getData` hook. For the subclass form
   *  prefer `static override async getData(ctx) {…}`. */
  getData(fn: ChartDataHandler): this {
    this._getData = fn
    return this
  }

  /** @deprecated Spelled `getData` for parity with View / StatsOverview;
   *  kept here for symmetry with `getDataHandler` on those classes. */
  getDataHandler(fn: ChartDataHandler): this {
    return this.getData(fn)
  }

  // ─── Effective getters (instance > static) ─────────────────
  getType(): string { return 'chart' }

  getChartType(): ChartType {
    if (this._type) return this._type
    const ctor = this.constructor as { type?: ChartType }
    return ctor.type ?? 'line'
  }

  getLabel(): string | undefined {
    if (this._label !== undefined) return this._label
    const ctor = this.constructor as { label?: string }
    return ctor.label
  }

  getColor(): ChartColor | undefined {
    if (this._color !== undefined) return this._color
    const ctor = this.constructor as { color?: ChartColor }
    return ctor.color
  }

  getMaxHeight(): number | undefined {
    if (this._maxHeight !== undefined) return this._maxHeight
    const ctor = this.constructor as { maxHeight?: number }
    return ctor.maxHeight
  }

  getOptions(): Record<string, unknown> | undefined {
    if (this._options !== undefined) return this._options
    const ctor = this.constructor as { options?: Record<string, unknown> }
    return ctor.options
  }

  getFilters(): Record<string, string> | undefined {
    if (this._filters !== undefined) return this._filters
    const ctor = this.constructor as { filters?: Record<string, string> }
    return ctor.filters
  }

  getDefaultFilter(): string | undefined {
    if (this._defaultFilter !== undefined) return this._defaultFilter
    const ctor = this.constructor as { defaultFilter?: string }
    return ctor.defaultFilter
  }

  toMeta(): Record<string, unknown> {
    const meta: Record<string, unknown> = {
      type:      'chart' as const,
      chartType: this.getChartType(),
    }
    const label = this.getLabel()
    if (label !== undefined) meta['label'] = label
    const color = this.getColor()
    if (color !== undefined) meta['color'] = color
    const maxHeight = this.getMaxHeight()
    if (maxHeight !== undefined) meta['maxHeight'] = maxHeight
    const options = this.getOptions()
    if (options !== undefined) meta['options'] = options
    const filters = this.getFilters()
    if (filters !== undefined) meta['filters'] = filters
    const defaultFilter = this.getDefaultFilter()
    if (defaultFilter !== undefined) meta['defaultFilter'] = defaultFilter
    return meta
  }

  /**
   * Resolve the chart's data payload. Falls back through:
   *   1. instance setter (`chart.getData(fn)`),
   *   2. static method on the subclass (`static async getData(ctx) {…}`),
   *   3. empty `{ labels: [], datasets: [] }`.
   *
   * `ctx.filter` carries the per-chart filter key so `getData` can
   * branch on it. The polling endpoint stamps `ctx.filter` from the
   * request body; the synchronous server-render path falls back to
   * `defaultFilter` when nothing is set.
   */
  async resolveServerData(ctx: RenderContext): Promise<ChartData> {
    const fallback = this.getDefaultFilter()
    // Spread `filter` only when we actually have a value — under
    // `exactOptionalPropertyTypes`, stamping `filter: undefined` differs
    // from omitting the key.
    const effectiveCtx: RenderContext = ctx.filter
      ? ctx
      : (fallback !== undefined ? { ...ctx, filter: fallback } : ctx)
    if (this._getData) return this._getData(effectiveCtx)
    const ctor = this.constructor as { getData?: ChartDataHandler }
    if (ctor.getData) return ctor.getData(effectiveCtx)
    return { labels: [], datasets: [] }
  }
}
