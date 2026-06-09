import type { Column } from '../Column.js'
import type { TextInputColumn } from '../columns/TextInputColumn.js'
import type { SelectColumn } from '../columns/SelectColumn.js'

/**
 * Coerce a raw `_cell` PATCH body value into the right shape for the
 * given column. JSON / urlencoded bodies arrive as strings; this is the
 * single place we normalize them before validators run + before the
 * value lands in `R.model.update(id, { [col]: value })`.
 *
 * Throws when a `'number'` text input receives a non-numeric string —
 * the route handler maps the throw to a 422 with a friendly message
 * (mirrors how form-level coerce surfaces invalid numeric inputs).
 *
 *   coerceCellValue(textInputCol, '42')      → 42 when type='number'
 *   coerceCellValue(textInputCol, '')        → ''
 *   coerceCellValue(toggleCol,    'true')    → true
 *   coerceCellValue(toggleCol,    1)         → true
 *   coerceCellValue(selectCol,    'draft')   → 'draft'
 *   coerceCellValue(selectCol,    null)      → null     (when nullable)
 */
export function coerceCellValue(col: Column, raw: unknown): unknown {
  switch (col.getColumnType()) {
    case 'textInput': {
      const t = (col as TextInputColumn).getInputType()
      if (t === 'number') {
        if (raw === null || raw === '' || raw === undefined) return null
        const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
        if (Number.isNaN(n)) {
          throw new CellCoerceError('Must be a number')
        }
        return n
      }
      // text / email / url / tel — always a string. `null` survives so
      // a nullable column can be cleared from the cell.
      if (raw === null || raw === undefined) return null
      return typeof raw === 'string' ? raw : String(raw)
    }
    case 'toggle':
    case 'checkbox': {
      // Accept boolean, number, and the common string truthy markers
      // ('true', '1', 'on'). Falsy strings ('', 'false', '0') → false.
      if (typeof raw === 'boolean') return raw
      if (typeof raw === 'number')  return raw !== 0
      if (typeof raw === 'string') {
        const v = raw.toLowerCase().trim()
        if (v === 'true' || v === '1' || v === 'on' || v === 'yes')  return true
        if (v === 'false' || v === '0' || v === 'off' || v === 'no' || v === '') return false
      }
      return Boolean(raw)
    }
    case 'select': {
      // Validate against the configured option set so a forged body
      // can't write an arbitrary string. `null` is accepted only when
      // the column was marked `.nullable()`.
      const sel = col as SelectColumn
      const opts = sel.getOptions()
      if (raw === null || raw === '' || raw === undefined) {
        // `selectNullable` is internal to SelectColumn — re-derive from
        // toMeta so we don't have to expose a getter.
        const meta = sel.toMeta()
        if (meta.selectNullable) return null
        throw new CellCoerceError('A value is required')
      }
      const value = String(raw)
      if (!opts.some(o => o.value === value)) {
        throw new CellCoerceError(`"${value}" is not a valid option`)
      }
      return value
    }
    default:
      // Read-only columns can't reach the route (the handler 400s on
      // `!col.isEditable()`), but stay defensive — return raw verbatim.
      return raw
  }
}

/** Thrown by `coerceCellValue` when the raw value doesn't fit the column.
 * The route handler catches this and replies with 422 + the message. */
export class CellCoerceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CellCoerceError'
  }
}
