/**
 * Column summarizers — small server-side aggregators over the rows the
 * table just rendered. Attached via `Column.summarize([Sum.make(), …])`,
 * computed inside `loadTableRecords`, and stamped onto `TableMeta.summaries`
 * for the renderer to display in a `<tfoot>` row.
 *
 * v1 scope: per-page only (computes over the rows currently rendered),
 * not across the full filtered set. Cross-page aggregation would need
 * a separate query against the model and is deferred.
 */

export type SummarizerKind = 'sum' | 'average' | 'count' | 'range'

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

  /** Compute the summary value from the rows' values for this column. */
  abstract compute(values: ReadonlyArray<unknown>): string

  toMeta(): SummarizerMeta {
    return {
      kind: this.kind,
      ...(this._label !== undefined ? { label: this._label } : {}),
    }
  }

  /** Run `compute` and bundle with the meta into a SummaryResult. */
  toResult(values: ReadonlyArray<unknown>): SummaryResult {
    return {
      kind:  this.kind,
      value: this.compute(values),
      ...(this._label !== undefined ? { label: this._label } : {}),
    }
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
}

export class Count extends Summarizer {
  readonly kind = 'count' as const
  static make(): Count { return new Count() }
  override compute(values: ReadonlyArray<unknown>): string {
    return String(values.length)
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
}
