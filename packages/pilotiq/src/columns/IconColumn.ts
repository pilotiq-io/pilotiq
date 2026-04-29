import { Column, type ColumnMeta, type ColumnColor } from '../Column.js'

/** Per-value rendering option for an IconColumn cell. */
export interface IconOption {
  icon: string
  color?: ColumnColor | string
}

/**
 * Renders the cell as a small icon. Use a value-to-icon map to vary the
 * icon by raw cell value (e.g. status string, boolean, numeric flag).
 *
 *   IconColumn.make('isAdmin').options({
 *     true:  { icon: 'shield-check', color: 'success' },
 *     false: { icon: 'user',         color: 'muted'   },
 *   })
 */
export class IconColumn extends Column {
  protected _options: Record<string, IconOption> = {}

  static override make(name: string): IconColumn {
    const c = new IconColumn(name)
    c.setColumnType('icon')
    return c
  }

  options(map: Record<string, IconOption>): this {
    this._options = { ...this._options, ...map }
    return this
  }

  protected override serializeExtras(meta: ColumnMeta): void {
    if (Object.keys(this._options).length > 0) {
      meta.iconOptions = this._options
    }
  }
}
