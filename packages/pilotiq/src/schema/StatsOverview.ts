import { ServerDataElement } from './ServerDataElement.js'
import type { RenderContext } from './resolveSchema.js'
import { Stat, type StatMeta } from './Stat.js'

/**
 * Plan #15 Phase B — `StatsOverview` is the KPI-card row widget.
 * Subclasses return an array of `Stat`s from `getStats(ctx)`; the
 * resolver lays them out as a grid of cards.
 *
 * Subclass form (primary):
 *
 *   import { StatsOverview, Stat } from '@pilotiq/pilotiq'
 *
 *   export class UsersStats extends StatsOverview {
 *     static override columns = 3
 *     static override async getStats(ctx) {
 *       return [
 *         Stat.make('Users').value(await User.query().count()).color('success'),
 *         Stat.make('Active sessions').value(await Session.query().active().count()),
 *         Stat.make('Revenue (MTD)').value('$' + total).icon('dollar-sign'),
 *       ]
 *     }
 *   }
 *
 *   // Page.schema()
 *   UsersStats.make()
 *
 * Fluent form (one-off — no subclass):
 *
 *   StatsOverview.make('quick-kpis')
 *     .columns(2)
 *     .getStatsHandler(async () => [Stat.make('Foo').value(1)])
 *
 * Wire-shape:
 *   meta:       { type: 'stats', columns?, serverData, id, lazy[, poll] }
 *   _widgetData[id]: { stats: StatMeta[] }
 *
 * Lazy default = true (inherited from `ServerDataElement`).
 */

export type StatsHandler = (ctx: RenderContext) => Stat[] | Promise<Stat[]>

export interface StatsOverviewPayload {
  stats: StatMeta[]
}

export class StatsOverview extends ServerDataElement {
  /** Subclass-time defaults — read by `make()`-built instances unless
   *  the fluent setter overrides. Mirrors the `View.componentName /
   *  getData` precedent. */
  static columns?: number
  static getStats?: StatsHandler

  // ─── Instance state (fluent overrides) ─────────────────────
  private _columns?:   number
  private _getStats?:  StatsHandler

  // Public for subclass `new this(id)` (matches `View`).
  constructor(id?: string) {
    super()
    if (id) this._id = id
  }

  static make(this: new (id?: string) => StatsOverview, id?: string): StatsOverview {
    return ServerDataElement.configured(new this(id))
  }

  /** Cards-per-row. Falls back to the static `columns` if the fluent
   *  setter wasn't called; renderer defaults further to a sensible
   *  number when neither is set. */
  columns(n: number): this {
    this._columns = n
    return this
  }

  /** Override the data hook. Useful for the fluent (no-subclass) form;
   *  for the subclass form prefer `static override async getStats(...)`. */
  getStatsHandler(fn: StatsHandler): this {
    this._getStats = fn
    return this
  }

  getType(): string { return 'stats' }

  /** Effective columns count. Instance setter wins; static is the
   *  fallback. Returns `undefined` when neither is set. */
  getColumns(): number | undefined {
    if (this._columns !== undefined) return this._columns
    const ctor = this.constructor as { columns?: number }
    return ctor.columns
  }

  toMeta(): Record<string, unknown> {
    const meta: Record<string, unknown> = { type: 'stats' as const }
    const cols = this.getColumns()
    if (cols !== undefined) meta['columns'] = cols
    return meta
  }

  /**
   * Run the configured stats hook. Falls back through:
   *   1. instance setter (`overview.getStatsHandler(fn)`),
   *   2. static method on the subclass (`static async getStats(ctx) {…}`),
   *   3. empty list (`{ stats: [] }`).
   *
   * Resolved Stat objects are serialized to JSON-clean `StatMeta`s here
   * so the renderer doesn't need to know about the `Stat` class.
   */
  async resolveServerData(ctx: RenderContext): Promise<StatsOverviewPayload> {
    let stats: Stat[] = []
    if (this._getStats) {
      stats = await this._getStats(ctx)
    } else {
      const ctor = this.constructor as { getStats?: StatsHandler }
      if (ctor.getStats) stats = await ctor.getStats(ctx)
    }
    return { stats: stats.map(s => s.toMeta()) }
  }
}
