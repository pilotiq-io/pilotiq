/**
 * Parses a pilotiq URL into a record-edit identity, or returns `null`
 * for any URL that isn't a record-bound edit page.
 *
 * A URL matches when:
 *   1. it starts with the panel's `basePath`
 *   2. after stripping the prefix it ends with `/edit`
 *   3. there are at least three remaining segments (resource slug,
 *      record id, `edit`)
 *
 * The `resourceSlug` is the slash-joined chain of every segment up to
 * the record id — this gives clustered resources (`${base}/blog/articles/123/edit`)
 * and nested-relation edits (`${base}/articles/123/comments/456/edit`)
 * distinct slugs so two URLs that target different records always
 * produce different room names downstream.
 *
 *   `/admin/articles/123/edit`                      → { resourceSlug: 'articles',                 recordId: '123' }
 *   `/admin/blog/articles/123/edit`                 → { resourceSlug: 'blog/articles',            recordId: '123' }
 *   `/admin/articles/123/comments/456/edit`         → { resourceSlug: 'articles/123/comments',    recordId: '456' }
 *   `/admin/articles/123/comments`                  → null  (no trailing /edit)
 *   `/admin/articles/123/comments/create`           → null  (no record id)
 *   `/site/articles/123/edit`                       → null  (basePath mismatch when basePath='/admin')
 */
export interface RecordEditIdentity {
  resourceSlug: string
  recordId:     string
}

export function parseRecordEditUrl(
  currentPath: string,
  basePath:    string,
): RecordEditIdentity | null {
  if (!currentPath) return null
  // Normalise — trailing slashes on the URL or trailing slashes on
  // basePath would otherwise reject perfectly valid matches.
  const trimmedPath = currentPath.replace(/\/+$/, '')
  const trimmedBase = basePath.replace(/\/+$/, '')

  if (trimmedBase !== '' && !trimmedPath.startsWith(trimmedBase)) return null

  const tail = trimmedPath.slice(trimmedBase.length).replace(/^\/+/, '')
  const parts = tail.split('/').filter(Boolean)

  if (parts.length < 3) return null
  if (parts[parts.length - 1] !== 'edit') return null

  const recordId    = parts[parts.length - 2]!
  const slugParts   = parts.slice(0, parts.length - 2)
  if (slugParts.length === 0) return null

  return {
    resourceSlug: slugParts.join('/'),
    recordId,
  }
}
