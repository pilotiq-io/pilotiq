import { Filter, type FilterKind, type FilterMeta } from './Filter.js'

/**
 * Three-state filter: yes / no / any. Renders as a dropdown. When a
 * value is selected, contributes `where(name, true|false)` to the
 * underlying ORM query — values `'1'` and `'true'` map to `true`,
 * everything else to `false`. The empty value means "any" (no clause
 * applied).
 *
 * @example
 * BooleanFilter.make('featured').label('Featured only')
 */
export class BooleanFilter extends Filter {
  static make(name: string): BooleanFilter {
    return this.configured(new BooleanFilter(name))
  }

  override getKind(): FilterKind { return 'boolean' }

  protected override formatActiveValue(value: string): string {
    return coerceBooleanFilterValue(value) ? 'Yes' : 'No'
  }

  override toMeta(): FilterMeta {
    return {
      ...this.buildBaseMeta(),
      placeholder: this.getPlaceholder() ?? 'Any',
    }
  }
}

/** Coerce a URL-string filter value to a boolean. */
export function coerceBooleanFilterValue(value: string): boolean {
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}
