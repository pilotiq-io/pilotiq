import '@/index.css'
import type { ReactNode } from 'react'
import { registerTiptap } from '@pilotiq/tiptap'
import { registerCodeEditor, registerCodeLanguage } from '@pilotiq/codemirror'
import { json } from '@codemirror/lang-json'
import { sql }  from '@codemirror/lang-sql'
import { registerChartRenderer } from '@pilotiq/recharts'
import { registerWidgetComponents } from '@pilotiq/pilotiq/widgets'
import { registerEntryComponents } from '@pilotiq/pilotiq/entries'
import { ActivityFeed }  from '../app/Pilotiq/widgets/ActivityFeed.js'
import { ReadingStats }  from '../app/Pilotiq/Posts/ReadingStats.js'

// One-time client-side wiring: tells SchemaRenderer how to render
// `fieldType: 'richtext'`. Module-level call is idempotent.
registerTiptap()

// CodeEditor renderer + the language packs the playground uses.
// Apps register only the languages they ship.
registerCodeEditor()
registerCodeLanguage('json', json)
registerCodeLanguage('sql',  sql)

// Plan #15 widgets — Recharts adapter for `Chart` widget elements.
// Lean core; opt-in install. Without this, Chart widgets paint a clear
// "renderer not registered — install @pilotiq/recharts" error.
registerChartRenderer()

// Plan #15 — `View` widget components. The matching `View` subclass
// (`ActivityFeedView`) carries `static componentName = 'ActivityFeed'`;
// core's ViewRenderer looks up the component here at render time.
registerWidgetComponents({ ActivityFeed })

// Plan #16 follow-up — `ComponentEntry` infolist components. Mirrors the
// widget registry; each entry's `.component('ReadingStats')` (or static
// `componentName`) keys into this map to find the React component.
registerEntryComponents({ ReadingStats })

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
