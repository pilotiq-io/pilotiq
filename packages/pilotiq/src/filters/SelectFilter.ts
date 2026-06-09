import { Filter, type FilterKind, type FilterMeta } from './Filter.js'

/** `value` accepts `number` (integer-PK / enum-int columns) — normalized
 * to the string wire shape at the `.options()` setter (URL filter values
 * are strings; the default query handler passes the string through). */
export interface SelectFilterOption {
  value: string | number
  label: string
}

/**
 * Single-value dropdown filter. Selecting a value adds a
 * `where(name, value)` clause to the table's ORM query (or runs the
 * user's `.query(fn)` hook when supplied).
 *
 * @example
 * SelectFilter.make('status').options([
 *   { value: 'draft',     label: 'Draft' },
 *   { value: 'published', label: 'Published' },
 * ])
 */
export class SelectFilter extends Filter {
  private _options: Array<{ value: string; label: string }> = []

  static make(name: string): SelectFilter {
    return this.configured(new SelectFilter(name))
  }

  options(opts: SelectFilterOption[]): this {
    this._options = opts.map(o => ({ ...o, value: String(o.value) }))
    return this
  }

  getOptions(): Array<{ value: string; label: string }> { return this._options }

  override getKind(): FilterKind { return 'select' }

  protected override formatActiveValue(value: string): string {
    return this._options.find(o => o.value === value)?.label ?? value
  }

  override toMeta(): FilterMeta {
    return {
      ...this.buildBaseMeta(),
      options: this._options,
      placeholder: this.getPlaceholder() ?? 'All',
    }
  }
}
