import * as React from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { SearchIcon, CornerDownLeftIcon, ArrowUpDownIcon } from 'lucide-react'

import { Dialog, DialogContent } from './ui/dialog.js'
import { useNavigate } from './navigate.js'
import { useIconFor } from './icon-context.js'
import type { GlobalSearchResult } from '../search.js'
import type { NavItem } from '../pageData.js'
import type { SerializedIcon } from '../icons/types.js'

/**
 * Context exposing the palette's open setter. AppShell hosts the
 * provider; trigger pills (sidebar + topbar headers) call
 * `useCommandPaletteOpener()` to open the palette from anywhere in the
 * tree without prop-drilling.
 */
const CommandPaletteContext = createContext<((open: boolean) => void) | null>(null)

export function CommandPaletteProvider({
  children,
  setOpen,
}: {
  children: React.ReactNode
  setOpen:  (open: boolean) => void
}): React.ReactElement {
  return (
    <CommandPaletteContext.Provider value={setOpen}>
      {children}
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPaletteOpener(): (() => void) | null {
  const setOpen = useContext(CommandPaletteContext)
  return setOpen ? () => setOpen(true) : null
}

/**
 * Plan #12 — Cmd+K palette. Hand-rolled on the existing Dialog primitive
 * (no `cmdk` dep yet). Listens for Cmd/Ctrl+K globally; renders an input
 * + grouped result list; debounced fetch with in-flight cancellation
 * (same pattern as Plan #5 FormStateContext).
 *
 * Empty input shows the panel navigation entries — Cmd+K becomes a fast
 * resource picker. Typing replaces the list with search results grouped
 * by resource.
 */

const DEBOUNCE_MS = 150
const MIN_QUERY_LENGTH = 2

interface SearchResponse {
  ok:      boolean
  results: GlobalSearchResult[]
  error?:  string
}

export interface CommandPaletteProps {
  basePath:    string
  navigation?: NavItem[]
  /** Controlled open state. AppShell hosts; the palette + the trigger
   *  pill share via context. */
  open:           boolean
  onOpenChange:   (open: boolean) => void
  /** Test seam — defaults to `globalThis.fetch`. */
  fetchImpl?:  typeof fetch
  /** Test seam — defaults to `useNavigate()`. */
  navigateOverride?: (url: string) => void
}

interface PaletteEntry {
  /** `'result'` rows are search hits; `'nav'` rows are nav-entry shortcuts. */
  kind:     'result' | 'nav'
  /** Group header label (resource label for results, group name for nav). */
  group:    string
  title:    string
  subtitle?: string
  url:      string
  icon?:    SerializedIcon
  /** Stable key for keyboard nav. */
  key:      string
}

export function CommandPalette({
  basePath,
  navigation,
  open,
  onOpenChange,
  fetchImpl,
  navigateOverride,
}: CommandPaletteProps): React.ReactElement {
  const navigate = useNavigate()
  const go = navigateOverride ?? navigate

  const setOpen = onOpenChange
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)

  // ─── Cmd+K global listener ───────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')
      if (!isCmdK) return
      e.preventDefault()
      setOpen(!open)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  // Reset query + active row whenever the palette closes.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setActive(0)
    }
  }, [open])

  // ─── Fetch with debounce + in-flight seq ─────────────
  // Mirrors Plan #5 FormStateContext: refs (not state) for the seq
  // counters so React StrictMode dev double-invokes don't produce
  // stale closures.
  const requestSeqRef = useRef(0)
  const latestSeenRef = useRef(0)
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runFetch = useCallback(async (q: string) => {
    if (q.trim().length < MIN_QUERY_LENGTH) {
      setResults([])
      setLoading(false)
      return
    }
    const seq  = ++requestSeqRef.current
    const doFetch = fetchImpl ?? fetch
    setLoading(true)
    try {
      const url = `${basePath}/_search?q=${encodeURIComponent(q)}`
      const res = await doFetch(url, {
        method:  'GET',
        headers: { 'Accept': 'application/json' },
      })
      if (seq < latestSeenRef.current) return
      latestSeenRef.current = seq
      if (!res.ok) {
        setResults([])
        return
      }
      const data = await res.json().catch(() => null) as SearchResponse | null
      if (!data?.ok) {
        setResults([])
        return
      }
      setResults(data.results ?? [])
      setActive(0)
    } catch {
      setResults([])
    } finally {
      // Only flip loading off when this is the latest in-flight.
      if (seq === requestSeqRef.current) setLoading(false)
    }
  }, [basePath, fetchImpl])

  // Debounce on query change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!open) return
    debounceRef.current = setTimeout(() => {
      void runFetch(query)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, runFetch])

  // ─── Compose the entry list shown in the palette ─────
  const entries = useMemo<PaletteEntry[]>(() => {
    if (query.trim().length >= MIN_QUERY_LENGTH) {
      return results.map((r, i) => {
        const entry: PaletteEntry = {
          kind:  'result',
          group: r.resourceLabel,
          title: r.title,
          url:   r.url,
          key:   `${r.resource}:${r.id}:${i}`,
        }
        if (r.subtitle !== undefined) entry.subtitle = r.subtitle
        if (r.icon     !== undefined) entry.icon     = r.icon
        return entry
      })
    }
    // Empty-input state: flatten navigation tree.
    return flattenNavigation(navigation ?? [])
  }, [query, results, navigation])

  // ─── Keyboard navigation ─────────────────────────────
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, Math.max(0, entries.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const entry = entries[active]
      if (entry) {
        setOpen(false)
        // Defer the navigate so the close transition fires first.
        Promise.resolve().then(() => go(entry.url))
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }, [entries, active, go])

  // ─── Group entries for rendering ─────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, PaletteEntry[]>()
    for (const e of entries) {
      const arr = map.get(e.group) ?? []
      arr.push(e)
      map.set(e.group, arr)
    }
    return [...map.entries()]
  }, [entries])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <SearchIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            autoFocus
            placeholder="Search resources, records, or pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search"
          />
          {loading && <span className="text-xs text-muted-foreground">…</span>}
          <kbd className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1 py-0.5">esc</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto py-1">
          {entries.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {query.trim().length < MIN_QUERY_LENGTH
                ? 'Type to search…'
                : loading
                  ? 'Searching…'
                  : 'No results.'}
            </p>
          )}
          {grouped.map(([group, rows]) => (
            <div key={group}>
              <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </div>
              <ul role="listbox">
                {rows.map((entry) => {
                  const flatIdx = entries.indexOf(entry)
                  const isActive = flatIdx === active
                  return (
                    <li key={entry.key}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActive(flatIdx)}
                        onClick={() => {
                          setOpen(false)
                          Promise.resolve().then(() => go(entry.url))
                        }}
                        className={[
                          'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition',
                          isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                        ].join(' ')}
                      >
                        <PaletteIcon icon={entry.icon} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{entry.title}</div>
                          {entry.subtitle && (
                            <div className="truncate text-xs text-muted-foreground">{entry.subtitle}</div>
                          )}
                        </div>
                        {isActive && (
                          <CornerDownLeftIcon className="size-3 text-muted-foreground" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <ArrowUpDownIcon className="size-3" aria-hidden="true" />
            navigate
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeftIcon className="size-3" aria-hidden="true" />
            open
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PaletteIcon({ icon }: { icon: SerializedIcon | undefined }) {
  const Icon = useIconFor(icon)
  if (!Icon) {
    return <span className="size-4 rounded bg-muted" aria-hidden="true" />
  }
  return <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
}

/**
 * Flatten the navigation tree (nested children) into a single PaletteEntry
 * list. Used for the empty-input quick-nav state. Group label is the
 * NavItem's `group` (or `'Navigation'` when unset).
 */
function flattenNavigation(items: NavItem[]): PaletteEntry[] {
  const out: PaletteEntry[] = []
  const walk = (nodes: NavItem[], inheritedGroup?: string) => {
    for (const n of nodes) {
      const group = n.group ?? inheritedGroup ?? 'Navigation'
      const entry: PaletteEntry = {
        kind:  'nav',
        group,
        title: n.label,
        url:   n.url,
        key:   `nav:${n.name}:${n.url}`,
      }
      if (n.icon !== undefined) entry.icon = n.icon
      out.push(entry)
      if (n.children && n.children.length > 0) walk(n.children, group)
    }
  }
  walk(items)
  return out
}
