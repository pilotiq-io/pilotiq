/**
 * Plan #12 — global search.
 *
 * Walks every opted-in resource on a panel, runs a per-resource search
 * query in parallel, and returns a flat list of results suitable for
 * rendering inside a Cmd+K palette.
 *
 * What "opted in" means:
 *   1. `Resource.globalSearch === true` — the static toggle.
 *   2. `R.canAccess(user)` AND `R.canViewAny(user)` (Plan #10) both
 *      resolve true. Failures fail closed (resource silently dropped).
 *   3. Either `R.getGlobalSearchQuery(needle)` returns a query, OR the
 *      resource has `static model = …` AND a non-empty
 *      `globallySearchableAttributes()` array.
 *
 * Each surviving resource hits `query.paginate(1, limitPerResource)`
 * (the same method `modelTableRecords` uses, no new ORM contract).
 * Results map through `getGlobalSearchResultTitle / Subtitle / Url`
 * and `serializeIcon(R.icon, R.name)` for transport. The caller
 * receives a flat array sorted by registration order — the palette
 * handles visual grouping.
 */
import type { Pilotiq } from './Pilotiq.js'
import type { ResourceClass } from './Resource.js'
import type { ModelQuery } from './orm/modelDefaults.js'
import { serializeIcon, type SerializedIcon } from './icons/types.js'

export interface GlobalSearchResult {
  /** URL slug of the resource, e.g. `'articles'`. Useful for grouping. */
  resource:      string
  /** Plural label for headings. */
  resourceLabel: string
  /** Pre-serialized icon — string registry key or `{ class }` manifest ref. */
  icon?:         SerializedIcon
  /** Stringified primary key. */
  id:            string
  /** Big text in the palette row. */
  title:         string
  /** Optional second line. */
  subtitle?:     string
  /** URL the palette navigates to on Enter. */
  url:           string
}

export interface GlobalSearchOptions {
  /** Cap results PER RESOURCE before merge. Default 5. */
  limitPerResource?: number
  /** Cap total results returned. Default 25. */
  limitTotal?: number
}

const DEFAULT_PER_RESOURCE = 5
const DEFAULT_TOTAL        = 25
const MIN_QUERY_LENGTH     = 2

/**
 * Search all opted-in resources for `query`. Returns up to
 * `opts.limitTotal` (default 25) results. Empty/short queries return
 * `[]` cheaply without touching the DB.
 */
export async function searchAllResources(
  pilotiq: Pilotiq,
  query:   string,
  user:    unknown,
  opts:    GlobalSearchOptions = {},
): Promise<GlobalSearchResult[]> {
  const needle = query.trim()
  if (needle.length < MIN_QUERY_LENGTH) return []

  const limitPerResource = opts.limitPerResource ?? DEFAULT_PER_RESOURCE
  const limitTotal       = opts.limitTotal       ?? DEFAULT_TOTAL

  const cfg = pilotiq.getConfig()
  const candidates = cfg.resources.filter(R => R.globalSearch === true)
  if (candidates.length === 0) return []

  // Authorization gate. `canAccess` AND `canViewAny` must both pass —
  // we don't surface records the user can't list. Throwing predicates
  // fail closed (drop the resource).
  const accessChecks = await Promise.all(
    candidates.map(async (R) => {
      try {
        const ok = (await R.canAccess(user)) && (await R.canViewAny(user))
        return ok ? R : null
      } catch {
        return null
      }
    }),
  )
  const allowed = accessChecks.filter((R): R is ResourceClass => R !== null)
  if (allowed.length === 0) return []

  const perResource = await Promise.all(
    allowed.map(R => searchResource(R, needle, limitPerResource, cfg.path)),
  )

  // Flatten + cap. Registration order preserved.
  const flat: GlobalSearchResult[] = []
  for (const chunk of perResource) {
    for (const r of chunk) {
      flat.push(r)
      if (flat.length >= limitTotal) return flat
    }
  }
  return flat
}

async function searchResource(
  R:      ResourceClass,
  needle: string,
  limit:  number,
  base:   string,
): Promise<GlobalSearchResult[]> {
  try {
    const q = buildSearchQuery(R, needle)
    if (!q) return []

    const result = await q.paginate(1, limit)
    const rows   = (result?.data ?? []) as unknown[]
    const slug   = R.getSlug()
    const icon   = serializeIcon(R.icon, R.name)

    return rows.map((record) => {
      const r        = record as Record<string, unknown>
      const id       = r['id']
      const title    = R.getGlobalSearchResultTitle(record)
      const subtitle = R.getGlobalSearchResultSubtitle(record)
      const url      = R.getGlobalSearchResultUrl(record, base)
      const out: GlobalSearchResult = {
        resource:      slug,
        resourceLabel: R.label,
        id:            id !== undefined && id !== null ? String(id) : '',
        title,
        url,
      }
      if (icon !== undefined)     out.icon     = icon
      if (subtitle !== undefined) out.subtitle = subtitle
      return out
    })
  } catch (err) {
    // One resource throwing must not blank the palette — log and drop
    // its results, the rest still resolve via Promise.all.
    console.warn(`[pilotiq] global search failed on ${R.name}:`, err)
    return []
  }
}

/**
 * Build the `ModelQuery` we run for a resource. Picks in this order:
 *   1. User override `R.getGlobalSearchQuery(needle)`.
 *   2. Default chain: `R.model.query()` chained with LIKE on each
 *      attribute returned from `R.globallySearchableAttributes()`.
 *
 * Returns `undefined` when the resource has no model AND no override —
 * pilotiq won't load every record into memory just to LIKE-match.
 */
function buildSearchQuery(R: ResourceClass, needle: string): ModelQuery | undefined {
  const override = R.getGlobalSearchQuery(needle)
  if (override) return override
  if (!R.model) return undefined

  const attrs = R.globallySearchableAttributes()
  if (attrs.length === 0) return undefined

  const wildcarded = `%${needle}%`
  let q = R.model.query()
  attrs.forEach((col, i) => {
    q = i === 0
      ? q.where(col,   'LIKE', wildcarded)
      : q.orWhere(col, 'LIKE', wildcarded)
  })
  return q
}
