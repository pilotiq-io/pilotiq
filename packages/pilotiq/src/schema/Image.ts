import { Element } from './Element.js'

export type ImageShape = 'square' | 'rounded' | 'circle'

/**
 * Display prime — renders an `<img>` inline in a schema. Use for inline
 * thumbnails, avatars, brand marks, or detail-page hero shots; for
 * table-cell images reach for `ImageColumn` instead.
 *
 * @example
 * Image.make('https://cdn.example.com/avatar.png').alt('Avatar').size(64).circle()
 */
export class Image extends Element {
  private _alt    = ''
  private _width?:  number
  private _height?: number
  private _shape:  ImageShape = 'square'

  private constructor(private url: string) {
    super()
  }

  static make(url: string): Image {
    return new Image(url)
  }

  alt(text: string): this { this._alt = text; return this }

  /** Width in pixels. */
  width(px: number): this { this._width = px; return this }

  /** Height in pixels. */
  height(px: number): this { this._height = px; return this }

  /** Sugar for square width + height. */
  size(px: number): this {
    this._width = px
    this._height = px
    return this
  }

  rounded(): this { this._shape = 'rounded'; return this }
  circle(): this  { this._shape = 'circle';  return this }

  getType(): string { return 'image' }

  toMeta() {
    return {
      type: 'image' as const,
      url:  this.url,
      alt:  this._alt,
      shape: this._shape,
      ...(this._width  !== undefined ? { width:  this._width  } : {}),
      ...(this._height !== undefined ? { height: this._height } : {}),
    }
  }
}
