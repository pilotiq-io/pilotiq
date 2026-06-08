import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

export type PanelLayout = 'list' | 'grid' | 'integrated'

export interface AspectRatioOption {
  /** Numeric ratio, e.g. `16/9`, `4/3`, `1` for square. */
  ratio: number
  /** Human-readable label shown in the editor picker, e.g. `'Widescreen'`. */
  label: string
}

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
  private _downloadable = false
  private _openable = false
  private _reorderable = false
  private _appendFiles = false
  private _panelLayout: PanelLayout = 'list'
  private _imageEditor = false
  private _imageEditorAspectRatioOptions?: AspectRatioOption[]
  private _circleCropper = false
  private _automaticallyCropImagesToAspectRatio = false
  private _automaticallyResize?: { width: number; height: number }
  private _preserveFilenames = false

  private constructor(name: string) {
    super(name, 'fileUpload')
  }

  static make(name: string): FileUploadField {
    return this.configured(new FileUploadField(name))
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

  /** Add a download button to each uploaded file item. */
  downloadable(value: boolean = true): this { this._downloadable = value; return this }

  /** Make the file thumbnail/icon link to the file (open in new tab). */
  openable(value: boolean = true): this { this._openable = value; return this }

  /** Allow files to be reordered via drag-and-drop. Only useful with `multiple()`. */
  reorderable(value: boolean = true): this { this._reorderable = value; return this }

  /**
   * Append new uploads to the existing file list instead of replacing it.
   * By default new picks replace the current value. Combine with `multiple()`.
   */
  appendFiles(value: boolean = true): this { this._appendFiles = value; return this }

  /** Display layout for the uploaded file list. `'grid'` shows square tiles; `'integrated'` embeds the upload button as a tile. */
  panelLayout(layout: PanelLayout): this { this._panelLayout = layout; return this }

  /** Open a crop/resize modal after the user selects an image, before it is uploaded. */
  imageEditor(value: boolean = true): this { this._imageEditor = value; return this }

  /** Aspect ratio presets shown in the image editor picker. */
  imageEditorAspectRatioOptions(options: AspectRatioOption[]): this { this._imageEditorAspectRatioOptions = options; return this }

  /** Render a circular crop overlay in the image editor. */
  circleCropper(value: boolean = true): this { this._circleCropper = value; return this }

  /**
   * When aspect ratio options are configured, automatically apply the first
   * ratio and skip showing the editor UI unless the user explicitly opens it.
   */
  automaticallyCropImagesToAspectRatio(value: boolean = true): this { this._automaticallyCropImagesToAspectRatio = value; return this }

  /**
   * Resize the image to the given dimensions on the server after upload.
   * Requires `@rudderjs/image` to be installed and the upload adapter to
   * forward the `resize_width` / `resize_height` FormData fields.
   */
  automaticallyResize(width: number, height: number): this { this._automaticallyResize = { width, height }; return this }

  /**
   * Shorthand for `.imageEditor().circleCropper().multiple(false)`.
   * Ideal for single avatar / profile-picture fields.
   */
  avatar(value: boolean = true): this {
    if (value) { this._imageEditor = true; this._circleCropper = true; this._multiple = false }
    return this
  }

  /**
   * Keep the original filename on the storage adapter instead of the
   * default random id. The adapter sanitizes the supplied name (strips
   * path segments + unsafe characters); two uploads with the same name
   * land on the same key, so the later one overwrites — pair with
   * `directory()` (or an adapter that namespaces per record) when
   * collisions matter. Honored by `localUpload`; custom adapters read
   * `UploadRequest.preserveFilenames`.
   */
  preserveFilenames(value: boolean = true): this { this._preserveFilenames = value; return this }

  getAccept(): string[] | undefined { return this._accept }
  getMaxSize(): number | undefined { return this._maxSize }
  isMultiple(): boolean { return this._multiple }
  hasPreview(): boolean { return this._preview }
  getDirectory(): string | undefined { return this._directory }
  isDownloadable(): boolean { return this._downloadable }
  isOpenable(): boolean { return this._openable }
  isReorderable(): boolean { return this._reorderable }
  doesAppendFiles(): boolean { return this._appendFiles }
  getPanelLayout(): PanelLayout { return this._panelLayout }
  hasImageEditor(): boolean { return this._imageEditor }
  getImageEditorAspectRatioOptions(): AspectRatioOption[] | undefined { return this._imageEditorAspectRatioOptions }
  hasCircleCropper(): boolean { return this._circleCropper }
  doesAutomaticallyCrop(): boolean { return this._automaticallyCropImagesToAspectRatio }
  getAutomaticallyResize(): { width: number; height: number } | undefined { return this._automaticallyResize }
  isPreservingFilenames(): boolean { return this._preserveFilenames }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return {
      ...this.buildMeta(ctx),
      multiple: this._multiple,
      preview:  this._preview,
      ...(this._accept     ? { accept: this._accept }     : {}),
      ...(this._maxSize !== undefined ? { maxSize: this._maxSize } : {}),
      ...(this._directory  ? { directory: this._directory }  : {}),
      ...(this._downloadable           ? { downloadable: true }             : {}),
      ...(this._openable               ? { openable: true }                 : {}),
      ...(this._reorderable            ? { reorderable: true }              : {}),
      ...(this._appendFiles            ? { appendFiles: true }              : {}),
      ...(this._panelLayout !== 'list' ? { panelLayout: this._panelLayout } : {}),
      ...(this._imageEditor ? { imageEditor: true } : {}),
      ...(this._imageEditorAspectRatioOptions?.length ? { imageEditorAspectRatioOptions: this._imageEditorAspectRatioOptions } : {}),
      ...(this._circleCropper ? { circleCropper: true } : {}),
      ...(this._automaticallyCropImagesToAspectRatio ? { automaticallyCropImagesToAspectRatio: true } : {}),
      ...(this._automaticallyResize ? { automaticallyResize: this._automaticallyResize } : {}),
      ...(this._preserveFilenames ? { preserveFilenames: true } : {}),
      // `uploadUrl` is stamped via RenderContext by the page-data
      // builders. Without it the renderer falls back to a clear error
      // ("no upload URL configured"); the route handler (and therefore
      // the URL) is registered alongside the panel.
      ...(ctx?.uploadUrl ? { uploadUrl: ctx.uploadUrl } : {}),
    }
  }
}

export const FileUpload = FileUploadField
