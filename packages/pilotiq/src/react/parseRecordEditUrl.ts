/**
 * URL → record-page identity parser. Used by `RecordWrapperGate` (and any
 * plugin that wants to reason about record-bound URLs) to decide whether
 * the current page is a record-edit or record-view route.
 *
 * A URL matches when:
 *   1. it starts with the panel's `basePath`
 *   2. after stripping the prefix it ends with `/edit` or `/view`
 *   3. there are at least three remaining segments (resource slug,
 *      record id, terminal token)
 *
 * The `resourceSlug` is the slash-joined chain of every segment up to
 * the record id — this gives clustered resources (`${base}/blog/articles/123/edit`)
 * and nested-relation edits (`${base}/articles/123/comments/456/edit`)
 * distinct slugs so two URLs that target different records always
 * produce different room names downstream.
 *
 *   `/admin/articles/123/edit`                      → { slug: 'articles',              id: '123', role: 'edit' }
 *   `/admin/articles/123/view`                      → { slug: 'articles',              id: '123', role: 'view' }
 *   `/admin/blog/articles/123/edit`                 → { slug: 'blog/articles',         id: '123', role: 'edit' }
 *   `/admin/articles/123/comments/456/edit`         → { slug: 'articles/123/comments', id: '456', role: 'edit' }
 *   `/admin/articles/123/comments`                  → null  (no trailing /edit or /view)
 *   `/admin/articles/123/comments/create`           → null  (terminal token isn't edit|view)
 *   `/site/articles/123/edit`                       → null  (basePath mismatch when basePath='/admin')
 */

/** Page roles `parseRecordPageUrl` recognizes. `'edit'` and `'view'`
 * are the two record-scoped page roles where collab and other
 * record-bound plugins want to mount their per-record wrapper. */
export type RecordPageRole = 'edit' | 'view'

export interface RecordPageIdentity {
  resourceSlug: string
  recordId:     string
  /** Which terminal URL segment matched — `'edit'` for the writable edit
   * page, `'view'` for the read-only view page. Lets the gate decide per
   * resource whether collab activates on this role (defaults to `'edit'`
   * only; resources opt into `'view'` for presence-only experiences). */
  role:         RecordPageRole
}

const RECOGNIZED_ROLES: ReadonlyArray<RecordPageRole> = ['edit', 'view']

/**
 * Parse a pilotiq URL into a `{ slug, id, role }` identity. Returns
 * `null` for any URL that isn't a record-edit or record-view page.
 */
export function parseRecordPageUrl(
  currentPath: string,
  basePath:    string,
): RecordPageIdentity | null {
  if (!currentPath) return null
  // Normalise — trailing slashes on the URL or trailing slashes on
  // basePath would otherwise reject perfectly valid matches.
  const trimmedPath = currentPath.replace(/\/+$/, '')
  const trimmedBase = basePath.replace(/\/+$/, '')

  if (trimmedBase !== '' && !trimmedPath.startsWith(trimmedBase)) return null

  const tail = trimmedPath.slice(trimmedBase.length).replace(/^\/+/, '')
  const parts = tail.split('/').filter(Boolean)

  if (parts.length < 3) return null
  const terminal = parts[parts.length - 1]!
  if (!RECOGNIZED_ROLES.includes(terminal as RecordPageRole)) return null

  const recordId    = parts[parts.length - 2]!
  const slugParts   = parts.slice(0, parts.length - 2)
  if (slugParts.length === 0) return null

  return {
    resourceSlug: slugParts.join('/'),
    recordId,
    role:         terminal as RecordPageRole,
  }
}

/** Legacy alias: parse a URL into an edit-only identity. Returns `null`
 * for view URLs (and any non-edit URL). Kept for back-compat with the
 * pre-`parseRecordPageUrl` public API; new code should call
 * `parseRecordPageUrl` and branch on `role`. */
export interface RecordEditIdentity {
  resourceSlug: string
  recordId:     string
}

export function parseRecordEditUrl(
  currentPath: string,
  basePath:    string,
): RecordEditIdentity | null {
  const identity = parseRecordPageUrl(currentPath, basePath)
  if (!identity || identity.role !== 'edit') return null
  return { resourceSlug: identity.resourceSlug, recordId: identity.recordId }
}
