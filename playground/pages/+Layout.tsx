import '@/index.css'
import type { ReactNode } from 'react'
import { registerEntryComponents } from '@pilotiq/pilotiq/entries'
import { registerWidgetComponents } from '@pilotiq/pilotiq/widgets'
import { MediaLibrary, registerBuiltinMediaPreviews } from '@pilotiq/media/widgets'
import { ReadingStats }  from '../app/Pilotiq/Posts/ReadingStats.js'

// Adapter renderers (Tiptap / Recharts) register through the panel
// module via `Pilotiq.make(...).plugins([...])` — see AdminPanel.ts.
// What stays here are the *app-owned* React components that pilotiq's
// `ComponentEntry` leaves bind to by name. The map references your own
// components, so it lives next to your pages.
registerEntryComponents({ ReadingStats })

// @pilotiq/media's library browser is a `View` widget — register its
// component + the built-in type previews (image/video/audio/pdf/text).
registerWidgetComponents({ MediaLibrary })
registerBuiltinMediaPreviews()

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
