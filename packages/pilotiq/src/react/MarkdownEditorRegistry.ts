import type { ComponentType } from 'react'

/**
 * Module-level registry slot for the WYSIWYG markdown editor renderer.
 *
 * Wiring posture (mirrors `CollabTextRendererRegistry` /
 * `FormCollabBindingRegistry`):
 *   - `@pilotiq/tiptap`'s `registerTiptap(...)` calls `registerMarkdownEditor(...)`
 *     once at boot. The registered component closes over `@tiptap/*` +
 *     `tiptap-markdown` imports so pilotiq core stays free of any tiptap peer
 *     dep — same posture as `CollabTextRendererRegistry`.
 *   - `MarkdownInput` checks for the registered component on every mount. When
 *     present, it replaces the legacy textarea + manual-toolbar path with a
 *     real WYSIWYG editor that serializes to / parses from markdown on the
 *     wire. When absent, `MarkdownInput` falls back to today's textarea path so
 *     panels that don't install `@pilotiq/tiptap` still get a working editor.
 *   - The adapter handles collab itself via the existing `useCollabRoom()` +
 *     `getCollabExtensions()` plumbing — when a `<RecordCollabRoom>` is mounted
 *     up-tree it binds the editor to the shared `Y.XmlFragment`. Markdown
 *     serialization runs locally on every change; only the ProseMirror tree
 *     ships over the wire.
 *
 * Wire format on the form remains a plain markdown string under the field
 * `name` — `MarkdownField` doesn't add a new coerce branch. The editor is
 * expected to write the current markdown to a hidden input (or call
 * `onChange` and let the host stamp it) so the form submission round-trip
 * stays identical to the textarea path.
 */
export interface MarkdownEditorProps {
  /**
   * Field name — drives the FormData hidden input AND the routing key
   * for AI suggestion delivery, applier registry, and the inline-diff
   * banner. For Repeater / Builder row leaves this is the dotted
   * positional path (`items.0.body`).
   */
  name: string
  /**
   * Collab-stable identifier for the `Y.XmlFragment` selector. When
   * present, the editor binds its collab fragment under this key
   * instead of `name`. Row leaves pass a row-id-anchored composite
   * (`items.<rowId>.body`) so the fragment survives reorders even as
   * the dotted positional `name` shifts. Top-level fields omit it —
   * `name` is stable on its own, so the fragment key tracks it
   * directly.
   *
   * AI suggestion routing and the FormData hidden input continue to
   * use `name`. The two concerns are intentionally separated: AI tool
   * calls reference fields by their positional FormData name (what
   * the agent sees), while collab needs a key that doesn't churn
   * when rows reorder.
   */
  fragmentKey?: string
  /**
   * Server-rendered default value (raw markdown string). The renderer parses
   * this into the editor's initial document. When collab is active and the
   * room has no persisted state for this field, the renderer also seeds the
   * `Y.XmlFragment` from this value.
   */
  defaultValue: string
  /** Optional placeholder hint shown in the editor when empty. */
  placeholder?: string
  /** Disabled / read-only state. */
  disabled?: boolean
  /** Fired on every editor change with the current serialized markdown. */
  onChange: (markdown: string) => void
  /** Fired on editor blur — host wires this to live-onBlur trigger semantics. */
  onBlur?: () => void

  /**
   * Configured toolbar buttons. The adapter is free to map these onto its own
   * command set; unknown / unsupported ids are skipped. Empty array hides
   * the toolbar entirely. See `MarkdownField.toolbarButtons()`.
   */
  toolbarButtons: ReadonlyArray<string>
  /** CSS height for the editor's collapsed state. */
  minHeight?: string
  /** CSS cap on grown height. */
  maxHeight?: string
  /** Sub-directory hint forwarded to the upload adapter on paste-image. */
  fileAttachmentsDirectory?: string
  /** Adapter-defined visibility hint (`'public'` or `'private'`). */
  fileAttachmentsVisibility?: string
  /** Panel upload route — stamped by `pageData.uploadCtx` only when an
   *  `UploadAdapter` is registered. Absent → adapter hides upload affordances. */
  uploadUrl?: string
}

export type MarkdownEditor = ComponentType<MarkdownEditorProps>

let _editor: MarkdownEditor | null = null

/**
 * Register the WYSIWYG markdown editor component. Called once at boot by
 * `@pilotiq/tiptap`'s `registerTiptap()` (or directly by an app that imports
 * the renderer). Calling with `null` clears the registry — useful for tests.
 *
 * When no editor is registered, `MarkdownInput` falls back to the textarea +
 * manual-toolbar path that's worked since `MarkdownField` shipped.
 */
export function registerMarkdownEditor(component: MarkdownEditor | null): void {
  _editor = component
}

/** Returns the registered editor component, or `null` when no adapter is installed. */
export function getMarkdownEditor(): MarkdownEditor | null {
  return _editor
}
