import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/**
 * Plan #15 — runtime-side context for the per-widget data map shipped
 * alongside `schemaData`. SchemaRenderer wraps its children in
 * `WidgetDataProvider` so widget renderers can look up their initial
 * payload by id (`useInitialWidgetData(id)`) and run polling fetches
 * (`useWidgetData(meta)`).
 *
 * The "initial payload" is whatever the server stamped under
 * `_widgetData[id]`:
 *   - lazy widgets stamp `null` (renderer renders skeleton + fetches),
 *   - eager widgets stamp the resolved payload directly,
 *   - per-widget hook errors stamp `{ error: '<message>' }`.
 *
 * `useWidgetData(meta)` is the high-level hook that owns:
 *   - reading the initial payload,
 *   - kicking off the lazy-mount fetch when the initial is `null`,
 *   - setInterval polling when `meta.poll` is set,
 *   - pause polling while the document is hidden,
 *   - latest-wins race handling so a slow request can't overwrite a
 *     fresh one (mirrors the form-state seq pattern).
 */

type WidgetDataMap = Record<string, unknown>

const WidgetDataContext = createContext<WidgetDataMap>({})

export interface WidgetDataProviderProps {
  data?:    WidgetDataMap
  children: React.ReactNode
}

export function WidgetDataProvider({ data, children }: WidgetDataProviderProps) {
  return (
    <WidgetDataContext.Provider value={data ?? {}}>
      {children}
    </WidgetDataContext.Provider>
  )
}

/** Read the server-stamped initial payload for one widget. Returns
 *  `undefined` outside a provider — callers fall back to lazy-loading. */
export function useInitialWidgetData(id: string): unknown {
  return useContext(WidgetDataContext)[id]
}

/** Wire-shape of the polling-endpoint response. */
interface WidgetFetchResponse {
  ok:         true
  data:       unknown
  timestamp?: number
}

interface WidgetFetchFailure {
  ok:     false
  error?: string
  status?: number
}

export interface WidgetState {
  /** Resolved payload — same shape as whatever `getStats` / `getData`
   *  returned. `null` means "not yet loaded" (still in skeleton). */
  data:      unknown
  /** Latest error message from the polling endpoint. Cleared on a
   *  successful fetch. */
  error:     string | null
  /** Convenience flag for skeleton rendering — true while we have no
   *  data and no error yet. */
  isLoading: boolean
  /** Manual re-fetch (used by per-widget filter dropdowns later). */
  refetch:   (filter?: string) => void
}

export interface WidgetMetaLike {
  id?:        unknown
  lazy?:      unknown
  poll?:      unknown
  widgetUrl?: unknown
}

/**
 * Manage one widget's data lifecycle from `meta`.
 *
 * - Initial paint: read `_widgetData[id]` from context.
 * - Lazy mount fetch: when initial is `null` and we have a `widgetUrl`,
 *   fire a one-shot POST.
 * - Polling: when `meta.poll` is set, setInterval at that cadence.
 *   Skip ticks while `document.visibilityState !== 'visible'` so an
 *   inactive tab doesn't hammer the server.
 * - Latest-wins: each fetch increments `seqRef`; stale responses drop.
 */
export function useWidgetData(meta: WidgetMetaLike): WidgetState {
  const id    = String(meta.id ?? '')
  const lazy  = Boolean(meta.lazy)
  const poll  = typeof meta.poll      === 'number' ? meta.poll      : undefined
  const url   = typeof meta.widgetUrl === 'string' ? meta.widgetUrl : undefined

  const initial = useInitialWidgetData(id)
  // Treat the server-stamped error sentinel as a recoverable error
  // rather than rendered data: the client can re-fetch and the error
  // banner clears.
  const initialError =
    initial && typeof initial === 'object' && initial !== null && 'error' in initial
      ? String((initial as { error: unknown }).error)
      : null

  const [data,  setData]  = useState<unknown>(initialError ? null : initial)
  const [error, setError] = useState<string | null>(initialError)
  const seqRef = useRef(0)

  const fetchOnce = useCallback(async (filter?: string) => {
    if (!url) return
    const seq = ++seqRef.current
    try {
      const res  = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify(filter !== undefined ? { filter } : {}),
      })
      const json = await res.json() as WidgetFetchResponse | WidgetFetchFailure
      if (seq !== seqRef.current) return // raced — drop stale response
      if (json.ok) {
        setData(json.data)
        setError(null)
      } else {
        setError(json.error ?? `Request failed with status ${res.status}`)
      }
    } catch (e) {
      if (seq !== seqRef.current) return
      setError(e instanceof Error ? e.message : 'Widget failed to load')
    }
  }, [url])

  // Lazy first-paint fetch.
  useEffect(() => {
    if (lazy && data === null && url && !error) fetchOnce()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [])

  // Polling — re-fetch on the configured interval, paused when tab hidden.
  useEffect(() => {
    if (!poll || !url) return
    const handle = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      fetchOnce()
    }, poll * 1000)
    return () => window.clearInterval(handle)
  }, [poll, url, fetchOnce])

  return {
    data,
    error,
    isLoading: data === null && !error,
    refetch:   fetchOnce,
  }
}
