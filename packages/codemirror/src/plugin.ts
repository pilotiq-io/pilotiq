import type { PilotiqPlugin } from '@pilotiq/pilotiq'
import { registerCodeEditor } from './register.js'
import { registerCodeLanguage, type CodeLanguageFactory } from './languageRegistry.js'

export interface CodeEditorPluginOptions {
  /**
   * CodeMirror language packs keyed by name. Each pack registers under its
   * key; consumers reference them via `CodeEditorField.make(...).language('json')`.
   *
   * @example
   * ```ts
   * import { json } from '@codemirror/lang-json'
   * import { sql }  from '@codemirror/lang-sql'
   *
   * codeEditor({ languages: { json, sql } })
   * ```
   */
  languages?: Record<string, CodeLanguageFactory>
}

/**
 * Pilotiq plugin that registers the CodeMirror editor renderer plus any
 * language packs the app ships.
 *
 * @example
 * ```ts
 * import { Pilotiq } from '@pilotiq/pilotiq'
 * import { codeEditor } from '@pilotiq/codemirror'
 * import { json } from '@codemirror/lang-json'
 *
 * Pilotiq.make('Admin').plugins([
 *   codeEditor({ languages: { json } }),
 * ])
 * ```
 */
export function codeEditor(opts: CodeEditorPluginOptions = {}): PilotiqPlugin {
  return {
    name: '@pilotiq/codemirror',
    register() {
      registerCodeEditor()
      const languages = opts.languages ?? {}
      for (const [name, factory] of Object.entries(languages)) {
        registerCodeLanguage(name, factory)
      }
    },
  }
}
