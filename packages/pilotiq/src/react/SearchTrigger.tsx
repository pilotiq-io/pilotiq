import * as React from 'react'
import { useEffect, useState } from 'react'
import { SearchIcon } from 'lucide-react'

import { useCommandPaletteOpener } from './CommandPalette.js'

/**
 * Plan #12 — compact "Search… ⌘K" pill that lives in the sidebar /
 * topbar header. Clicking it opens the command palette via the
 * `useCommandPaletteOpener()` context hook (AppShell hosts the
 * provider).
 *
 * Renders nothing when the opener isn't mounted (panel without
 * AppShell — e.g., a custom embedding). The keyboard shortcut hint
 * adapts to platform: ⌘ on macOS, Ctrl elsewhere.
 */
export function SearchTrigger(): React.ReactElement | null {
  const open = useCommandPaletteOpener()
  const [isMac, setIsMac] = useState(false)

  // Detect macOS after mount — server renders with the default ("Ctrl"),
  // client refines after hydration. SSR-stable, no flash on macOS users
  // because the symbol is resolved before the icon paints.
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform))
    }
  }, [])

  if (!open) return null

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Open search"
      className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition"
    >
      <SearchIcon className="size-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">Search…</span>
      <kbd className="hidden sm:inline-flex items-center font-mono text-[10px] text-muted-foreground/80 border border-border/60 rounded px-1 ml-1">
        {isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  )
}
