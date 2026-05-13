import { type ReactNode } from 'react'
import { getRecordWrapper } from './RecordWrapperRegistry.js'
import { parseRecordPageUrl } from './parseRecordEditUrl.js'
import type { ResourceCollabConfig } from '../Resource.js'

/** Per-resource collab opt-in keyed by URL slug (`R.getSlug()` for
 * non-clustered, `${cluster.slug}/${R.getSlug()}` for clustered). Built
 * server-side by `panelInfo()` as `recordCollab`. */
export type RecordCollabMap = Record<string, ResourceCollabConfig>

export interface RecordWrapperGateProps {
  currentPath?: string
  basePath:     string
  /** Resource opt-in map. Absent means no resource opted in (or the
   *  panel has no resources) — gate always passes through. */
  recordCollab?: RecordCollabMap
  children:     ReactNode
}

/**
 * Conditionally wraps the page tree with the plugin-registered
 * `RecordWrapper` when the current URL resolves to a record-bound page
 * AND the underlying resource has opted into collab on that page role.
 * Pass-through in every other case:
 *
 *   - no plugin registered a wrapper (`getRecordWrapper() === null`)
 *   - the URL isn't a record edit/view page
 *   - `currentPath` not yet known on the very first SSR render
 *   - the resource has not opted in via `static collab` (or has opted in
 *     but excluded the current page role)
 *
 * Mounted once inside `AppShell` around the page content area so
 * record-scoped plugins (collab room, audit trail, …) get one
 * lifetimed mount per record-view-or-edit without each plugin having
 * to thread URL parsing into its own provider.
 *
 * v1 caveat: nested-relation edit URLs (`/articles/:parentId/comments/:childId/edit`)
 * have a dynamic-id segment baked into the URL slug, so they don't match
 * the resource-keyed `recordCollab` map and fall through to no-collab.
 * Collab on nested-relation edits is a follow-up.
 */
export function RecordWrapperGate({ currentPath, basePath, recordCollab, children }: RecordWrapperGateProps) {
  const Wrapper = getRecordWrapper()
  if (!Wrapper || !currentPath) return <>{children}</>

  const identity = parseRecordPageUrl(currentPath, basePath)
  if (!identity) return <>{children}</>

  const cfg = recordCollab?.[identity.resourceSlug]
  if (!cfg) return <>{children}</>
  if (!cfg.pages.includes(identity.role)) return <>{children}</>

  return (
    <Wrapper resourceSlug={identity.resourceSlug} recordId={identity.recordId}>
      {children}
    </Wrapper>
  )
}
