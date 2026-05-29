/**
 * Right-sidebar runtime state — open/close, active tab, current width.
 *
 * Shape mirrors the contract documented in `docs/plans/right-sidebar.md` so
 * plugin bodies and the chrome read from the same surface. Values persist
 * to localStorage under per-basePath keys so a multi-panel app (`/admin`
 * + `/simple`) doesn't share state across mount points.
 *
 * The provider mounts inside `AppShell` only when `panel.rightSidebar` is
 * present — plugin contributions render inside the chrome's body, so
 * they're guaranteed to call `useRightSidebar()` under the provider.
 *
 * Programmatic open: any descendant of the provider (most useful: a render
 * hook on the topbar) can flip open/active via the hook. The default
 * `RightSidebarTrigger` uses this exact wiring; consumers that want a
 * floating-button affordance can call `useRightSidebar()` and roll their own.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { RightPanelMeta, RightSidebarMeta } from '../pageData.js'
import { clampPanelWidth } from './useResizableWidth.js'

export interface RightSidebarApi {
  /** Whether the panel is currently open. */
  open:          boolean
  setOpen:       (v: boolean) => void
  toggle:        () => void
  /** Active tab's contribution id. `null` when no tab has been picked
   *  (initial render of an empty-localStorage panel). */
  activeId:      string | null
  setActiveId:   (id: string) => void
  /** Current panel width in px. */
  width:         number
  setWidth:      (px: number) => void
  /** All visible contributions for the current panel. Sorted by the
   *  server-side `panelInfo()` builder; the order is stable across
   *  navigations. */
  contributions: RightPanelMeta[]
  /** Server-supplied min/max/default — exposed so the chrome's resize
   *  handle clamps to the same range. */
  bounds:        { min: number; max: number; default: number }
}

const Ctx = createContext<RightSidebarApi | null>(null)

export interface RightSidebarProviderProps {
  meta:     RightSidebarMeta
  basePath: string
  children: React.ReactNode
}

function storageKey(basePath: string, key: 'open' | 'activeId' | 'width'): string {
  return `pilotiq.rightSidebar.${basePath}.${key}`
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage?.getItem(key)
    if (raw === 'true') return true
    if (raw === 'false') return false
    return fallback
  } catch { return fallback }
}

function readString(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage?.getItem(key)
    return raw ?? null
  } catch { return null }
}

function writeString(key: string, value: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (value === null) window.localStorage?.removeItem(key)
    else                window.localStorage?.setItem(key, value)
  } catch { /* private mode / quota — best-effort */ }
}

export function RightSidebarProvider({ meta, basePath, children }: RightSidebarProviderProps): React.ReactElement {
  const openKey     = storageKey(basePath, 'open')
  const activeKey   = storageKey(basePath, 'activeId')
  const widthKey    = storageKey(basePath, 'width')

  const fallbackId = meta.panels[0]?.id ?? null

  // SSR-safety: initialise to closed / fallback / default-width so the
  // server-rendered tree matches a fresh client (no localStorage). The
  // useEffect below rehydrates from localStorage AFTER mount, avoiding a
  // hydration mismatch warning every time a returning user reloads with
  // the panel previously open. Brief closed→open flash is acceptable and
  // identical to first-visit behaviour.
  const [open,     setOpenState]     = useState<boolean>(false)
  const [activeId, setActiveIdState] = useState<string | null>(fallbackId)
  const [width,    setWidthState]    = useState<number>(() =>
    clampPanelWidth(meta.defaultWidth, {
      min: meta.minWidth,
      max: meta.maxWidth,
      defaultWidth: meta.defaultWidth,
    }),
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedOpen = readBool(openKey, false)
    setOpenState(storedOpen)
    const storedActive = readString(activeKey)
    if (storedActive && meta.panels.some(p => p.id === storedActive)) {
      setActiveIdState(storedActive)
    }
    const storedWidth = readString(widthKey)
    if (storedWidth !== null) {
      setWidthState(clampPanelWidth(storedWidth, {
        min: meta.minWidth,
        max: meta.maxWidth,
        defaultWidth: meta.defaultWidth,
      }))
    }
    // Run once on mount per basePath. Width / activeId / open keys are
    // basePath-derived, so the dependency list is effectively static for
    // a given panel — no stale-closure risk on subsequent renders.
     
  }, [basePath])

  // Re-validate `activeId` when the contribution set changes (e.g.,
  // canAccess gating flipped after a route nav). If the stored id has
  // disappeared, fall back to the first visible tab. Skip when nothing
  // changed so we don't churn renders on every server data refresh.
  const visibleIds = useMemo(() => meta.panels.map(p => p.id), [meta.panels])
  const visibleIdsRef = useRef<string[]>(visibleIds)
  useEffect(() => {
    const prev = visibleIdsRef.current
    visibleIdsRef.current = visibleIds
    const stillValid = activeId !== null && visibleIds.includes(activeId)
    if (stillValid) return
    if (prev.length === visibleIds.length && prev.every((id, i) => id === visibleIds[i])) return
    setActiveIdState(visibleIds[0] ?? null)
  }, [visibleIds, activeId])

  const setOpen = useCallback((v: boolean): void => {
    setOpenState(v)
    writeString(openKey, v ? 'true' : 'false')
  }, [openKey])

  const toggle = useCallback((): void => {
    setOpenState((prev) => {
      const next = !prev
      writeString(openKey, next ? 'true' : 'false')
      return next
    })
  }, [openKey])

  const setActiveId = useCallback((id: string): void => {
    setActiveIdState(id)
    writeString(activeKey, id)
    // Selecting a tab implies opening — matches VS Code behaviour.
    setOpenState(true)
    writeString(openKey, 'true')
  }, [activeKey, openKey])

  const setWidth = useCallback((px: number): void => {
    const clamped = clampPanelWidth(px, {
      min: meta.minWidth,
      max: meta.maxWidth,
      defaultWidth: meta.defaultWidth,
    })
    setWidthState(clamped)
    writeString(widthKey, String(clamped))
  }, [meta.minWidth, meta.maxWidth, meta.defaultWidth, widthKey])

  // Mod-Shift-\ — VS Code's secondary side bar shortcut. Owned by core
  // so plugins don't fight over the same key.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Backslash') return
      if (!e.shiftKey) return
      if (!(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const value = useMemo<RightSidebarApi>(() => ({
    open,
    setOpen,
    toggle,
    activeId,
    setActiveId,
    width,
    setWidth,
    contributions: meta.panels,
    bounds: { min: meta.minWidth, max: meta.maxWidth, default: meta.defaultWidth },
  }), [open, setOpen, toggle, activeId, setActiveId, width, setWidth, meta.panels, meta.minWidth, meta.maxWidth, meta.defaultWidth])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * Read the right-sidebar API. Throws when called outside a
 * `RightSidebarProvider` — call it from inside a contribution's `render`
 * body or any descendant component.
 */
export function useRightSidebar(): RightSidebarApi {
  const v = useContext(Ctx)
  if (v === null) {
    throw new Error(
      '[Pilotiq] useRightSidebar() called outside <RightSidebarProvider>. ' +
      'The provider mounts only when `panel.rightSidebar` is present in meta — ' +
      'either no contributions were registered, or the auth gate dropped them all.',
    )
  }
  return v
}

/**
 * Optional variant — returns `null` when no provider is mounted instead
 * of throwing. Useful for chrome that wants to render only when the
 * surface is active (e.g., the topbar trigger button).
 */
export function useRightSidebarOptional(): RightSidebarApi | null {
  return useContext(Ctx)
}
