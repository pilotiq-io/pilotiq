import { Column, type ColumnMeta, type ColumnSelectOption } from '../Column.js'

/** Accepted shapes for `SelectColumn.options(...)`. The map form
 * (`{ draft: 'Draft' }`) is convenience sugar for the array form. */
export type SelectColumnOptionsInput =
  | Record<string, string>
  | Array<ColumnSelectOption>

/** Per-row resolver — runs once per visible row at table-data time and
 * stamps the resolved options on the row under `_cellSelectOptions[col]`
 * so the inline `<select>` shows row-specific values (e.g. assignee
 * candidates filtered by record team). May return a Promise. */
export type SelectColumnOptionsResolver =
  (record: unknown) => SelectColumnOptionsInput | Promise<SelectColumnOptionsInput>

/** Normalize either input shape to the canonical array form. Shared
 * between the static `.options()` setter and the per-row resolver path
 * inside `dispatchTable.ts`. */
export function normalizeSelectOptions(opts: SelectColumnOptionsInput): ColumnSelectOption[] {
  return Array.isArray(opts)
    ? opts.map(o => ({ value: o.value, label: o.label }))
    : Object.entries(opts).map(([value, label]) => ({ value, label }))
}

/**
 * Inline-edit select. Renders a `<select>` in the cell; each change
 * fires an immediate PATCH.
 *
 *   SelectColumn.make('status')
 *     .options({ draft: 'Draft', published: 'Published', archived: 'Archived' })
 *     .nullable()
 *
 * Pair with `Column.disabled(record => …)` for per-row gating
 * (e.g. forbid changing status once archived).
 *
 * Per-row options resolve via `.options(record => …)`:
 *
 *   SelectColumn.make('assigneeId')
 *     .options(async (row) => {
 *       const team = await Team.find(row.teamId)
 *       return team.members.map(m => ({ value: String(m.id), label: m.name }))
 *     })
 *
 * The resolver runs once per visible row in `loadTableRecords` and
 * stamps the resolved option list on `row._cellSelectOptions[col.name]`.
 * Failed resolvers stay silent — the cell falls back to whatever was
 * passed as a static `.options(...)` (or an empty list) so a single bad
 * row doesn't break the whole table.
 */
export class SelectColumn extends Column {
  protected _options: ColumnSelectOption[] = []
  protected _optionsResolver?: SelectColumnOptionsResolver
  protected _nullable = false
  protected _selectablePlaceholder = true

  static override make(name: string): SelectColumn {
    const c = new SelectColumn(name)
    c.setColumnType('select')
    return c
  }

  /** Static options OR a per-row resolver. Function form receives the
   * raw record and may return a Promise — runs once per row in
   * `loadTableRecords`. Re-calling replaces the previous set; mixing
   * static + resolver replaces both because the renderer reads the
   * per-row stamp first and falls back to the static list. */
  options(opts: SelectColumnOptionsInput | SelectColumnOptionsResolver): this {
    if (typeof opts === 'function') {
      this._optionsResolver = opts
      this._options = []
    } else {
      this._options = normalizeSelectOptions(opts)
      delete this._optionsResolver
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
  getOptionsResolver(): SelectColumnOptionsResolver | undefined { return this._optionsResolver }

  protected override serializeExtras(meta: ColumnMeta): void {
    // The static list still serializes when set so the renderer has a
    // fallback if the per-row resolver throws or stamps no options.
    if (this._options.length > 0) meta.selectOptions = this._options.slice()
    if (this._nullable) meta.selectNullable = true
    if (!this._selectablePlaceholder) meta.selectablePlaceholder = false
  }
}
