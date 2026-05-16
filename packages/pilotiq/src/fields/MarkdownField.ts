import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Recognized toolbar buttons. The renderer maps each id to a click handler
 * that splices markdown into the textarea around the current selection.
 * `attachFiles` is special-cased — it requires a panel-level UploadAdapter
 * (`Pilotiq.uploads({ adapter })`) and is stripped server-side from the
 * resolved meta when none is registered.
 */
export type MarkdownToolbarButton =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'link'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'codeBlock'
  | 'attachFiles'

export type MarkdownAttachmentVisibility = 'public' | 'private'

export const DEFAULT_MARKDOWN_TOOLBAR: readonly MarkdownToolbarButton[] = [
  'bold',
  'italic',
  'strike',
  'link',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
  'attachFiles',
] as const

/**
 * Markdown editor. The wire format is a plain markdown string under the
 * field name — same shape as `TextareaField`, so no new coerce branch
 * is needed.
 *
 * **Renderer is pluggable.** When `@pilotiq/tiptap` is installed, its
 * `registerTiptap()` hook wires a WYSIWYG editor that parses the
 * markdown into a Tiptap document, exposes a rich-text toolbar, and
 * serializes back to markdown on every change via `tiptap-markdown`.
 * Editor / Source / Preview tabs let users switch between the WYSIWYG
 * view, raw markdown, and a rendered preview without leaving the form.
 * Collab is automatic — when a `<RecordCollabRoom>` is mounted up-tree
 * the editor binds to the shared `Y.XmlFragment` and all peers see live
 * edits, the same way `RichTextField` does. Without `@pilotiq/tiptap`,
 * `MarkdownInput` falls back to a textarea with a formatting toolbar +
 * a preview tab — works fine for panels that don't install the adapter.
 *
 * The toolbar is configurable via `toolbarButtons([…])` /
 * `disableToolbarButtons([…])`; pass `[]` to hide the toolbar entirely.
 *
 * `attachFiles` integrates with the panel's `UploadAdapter` (the same
 * one `FileUpload` uses) — the toolbar button uploads the file via
 * `POST {base}/_uploads` and inserts an `![alt](url)` image (or a
 * `[name](url)` link for non-images). When no adapter is registered,
 * the button is stripped server-side so apps without uploads never see
 * a broken affordance.
 *
 * @example
 * ```ts
 * MarkdownField.make('body')
 *   .label('Article body')
 *   .placeholder('Write in markdown…')
 *   .minHeight('200px')
 *   .maxHeight('600px')
 *   .fileAttachmentsDirectory('articles')
 * ```
 */
export class MarkdownField extends Field {
  private _toolbarButtons: MarkdownToolbarButton[] = [...DEFAULT_MARKDOWN_TOOLBAR]
  private _minHeight?: string
  private _maxHeight?: string
  private _fileAttachmentsDirectory?: string
  private _fileAttachmentsVisibility?: MarkdownAttachmentVisibility

  private constructor(name: string) {
    super(name, 'markdown')
  }

  static make(name: string): MarkdownField {
    return new MarkdownField(name)
  }

  /**
   * Replace the toolbar entirely with the given list. Order is preserved.
   * Pass `[]` for a toolbar-less editor (preview tab still mounts).
   */
  toolbarButtons(buttons: MarkdownToolbarButton[]): this {
    this._toolbarButtons = [...buttons]
    return this
  }

  /**
   * Sugar — drop the listed buttons from the current toolbar without
   * having to re-spell every survivor. Operates on whatever the current
   * toolbar list is (the default, or whatever the last `toolbarButtons()`
   * call set).
   */
  disableToolbarButtons(buttons: MarkdownToolbarButton[]): this {
    const drop = new Set(buttons)
    this._toolbarButtons = this._toolbarButtons.filter(b => !drop.has(b))
    return this
  }

  /** CSS height for the textarea's collapsed state — any valid CSS length. */
  minHeight(value: string): this { this._minHeight = value; return this }

  /** Cap the textarea's grown height — defaults to no cap. */
  maxHeight(value: string): this { this._maxHeight = value; return this }

  /**
   * Sub-directory hint forwarded to the upload adapter alongside the
   * pasted-image / attached-file payload. Adapters honor it differently
   * (`localUpload` writes to `<root>/<directory>/...`, S3 prepends to
   * the key, etc.).
   */
  fileAttachmentsDirectory(d: string): this {
    this._fileAttachmentsDirectory = d
    return this
  }

  /** Adapter-defined visibility hint — `'public'` or `'private'`. */
  fileAttachmentsVisibility(v: MarkdownAttachmentVisibility): this {
    this._fileAttachmentsVisibility = v
    return this
  }

  getToolbarButtons(): readonly MarkdownToolbarButton[] { return this._toolbarButtons }
  getMinHeight(): string | undefined { return this._minHeight }
  getMaxHeight(): string | undefined { return this._maxHeight }
  getFileAttachmentsDirectory(): string | undefined { return this._fileAttachmentsDirectory }
  getFileAttachmentsVisibility(): MarkdownAttachmentVisibility | undefined { return this._fileAttachmentsVisibility }

  override toMeta(ctx?: RenderContext): FieldMeta {
    const base = this.buildMeta(ctx)
    // Strip `attachFiles` server-side when the panel hasn't registered an
    // upload adapter. Apps without uploads see a clean toolbar with no
    // broken affordance — distinct from `uploadUrl`, which is always
    // stamped so `FileUpload` can surface a clear error.
    const toolbarButtons = ctx?.hasUploadAdapter
      ? this._toolbarButtons
      : this._toolbarButtons.filter(b => b !== 'attachFiles')
    return {
      ...base,
      toolbarButtons,
      ...(this._minHeight !== undefined ? { minHeight: this._minHeight } : {}),
      ...(this._maxHeight !== undefined ? { maxHeight: this._maxHeight } : {}),
      ...(this._fileAttachmentsDirectory !== undefined
            ? { fileAttachmentsDirectory: this._fileAttachmentsDirectory } : {}),
      ...(this._fileAttachmentsVisibility !== undefined
            ? { fileAttachmentsVisibility: this._fileAttachmentsVisibility } : {}),
      ...(ctx?.uploadUrl && ctx?.hasUploadAdapter ? { uploadUrl: ctx.uploadUrl } : {}),
    }
  }
}

