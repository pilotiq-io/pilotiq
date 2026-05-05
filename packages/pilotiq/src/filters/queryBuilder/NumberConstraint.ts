import { Constraint, type ConstraintOperator, type ConstraintOperatorName } from './Constraint.js'
import type { ModelQuery } from '../../orm/modelDefaults.js'

const OPERATORS: ConstraintOperator[] = [
  { name: 'equals',     label: 'Equals',           valueKind: 'number' },
  { name: 'notEquals',  label: 'Does not equal',   valueKind: 'number' },
  { name: 'gt',         label: 'Greater than',     valueKind: 'number' },
  { name: 'gte',        label: 'Greater or equal', valueKind: 'number' },
  { name: 'lt',         label: 'Less than',        valueKind: 'number' },
  { name: 'lte',        label: 'Less or equal',    valueKind: 'number' },
  { name: 'between',    label: 'Between',          valueKind: 'numberRange' },
  { name: 'isEmpty',    label: 'Is empty',         valueKind: 'none' },
  { name: 'isNotEmpty', label: 'Is not empty',     valueKind: 'none' },
]

/**
 * Numeric-column constraint. `between` takes a `[min, max]` tuple — both
 * sides optional, missing side skipped (mirrors `DateRangeFilter`).
 */
export class NumberConstraint extends Constraint {
  static make(name: string): NumberConstraint { return new NumberConstraint(name) }

  override getOperators(): ConstraintOperator[] { return OPERATORS }

  override apply(query: ModelQuery, operator: ConstraintOperatorName, value: unknown): ModelQuery {
    if (operator === 'isEmpty') {
      return typeof query.whereNull === 'function' ? query.whereNull(this.name) : query.where(this.name, '=', null)
    }
    if (operator === 'isNotEmpty') {
      return query.where(this.name, '!=', null)
    }

    if (operator === 'between') {
      const [min, max] = parseNumberPair(value)
      if (min !== undefined) query = query.where(this.name, '>=', min)
      if (max !== undefined) query = query.where(this.name, '<=', max)
      return query
    }

    const n = parseNumber(value)
    if (n === undefined) return query

    switch (operator) {
      case 'equals':    return query.where(this.name, '=',  n)
      case 'notEquals': return query.where(this.name, '!=', n)
      case 'gt':        return query.where(this.name, '>',  n)
      case 'gte':       return query.where(this.name, '>=', n)
      case 'lt':        return query.where(this.name, '<',  n)
      case 'lte':       return query.where(this.name, '<=', n)
      default:          return query
    }
  }
}

function parseNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function parseNumberPair(v: unknown): [number | undefined, number | undefined] {
  if (Array.isArray(v)) {
    return [parseNumber(v[0]), parseNumber(v[1])]
  }
  return [undefined, undefined]
}
