import { Column, type ColumnMeta } from '../Column.js'

/**
 * Renders the cell as a color swatch — pairs with `ColorPickerField`.
 * The raw cell value is treated as a CSS color string (HEX, HSL, RGB,
 * RGBA, named) and applied as the swatch's `background-color`. The
 * accompanying value text is shown beside the swatch unless
 * `hideValue()` is set.
 *
 *   ColorColumn.make('accent')
 *     .square()      // shape; default is `rounded()`
 *     .hideValue()   // chip only
 */
export class ColorColumn extends Column {
  protected _shape:     'rounded' | 'square' | 'circle' = 'rounded'
  protected _hideValue: boolean = false

  static override make(name: string): ColorColumn {
    const c = new ColorColumn(name)
    c.setColumnType('color')
    return c
  }

  /** Default — slightly rounded swatch. */
  rounded(): this { this._shape = 'rounded'; return this }
  /** Sharp-cornered swatch. */
  square():  this { this._shape = 'square';  return this }
  /** Circle swatch. */
  circle():  this { this._shape = 'circle';  return this }

  /** Drop the value text — render only the swatch. */
  hideValue(v = true): this { this._hideValue = v; return this }

  protected override serializeExtras(meta: ColumnMeta): void {
    meta.colorShape = this._shape
    if (this._hideValue) meta.colorHideValue = true
  }
}
