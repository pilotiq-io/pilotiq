import { Constraint, type ConstraintOperator, type ConstraintOperatorName } from './Constraint.js'
import type { ModelQuery } from '../../orm/modelDefaults.js'

const OPERATORS: ConstraintOperator[] = [
  { name: 'isTrue',     label: 'Is true',      valueKind: 'none' },
  { name: 'isFalse',    label: 'Is false',     valueKind: 'none' },
  { name: 'isEmpty',    label: 'Is empty',     valueKind: 'none' },
  { name: 'isNotEmpty', label: 'Is not empty', valueKind: 'none' },
]

/**
 * Boolean-column constraint. No value input — every operator is binary.
 * `isEmpty / isNotEmpty` exist for nullable boolean columns and rely on
 * `ModelQuery.whereNull?` (mirrors `TernaryFilter`'s blank bucket).
 */
export class BooleanConstraint extends Constraint {
  static make(name: string): BooleanConstraint { return new BooleanConstraint(name) }

  override getOperators(): ConstraintOperator[] { return OPERATORS }

  override apply(query: ModelQuery, operator: ConstraintOperatorName, _value: unknown): ModelQuery {
    switch (operator) {
      case 'isTrue':     return query.where(this.name, '=',  true)
      case 'isFalse':    return query.where(this.name, '=',  false)
      case 'isEmpty':
        return typeof query.whereNull === 'function' ? query.whereNull(this.name) : query.where(this.name, '=', null)
      case 'isNotEmpty': return query.where(this.name, '!=', null)
      default:           return query
    }
  }
}
