import { Field, type FieldMeta, type FieldType, type RenderContext } from '@pilotiq/pilotiq'
import { Block, type BlockMeta } from './Block.js'
import { defaultBlocks } from './blocks/index.js'
import {
  MentionProvider,
  type MentionItem,
  type MentionProviderMeta,
  type MentionResolverContext,
} from './MentionProvider.js'

/**
 * Identifier for a single toolbar action. The renderer maps each id to a
 * Tiptap command + an icon. Unknown ids are rendered as nothing — keeps the
 * surface forward-compatible: a config that targets a button shipped in a
 * later version stays inert today instead of crashing.
 *
 * Buttons that aren't yet shipped (textColor, highlight, attachFiles, table
 * variants, …) still appear in the union — registering them in user code is
 * a no-op today and lights up automatically when a later phase wires them.
 */
export type ToolbarButtonId =
  // Inline marks
  | 'bold' | 'italic' | 'underline' | 'strike' | 'subscript' | 'superscript' | 'code'
  // Inline size variants — `lead` paragraph styling + semantic `<small>`.
  | 'lead' | 'small'
  // Block / heading switches
  | 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  // Alignment
  | 'alignStart' | 'alignCenter' | 'alignEnd' | 'alignJustify'
  // Block primitives
  | 'blockquote' | 'codeBlock' | 'bulletList' | 'orderedList' | 'horizontalRule'
  // Editing helpers
  | 'clearFormatting' | 'link' | 'undo' | 'redo'
  // Reserved — wired in later phases
  | 'textColor' | 'highlight' | 'attachFiles'
  | 'table' | 'tableAddColumnBefore' | 'tableAddColumnAfter' | 'tableDeleteColumn'
  | 'tableAddRowBefore' | 'tableAddRowAfter' | 'tableDeleteRow'
  | 'tableMergeCells' | 'tableSplitCell'
  | 'tableToggleHeaderRow' | 'tableToggleHeaderCell' | 'tableDelete'
  // Collapsible `<details>` block — single button, opt-in via `.toolbarButtons`.
  | 'details'
  // Multi-column grid layout. `grid` inserts a 2-column grid by default;
  // `gridDelete` unwraps the enclosing grid. Both default-off — opt-in via
  // `.toolbarButtons([...])`.
  | 'grid' | 'gridDelete'

export type ToolbarGroups = ToolbarButtonId[][]

/** Default top-level toolbar groups — mirrors the reference admin's layout. */
export const DEFAULT_TOOLBAR_GROUPS: ToolbarGroups = [
  ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'link'],
  ['h2', 'h3'],
  ['alignStart', 'alignCenter', 'alignEnd'],
  ['blockquote', 'codeBlock', 'bulletList', 'orderedList'],
  ['undo', 'redo'],
]

export type RichTextStorage = 'json' | 'html'

/**
 * One swatch in a text-color or highlight palette. `value` is what gets
 * written into the editor (a CSS color); `dark` is an optional override
 * shown when the editor's parent is in dark mode.
 */
export interface ColorSwatch {
  value: string
  label: string
  dark?: string
}

/**
 * Tailwind-flavored fallback palette. Used when the field doesn't override
 * the colors via `.textColors([...])`. Mirrors the reference admin's
 * "popular Tailwind hues" default.
 */
export const DEFAULT_TEXT_COLORS: ColorSwatch[] = [
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#000000', label: 'Black', dark: '#ffffff' },
  { value: '#6b7280', label: 'Gray' },
]

export const DEFAULT_HIGHLIGHT_COLORS: ColorSwatch[] = [
  { value: '#fef08a', label: 'Yellow' },
  { value: '#fed7aa', label: 'Orange' },
  { value: '#fecaca', label: 'Red' },
  { value: '#bbf7d0', label: 'Green' },
  { value: '#bfdbfe', label: 'Blue' },
  { value: '#e9d5ff', label: 'Purple' },
  { value: '#f5d0fe', label: 'Pink' },
  { value: '#e5e7eb', label: 'Gray' },
]

export type RichTextAttachmentVisibility = 'public' | 'private'

// Inherits `fieldType` from FieldMeta; we don't narrow it here because the
// `FieldType` union admits `(string & {})` which makes the narrow `'richtext'`
// literal incompatible during interface extension. `fieldType` is always
// `'richtext'` at runtime.
export interface RichTextFieldMeta extends FieldMeta {
  blocks:           BlockMeta[]
  slashCommand:     boolean
  /** Always-on top-level toolbar groups. `null` = hidden. */
  toolbarGroups:    ToolbarGroups | null
  /** Selection-anchored quick-format toolbar. */
  floatingToolbar:  boolean
  storage:          RichTextStorage
  /** Text-color palette shown when the `textColor` button opens. */
  textColors:       ColorSwatch[]
  /** Whether to expose a free-form color picker below the swatches. */
  customTextColors: boolean
  /** Highlight palette shown when the `highlight` button opens. */
  highlightColors:  ColorSwatch[]
  /** Allow drag-resize of inserted images via a corner handle. */
  resizableImages:  boolean
  /** MIME-type allowlist for the `attachFiles` picker (e.g. `['image/*']`). */
  fileAttachmentsAcceptedFileTypes?: string[]
  /** Per-file size cap in bytes; the upload route also enforces this. */
  fileAttachmentsMaxSize?: number
  /** Sub-directory hint forwarded to the upload adapter. */
  fileAttachmentsDirectory?: string
  /** Adapter-defined visibility hint — `'public'` or `'private'`. */
  fileAttachmentsVisibility?: RichTextAttachmentVisibility
  /** URL of the panel's `_uploads` route. Only stamped when both
   *  `RenderContext.uploadUrl` and `RenderContext.hasUploadAdapter` are
   *  set — so its presence is itself the "adapter is wired" signal that
   *  the slash-menu Image entry consults. */
  uploadUrl?: string
  /**
   * Identifier list for `{{ tag }}` placeholders surfaced in the slash menu.
   * Empty array = no merge tags.
   */
  mergeTags: string[]
  /**
   * Mention providers — one entry per trigger character (`@`, `#`, …) with
   * its static item list. Empty array = no mentions wired.
   */
  mentions: MentionProviderMeta[]
  /**
   * Endpoint stamped by `tagRichTextMentionUrls` when this field has at
   * least one async provider (`MentionProvider.itemsUsing(fn)`). The
   * client POSTs `{ field, trigger, query }` per keystroke; the server
   * runs the user resolver and returns `{ ok, items }`. Absent when
   * every provider on this field is static.
   */
  mentionsUrl?: string
}

/**
 * Field that renders a Tiptap-based rich-text editor with slash menu,
 * draggable blocks, and a custom-block API.
 *
 * @example
 * ```ts
 * RichTextField.make('body')
 *   .label('Article body')
 *   .placeholder('Start writing…')
 *   .toolbarButtons([
 *     ['bold', 'italic', 'underline', 'strike', 'link'],
 *     ['h2', 'h3'],
 *     ['bulletList', 'orderedList'],
 *     ['undo', 'redo'],
 *   ])
 *   .blocks([
 *     Block.make('callout').label('Callout').icon('💡').schema([
 *       TextField.make('title'),
 *       TextareaField.make('content').required(),
 *     ]),
 *   ])
 * ```
 */
export class RichTextField extends Field {
  private _blocks:          Block[] = []
  private _includeDefaultBlocks = true
  private _slashCommand    = true
  /** `undefined` = use default, `null` = hidden, array = explicit override. */
  private _toolbarOverride: ToolbarGroups | null | undefined = undefined
  private _enabled:         ToolbarButtonId[] = []
  private _disabled:        ToolbarButtonId[] = []
  private _floatingToolbar = true
  private _storage:         RichTextStorage = 'json'
  private _textColors:      ColorSwatch[] | null = null
  private _customTextColors = false
  private _highlightColors: ColorSwatch[] | null = null
  private _resizableImages = false
  private _fileAttachmentsAcceptedFileTypes?: string[]
  private _fileAttachmentsMaxSize?:           number
  private _fileAttachmentsDirectory?:         string
  private _fileAttachmentsVisibility?:        RichTextAttachmentVisibility
  private _mergeTags:                         string[] = []
  private _mentions:                          MentionProvider[] = []
  private _mentionsUrl?:                      string

  private constructor(name: string) {
    super(name, 'richtext' as FieldType)
  }

  static make(name: string): RichTextField {
    return new RichTextField(name)
  }

  /** Custom blocks available via the slash menu (merged on top of the defaults). */
  blocks(blocks: Block[]): this {
    this._blocks = blocks
    return this
  }

  /**
   * Toggle the built-in default blocks (FAQ, Alert, Summary, Key takeaways,
   * Pros & cons) for this field. On by default — every field gets them in the
   * slash menu and the agent block catalog. Pass `false` to ship only the
   * blocks declared via `.blocks([...])`.
   */
  withDefaultBlocks(enabled = true): this {
    this._includeDefaultBlocks = enabled
    return this
  }

  /**
   * The blocks this field actually exposes — the default set (unless opted
   * out) merged with the field's own `.blocks([...])`. A field block with the
   * same name overrides the default. This is what the editor slash menu, the
   * side panel, and the agent block catalog all consume.
   */
  private resolveBlocks(): Block[] {
    const byName = new Map<string, Block>()
    if (this._includeDefaultBlocks) {
      for (const b of defaultBlocks) byName.set(b.getName(), b)
    }
    for (const b of this._blocks) byName.set(b.getName(), b)
    return [...byName.values()]
  }

  /** Toggle the slash menu (`/`) on/off. Defaults to `true`. */
  slashCommand(enabled: boolean): this {
    this._slashCommand = enabled
    return this
  }

  /**
   * Replace the top-level toolbar layout. Pass nested arrays — each inner
   * array becomes a button group separated by a thin divider.
   *
   * Pass `null` (or call `toolbar(false)`) to hide the toolbar entirely.
   */
  toolbarButtons(groups: ToolbarGroups | null): this {
    this._toolbarOverride = groups
    return this
  }

  /** Add buttons on top of whichever layout is active. */
  enableToolbarButtons(buttons: ToolbarButtonId[]): this {
    this._enabled = [...this._enabled, ...buttons]
    return this
  }

  /** Remove buttons from whichever layout is active. */
  disableToolbarButtons(buttons: ToolbarButtonId[]): this {
    this._disabled = [...this._disabled, ...buttons]
    return this
  }

  /**
   * Toolbar visibility shortcut.
   *
   *   - `true` (default) — show the top-level toolbar with the default groups
   *     unless `toolbarButtons([...])` was called.
   *   - `false` — hide the top-level toolbar.
   *
   * Selection-anchored floating toolbar is controlled separately via
   * {@link floatingToolbar}.
   */
  toolbar(enabled: boolean): this {
    if (!enabled) this._toolbarOverride = null
    else if (this._toolbarOverride === null) this._toolbarOverride = undefined
    return this
  }

  /** Toggle the selection-anchored quick-format toolbar. Defaults to `true`. */
  floatingToolbar(enabled: boolean): this {
    this._floatingToolbar = enabled
    return this
  }

  /**
   * Storage format for the field's value.
   *
   *   - `'json'` (default) — Tiptap JSON document, parsed via `JSON.parse`.
   *   - `'html'` — serialized HTML string, useful for display surfaces that
   *     can't render JSON (e.g. existing blog/CMS columns).
   */
  storage(format: RichTextStorage): this {
    this._storage = format
    return this
  }

  /**
   * Replace the text-color palette opened by the `textColor` toolbar button.
   * Pass `null` to fall back to the default Tailwind-derived palette.
   *
   * @example
   * ```ts
   * RichTextField.make('body').textColors([
   *   { value: '#1e293b', label: 'Slate' },
   *   { value: '#dc2626', label: 'Red',   dark: '#fca5a5' },
   * ])
   * ```
   */
  textColors(palette: ColorSwatch[] | null): this {
    this._textColors = palette
    return this
  }

  /** Show a free-form color picker below the swatches. */
  customTextColors(enabled = true): this {
    this._customTextColors = enabled
    return this
  }

  /** Replace the highlight palette opened by the `highlight` toolbar button. */
  highlightColors(palette: ColorSwatch[] | null): this {
    this._highlightColors = palette
    return this
  }

  /**
   * Allow drag-resizing of inserted images via a corner handle. Off by
   * default — when enabled, the editor mounts a NodeView that wraps the
   * image in a resize-aware wrapper and writes `width` / `height` attrs
   * back into the document.
   */
  resizableImages(enabled = true): this {
    this._resizableImages = enabled
    return this
  }

  /**
   * Restrict the `attachFiles` picker to specific MIME types — passed
   * verbatim to the file input's `accept` attribute and re-checked
   * server-side by the upload route.
   *
   * @example
   * ```ts
   * RichTextField.make('body').fileAttachmentsAcceptedFileTypes(['image/*'])
   * ```
   */
  fileAttachmentsAcceptedFileTypes(types: string[]): this {
    this._fileAttachmentsAcceptedFileTypes = types
    return this
  }

  /** Per-file size cap in bytes for `attachFiles`. */
  fileAttachmentsMaxSize(bytes: number): this {
    this._fileAttachmentsMaxSize = bytes
    return this
  }

  /**
   * Sub-directory hint forwarded to the upload adapter alongside the
   * `attachFiles` payload. Adapters honor it differently (`localUpload`
   * writes to `<root>/<directory>/...`, S3 prepends to the key, etc.).
   */
  fileAttachmentsDirectory(d: string): this {
    this._fileAttachmentsDirectory = d
    return this
  }

  /** Adapter-defined visibility hint — `'public'` or `'private'`. */
  fileAttachmentsVisibility(v: RichTextAttachmentVisibility): this {
    this._fileAttachmentsVisibility = v
    return this
  }

  /**
   * Surface a `{{ tag }}` placeholder for each id in the slash menu under
   * the "Merge tags" group. The placeholder stores as a `mergeTag` atom
   * node and renders read-side via
   * `renderRichTextToHtml(content, { mergeTags: { name: 'Sleman', … } })` —
   * the substitution map replaces each id with the resolved value
   * (HTML-escaped).
   *
   * @example
   * ```ts
   * RichTextField.make('body').mergeTags(['firstName', 'company'])
   * ```
   */
  mergeTags(tags: string[]): this {
    this._mergeTags = tags
    return this
  }

  /**
   * Wire one or more mention providers. Each provider owns a trigger
   * character (`@` / `#` / …) and a static item list. Typing the trigger
   * opens a popover anchored to the cursor; picking an item inserts a
   * `mention` atom node carrying `id`, `label`, and `trigger`.
   *
   * Read-side rendering uses the cached label by default; pass
   * `renderRichTextToHtml(content, { resolveMention: (trigger, id) =>
   * latestLabel })` to override at display time.
   *
   * @example
   * ```ts
   * RichTextField.make('body').mentions([
   *   MentionProvider.make('@').items([
   *     { id: 'sleman', label: 'Sleman' },
   *     { id: 'alex',   label: 'Alex'   },
   *   ]),
   * ])
   * ```
   */
  mentions(providers: MentionProvider[]): this {
    this._mentions = providers
    return this
  }

  getBlocks():       readonly Block[] { return this.resolveBlocks() }
  getMergeTags():    readonly string[] { return this._mergeTags }
  getMentionProviders(): readonly MentionProvider[] { return this._mentions }
  /**
   * `true` iff at least one provider was configured with `itemsUsing(fn)`.
   * Pilotiq's `tagRichTextMentionUrls` walker uses this to gate URL
   * stamping — fields with only static providers stay URL-less.
   */
  hasAsyncMentions(): boolean {
    return this._mentions.some(p => p.isAsync())
  }
  /**
   * Look up a provider by trigger char and run its resolver with `query`
   * and `ctx`. Returns the matched items, or `null` when no provider
   * carries that trigger. Static providers run too (using their cached
   * list) — keeps the dispatcher uniform; the client just won't call
   * the endpoint for static providers.
   */
  async resolveMention(trigger: string, query: string, ctx: MentionResolverContext): Promise<MentionItem[] | null> {
    const provider = this._mentions.find(p => p.getTrigger() === trigger)
    if (!provider) return null
    return await provider.runResolver(query, ctx)
  }
  /**
   * Render-time setter — pilotiq stamps the URL after schema resolution
   * via `tagRichTextMentionUrls`. The setter is idempotent; the last
   * call wins.
   */
  withMentionsUrl(url: string): this {
    this._mentionsUrl = url
    return this
  }
  isSlashEnabled():  boolean { return this._slashCommand }
  getStorage():      RichTextStorage { return this._storage }
  isResizableImages(): boolean { return this._resizableImages }
  getFileAttachmentsAcceptedFileTypes(): string[] | undefined { return this._fileAttachmentsAcceptedFileTypes }
  getFileAttachmentsMaxSize(): number | undefined { return this._fileAttachmentsMaxSize }
  getFileAttachmentsDirectory(): string | undefined { return this._fileAttachmentsDirectory }
  getFileAttachmentsVisibility(): RichTextAttachmentVisibility | undefined { return this._fileAttachmentsVisibility }

  /**
   * Resolve the actual button layout — base layout (override or default) with
   * `enableToolbarButtons` appended to the last group and
   * `disableToolbarButtons` filtered out across every group. Empty groups
   * are dropped. Returns `null` when the toolbar is hidden.
   */
  getToolbarGroups(): ToolbarGroups | null {
    const override = this._toolbarOverride
    const base: ToolbarGroups | null =
      override === null      ? null :
      override === undefined ? DEFAULT_TOOLBAR_GROUPS :
      override

    if (base === null) return null

    const enabled  = this._enabled
    const disabled = new Set(this._disabled)

    const groups = base.map((group) => group.filter((id) => !disabled.has(id)))
    if (enabled.length > 0) {
      const extras = enabled.filter((id) => !disabled.has(id))
      if (groups.length === 0) groups.push(extras)
      else {
        const last = groups[groups.length - 1]!
        groups[groups.length - 1] = [...last, ...extras]
      }
    }
    return groups.filter((g) => g.length > 0)
  }

  isFloatingToolbarEnabled(): boolean {
    return this._floatingToolbar
  }

  override async toMeta(ctx?: RenderContext): Promise<RichTextFieldMeta> {
    // Block fields can be async — Select / Radio / ToggleButtons resolve their
    // options at meta-build time and return `Promise<FieldMeta>`. So block
    // metas, and therefore this method, are async. The core resolves every
    // field via `await field.toMeta(ctx)` (`resolveField`), so returning a
    // Promise is the supported path.
    const base = (await Promise.resolve(super.toMeta(ctx))) as FieldMeta
    // Strip `attachFiles` server-side when the panel hasn't registered an
    // upload adapter — same posture as `MarkdownField` and the editor
    // chrome stays clean. `uploadUrl` is the wire-side URL for the picker
    // dialog; only stamped when adapter is wired (otherwise the button is
    // already gone from the toolbar groups).
    const groups = this.getToolbarGroups()
    const filteredGroups = ctx?.hasUploadAdapter
      ? groups
      : groups?.map(g => g.filter(b => b !== 'attachFiles'))
                .filter(g => g.length > 0) ?? null
    return {
      ...base,
      blocks:           await Promise.all(this.resolveBlocks().map((b) => b.toMeta())),
      slashCommand:     this._slashCommand,
      toolbarGroups:    filteredGroups,
      floatingToolbar:  this._floatingToolbar,
      storage:          this._storage,
      textColors:       this._textColors       ?? DEFAULT_TEXT_COLORS,
      customTextColors: this._customTextColors,
      highlightColors:  this._highlightColors  ?? DEFAULT_HIGHLIGHT_COLORS,
      resizableImages:  this._resizableImages,
      ...(this._fileAttachmentsAcceptedFileTypes !== undefined
            ? { fileAttachmentsAcceptedFileTypes: this._fileAttachmentsAcceptedFileTypes } : {}),
      ...(this._fileAttachmentsMaxSize !== undefined
            ? { fileAttachmentsMaxSize: this._fileAttachmentsMaxSize } : {}),
      ...(this._fileAttachmentsDirectory !== undefined
            ? { fileAttachmentsDirectory: this._fileAttachmentsDirectory } : {}),
      ...(this._fileAttachmentsVisibility !== undefined
            ? { fileAttachmentsVisibility: this._fileAttachmentsVisibility } : {}),
      ...(ctx?.uploadUrl && ctx?.hasUploadAdapter ? { uploadUrl: ctx.uploadUrl } : {}),
      mergeTags:        [...this._mergeTags],
      mentions:         this._mentions.map((p) => p.toMeta()),
      ...(this._mentionsUrl !== undefined ? { mentionsUrl: this._mentionsUrl } : {}),
    }
  }
}
