import { Filter, type FilterKind, type FilterMeta } from './Filter.js'

export interface SelectFilterOption {
  value: string
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
  private _options: SelectFilterOption[] = []

  static make(name: string): SelectFilter {
    return new SelectFilter(name)
  }

  options(opts: SelectFilterOption[]): this {
    this._options = opts
    return this
  }

  getOptions(): SelectFilterOption[] { return this._options }

  override getKind(): FilterKind { return 'select' }

  protected override formatActiveValue(value: string): string {
    return this._options.find(o => o.value === value)?.label ?? value
  }

  override toMeta(): FilterMeta {
    return {
      ...super.toMeta(),
      options: this._options,
      placeholder: this.getPlaceholder() ?? 'All',
    }
  }
}
