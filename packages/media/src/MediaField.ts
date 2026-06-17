import { Field, type FieldMeta, type RenderContext } from '@pilotiq/pilotiq'

/**
 * A media-library form field — the media-aware counterpart to core's
 * `FileUpload`. Two ways to set a value in one field:
 *
 *   1. Upload new file(s) inline (runs the `@pilotiq/media` upload pipeline,
 *      so conversions / dimensions are generated on the server).
 *   2. Open the library browser and pick existing item(s).
 *
 * The stored value is a stable {@link MediaRef} (single) or `MediaRef[]`
 * (`multiple()`), NOT a raw URL — so alt text and responsive conversions
 * round-trip onto the field on edit without a re-fetch. The column must carry
 * a `'json'` cast (`static casts = { [name]: 'json' }`) so the object/array
 * persists and revives through the native engine.
 *
 * @example
 * ```ts
 * MediaField.make('featuredImage')
 *   .label('Featured image')
 *   .accept(['image/*'])
 *
 * MediaField.make('gallery')
 *   .label('Gallery')
 *   .multiple()
 *   .library('photos')
 * ```
 */
export class MediaField extends Field {
  private _multiple = false
  private _preview  = true
  private _accept?:  string[]
  private _maxSize?: number
  private _library?: string

  private constructor(name: string) {
    super(name, 'media')
  }

  static make(name: string): MediaField {
    return this.configured(new MediaField(name))
  }

  /** Allow selecting / uploading multiple files. Value becomes `MediaRef[]`. */
  multiple(value: boolean = true): this { this._multiple = value; return this }

  /** Show a thumbnail / file-name preview of the current value. Default true. */
  preview(value: boolean = true): this { this._preview = value; return this }

  /** Restrict accepted MIME types for inline uploads (passed to the file input). */
  accept(mimes: string[]): this { this._accept = mimes; return this }

  /** Max upload size in bytes (enforced server-side by the upload pipeline). */
  maxSize(bytes: number): this { this._maxSize = bytes; return this }

  /** Target a named library (from `media()` plugin config) for uploads. */
  library(name: string): this { this._library = name; return this }

  override toMeta(ctx?: RenderContext): FieldMeta {
    // The `_media` CRUD routes mount at `${panelBase}/_media`. Core stamps
    // `uploadUrl = ${panelBase}/_uploads` on every render ctx; derive the
    // sibling media base from it so the field works in any form location
    // (the client-side `deriveApiBase` is page-slug-relative and wrong here).
    const apiBase = ctx?.uploadUrl
      ? ctx.uploadUrl.replace(/\/_uploads$/, '/_media')
      : undefined

    return {
      ...this.buildMeta(ctx),
      multiple: this._multiple,
      preview:  this._preview,
      ...(this._accept  ? { accept: this._accept }   : {}),
      ...(this._maxSize !== undefined ? { maxSize: this._maxSize } : {}),
      ...(this._library ? { library: this._library } : {}),
      ...(apiBase ? { apiBase } : {}),
    }
  }
}

/** Filament-style alias. */
export const MediaPicker = MediaField
