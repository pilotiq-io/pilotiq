import { Filter, type FilterKind, type FilterMeta } from './Filter.js'
import type { Element, ElementMeta } from '../schema/Element.js'
import type { FieldMeta } from '../fields/Field.js'
import type { ModelQuery } from '../orm/modelDefaults.js'
import { resolveSchema, type RenderContext } from '../schema/resolveSchema.js'

/**
 * Parsed shape of a `FormFilter`'s URL value. JSON-encoded under a single
 * URL key (`?amount={"min":100,"max":500}`). Empty / unparseable / non-
 * object payloads round-trip as `{}`.
 *
 * Exposed as a public helper so users writing a custom `Filter.query(fn)`
 * (or building their own server-side dispatch) can avoid re-parsing the
 * encoding by hand.
 */
export type FormFilterValue = Record<string, unknown>

export function parseFormFilterValue(value: string | undefined): FormFilterValue {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as FormFilterValue
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Encode a `Record<string, unknown>` of form values as the canonical
 * single-URL-key JSON payload. Empty / null / `''` entries are dropped
 * so the URL doesn't bloat with no-op keys; the all-empty case returns
 * `''` (caller should drop the URL key entirely rather than emitting `{}`).
 */
export function encodeFormFilterValue(values: FormFilterValue): string {
  const clean: FormFilterValue = {}
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    clean[k] = v
  }
  if (Object.keys(clean).length === 0) return ''
  return JSON.stringify(clean)
}

/**
 * User-supplied query callback for `FormFilter` — the parsed form values
 * arrive as a `Record<string, unknown>` keyed by inner-field name (versus
 * the base `FilterQueryHandler`, which sees the raw URL string).
 */
export type FormFilterQueryHandler = (
  query:  ModelQuery,
  values: FormFilterValue,
) => ModelQuery

/**
 * User-supplied indicator-pill formatter for `FormFilter`. Mirrors the
 * base `FilterIndicatorHandler` but pre-parses the URL value.
 */
export type FormFilterIndicatorHandler = (
  values: FormFilterValue,
  filter: FormFilter,
) => string

/**
 * Multi-field filter with arbitrary form schema. The popover renders the
 * declared fields verbatim (using the same SchemaRenderer field dispatch
 * as a regular form), the values are JSON-encoded into a single URL key,
 * and the user's `.handle((q, values) => …)` callback applies the values
 * to the ORM query.
 *
 * Designed for cases where the existing typed kinds (Select / Boolean /
 * Ternary / DateRange / MultiSelect) don't fit — e.g. a price filter that
 * needs both `min` and `max`, or a search filter that combines a needle
 * with a category dropdown.
 *
 * Inner fields are resolved at meta-build time with the same `RenderContext`
 * that `resolveSchema` uses for the surrounding table, so dependent-options
 * resolvers (e.g. user-aware role lookups) work the same as in a regular form.
 *
 * @example
 *   FormFilter.make('amount')
 *     .label('Price')
 *     .form([
 *       NumberField.make('min').label('Min'),
 *       NumberField.make('max').label('Max'),
 *     ])
 *     .handle((q, { min, max }) => {
 *       if (min !== undefined) q = q.where('price', '>=', Number(min))
 *       if (max !== undefined) q = q.where('price', '<=', Number(max))
 *       return q
 *     })
 *     .indicator(({ min, max }) => {
 *       if (min !== undefined && max !== undefined) return `Price: ${min}–${max}`
 *       if (min !== undefined) return `Price: ≥ ${min}`
 *       if (max !== undefined) return `Price: ≤ ${max}`
 *       return 'Price'
 *     })
 */
export class FormFilter extends Filter {
  private _formSchema: Element[] = []

  static make(name: string): FormFilter {
    const f = new FormFilter(name)
    // Default no-op queryFn so modelDefaults' `if (customQuery)` short-
    // circuits cleanly when the user hasn't called `.handle()` yet —
    // otherwise the default `where(name, jsonString)` clause would fire
    // with a JSON blob and most ORMs would NOT enjoy that.
    f.query((q) => q)
    return this.configured(f)
  }

  /**
   * Set the inner form schema. Any pilotiq Element is allowed — Field /
   * Section / Grid / Group — though the filter popover is a small surface,
   * so plain fields read best in v1.
   */
  form(elements: Element[]): this {
    this._formSchema = elements
    return this
  }

  /**
   * Typed query callback. Receives the parsed form-values object
   * (`Record<string, unknown>` keyed by inner-field name) plus the running
   * ORM query. Wraps the inherited `Filter.query()` hook — when this is
   * called, a `_queryFn` is installed that parses the URL value before
   * delegating to `fn`.
   */
  handle(fn: FormFilterQueryHandler): this {
    this.query((q, value) => fn(q, parseFormFilterValue(value)))
    return this
  }

  /**
   * Typed indicator override. Receives the parsed form-values object so
   * users don't have to call `parseFormFilterValue` themselves. String
   * arguments still work via the inherited `Filter.indicator(string)`.
   */
  formIndicator(fn: FormFilterIndicatorHandler): this {
    this.indicator((value: string) => fn(parseFormFilterValue(value), this))
    return this
  }

  getFormSchema(): Element[] { return this._formSchema }

  override getKind(): FilterKind { return 'form' }

  protected override formatActiveValue(value: string): string {
    const parsed = parseFormFilterValue(value)
    const entries = Object.entries(parsed).filter(([, v]) => v !== undefined && v !== null && v !== '')
    if (entries.length === 0) return ''
    return entries.map(([k, v]) => `${k}: ${formatScalar(v)}`).join(', ')
  }

  /**
   * Override so that a stored value of `'{}'` (legitimately parsed JSON
   * with zero entries) doesn't paint an empty `"Label: "` pill. The base
   * `getIndicator` only checks for raw empty-string / undefined.
   */
  override getIndicator(): string | undefined {
    const value = this.getValue()
    if (value === undefined || value === '') return undefined
    const parsed = parseFormFilterValue(value)
    const hasAny = Object.values(parsed).some(v => v !== undefined && v !== null && v !== '')
    if (!hasAny) return undefined
    return super.getIndicator()
  }

  override async toMeta(ctx?: RenderContext): Promise<FilterMeta> {
    const base     = this.buildBaseMeta()
    const resolved = await resolveSchema(this._formSchema, ctx ?? {})
    const parsed   = parseFormFilterValue(this.getValue())
    const hydrated = applyValuesToMeta(resolved, parsed)
    return {
      ...base,
      formSchema:  hydrated,
      placeholder: this.getPlaceholder() ?? 'Filter',
    }
  }
}

/** Walk a resolved meta tree and stamp each Field's `defaultValue` from
 *  the parsed URL values map. Recurses into containers via `children`. */
function applyValuesToMeta(metas: ElementMeta[], values: FormFilterValue): ElementMeta[] {
  return metas.map(m => applyToOne(m, values))
}

function applyToOne(meta: ElementMeta, values: FormFilterValue): ElementMeta {
  const next: ElementMeta = { ...meta }
  if (next.type === 'field') {
    const f = next as FieldMeta
    if (f.name in values) {
      (next as FieldMeta).defaultValue = values[f.name]
    }
  }
  const children = (next as { children?: ElementMeta[] }).children
  if (Array.isArray(children)) {
    (next as { children?: ElementMeta[] }).children = applyValuesToMeta(children, values)
  }
  return next
}

/** Friendly display for an arbitrary JSON-decoded value. Booleans / numbers
 *  / strings stringify directly; arrays join with ", "; objects collapse to
 *  `[object]` (rare — most form fields produce scalars). */
function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v))             return v.map(x => formatScalar(x)).join(', ')
  if (typeof v === 'object')        return '[object]'
  if (typeof v === 'boolean')       return v ? 'Yes' : 'No'
  return String(v)
}
