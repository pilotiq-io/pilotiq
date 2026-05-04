import { Entry, type EntryMeta } from './Entry.js'
import type { RenderContext } from '../schema/resolveSchema.js'

export type ColorEntryShape = 'square' | 'rounded' | 'circle'

/**
 * Read-only swatch entry — sibling of `ColorPickerField`. The state value
 * is a CSS color string (`#aabbcc`, `rgb(…)`, `oklch(…)`, …) rendered as
 * a colored chip. The raw value is shown beside the chip by default; toggle
 * with `.copyable()` for click-to-copy on the value text.
 *
 * @example
 * ColorEntry.make('brandColor').dimensions(24).circle()
 */
export class ColorEntry extends Entry {
  private _width  = 24
  private _height = 24
  private _shape: ColorEntryShape = 'rounded'
  private _showValue = true

  private constructor(name: string) {
    super(name)
  }

  static make(name: string): ColorEntry {
    return new ColorEntry(name)
  }

  width(px: number): this  { this._width  = px; return this }
  height(px: number): this { this._height = px; return this }

  /** Square sugar — sets width and height to the same pixel value. */
  dimensions(px: number): this {
    this._width  = px
    this._height = px
    return this
  }

  square(): this  { this._shape = 'square';  return this }
  rounded(): this { this._shape = 'rounded'; return this }
  circle(): this  { this._shape = 'circle';  return this }

  /** Hide the raw color string next to the swatch (chip only). */
  hideValue(v = true): this { this._showValue = !v; return this }

  protected override getEntryType(): string { return 'color' }

  override async toMeta(ctx?: RenderContext): Promise<EntryMeta> {
    const meta = await Promise.resolve(super.toMeta(ctx)) as EntryMeta & {
      colorWidth?:  number
      colorHeight?: number
      colorSize?:   number
      colorShape?:  ColorEntryShape
      showValue?:   boolean
    }
    meta.colorWidth  = this._width
    meta.colorHeight = this._height
    meta.colorShape  = this._shape
    if (this._width === this._height) meta.colorSize = this._width
    if (!this._showValue)             meta.showValue = false
    return meta
  }
}
