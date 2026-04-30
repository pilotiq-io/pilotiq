import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * File upload. The field stores the resolved upload's URL string —
 * `string` for single-file mode, `string[]` for multi.
 *
 * The actual upload mechanism is a separate POST endpoint. The renderer
 * picks a file → POSTs multipart to the panel's `_uploads` route → the
 * adapter (`localUpload` / S3 / etc.) writes the file → the route
 * returns `{ ok, url }` → the renderer stashes that URL in the form
 * state. On submit, the field value is just that URL.
 */
export class FileUploadField extends Field {
  private _accept?: string[]
  private _maxSize?: number
  private _multiple = false
  private _preview = true
  private _directory?: string

  private constructor(name: string) {
    super(name, 'fileUpload')
  }

  static make(name: string): FileUploadField {
    return new FileUploadField(name)
  }

  /** Restrict accepted MIME types — passed verbatim to the file input + validated server-side. */
  accept(mimes: string[]): this { this._accept = mimes; return this }

  /** Max upload size in bytes. Server-side enforced; client-side surfaces the limit too. */
  maxSize(bytes: number): this { this._maxSize = bytes; return this }

  /** Switch to multi-file mode. Value becomes `string[]` instead of `string`. */
  multiple(value: boolean = true): this { this._multiple = value; return this }

  /** Show a thumbnail / file-name preview when the value is set. Default true. */
  preview(value: boolean = true): this { this._preview = value; return this }

  /**
   * Sub-directory hint passed to the adapter. Adapters honor this
   * differently (`localUpload` writes to `<root>/<directory>/...`,
   * S3 prepends to the key, etc.).
   */
  directory(d: string): this { this._directory = d; return this }

  getAccept(): string[] | undefined { return this._accept }
  getMaxSize(): number | undefined { return this._maxSize }
  isMultiple(): boolean { return this._multiple }
  hasPreview(): boolean { return this._preview }
  getDirectory(): string | undefined { return this._directory }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return {
      ...this.buildMeta(ctx),
      multiple: this._multiple,
      preview:  this._preview,
      ...(this._accept   ? { accept: this._accept }    : {}),
      ...(this._maxSize !== undefined ? { maxSize: this._maxSize } : {}),
      ...(this._directory ? { directory: this._directory } : {}),
      // `uploadUrl` is stamped via RenderContext by the page-data
      // builders. Without it the renderer falls back to a clear error
      // ("no upload URL configured"); the route handler (and therefore
      // the URL) is registered alongside the panel.
      ...(ctx?.uploadUrl ? { uploadUrl: ctx.uploadUrl } : {}),
    }
  }
}

export const FileUpload = FileUploadField
