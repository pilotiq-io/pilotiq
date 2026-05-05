import { Element, type ElementMeta } from '../schema/Element.js'
import type { ModelQuery } from '../orm/modelDefaults.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Discriminator for the renderer to pick a control.
 *
 * - `'select'`      — single-value dropdown (`SelectFilter`, `TrashedFilter`).
 * - `'multiSelect'` — checkbox list; URL value is comma-separated.
 * - `'boolean'`     — three-state yes/no/any.
 * - `'ternary'`     — three-state with a meaningful "blank" (NULL) bucket.
 * - `'dateRange'`   — pair of date / datetime inputs encoded as `from..to`.
 * - `'form'`        — arbitrary-schema multi-field popover; URL value is
 *                     a JSON-encoded object keyed by inner-field name.
 * - `'queryBuilder'` — composable rules with per-column constraints; URL
 *                     value is a JSON-encoded `{ operator, rules }` tree.
 *
 * Extends naturally — future kinds may include `'numberRange'`.
 */
export type FilterKind = 'select' | 'multiSelect' | 'boolean' | 'ternary' | 'dateRange' | 'form' | 'queryBuilder'

export interface FilterMeta extends ElementMeta {
  type:        'filter'
  name:        string
  label:       string
  kind:        FilterKind
  /** Currently-selected value, mirrored from the URL query at render time. */
  value?:      string
  /** Placeholder shown when no value is selected (e.g. "All", "Any"). */
  placeholder?: string
  /** Options for `kind === 'select' | 'multiSelect' | 'ternary'`. Boolean uses fixed yes/no. */
  options?:    Array<{ value: string; label: string }>
  /** `kind === 'dateRange'` — true switches the inputs to `datetime-local`. */
  includesTime?: boolean
  /** `kind === 'dateRange'` — clamp the inputs' `min` attribute. */
  minDate?:    string
  /** `kind === 'dateRange'` — clamp the inputs' `max` attribute. */
  maxDate?:    string
  /**
   * `kind === 'form'` — resolved schema for the popover sub-form. Each
   * field's `defaultValue` is pre-hydrated from the active URL value so
   * the inputs round-trip across navigations.
   */
  formSchema?: ElementMeta[]
  /**
   * `kind === 'queryBuilder'` — declared constraints (one per queryable
   * column) the user can pick from when adding a rule. Wire shape comes
   * from `Constraint.toMeta()`.
   */
  constraints?: Array<Record<string, unknown>>
  /**
   * Active-filter indicator pill text. Present only when the filter has an
   * active value. Default format is `"<label>: <displayValue>"`; users can
   * override via `Filter.indicator(string | (value, filter) => string)`.
   */
  indicator?:  string
}

/**
 * User-supplied query customizer. Receives the active filter value plus
 * the running ORM query and returns the modified query. When supplied,
 * `Filter.query(fn)` overrides the default `where(name, value)` clause.
 */
export type FilterQueryHandler = (query: ModelQuery, value: string) => ModelQuery

/**
 * User-supplied indicator-pill formatter. Receives the active value plus
 * the filter so callbacks can read its label / option set. The default
 * indicator is `"<label>: <displayValue>"` where `displayValue` comes from
 * each subclass's `formatActiveValue` hook.
 */
export type FilterIndicatorHandler = (value: string, filter: Filter) => string

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
  protected _indicatorFn?: FilterIndicatorHandler

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

  /**
   * Override the active-filter indicator pill text. Accepts either a
   * literal string or a `(value, filter) => string` callback. The default
   * indicator is `"<label>: <displayValue>"`, where `<displayValue>` comes
   * from each subclass's `formatActiveValue(value)` hook (e.g. SelectFilter
   * maps `'draft'` → its option label `'Draft'`).
   */
  indicator(fn: string | FilterIndicatorHandler): this {
    this._indicatorFn = typeof fn === 'function' ? fn : () => fn
    return this
  }

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

  /**
   * Subclass hook — render the active value as a human-readable string for
   * the indicator pill. Default is the raw value; SelectFilter/TernaryFilter
   * map to option labels, BooleanFilter to "Yes"/"No", DateRangeFilter to a
   * `from → to` range. Override when the URL value isn't user-friendly.
   */
  protected formatActiveValue(value: string): string { return value }

  /**
   * Render the indicator pill text. Returns `undefined` when no value is
   * active so the renderer can skip the pill entirely. Honours the user's
   * `indicator(fn)` override when supplied.
   */
  getIndicator(): string | undefined {
    const value = this._value
    if (value === undefined || value === '') return undefined
    if (this._indicatorFn) return this._indicatorFn(value, this)
    return `${this.getLabel()}: ${this.formatActiveValue(value)}`
  }

  // ─── Element contract ────────────────────────────────

  getType(): string { return 'filter' }

  /**
   * Sync by default — `kind: 'form'` filters override to async because they
   * need to resolve their inner schema. The optional `_ctx` parameter is
   * threaded by `resolveSchema` so subclasses can read the active user /
   * record / values when building their meta. Existing typed filters
   * (Select / Boolean / Ternary / DateRange / MultiSelect / Trashed)
   * ignore the parameter.
   */
  override toMeta(_ctx?: RenderContext): FilterMeta | Promise<FilterMeta> {
    return this.buildBaseMeta()
  }

  /**
   * Shared meta construction for `Filter` subclasses — exposed as a
   * protected helper so async subclasses (e.g. `FormFilter`) can pull
   * the same shape without spreading a `Promise<FilterMeta>` union.
   */
  protected buildBaseMeta(): FilterMeta {
    const indicator = this.getIndicator()
    return {
      type:  'filter',
      name:  this.name,
      label: this.getLabel(),
      kind:  this.getKind(),
      ...(this._value       !== undefined ? { value:       this._value       } : {}),
      ...(this._placeholder !== undefined ? { placeholder: this._placeholder } : {}),
      ...(indicator         !== undefined ? { indicator                      } : {}),
    }
  }
}
