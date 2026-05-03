import { ServerDataElement } from './ServerDataElement.js'
import type { RenderContext } from './resolveSchema.js'
import { Column, type ColumnMeta } from '../Column.js'
import {
  type ModelLike,
  type ModelQuery,
} from '../orm/modelDefaults.js'

/**
 * Plan #15 Phase D — `TableWidget` is the slim-table dashboard widget.
 * Mirrors Filament's `Filament\Widgets\TableWidget`: a dashboard tile
 * that surfaces a small list of records (e.g. "5 newest posts") without
 * the full Resource list-page chrome (no filters, no bulk actions, no
 * pagination, no search).
 *
 * Distinct from the schema-element `Table` (`elements/Table.ts`) — that
 * one drives Resource list pages and carries the full surface. The
 * widget renders a stripped-down `<table>` paint and reads its rows from
 * `_widgetData[id]`.
 *
 * **Subclass form** (primary):
 *
 *   import { TableWidget } from '@pilotiq/pilotiq'
 *   import { TextColumn } from '@pilotiq/pilotiq/columns'
 *   import { Post } from '#models'
 *
 *   export class RecentPosts extends TableWidget {
 *     static override label = 'Recent posts'
 *     static override model = Post
 *     static override viewAllUrl = '/admin/posts'
 *     static override async query(q) {
 *       return q.orderBy('createdAt', 'desc').paginate(1, 5)
 *     }
 *     static override columns() {
 *       return [
 *         TextColumn.make('title').limit(40),
 *         TextColumn.make('createdAt').dateTime(),
 *       ]
 *     }
 *   }
 *
 * **Fluent form** — useful for one-off cases:
 *
 *   TableWidget.make('recent-posts')
 *     .label('Recent posts')
 *     .columns([Column.make('title')])
 *     .records(async () => ({ rows: [{ title: 'Hi' }], total: 1 }))
 *     .viewAllUrl('/admin/posts')
 *
 * Wire-shape:
 *   meta:           { type: 'tableWidget', label?, viewAllUrl?, columns: ColumnMeta[],
 *                     serverData, id, lazy[, poll] }
 *   _widgetData[id]: { rows: Record<string, unknown>[]; total?: number }
 *
 * Lazy default = true (inherited from `ServerDataElement`).
 */

/** Result returned by `records()` — rows plus optional total. The total
 *  is informational only in v1 (no pagination in the slim renderer);
 *  reserved for future "View all (24)" badge sugar. */
export interface TableWidgetRecordsResult {
  rows:   Record<string, unknown>[]
  total?: number
}

export type TableWidgetRecordsHandler = (
  ctx: RenderContext,
) => TableWidgetRecordsResult | Promise<TableWidgetRecordsResult>

/**
 * Subclass-form `query(q)` hook — receives a `ModelQuery` from
 * `static model.query()` and returns a `Promise<{ data, total }>`. The
 * `paginate()` call lives inside the hook so users control limit (e.g.
 * `q.orderBy(...).paginate(1, 5)` for "5 newest").
 *
 * Returning the bare query (without `paginate()`) is a programming error
 * — the widget needs an awaited result, not another query builder.
 */
export type TableWidgetQueryHandler = (
  q: ModelQuery,
) => Promise<{ data: unknown[]; total: number }>

export interface TableWidgetPayload {
  rows:   Record<string, unknown>[]
  total?: number
}

export class TableWidget extends ServerDataElement {
  // ─── Subclass-time defaults ──────────────────────────────
  /** Heading rendered above the table. Falls back to the class name when
   *  unset and `viewAllUrl` is set (the link needs visible chrome). */
  static label?: string
  /** Optional ORM model — when set, default `records()` does
   *  `M.query()` then runs the configured `query()` hook (which must
   *  paginate to bound the row count). */
  static model?: ModelLike
  /** Optional "View all →" link href shown in the widget header. */
  static viewAllUrl?: string
  /** Subclass-form column factory. Called once per resolve; instance
   *  setter wins. */
  static columns?: () => Column[]
  /** Subclass-form query hook (model-driven path). Falls back to a
   *  bare `paginate(1, 5)` when unset. */
  static query?: TableWidgetQueryHandler
  /** Subclass-form full-records override. When set, takes precedence
   *  over `model + query`. */
  static records?: TableWidgetRecordsHandler

  // ─── Instance state (fluent overrides) ──────────────────
  private _label?:       string
  private _model?:       ModelLike
  private _viewAllUrl?:  string
  private _columns?:     Column[]
  private _query?:       TableWidgetQueryHandler
  private _records?:     TableWidgetRecordsHandler

  constructor(id?: string) {
    super()
    if (id) this._id = id
  }

  static make(this: new (id?: string) => TableWidget, id?: string): TableWidget {
    return new this(id)
  }

  // ─── Fluent setters ──────────────────────────────────────

  /** Heading rendered above the table. */
  label(text: string): this {
    this._label = text
    return this
  }

  /** Bind a `ModelLike` for the default model-driven records loader. */
  model(M: ModelLike): this {
    this._model = M
    return this
  }

  /** Custom query hook — receives `M.query()` and must return a
   *  `paginate()` promise. Composes with `.model(M)`. */
  query(fn: TableWidgetQueryHandler): this {
    this._query = fn
    return this
  }

  /** Full records override — fully replaces the `model + query` path. */
  records(fn: TableWidgetRecordsHandler): this {
    this._records = fn
    return this
  }

  /** Column children. The renderer reads label / format / columnType /
   *  formatter from each column's resolved meta — same shape as the
   *  Resource list table. Columns are serialized inline under
   *  `meta.columns` (not under `meta.children`) so the resolver doesn't
   *  treat them as standalone nodes. */
  columns(cols: Column[]): this {
    this._columns = cols
    return this
  }

  /** "View all →" link href. */
  viewAllUrl(href: string): this {
    this._viewAllUrl = href
    return this
  }

  // ─── Getters ─────────────────────────────────────────────

  /** Effective label. Instance setter wins; static is the fallback. */
  getLabel(): string | undefined {
    if (this._label !== undefined) return this._label
    const ctor = this.constructor as { label?: string }
    return ctor.label
  }

  /** Effective viewAllUrl. */
  getViewAllUrl(): string | undefined {
    if (this._viewAllUrl !== undefined) return this._viewAllUrl
    const ctor = this.constructor as { viewAllUrl?: string }
    return ctor.viewAllUrl
  }

  /** Effective model. */
  getModel(): ModelLike | undefined {
    if (this._model !== undefined) return this._model
    const ctor = this.constructor as { model?: ModelLike }
    return ctor.model
  }

  /** Effective columns. Instance setter wins; static factory is the
   *  fallback. Empty array when neither is set. */
  getColumns(): Column[] {
    if (this._columns !== undefined) return this._columns
    const ctor = this.constructor as { columns?: () => Column[] }
    if (typeof ctor.columns === 'function') {
      const out = ctor.columns()
      this._columns = out
      return out
    }
    return []
  }

  override getType(): string { return 'tableWidget' }

  override toMeta(): Record<string, unknown> {
    const meta: Record<string, unknown> = { type: 'tableWidget' as const }
    const label = this.getLabel()
    if (label !== undefined) meta['label'] = label
    const url = this.getViewAllUrl()
    if (url !== undefined) meta['viewAllUrl'] = url
    meta['columns'] = this.getColumns().map(c => c.toMeta() as ColumnMeta)
    return meta
  }

  // ─── Server-data resolve ────────────────────────────────

  /**
   * Run the configured row loader. Falls back through:
   *   1. instance `.records(fn)` setter,
   *   2. subclass `static records(ctx)`,
   *   3. instance `.model(M) + .query(fn)`,
   *   4. subclass `static model + static query?(q)`,
   *   5. error — at least one path must be configured.
   *
   * The default `query` hook (when only `model` is set) is
   * `q => q.paginate(1, 5)`. Override on the subclass for "10 newest"
   * etc.
   */
  async resolveServerData(ctx: RenderContext): Promise<TableWidgetPayload> {
    let payload: TableWidgetPayload

    if (this._records) {
      payload = this.normalizeResult(await this._records(ctx))
    } else {
      const ctor = this.constructor as { records?: TableWidgetRecordsHandler }
      if (ctor.records) {
        payload = this.normalizeResult(await ctor.records(ctx))
      } else {
        const M = this.getModel()
        if (!M) {
          throw new Error(
            `[Pilotiq] TableWidget "${this.getId()}" has no rows source — call .records(fn), ` +
            `.model(M).query(fn), or set static model / records / columns on the subclass.`,
          )
        }
        const q  = M.query()
        const fn = this._query ?? (this.constructor as { query?: TableWidgetQueryHandler }).query ?? defaultQueryHook
        const result = await fn(q)
        payload = result.total !== undefined
          ? { rows: (result.data as Record<string, unknown>[]) ?? [], total: result.total }
          : { rows: (result.data as Record<string, unknown>[]) ?? [] }
      }
    }

    // Per-row server-side `formatStateUsing` — same convention as the
    // full `Table` (`row._formatted[colName]`). Skipped when no column
    // has a formatter so we don't allocate per-row in the common case.
    const columnsWithFormatter = this.getColumns().filter(c => c.hasFormatter())
    if (columnsWithFormatter.length > 0) {
      payload.rows = payload.rows.map(row => {
        const formatted: Record<string, string> = {}
        for (const col of columnsWithFormatter) {
          const fn = col.getFormatStateHandler()
          if (!fn) continue
          try { formatted[col.name] = fn(row[col.name], row) }
          catch { /* fall back to raw value in renderer */ }
        }
        return { ...row, _formatted: formatted }
      })
    }

    return payload
  }

  private normalizeResult(r: TableWidgetRecordsResult): TableWidgetPayload {
    return r.total !== undefined
      ? { rows: r.rows, total: r.total }
      : { rows: r.rows }
  }
}

/** Default query hook — paginate to the first 5 rows. Users override on
 *  the subclass (`static async query(q) { return q.orderBy(...).paginate(1, 10) }`)
 *  or via the instance setter for limits / sorts. */
function defaultQueryHook(q: ModelQuery): Promise<{ data: unknown[]; total: number }> {
  return q.paginate(1, 5)
}
