import '@/index.css'
import type { ReactNode } from 'react'
import { registerWidgetComponents } from '@pilotiq/pilotiq/widgets'
import { registerEntryComponents } from '@pilotiq/pilotiq/entries'
import { ActivityFeed }  from '../app/Pilotiq/widgets/ActivityFeed.js'
import { ReadingStats }  from '../app/Pilotiq/Posts/ReadingStats.js'

// Adapter renderers (Tiptap / CodeMirror / Recharts) register through the
// panel module via `Pilotiq.make(...).plugins([...])` — see AdminPanel.ts.
// What stays here are the *app-owned* React components that pilotiq's
// `View` widgets and `ComponentEntry` leaves bind to by name. The maps
// reference your own components, so it lives next to your pages.
registerWidgetComponents({ ActivityFeed })
registerEntryComponents({ ReadingStats })

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
