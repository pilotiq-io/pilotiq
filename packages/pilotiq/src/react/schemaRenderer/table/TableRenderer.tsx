import React, { useEffect, useState } from 'react'
import type { ElementMeta } from '../../../schema/Element.js'
import { TableRendererBody, type TableBodyDeps } from './TableRendererBody.js'

// ─── Table wrapper + deferred-load shell ────────────────────


/**
 * Tier-3 deferred-load shell. When `Resource.deferLoading = true`, the
 * SSR pass marks each Table on the page as `deferred` + stamps a
 * `tableUrl`. This wrapper paints a skeleton on first frame and fetches
 * the actual rows from the JSON endpoint after mount; the inner
 * `TableRendererBody` renders identically against either the SSR meta
 * (non-deferred case) or the fetched meta (deferred case).
 *
 * SPA nav with a query change re-runs SSR, which re-stamps `deferred`
 * — so the URL-change effect fires another fetch. The skeleton frame
 * still shows current sort / search / page / filter chrome because the
 * SSR pass mirrors URL state on the deferred Table.
 */
export function TableRenderer({ el, deps }: { el: ElementMeta; deps: TableBodyDeps }) {
  const isDeferred = el['deferred'] === true && typeof el['tableUrl'] === 'string'
  const tableUrl   = isDeferred ? (el['tableUrl'] as string) : ''

  // Track the URL search string so a navigation that changes filters /
  // sort / page re-fires the fetch. Initialized lazy on first client
  // render; on the SSR pass we just fall through to skeleton.
  const [search, setSearch] = useState<string>(() =>
    typeof window === 'undefined' ? '' : window.location.search,
  )
  useEffect(() => {
    if (!isDeferred) return
    if (typeof window === 'undefined') return
    setSearch(window.location.search)
  }, [isDeferred, el])

  const [deferredMeta, setDeferredMeta] = useState<ElementMeta | null>(null)
  const [deferredError, setDeferredError] = useState<string | null>(null)

  useEffect(() => {
    if (!isDeferred || !tableUrl) return
    if (typeof window === 'undefined') return
    let cancelled = false
    setDeferredMeta(null)
    setDeferredError(null)
    fetch(tableUrl + search, {
      headers:     { 'Accept': 'application/json' },
      credentials: 'same-origin',
    })
      .then(async r => {
        const data = (await r.json()) as {
          ok?:     boolean
          tables?: Record<string, unknown>[]
          error?:  string
        }
        if (cancelled) return
        if (data.ok && Array.isArray(data.tables) && data.tables.length > 0) {
          setDeferredMeta(data.tables[0] as ElementMeta)
        } else {
          setDeferredError(data.error ?? 'Failed to load table')
        }
      })
      .catch(err => {
        if (cancelled) return
        setDeferredError(err instanceof Error ? err.message : 'Failed to load table')
      })
    return () => { cancelled = true }
  }, [isDeferred, tableUrl, search])

  if (isDeferred && deferredError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Failed to load table: {deferredError}
      </div>
    )
  }
  if (isDeferred && !deferredMeta) {
    return <TableSkeleton el={el} />
  }

  return <TableRendererBody el={isDeferred ? deferredMeta! : el} deps={deps} />
}

/**
 * Skeleton placeholder painted while a deferred-loaded table fetches
 * its rows. Mirrors the table's heading + description chrome (already
 * present on `el`) so the frame doesn't pop layout when the real rows
 * arrive. Renders a small column header strip + 5 placeholder rows.
 */
export function TableSkeleton({ el }: { el: ElementMeta }) {
  const heading     = typeof el['heading']     === 'string' ? (el['heading']     as string) : undefined
  const description = typeof el['description'] === 'string' ? (el['description'] as string) : undefined
  const children    = el.children ?? []
  const colCount    = Math.max(1, children.filter(c => c.type === 'column').length)
  return (
    <div className="space-y-3">
      {(heading || description) ? (
        <div className="space-y-1">
          {heading     ? <div className="text-lg font-semibold">{heading}</div>            : null}
          {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
        </div>
      ) : null}
      <div className="rounded-md border">
        <div className="grid border-b bg-muted/50 px-4 py-2"
             style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
          {Array.from({ length: colCount }).map((_, i) => (
            <div key={i} className="h-4 w-20 rounded bg-muted-foreground/20" />
          ))}
        </div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, rowIdx) => (
            <div key={rowIdx} className="grid items-center px-4 py-3"
                 style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
              {Array.from({ length: colCount }).map((_, colIdx) => (
                <div key={colIdx} className="h-4 w-2/3 rounded bg-muted-foreground/10 animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
