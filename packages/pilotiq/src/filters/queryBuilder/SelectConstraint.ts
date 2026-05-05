import { Constraint, type ConstraintOperator, type ConstraintOperatorName } from './Constraint.js'
import type { ModelQuery } from '../../orm/modelDefaults.js'

/**
 * Enum-column constraint. Values come from a fixed `options([...])` list;
 * the renderer mounts a single-select for `equals / notEquals` and a
 * multi-select chip stack for `in / notIn`.
 */
export class SelectConstraint extends Constraint {
  static make(name: string): SelectConstraint { return new SelectConstraint(name) }

  private _options: Array<{ value: string; label: string }> = []

  options(opts: Array<{ value: string; label: string }>): this {
    this._options = opts
    return this
  }

  override getOptions(): Array<{ value: string; label: string }> | undefined {
    return this._options.length > 0 ? this._options : undefined
  }

  override getOperators(): ConstraintOperator[] {
    return [
      { name: 'equals',     label: 'Equals',           valueKind: 'select' },
      { name: 'notEquals',  label: 'Does not equal',   valueKind: 'select' },
      { name: 'in',         label: 'Is one of',        valueKind: 'multiSelect' },
      { name: 'notIn',      label: 'Is not one of',    valueKind: 'multiSelect' },
      { name: 'isEmpty',    label: 'Is empty',         valueKind: 'none' },
      { name: 'isNotEmpty', label: 'Is not empty',     valueKind: 'none' },
    ]
  }

  override apply(query: ModelQuery, operator: ConstraintOperatorName, value: unknown): ModelQuery {
    if (operator === 'isEmpty') {
      return typeof query.whereNull === 'function' ? query.whereNull(this.name) : query.where(this.name, '=', null)
    }
    if (operator === 'isNotEmpty') {
      return query.where(this.name, '!=', null)
    }

    if (operator === 'in' || operator === 'notIn') {
      const list = parseList(value)
      if (list.length === 0) return query
      return query.where(this.name, operator === 'in' ? 'IN' : 'NOT IN', list)
    }

    const v = parseScalar(value)
    if (v === undefined) return query

    switch (operator) {
      case 'equals':    return query.where(this.name, '=',  v)
      case 'notEquals': return query.where(this.name, '!=', v)
      default:          return query
    }
  }
}

function parseScalar(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  return String(v)
}

function parseList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const item of v) {
    if (item === null || item === undefined || item === '') continue
    out.push(String(item))
  }
  return out
}
