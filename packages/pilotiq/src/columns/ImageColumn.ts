import { Column, type ColumnMeta } from '../Column.js'

/**
 * Renders the cell value as an image (avatar / thumbnail). The cell
 * value should be a URL string. Defaults to a 32px square; use
 * `.size(n)` and `.circular()` / `.square()` to tweak.
 */
export class ImageColumn extends Column {
  protected _size = 32
  protected _shape: 'square' | 'circle' = 'square'

  static override make(name: string): ImageColumn {
    const c = new ImageColumn(name)
    c.setColumnType('image')
    return this.configured(c)
  }

  /** Width = height in px. Default 32. */
  size(px: number): this { this._size = px; return this }

  circular(): this { this._shape = 'circle'; return this }
  square(): this   { this._shape = 'square'; return this }

  protected override serializeExtras(meta: ColumnMeta): void {
    meta.imageSize  = this._size
    meta.imageShape = this._shape
  }
}
