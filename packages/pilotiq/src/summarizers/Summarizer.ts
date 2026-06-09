/**
 * Column summarizers — server-side aggregators displayed in the table's
 * `<tfoot>`. Attached via `Column.summarize([Sum.make(), …])` and stamped
 * onto `TableMeta.summaries` for the renderer.
 *
 * Two computation paths share the same `label` / `format` chrome:
 *
 * - **Cross-page (default, model-backed tables):** the records handler runs
 *   a second aggregate query over the FULL filtered set (`SUM`/`AVG`/`MIN`/
 *   `MAX`/`COUNT`) and feeds the resolved scalars to {@link resultFromScalars}.
 *   This is what a "Total" should mean — the whole result, not page 1.
 * - **Per-page (fallback):** custom `records()` handlers and columns that
 *   aren't real DB columns (virtual / `formatStateUsing` / relationship)
 *   fall back to {@link compute} over the rendered rows in `loadTableRecords`.
 */

export type SummarizerKind = 'sum' | 'average' | 'count' | 'range'

/** SQL aggregate functions a summarizer can request over its column for the
 *  cross-page path. `count` is special-cased by the handler — it reuses the
 *  paginator's `total` rather than issuing a separate `COUNT(*)`. */
export type AggregateFn = 'sum' | 'avg' | 'min' | 'max' | 'count'

export interface SummarizerMeta {
  kind:   SummarizerKind
  label?: string
}

export interface SummaryResult {
  kind:   SummarizerKind
  value:  string
  label?: string
}

export type SummaryFormatter = (value: number) => string

export abstract class Summarizer {
  protected _label?:  string
  protected _format?: SummaryFormatter

  abstract readonly kind: SummarizerKind

  /** Inline label rendered before the value (e.g. "Total: 42"). */
  label(l: string): this { this._label = l; return this }

  /** Custom number formatter — pair with `Intl.NumberFormat` for currency
   * / locale-aware output. `Count` ignores formatters. */
  format(fn: SummaryFormatter): this { this._format = fn; return this }

  getLabel(): string | undefined { return this._label }
  getFormatter(): SummaryFormatter | undefined { return this._format }

  /** Compute the per-page summary value from the rows' values for this
   *  column (fallback path — see the class doc). */
  abstract compute(values: ReadonlyArray<unknown>): string

  /** SQL aggregate fns this summarizer needs over its column for the
   *  cross-page (full filtered set) path. The handler runs each once per
   *  column (deduped across the column's summarizers) and passes the
   *  resolved scalars to {@link resultFromScalars}. */
  abstract aggregates(): ReadonlyArray<AggregateFn>

  /** Build the display result from resolved scalar aggregates — the
   *  cross-page counterpart to {@link compute}. Keys present mirror
   *  {@link aggregates}; a `null`/absent scalar means the filtered set was
   *  empty (or held no numerics), which each subclass renders sensibly
   *  (`0` for Sum/Average/Count, `—` for Range). */
  abstract resultFromScalars(scalars: Partial<Record<AggregateFn, number | null>>): SummaryResult

  toMeta(): SummarizerMeta {
    return {
      kind: this.kind,
      ...(this._label !== undefined ? { label: this._label } : {}),
    }
  }

  /** Bundle a rendered value string with this summarizer's meta. */
  protected bundle(value: string): SummaryResult {
    return {
      kind:  this.kind,
      value,
      ...(this._label !== undefined ? { label: this._label } : {}),
    }
  }

  /** Run the per-page `compute` and bundle into a SummaryResult. */
  toResult(values: ReadonlyArray<unknown>): SummaryResult {
    return this.bundle(this.compute(values))
  }

  /** Coerce a list of cell values into numbers, dropping non-numerics.
   * `null` is excluded explicitly — `Number(null)` is 0, which would
   * otherwise pollute averages and ranges. Empty strings, undefined,
   * and unparseable strings are also dropped. */
  protected toNumbers(values: ReadonlyArray<unknown>): number[] {
    const out: number[] = []
    for (const v of values) {
      if (v === null || v === undefined || v === '') continue
      const n = typeof v === 'number' ? v : Number(v)
      if (!Number.isNaN(n) && Number.isFinite(n)) out.push(n)
    }
    return out
  }

  protected formatNumber(n: number): string {
    return this._format ? this._format(n) : String(n)
  }
}

export class Sum extends Summarizer {
  readonly kind = 'sum' as const
  static make(): Sum { return new Sum() }
  override compute(values: ReadonlyArray<unknown>): string {
    const total = this.toNumbers(values).reduce((a, b) => a + b, 0)
    return this.formatNumber(total)
  }
  override aggregates(): ReadonlyArray<AggregateFn> { return ['sum'] }
  override resultFromScalars(s: Partial<Record<AggregateFn, number | null>>): SummaryResult {
    return this.bundle(this.formatNumber(s.sum ?? 0))
  }
}

export class Average extends Summarizer {
  readonly kind = 'average' as const
  static make(): Average { return new Average() }
  override compute(values: ReadonlyArray<unknown>): string {
    const nums = this.toNumbers(values)
    if (nums.length === 0) return this.formatNumber(0)
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length
    return this.formatNumber(avg)
  }
  override aggregates(): ReadonlyArray<AggregateFn> { return ['avg'] }
  override resultFromScalars(s: Partial<Record<AggregateFn, number | null>>): SummaryResult {
    return this.bundle(this.formatNumber(s.avg ?? 0))
  }
}

export class Count extends Summarizer {
  readonly kind = 'count' as const
  static make(): Count { return new Count() }
  override compute(values: ReadonlyArray<unknown>): string {
    return String(values.length)
  }
  override aggregates(): ReadonlyArray<AggregateFn> { return ['count'] }
  override resultFromScalars(s: Partial<Record<AggregateFn, number | null>>): SummaryResult {
    return this.bundle(String(s.count ?? 0))
  }
}

export class Range extends Summarizer {
  readonly kind = 'range' as const
  static make(): Range { return new Range() }
  override compute(values: ReadonlyArray<unknown>): string {
    const nums = this.toNumbers(values)
    if (nums.length === 0) return '—'
    let min = nums[0]!
    let max = nums[0]!
    for (const n of nums) {
      if (n < min) min = n
      if (n > max) max = n
    }
    return `${this.formatNumber(min)}..${this.formatNumber(max)}`
  }
  override aggregates(): ReadonlyArray<AggregateFn> { return ['min', 'max'] }
  override resultFromScalars(s: Partial<Record<AggregateFn, number | null>>): SummaryResult {
    const { min, max } = s
    if (min === null || min === undefined || max === null || max === undefined) {
      return this.bundle('—')
    }
    return this.bundle(`${this.formatNumber(min)}..${this.formatNumber(max)}`)
  }
}
