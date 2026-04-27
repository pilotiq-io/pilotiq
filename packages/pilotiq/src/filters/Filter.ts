import { Element, type ElementMeta } from '../schema/Element.js'
import type { ModelQuery } from '../orm/modelDefaults.js'

/**
 * Discriminator for the renderer to pick a control. Extends naturally —
 * future kinds could include `'multiSelect'`, `'dateRange'`, `'numberRange'`.
 */
export type FilterKind = 'select' | 'boolean'

export interface FilterMeta extends ElementMeta {
  type:        'filter'
  name:        string
  label:       string
  kind:        FilterKind
  /** Currently-selected value, mirrored from the URL query at render time. */
  value?:      string
  /** Placeholder shown when no value is selected (e.g. "All", "Any"). */
  placeholder?: string
  /** Options for `kind === 'select'`. Boolean uses fixed yes/no/any. */
  options?:    Array<{ value: string; label: string }>
}

/**
 * User-supplied query customizer. Receives the active filter value plus
 * the running ORM query and returns the modified query. When supplied,
 * `Filter.query(fn)` overrides the default `where(name, value)` clause.
 */
export type FilterQueryHandler = (query: ModelQuery, value: string) => ModelQuery

/**
 * Base class for table filters. Filters live as children of `Table` and
 * surface as form controls in the table's header bar. Their values are
 * carried through the URL query (`?status=published&featured=1`) and
 * applied to the underlying ORM query for `Table.records`.
 */
export abstract class Filter extends Element {
  readonly name: string
  protected _label?: string
  protected _value?: string
  protected _queryFn?: FilterQueryHandler
  protected _placeholder?: string

  protected constructor(name: string) {
    super()
    this.name = name
  }

  label(l: string): this { this._label = l; return this }

  /** Override the placeholder shown when no value is selected. */
  placeholder(p: string): this { this._placeholder = p; return this }

  /**
   * Override the default `where(name, value)` clause this filter
   * contributes to the ORM query. Receives the current `ModelQuery` plus
   * the active value and must return the modified query.
   */
  query(fn: FilterQueryHandler): this { this._queryFn = fn; return this }

  /** Render-time setter: framework calls this with the URL-supplied value. */
  withValue(v: string): this { this._value = v; return this }

  // ─── Getters ──────────────────────────────────────────

  getLabel(): string {
    return this._label ?? this.name.charAt(0).toUpperCase() + this.name.slice(1)
  }
  getValue(): string | undefined            { return this._value }
  getPlaceholder(): string | undefined      { return this._placeholder }
  getQuery(): FilterQueryHandler | undefined { return this._queryFn }

  abstract getKind(): FilterKind

  // ─── Element contract ────────────────────────────────

  getType(): string { return 'filter' }

  override toMeta(): FilterMeta {
    return {
      type:  'filter',
      name:  this.name,
      label: this.getLabel(),
      kind:  this.getKind(),
      ...(this._value       !== undefined ? { value:       this._value       } : {}),
      ...(this._placeholder !== undefined ? { placeholder: this._placeholder } : {}),
    }
  }
}
