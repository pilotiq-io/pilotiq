import '@/index.css'
import type { ReactNode } from 'react'
import { registerTiptap } from '@pilotiq/tiptap'

// One-time client-side wiring: tells SchemaRenderer how to render
// `fieldType: 'richtext'`. Module-level call is idempotent.
registerTiptap()

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
