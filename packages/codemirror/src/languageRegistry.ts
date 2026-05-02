import type { Extension } from '@codemirror/state'

/**
 * A language factory — produces a CodeMirror `Extension` (or array thereof)
 * that wires up syntax highlighting + indentation for a single language.
 *
 * `@codemirror/lang-*` packages already export functions of this shape
 * (`json()`, `sql()`, `javascript()`, …) so they can be passed in directly.
 */
export type CodeLanguageFactory = () => Extension

const registry = new Map<string, CodeLanguageFactory>()

/**
 * Register a CodeMirror language factory under a string id. The id is what
 * users pass to `CodeEditorField.make(name).language(id)`.
 *
 * @example
 * ```ts
 * import { registerCodeLanguage } from '@pilotiq/codemirror'
 * import { json } from '@codemirror/lang-json'
 * import { sql }  from '@codemirror/lang-sql'
 *
 * registerCodeLanguage('json', json)
 * registerCodeLanguage('sql',  sql)
 * ```
 *
 * Re-registering the same id overwrites silently — this is intentional for
 * HMR and for apps that want to replace a language with a customized variant.
 */
export function registerCodeLanguage(id: string, factory: CodeLanguageFactory): void {
  registry.set(id, factory)
}

/** Look up a registered language factory. Returns `undefined` for unknown ids. */
export function getCodeLanguage(id: string): CodeLanguageFactory | undefined {
  return registry.get(id)
}

/** Internal — list every registered id. Used by tests; not part of the public surface. */
export function listCodeLanguages(): string[] {
  return [...registry.keys()]
}
