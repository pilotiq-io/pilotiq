import { type ReactNode } from 'react'
import { getCustomPageWrapper } from './CustomPageWrapperRegistry.js'
import type { PageCollabConfig } from '../Page.js'

/** Per-custom-page collab opt-in keyed by URL slug (`P.getSlug()` for
 * non-clustered, `${cluster.slug}/${P.getSlug()}` for clustered). Built
 * server-side by `panelInfo()` as `pageCollab`. */
export type PageCollabMap = Record<string, PageCollabConfig>

export interface CustomPageWrapperGateProps {
  currentPath?: string
  basePath:     string
  /** Per-page opt-in map. Absent means no custom page opted in — gate
   *  always passes through. */
  pageCollab?: PageCollabMap
  children:    ReactNode
}

/**
 * Strip `basePath` from `currentPath` and return the remaining slash-
 * joined tail. Returns `null` when the path is empty / doesn't start
 * with `basePath` / has no tail. Mirrors `parseRecordPageUrl`'s
 * normalization (trailing slash on either side is tolerated).
 */
function pageSlugFromUrl(currentPath: string, basePath: string): string | null {
  if (!currentPath) return null
  const trimmedPath = currentPath.replace(/\/+$/, '')
  const trimmedBase = basePath.replace(/\/+$/, '')

  if (trimmedBase !== '' && !trimmedPath.startsWith(trimmedBase)) return null

  const tail = trimmedPath.slice(trimmedBase.length).replace(/^\/+/, '')
  if (tail.length === 0) return null
  return tail
}

/**
 * Conditionally wraps the page tree with the plugin-registered
 * `CustomPageWrapper` when the current URL resolves to a custom page
 * (a `Page` subclass with `static collab = { room: '…' }`).
 * Pass-through in every other case:
 *
 *   - no plugin registered a wrapper (`getCustomPageWrapper() === null`)
 *   - `currentPath` not yet known on the very first SSR render
 *   - `pageCollab` map absent (no page opted in)
 *   - the URL tail doesn't match any registered page slug (resource
 *     list/edit/view pages, dashboard, theme editor, etc.)
 *
 * Mounted inside `AppShell` around the page content area, beside
 * `RecordWrapperGate`. The two gates are mutually exclusive in
 * practice — record routes have 3+ segments ending in /edit or /view,
 * custom-page routes are 1-2 segments matching a registered page slug.
 */
export function CustomPageWrapperGate({ currentPath, basePath, pageCollab, children }: CustomPageWrapperGateProps) {
  const Wrapper = getCustomPageWrapper()
  if (!Wrapper || !currentPath || !pageCollab) return <>{children}</>

  const slug = pageSlugFromUrl(currentPath, basePath)
  if (!slug) return <>{children}</>

  const cfg = pageCollab[slug]
  if (!cfg) return <>{children}</>

  return (
    <Wrapper pageSlug={slug} room={cfg.room} presence={cfg.presence}>
      {children}
    </Wrapper>
  )
}
