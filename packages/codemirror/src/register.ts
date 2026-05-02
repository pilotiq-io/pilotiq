import { registerFieldRenderer } from '@pilotiq/pilotiq/react'
import { CodeMirrorEditor } from './react/CodeMirrorEditor.js'

/**
 * Register the CodeMirror editor as the pilotiq renderer for
 * `fieldType: 'code'`.
 *
 * Call once in your app's client-side entry point, alongside any
 * language registrations:
 *
 * ```ts
 * import { registerCodeEditor, registerCodeLanguage } from '@pilotiq/codemirror'
 * import { json } from '@codemirror/lang-json'
 *
 * registerCodeEditor()
 * registerCodeLanguage('json', json)
 * ```
 *
 * Without `registerCodeEditor()`, `CodeEditorField` form fields render
 * as nothing — pilotiq's SchemaRenderer can't find a renderer for the
 * `'code'` type.
 */
export function registerCodeEditor(): void {
  registerFieldRenderer('code', CodeMirrorEditor)
}
