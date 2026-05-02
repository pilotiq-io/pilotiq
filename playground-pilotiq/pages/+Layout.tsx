import '@/index.css'
import type { ReactNode } from 'react'
import { registerTiptap } from '@pilotiq/tiptap'
import { registerCodeEditor, registerCodeLanguage } from '@pilotiq/codemirror'
import { json } from '@codemirror/lang-json'
import { sql }  from '@codemirror/lang-sql'

// One-time client-side wiring: tells SchemaRenderer how to render
// `fieldType: 'richtext'`. Module-level call is idempotent.
registerTiptap()

// CodeEditor renderer + the language packs the playground uses.
// Apps register only the languages they ship.
registerCodeEditor()
registerCodeLanguage('json', json)
registerCodeLanguage('sql',  sql)

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
