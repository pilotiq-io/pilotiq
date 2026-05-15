import { registerFieldRenderer, registerCollabTextRenderer } from '@pilotiq/pilotiq/react'
import { registerRichTextRenderer } from '@pilotiq/pilotiq/richtext'
import { TiptapEditor } from './react/TiptapEditor.js'
import { CollabTextRenderer } from './react/CollabTextRenderer.js'
import { renderRichTextToHtml, isRichTextValue } from './render.js'

/**
 * Register the Tiptap editor as the pilotiq renderer for `fieldType: 'richtext'`.
 *
 * Call once in your app's client-side entry point:
 *
 * ```ts
 * import { registerTiptap } from '@pilotiq/tiptap'
 * registerTiptap()
 * ```
 *
 * Also wires the read-side renderer (`@pilotiq/pilotiq/richtext`) so that
 * `TextEntry` / `TextColumn` auto-detect Tiptap content and render finished
 * HTML on `ViewPage` / list tables — without shipping the editor parser to
 * display-only pages.
 *
 * Without this call, `RichTextField` form fields render as nothing —
 * pilotiq's SchemaRenderer can't find a renderer for the `'richtext'` type.
 */
export function registerTiptap(): void {
  registerFieldRenderer('richtext', TiptapEditor)
  registerRichTextRenderer(renderRichTextToHtml, isRichTextValue)
  // Phase B — opt every plain-text field in the panel into y-prosemirror
  // backing when collab is on. `TextLikeInput` checks this registry; if it's
  // populated AND a `<RecordCollabRoom>` is up-tree AND the field hasn't opted
  // out via `.collab(false)`, the renderer mounts `CollabTextRenderer`
  // instead of the legacy `Y.Text` + `computeDelta` + `preserveCursor` path.
  registerCollabTextRenderer(CollabTextRenderer)
}
