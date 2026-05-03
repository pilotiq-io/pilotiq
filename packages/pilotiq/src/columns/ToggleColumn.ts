import { Column, type ColumnMeta, type ColumnColor } from '../Column.js'

/**
 * Inline-edit boolean toggle. Renders a Switch in the cell; each click
 * fires an immediate PATCH (no debounce). Falsy values render off,
 * truthy on — strings like `'true'` / `'1'` from URL-encoded bodies are
 * normalized by the route handler.
 *
 *   ToggleColumn.make('featured')
 *     .onColor('success')
 *     .onIcon('star').offIcon('star-off')
 *
 * Pair with `Column.disabled(record => …)` for per-row gating
 * (e.g. forbid toggling on archived rows).
 */
export class ToggleColumn extends Column {
  protected _onColor?:  ColumnColor
  protected _offColor?: ColumnColor
  protected _onIcon?:   string
  protected _offIcon?:  string

  static override make(name: string): ToggleColumn {
    const c = new ToggleColumn(name)
    c.setColumnType('toggle')
    return c
  }

  /** Color preset applied to the switch when on. Defaults to `'primary'`
   * (renderer-side fallback) so users can opt into success / warning. */
  onColor(c: ColumnColor): this { this._onColor = c; return this }

  /** Color preset applied to the switch when off. Defaults to `'muted'`. */
  offColor(c: ColumnColor): this { this._offColor = c; return this }

  /** Icon (registry name) shown on the on side. When set on either side
   * the renderer flips into icon-button mode instead of native toggle. */
  onIcon(name: string): this { this._onIcon = name; return this }
  offIcon(name: string): this { this._offIcon = name; return this }

  protected override serializeExtras(meta: ColumnMeta): void {
    if (this._onColor  !== undefined) meta.toggleOnColor  = this._onColor
    if (this._offColor !== undefined) meta.toggleOffColor = this._offColor
    if (this._onIcon   !== undefined) meta.toggleOnIcon   = this._onIcon
    if (this._offIcon  !== undefined) meta.toggleOffIcon  = this._offIcon
  }
}
