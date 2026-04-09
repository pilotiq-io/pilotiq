import { registerField } from '@pilotiq/panels'
import { LexicalEditor } from './LexicalEditor.js'
import { CollaborativePlainText } from './CollaborativePlainText.js'

/**
 * Register Lexical editor components with @pilotiq/panels.
 *
 * Call once in your app's client-side entry point:
 *
 * ```ts
 * import { registerLexical } from '@pilotiq/lexical'
 * registerLexical()
 * ```
 */
export function registerLexical(): void {
  registerField('_lexical:richcontent', LexicalEditor)
  registerField('_lexical:collaborativePlainText', CollaborativePlainText)
}
