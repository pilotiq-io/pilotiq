import { Filter, type FilterKind, type FilterMeta } from './Filter.js'
import type { ModelQuery } from '../orm/modelDefaults.js'

/** `value` accepts `number` (integer-PK / enum-int columns) — normalized
 * to the string wire shape at the `.options()` setter (URL filter values
 * are strings; the default `IN` handler passes the tokens through). */
export interface MultiSelectFilterOption {
  value: string | number
  label: string
}

/**
 * Parse a comma-separated multi-select URL value into its individual
 * tokens. Empty / whitespace-only entries drop. Exposed as a public
 * helper so callers writing a custom `Filter.query(fn)` can reuse the
 * same encoding without re-implementing it.
 */
export function parseMultiSelectValue(value: string): string[] {
  if (!value) return []
  return value.split(',').map(s => s.trim()).filter(s => s !== '')
}

/**
 * Encode a list of selected values into the canonical comma-separated
 * URL value. The empty case returns `''` so the renderer can drop the
 * URL key entirely rather than emitting a trailing `&name=`.
 */
export function encodeMultiSelectValue(values: ReadonlyArray<string>): string {
  return values.filter(v => v !== '').join(',')
}

/**
 * Multi-value dropdown filter. Renders as a checkbox list inside the
 * filter popover; the URL value is comma-separated (`?status=draft,published`).
 * Default ORM clause is `where(name, 'IN', values)` — backends without
 * SQL `IN` can swap in their own logic via `Filter.query(fn)`.
 *
 * @example
 * MultiSelectFilter.make('status').options([
 *   { value: 'draft',     label: 'Draft' },
 *   { value: 'published', label: 'Published' },
 *   { value: 'archived',  label: 'Archived' },
 * ])
 */
export class MultiSelectFilter extends Filter {
  private _options: Array<{ value: string; label: string }> = []

  static make(name: string): MultiSelectFilter {
    const f = new MultiSelectFilter(name)
    f.query((q: ModelQuery, value: string) => {
      const values = parseMultiSelectValue(value)
      if (values.length === 0) return q
      return q.where(f.name, 'IN', values)
    })
    return f
  }

  options(opts: MultiSelectFilterOption[]): this {
    this._options = opts.map(o => ({ ...o, value: String(o.value) }))
    return this
  }

  getOptions(): Array<{ value: string; label: string }> { return this._options }

  override getKind(): FilterKind { return 'multiSelect' }

  protected override formatActiveValue(value: string): string {
    const tokens = parseMultiSelectValue(value)
    if (tokens.length === 0) return value
    const labels = tokens.map(v => this._options.find(o => o.value === v)?.label ?? v)
    return labels.join(', ')
  }

  override toMeta(): FilterMeta {
    return {
      ...this.buildBaseMeta(),
      options:     this._options,
      placeholder: this.getPlaceholder() ?? 'Any',
    }
  }
}
