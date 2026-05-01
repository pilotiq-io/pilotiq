import { Filter, type FilterKind, type FilterMeta } from './Filter.js'
import type { ModelQuery } from '../orm/modelDefaults.js'

/**
 * Three-state filter for nullable boolean columns where `NULL` is a
 * meaningful third bucket. Distinct from `BooleanFilter` (yes/no/any)
 * because the empty / unset URL value here means "any" while
 * `'blank'` means "the column IS NULL".
 *
 *   `''`     — placeholder "Any" (no clause)
 *   `'yes'`  — `where(name, true)`
 *   `'no'`   — `where(name, false)`
 *   `'blank'`— `whereNull(name)` (or `where(name, null)` when the
 *              query builder doesn't expose `whereNull`)
 *
 * @example
 * TernaryFilter.make('verified')
 *   .label('Verification')
 *   .trueLabel('Verified').falseLabel('Unverified').blankLabel('Pending')
 */
export class TernaryFilter extends Filter {
  private _trueLabel  = 'Yes'
  private _falseLabel = 'No'
  private _blankLabel = 'Blank'
  private _nullable   = true

  static make(name: string): TernaryFilter {
    const f = new TernaryFilter(name)
    f.query((q: ModelQuery, value: string) => {
      if (value === 'yes')  return q.where(f.name, true)
      if (value === 'no')   return q.where(f.name, false)
      if (value === 'blank') {
        if (typeof q.whereNull === 'function') return q.whereNull(f.name)
        return q.where(f.name, null)
      }
      return q
    })
    return f
  }

  trueLabel(label: string):  this { this._trueLabel  = label; return this }
  falseLabel(label: string): this { this._falseLabel = label; return this }
  blankLabel(label: string): this { this._blankLabel = label; return this }

  /** Drop the `'blank'` option — useful for non-null columns where the
   *  third bucket is meaningless. Default: `true`. */
  nullable(value = true): this { this._nullable = value; return this }

  override getKind(): FilterKind { return 'ternary' }

  protected override formatActiveValue(value: string): string {
    if (value === 'yes')   return this._trueLabel
    if (value === 'no')    return this._falseLabel
    if (value === 'blank') return this._blankLabel
    return value
  }

  override toMeta(): FilterMeta {
    const options = [
      { value: 'yes', label: this._trueLabel  },
      { value: 'no',  label: this._falseLabel },
      ...(this._nullable
        ? [{ value: 'blank', label: this._blankLabel }]
        : []),
    ]
    return {
      ...super.toMeta(),
      options,
      placeholder: this.getPlaceholder() ?? 'Any',
    }
  }
}
