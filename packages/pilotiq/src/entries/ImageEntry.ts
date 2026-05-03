import { Entry, type EntryMeta } from './Entry.js'
import type { RenderContext } from '../schema/resolveSchema.js'

export type ImageEntryShape = 'square' | 'rounded' | 'circle'

/**
 * Read-only sibling of `ImageColumn` / the `Image` display prime, but
 * record-bound. The state value is the image URL; `.width(px) / .height(px)`
 * (or the `.dimensions(px)` square sugar) control the rendered size;
 * `.square() / .rounded() / .circle()` pick the border-radius shape.
 *
 * `Entry.size(EntrySize)` is inherited but doesn't affect image rendering
 * — it's the text-size token used by `TextEntry`. Use `dimensions()` for
 * pixel sizing instead.
 *
 * @example
 * ImageEntry.make('avatarUrl').dimensions(96).circle()
 */
export class ImageEntry extends Entry {
  private _width  = 64
  private _height = 64
  private _imageShape: ImageEntryShape = 'rounded'

  private constructor(name: string) {
    super(name)
  }

  static make(name: string): ImageEntry {
    return new ImageEntry(name)
  }

  width(px: number): this  { this._width  = px; return this }
  height(px: number): this { this._height = px; return this }

  /** Square sugar — sets width and height to the same pixel value. */
  dimensions(px: number): this {
    this._width  = px
    this._height = px
    return this
  }

  square(): this  { this._imageShape = 'square';  return this }
  rounded(): this { this._imageShape = 'rounded'; return this }
  circle(): this  { this._imageShape = 'circle';  return this }

  protected override getEntryType(): string { return 'image' }

  override async toMeta(ctx?: RenderContext): Promise<EntryMeta> {
    const meta = await Promise.resolve(super.toMeta(ctx)) as EntryMeta & {
      imageSize?:  number
      imageWidth?: number
      imageHeight?: number
      imageShape?: ImageEntryShape
    }
    meta.imageWidth  = this._width
    meta.imageHeight = this._height
    meta.imageShape  = this._imageShape
    if (this._width === this._height) meta.imageSize = this._width
    return meta
  }
}
