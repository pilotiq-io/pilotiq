import { useCallback, useEffect, useState } from 'react'

/**
 * Drag-resize a panel's width and persist the result to localStorage.
 *
 * Used by `RightSidebar` (Phase C) and the Tiptap custom-block side
 * panel — both want a left-edge resize handle that grows the panel as
 * the user drags toward the screen edge it docks against.
 *
 * @param storageKey  Key under which the width persists. `null` opts out
 *                    of persistence (still drag-resizable, just not
 *                    remembered across mounts / reloads).
 * @param min         Minimum width in px. Defaults to 240.
 * @param max         Maximum width in px. Defaults to 800.
 * @param defaultWidth Initial width when no value is stored. Defaults to 360.
 * @param edge        Which edge carries the handle. `'left'` (default) is
 *                    for right-docked panels: dragging the left edge
 *                    *outward* (leftward) grows the panel. `'right'` is
 *                    for left-docked panels.
 *
 * Width writes happen on `pointerup` only (no Storage churn during drag).
 */
export interface UseResizableWidthOptions {
  storageKey:    string | null
  min?:          number
  max?:          number
  defaultWidth?: number
  edge?:         'left' | 'right'
}

export interface UseResizableWidthApi {
  width:         number
  setWidth:      (px: number) => void
  /** Attach to the resize-handle element's `onPointerDown`. */
  onResizeStart: (e: React.PointerEvent<HTMLElement>) => void
  resizing:      boolean
}

const DEFAULT_MIN     = 240
const DEFAULT_MAX     = 800
const DEFAULT_DEFAULT = 360

/**
 * Clamp a candidate width into `[min, max]`, falling back to `defaultWidth`
 * when the value can't be coerced to a finite number. Exported so the
 * resize hook and any test (or one-off seed-from-meta path) share the
 * same sanitization logic.
 */
export function clampPanelWidth(
  value: unknown,
  opts:  { min?: number; max?: number; defaultWidth?: number } = {},
): number {
  const min          = opts.min          ?? DEFAULT_MIN
  const max          = opts.max          ?? DEFAULT_MAX
  const defaultWidth = opts.defaultWidth ?? DEFAULT_DEFAULT
  // Explicit "no value" — null / undefined / empty-string land here from
  // the localStorage round-trip and should fall back to the default
  // rather than clamp upward via `Number(null) === 0` → MIN.
  if (value === null || value === undefined || value === '') {
    return Math.min(Math.max(defaultWidth, min), max)
  }
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return Math.min(Math.max(defaultWidth, min), max)
  if (n < min) return min
  if (n > max) return max
  return n
}

function readStoredWidth(
  key:   string | null,
  opts:  { min?: number; max?: number; defaultWidth?: number },
): number {
  const fallback = clampPanelWidth(opts.defaultWidth, opts)
  if (key === null) return fallback
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage?.getItem(key)
    if (raw === null || raw === undefined) return fallback
    return clampPanelWidth(raw, opts)
  } catch {
    return fallback
  }
}

export function useResizableWidth(opts: UseResizableWidthOptions): UseResizableWidthApi {
  const min          = opts.min          ?? DEFAULT_MIN
  const max          = opts.max          ?? DEFAULT_MAX
  const defaultWidth = opts.defaultWidth ?? DEFAULT_DEFAULT
  const edge         = opts.edge         ?? 'left'

  const [width, setWidthState] = useState<number>(() =>
    readStoredWidth(opts.storageKey, { min, max, defaultWidth }))
  const [resizing, setResizing] = useState(false)

  // Re-seed when the storage key changes (e.g. basePath flip on a
  // multi-panel host). New key, fresh width.
  useEffect(() => {
    setWidthState(readStoredWidth(opts.storageKey, { min, max, defaultWidth }))
    // Intentionally exclude width — we only want this on storageKey flip.
     
  }, [opts.storageKey])

  const setWidth = useCallback((px: number): void => {
    setWidthState(clampPanelWidth(px, { min, max, defaultWidth }))
  }, [min, max, defaultWidth])

  const onResizeStart = useCallback((e: React.PointerEvent<HTMLElement>): void => {
    e.preventDefault()
    const startX     = e.clientX
    const startWidth = width
    setResizing(true)
    const onMove = (ev: PointerEvent): void => {
      const rawDelta = edge === 'left'
        ? startX - ev.clientX   // left-edge handle on right-docked panel
        : ev.clientX - startX   // right-edge handle on left-docked panel
      setWidthState(clampPanelWidth(startWidth + rawDelta, { min, max, defaultWidth }))
    }
    const onUp = (): void => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup',   onUp)
      setResizing(false)
      // Persist once on pointer-up so we don't churn Storage during drag.
      if (opts.storageKey === null) return
      try {
        // Read latest width via a setState callback — closure captured
        // `startWidth` is stale by the time we reach pointerup.
        setWidthState((w) => {
          try { window.localStorage?.setItem(opts.storageKey!, String(w)) }
          catch { /* private mode / quota — width still works in-session */ }
          return w
        })
      } catch { /* SSR / no window */ }
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup',   onUp)
  }, [width, edge, min, max, defaultWidth, opts.storageKey])

  return { width, setWidth, onResizeStart, resizing }
}
