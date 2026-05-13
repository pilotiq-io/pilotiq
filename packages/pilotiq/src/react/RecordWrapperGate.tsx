import { type ReactNode } from 'react'
import { getRecordWrapper } from './RecordWrapperRegistry.js'
import { parseRecordEditUrl } from './parseRecordEditUrl.js'

export interface RecordWrapperGateProps {
  currentPath?: string
  basePath:     string
  children:     ReactNode
}

/**
 * Conditionally wraps the page tree with the plugin-registered
 * `RecordWrapper` when the current URL resolves to a record-bound edit
 * page. Pass-through in every other case:
 *
 *   - no plugin registered a wrapper (`getRecordWrapper() === null`)
 *   - the URL isn't a record-edit URL (list / create / view / dashboard / …)
 *   - `currentPath` not yet known on the very first SSR render
 *
 * Mounted once inside `AppShell` around the page content area so
 * record-scoped plugins (collab room, audit trail, …) get one
 * lifetimed mount per record-view-or-edit without each plugin having
 * to thread URL parsing into its own provider.
 *
 * Scope limited to `/edit` URLs in v1; view-page support (read-only
 * collab cursors on `ViewPage`) is a follow-up.
 */
export function RecordWrapperGate({ currentPath, basePath, children }: RecordWrapperGateProps) {
  const Wrapper = getRecordWrapper()
  if (!Wrapper || !currentPath) return <>{children}</>

  const identity = parseRecordEditUrl(currentPath, basePath)
  if (!identity) return <>{children}</>

  return (
    <Wrapper resourceSlug={identity.resourceSlug} recordId={identity.recordId}>
      {children}
    </Wrapper>
  )
}
