import { Column } from '../Column.js'

/**
 * Inline-edit boolean checkbox. Sibling of `ToggleColumn` — same
 * immediate-PATCH semantics (each click fires `POST …/_cell/:column`,
 * no debounce, optimistic with rollback), rendered as a plain checkbox
 * instead of a switch. Reach for it on dense tables where a row of
 * switches reads too heavy, or for "mark done"-style booleans where a
 * checkbox is the natural metaphor.
 *
 *   CheckboxColumn.make('approved')
 *     .confirm('Approve this comment?')
 *
 * Pair with `Column.disabled(record => …)` for per-row gating. Rows the
 * user can't edit (`R.canEdit(user, row)` denied) fall back to the
 * read-only cell, same as every editable column.
 */
export class CheckboxColumn extends Column {
  static override make(name: string): CheckboxColumn {
    const c = new CheckboxColumn(name)
    c.setColumnType('checkbox')
    return this.configured(c)
  }
}
