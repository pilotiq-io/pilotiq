import type { ModelQuery } from '../../orm/modelDefaults.js'

/**
 * Wire-side discriminator for the value input the renderer mounts under
 * a constraint row. `'none'` means the operator implies no value (e.g.
 * `isEmpty / isNotEmpty / isTrue / isFalse`) — the renderer hides the
 * value input entirely.
 */
export type ConstraintValueKind =
  | 'text'
  | 'number'
  | 'date'
  | 'dateTime'
  | 'select'
  | 'multiSelect'
  | 'boolean'
  | 'numberRange'
  | 'dateRange'
  | 'none'

/**
 * Canonical operator names a constraint advertises. The set is wider than
 * any single subclass returns — each `Constraint` exposes its valid subset
 * via `getOperators()`. Storage / URL value rules reference operators by
 * this string.
 */
export type ConstraintOperatorName =
  | 'equals' | 'notEquals'
  | 'contains' | 'startsWith' | 'endsWith'
  | 'lt' | 'lte' | 'gt' | 'gte' | 'between'
  | 'before' | 'after' | 'dateBetween'
  | 'in' | 'notIn'
  | 'isEmpty' | 'isNotEmpty'
  | 'isTrue' | 'isFalse'

/** A single operator option with renderer-side label + value-input kind. */
export interface ConstraintOperator {
  name:      ConstraintOperatorName
  label:     string
  valueKind: ConstraintValueKind
}

/** Wire shape consumed by the renderer to mount a constraint row. */
export interface ConstraintMeta {
  name:       string
  label:      string
  operators:  ConstraintOperator[]
  options?:   Array<{ value: string; label: string }>
  /** Default operator pre-selected when the user adds a fresh row. */
  defaultOperator?: ConstraintOperatorName
}

/**
 * Base class for `QueryBuilder` constraints — declares which column the
 * user can query, which operators they get, and how to translate a
 * `(operator, value)` pair into ORM `where` clauses.
 *
 * Subclasses are typed value-objects (NOT `Element`) — they live as
 * children of `QueryBuilderFilter.constraints([...])`, never standalone.
 *
 * The `apply()` contract takes a `ModelQuery` and returns it with any
 * number of `.where()` calls chained on. v1 dispatches every rule through
 * `.where()` (AND-root only) — see `QueryBuilderFilter` for the why.
 */
export abstract class Constraint {
  readonly name: string
  protected _label?: string

  protected constructor(name: string) {
    this.name = name
  }

  label(l: string): this { this._label = l; return this }

  getLabel(): string {
    return this._label ?? this.name.charAt(0).toUpperCase() + this.name.slice(1)
  }

  /** Operators this constraint advertises. Subclasses override. */
  abstract getOperators(): ConstraintOperator[]

  /** Default operator pre-selected on a fresh row. Defaults to first. */
  getDefaultOperator(): ConstraintOperatorName {
    const ops = this.getOperators()
    return ops[0]?.name ?? 'equals'
  }

  /** Optional select-style options surfaced under `meta.options`. */
  getOptions(): Array<{ value: string; label: string }> | undefined { return undefined }

  /**
   * Translate a single rule into ORM `where` clauses. Returns the modified
   * query. Always called inside the QueryBuilder's AND-root pipeline in
   * v1 — multi-clause operators (e.g. `between` → two `where` calls) are
   * naturally AND'd by the running pipeline.
   *
   * Implementations should silently no-op on malformed values (return `q`
   * unchanged). Throwing would abort the whole list query.
   */
  abstract apply(query: ModelQuery, operator: ConstraintOperatorName, value: unknown): ModelQuery

  /** Wire shape consumed by the React renderer. */
  toMeta(): ConstraintMeta {
    const ops = this.getOperators()
    const out: ConstraintMeta = {
      name:            this.name,
      label:           this.getLabel(),
      operators:       ops,
      defaultOperator: this.getDefaultOperator(),
    }
    const options = this.getOptions()
    if (options) out.options = options
    return out
  }
}
