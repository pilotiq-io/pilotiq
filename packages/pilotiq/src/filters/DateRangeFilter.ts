import { Filter, type FilterKind, type FilterMeta } from './Filter.js'
import type { ModelQuery } from '../orm/modelDefaults.js'

/**
 * Parsed shape of a `DateRangeFilter`'s URL value. Either side may be
 * absent; `{ from, to }` are kept as raw strings so callers can decide
 * whether to coerce to `Date` or pass straight through to the ORM.
 */
export interface DateRangeValue {
  from?: string
  to?:   string
}

/**
 * Round-trip a `from..to`-encoded URL value to `{ from?, to? }`. Either
 * side may be empty (`'2026-01-01..'` → `{ from: '2026-01-01' }`). The
 * empty string and `'..'` both parse to `{}`.
 *
 * Exposed as a public helper so users writing a custom `Filter.query(fn)`
 * can avoid re-parsing the encoding by hand.
 */
export function parseDateRangeValue(value: string): DateRangeValue {
  if (!value || value === '..') return {}
  const idx = value.indexOf('..')
  if (idx === -1) {
    // No separator — treat as a single "from" bound. Rare; users are
    // more likely to pass the encoded form.
    const from = value.trim()
    return from ? { from } : {}
  }
  const from = value.slice(0, idx).trim()
  const to   = value.slice(idx + 2).trim()
  const out: DateRangeValue = {}
  if (from) out.from = from
  if (to)   out.to   = to
  return out
}

/**
 * Encode a `{ from?, to? }` pair as the canonical `from..to` URL value.
 * The empty / both-missing case returns `''` (caller should drop the
 * URL key entirely rather than emitting `..`).
 */
export function encodeDateRangeValue(range: DateRangeValue): string {
  const from = range.from?.trim() ?? ''
  const to   = range.to?.trim()   ?? ''
  if (!from && !to) return ''
  return `${from}..${to}`
}

/**
 * Pair-of-date-inputs filter. Encodes the URL value as `from..to`
 * keyed off the filter name so the existing single-key `parseFilterValues`
 * contract holds:
 *
 *   `?publishedAt=2026-01-01..2026-12-31`  closed range
 *   `?publishedAt=2026-01-01..`            open-ended `>=` from
 *   `?publishedAt=..2026-12-31`            open-ended `<=` to
 *
 * Default ORM clauses:
 *
 *   from + to → `where(name,'>=',from).where(name,'<=',to)`
 *   from only → `where(name,'>=',from)`
 *   to only   → `where(name,'<=',to)`
 *
 * `to` is treated as inclusive — for `DateTime` columns with
 * `includesTime(false)`, callers wanting "all of 2026-12-31" should
 * widen the upper bound via `Filter.query(fn)`.
 *
 * @example
 * DateRangeFilter.make('publishedAt').label('Published')
 * DateRangeFilter.make('createdAt').includesTime(true).maxDate(new Date())
 */
export class DateRangeFilter extends Filter {
  private _includesTime = false
  private _minDate?:    string
  private _maxDate?:    string

  static make(name: string): DateRangeFilter {
    const f = new DateRangeFilter(name)
    f.query((q: ModelQuery, value: string) => {
      const { from, to } = parseDateRangeValue(value)
      let next = q
      if (from) next = next.where(f.name, '>=', from)
      if (to)   next = next.where(f.name, '<=', to)
      return next
    })
    return this.configured(f)
  }

  /** Switch the inputs to `<input type="datetime-local">` and the URL
   *  values to ISO timestamps. Default: `false`. */
  includesTime(value = true): this { this._includesTime = value; return this }

  /** Lower bound for the input's `min` attribute. Accepts an ISO string or `Date`. */
  minDate(value: string | Date): this {
    this._minDate = toBoundString(value, this._includesTime)
    return this
  }

  /** Upper bound for the input's `max` attribute. Accepts an ISO string or `Date`. */
  maxDate(value: string | Date): this {
    this._maxDate = toBoundString(value, this._includesTime)
    return this
  }

  // Getters used by tests + the renderer.
  getIncludesTime(): boolean             { return this._includesTime }
  getMinDate():     string | undefined   { return this._minDate }
  getMaxDate():     string | undefined   { return this._maxDate }

  override getKind(): FilterKind { return 'dateRange' }

  protected override formatActiveValue(value: string): string {
    const { from, to } = parseDateRangeValue(value)
    if (from && to) return `${from} → ${to}`
    if (from)       return `≥ ${from}`
    if (to)         return `≤ ${to}`
    return value
  }

  override toMeta(): FilterMeta {
    return {
      ...this.buildBaseMeta(),
      includesTime: this._includesTime,
      ...(this._minDate !== undefined ? { minDate: this._minDate } : {}),
      ...(this._maxDate !== undefined ? { maxDate: this._maxDate } : {}),
      placeholder: this.getPlaceholder() ?? 'Any',
    }
  }
}

/** Coerce a `Date | string` bound to the canonical `YYYY-MM-DD` or
 *  `YYYY-MM-DDTHH:mm` input-friendly string. Strings pass through
 *  trimmed; the renderer's `min` / `max` attributes accept either. */
function toBoundString(value: string | Date, includesTime: boolean): string {
  if (typeof value === 'string') return value.trim()
  // Use the local-time split so `<input type="date">` doesn't shift the
  // bound a day under negative-UTC-offset clients.
  const yyyy = value.getFullYear().toString().padStart(4, '0')
  const mm   = (value.getMonth() + 1).toString().padStart(2, '0')
  const dd   = value.getDate().toString().padStart(2, '0')
  const date = `${yyyy}-${mm}-${dd}`
  if (!includesTime) return date
  const hh   = value.getHours().toString().padStart(2, '0')
  const min  = value.getMinutes().toString().padStart(2, '0')
  return `${date}T${hh}:${min}`
}
