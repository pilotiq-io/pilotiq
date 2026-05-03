import { Column, type ColumnMeta, type ColumnSelectOption } from '../Column.js'

/** Accepted shapes for `SelectColumn.options(...)`. The map form
 * (`{ draft: 'Draft' }`) is convenience sugar for the array form. */
export type SelectColumnOptionsInput =
  | Record<string, string>
  | Array<ColumnSelectOption>

/**
 * Inline-edit select. Renders a `<select>` in the cell; each change
 * fires an immediate PATCH. Static options only in v1 — async per-row
 * resolvers are deferred until a consumer hits the case.
 *
 *   SelectColumn.make('status')
 *     .options({ draft: 'Draft', published: 'Published', archived: 'Archived' })
 *     .nullable()
 *
 * Pair with `Column.disabled(record => …)` for per-row gating
 * (e.g. forbid changing status once archived).
 */
export class SelectColumn extends Column {
  protected _options: ColumnSelectOption[] = []
  protected _nullable = false
  protected _selectablePlaceholder = true

  static override make(name: string): SelectColumn {
    const c = new SelectColumn(name)
    c.setColumnType('select')
    return c
  }

  /** Static options. Accepts either `{ value: label }` or
   * `[{ value, label }]`. Re-calling replaces the previous set. */
  options(opts: SelectColumnOptionsInput): this {
    if (Array.isArray(opts)) {
      this._options = opts.map(o => ({ value: o.value, label: o.label }))
    } else {
      this._options = Object.entries(opts).map(([value, label]) => ({ value, label }))
    }
    return this
  }

  /** Add an explicit "—" option that maps to `null`. Without this a
   * required column has no way to clear the value through the inline
   * control. */
  nullable(v = true): this { this._nullable = v; return this }

  /** Hide the placeholder option (the leading "Select…" entry) once a
   * value is set. Default: keep showing it so users can clear or
   * reselect. Filament parity. */
  selectablePlaceholder(v = true): this { this._selectablePlaceholder = v; return this }

  getOptions(): ReadonlyArray<ColumnSelectOption> { return this._options }

  protected override serializeExtras(meta: ColumnMeta): void {
    if (this._options.length > 0) meta.selectOptions = this._options.slice()
    if (this._nullable) meta.selectNullable = true
    if (!this._selectablePlaceholder) meta.selectablePlaceholder = false
  }
}
