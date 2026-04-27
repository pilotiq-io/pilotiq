import { registerFieldRenderer } from '@pilotiq/pilotiq/react'
import { TiptapEditor } from './react/TiptapEditor.js'

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
 * Without this call, `RichTextField` form fields render as nothing —
 * pilotiq's SchemaRenderer can't find a renderer for the `'richtext'` type.
 */
export function registerTiptap(): void {
  registerFieldRenderer('richtext', TiptapEditor)
}
