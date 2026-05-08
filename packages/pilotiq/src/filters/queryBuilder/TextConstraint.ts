import { Constraint, type ConstraintOperator, type ConstraintOperatorName } from './Constraint.js'
import type { ModelQuery } from '../../orm/modelDefaults.js'

const OPERATORS: ConstraintOperator[] = [
  { name: 'contains',     label: 'Contains',         valueKind: 'text' },
  { name: 'notContains',  label: 'Does not contain', valueKind: 'text' },
  { name: 'equals',       label: 'Equals',           valueKind: 'text' },
  { name: 'notEquals',    label: 'Does not equal',   valueKind: 'text' },
  { name: 'startsWith',   label: 'Starts with',      valueKind: 'text' },
  { name: 'endsWith',     label: 'Ends with',        valueKind: 'text' },
  { name: 'isEmpty',      label: 'Is empty',         valueKind: 'none' },
  { name: 'isNotEmpty',   label: 'Is not empty',     valueKind: 'none' },
]

/**
 * String-column constraint. Default operator is `'contains'` because text
 * filters in admin tables almost always want substring search rather than
 * exact match.
 *
 * `isEmpty / isNotEmpty` rely on `ModelQuery.whereNull?` (added for
 * `TernaryFilter`). When unavailable they fall back to `where(name, '')`
 * which still catches the common case for non-NULL string columns.
 */
export class TextConstraint extends Constraint {
  static make(name: string): TextConstraint { return new TextConstraint(name) }

  override getOperators(): ConstraintOperator[] { return OPERATORS }

  override getDefaultOperator(): ConstraintOperatorName { return 'contains' }

  override apply(query: ModelQuery, operator: ConstraintOperatorName, value: unknown): ModelQuery {
    if (operator === 'isEmpty')    return whereNullOrEmpty(query, this.name)
    if (operator === 'isNotEmpty') return whereNotNullAndNotEmpty(query, this.name)

    const v = value === null || value === undefined ? '' : String(value)
    if (v === '') return query

    switch (operator) {
      case 'contains':    return query.where(this.name, 'LIKE',     `%${escapeLike(v)}%`)
      case 'notContains': return query.where(this.name, 'NOT LIKE', `%${escapeLike(v)}%`)
      case 'startsWith':  return query.where(this.name, 'LIKE',     `${escapeLike(v)}%`)
      case 'endsWith':    return query.where(this.name, 'LIKE',     `%${escapeLike(v)}`)
      case 'equals':      return query.where(this.name, '=', v)
      case 'notEquals':   return query.where(this.name, '!=', v)
      default:            return query
    }
  }
}

function whereNullOrEmpty(q: ModelQuery, col: string): ModelQuery {
  if (typeof q.whereNull === 'function') {
    return q.whereNull(col).orWhere(col, '=', '')
  }
  return q.where(col, '=', '')
}

function whereNotNullAndNotEmpty(q: ModelQuery, col: string): ModelQuery {
  return q.where(col, '!=', '')
}

/** Escape SQL `LIKE` wildcards in user input. Mirrors `unique` validator. */
function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
