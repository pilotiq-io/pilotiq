import { Constraint, type ConstraintOperator, type ConstraintOperatorName } from './Constraint.js'
import type { ModelQuery } from '../../orm/modelDefaults.js'

/**
 * Date-column constraint. `includesTime()` flips the value inputs to
 * `datetime-local` and the wire `valueKind` to `'dateTime'`.
 *
 * Values arrive as ISO strings (`'2026-05-04'` / `'2026-05-04T13:00'`) and
 * are passed through to the ORM as-is — Prisma / SQLite / MySQL all accept
 * ISO strings on date columns.
 */
export class DateConstraint extends Constraint {
  static make(name: string): DateConstraint { return new DateConstraint(name) }

  private _includesTime = false

  includesTime(v = true): this { this._includesTime = v; return this }

  override getOperators(): ConstraintOperator[] {
    const kind = this._includesTime ? 'dateTime' : 'date'
    const range = this._includesTime ? 'dateTime' : 'dateRange'
    return [
      { name: 'equals',      label: 'On',          valueKind: kind  },
      { name: 'before',      label: 'Before',      valueKind: kind  },
      { name: 'after',       label: 'After',       valueKind: kind  },
      { name: 'dateBetween', label: 'Between',     valueKind: range },
      { name: 'isEmpty',     label: 'Is empty',    valueKind: 'none' },
      { name: 'isNotEmpty',  label: 'Is not empty', valueKind: 'none' },
    ]
  }

  override apply(query: ModelQuery, operator: ConstraintOperatorName, value: unknown): ModelQuery {
    if (operator === 'isEmpty') {
      return typeof query.whereNull === 'function' ? query.whereNull(this.name) : query.where(this.name, '=', null)
    }
    if (operator === 'isNotEmpty') {
      return query.where(this.name, '!=', null)
    }

    if (operator === 'dateBetween') {
      const [from, to] = parseDatePair(value)
      if (from) query = query.where(this.name, '>=', from)
      if (to)   query = query.where(this.name, '<=', to)
      return query
    }

    const v = parseDate(value)
    if (v === undefined) return query

    switch (operator) {
      case 'equals': return query.where(this.name, '=',  v)
      case 'before': return query.where(this.name, '<',  v)
      case 'after':  return query.where(this.name, '>',  v)
      default:       return query
    }
  }
}

function parseDate(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  return String(v)
}

function parseDatePair(v: unknown): [string | undefined, string | undefined] {
  if (Array.isArray(v)) {
    return [parseDate(v[0]), parseDate(v[1])]
  }
  return [undefined, undefined]
}
