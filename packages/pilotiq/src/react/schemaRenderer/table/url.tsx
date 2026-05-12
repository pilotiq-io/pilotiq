import React from 'react'
import type { NavigateFn } from '../../navigate.js'

// ─── Table URL helpers ──────────────────────────────────────
//
// The table renderer mirrors its current sort / search / page / group
// state to the URL query string. These helpers build / parse / dedupe
// that slice without dragging the server-side dispatcher into the
// client bundle.

export interface TableUrlState {
  search?: string
  sort?:   { column: string; direction: 'asc' | 'desc' }
  page?:   number
  /** Active group column for `?group=`. Empty string means an explicit
   * "no grouping" override (set on the URL when the user picks "None"
   * in the dropdown to override `defaultGroup`); `undefined` omits the
   * key entirely so the configured default takes over. */
  group?:  string
  /** Drilled-in group key for `?groupKey=`. `undefined` omits — the
   * heading is banded (or no group at all); empty string explicitly
   * clears (used by the chip's × so a stale URL value doesn't return
   * via foreign-param round-trip). */
  groupKey?: string
}

// Mirror of `prefixedKey` in `elements/dispatchTable.ts`. Kept inline so
// SchemaRenderer doesn't drag the server-side dispatcher into the client
// bundle.
export function prefixK(prefix: string | undefined, key: string): string {
  return prefix === undefined || prefix === '' ? key : `${prefix}_${key}`
}

let cachedSearchString: string | null = null
let cachedSearchParams: URLSearchParams | null = null

export function getCurrentSearchParams(): URLSearchParams | null {
  if (typeof window === 'undefined') return null
  const s = window.location.search
  if (s === cachedSearchString && cachedSearchParams) return cachedSearchParams
  cachedSearchString = s
  cachedSearchParams = new URLSearchParams(s)
  return cachedSearchParams
}

export function SearchFormHiddenInputs({ prefix }: { prefix: string | undefined }): React.ReactElement {
  const sp = getCurrentSearchParams()
  if (!sp) return <></>
  const searchKey = prefixK(prefix, 'search')
  const pageKey = prefixK(prefix, 'page')
  const inputs: React.ReactElement[] = []
  let i = 0
  for (const [k, v] of sp) {
    if (k === searchKey || k === pageKey) continue
    inputs.push(<input key={i++} type="hidden" name={k} value={v} />)
  }
  return <>{inputs}</>
}

export function buildTableQuery(
  state:        TableUrlState,
  override:     TableUrlState,
  pathname:     string,
  filterValues: Record<string, string> = {},
  prefix?:      string,
): string {
  const merged: TableUrlState = { ...state, ...override }
  const params = new URLSearchParams()
  // Foreign URL params (other tables' state, app-level params) round-trip
  // verbatim so this builder only ever rewrites its own slice.
  const currentParams = getCurrentSearchParams()
  if (currentParams) {
    const ours = new Set([
      prefixK(prefix, 'search'),
      prefixK(prefix, 'sort'),
      prefixK(prefix, 'page'),
      prefixK(prefix, 'perPage'),
      prefixK(prefix, 'group'),
      prefixK(prefix, 'groupKey'),
      ...Object.keys(filterValues).map(n => prefixK(prefix, n)),
    ])
    for (const [k, v] of currentParams) {
      if (ours.has(k)) continue
      params.set(k, v)
    }
  }
  // Carry forward active filter values so sort/pagination links don't
  // accidentally clear them. Filter names can't collide with reserved
  // keys (search/sort/page/perPage/group) — that's enforced upstream.
  for (const [name, val] of Object.entries(filterValues)) {
    if (val) params.set(prefixK(prefix, name), val)
  }
  if (merged.search)    params.set(prefixK(prefix, 'search'), merged.search)
  if (merged.sort)      params.set(prefixK(prefix, 'sort'), `${merged.sort.column}:${merged.sort.direction}`)
  if (merged.page && merged.page > 1) params.set(prefixK(prefix, 'page'), String(merged.page))
  if (merged.group !== undefined) params.set(prefixK(prefix, 'group'), merged.group)
  // groupKey is sparse — only writes when the override sets a non-empty
  // value. Drill-out (chip ×) passes `''` to clear; the foreign-param
  // dedupe set above already filtered the stale value out, so an empty
  // override produces a URL without the key.
  if (merged.groupKey) params.set(prefixK(prefix, 'groupKey'), merged.groupKey)
  const qs = params.toString()
  // Always anchor to a real pathname — Vike's client-side router treats
  // a bare `?qs` href as a fresh URL with empty pathname, which routes
  // to the dashboard and blanks the page during SPA navigation.
  const base = pathname || (typeof window !== 'undefined' ? window.location.pathname : '')
  return qs ? `${base}?${qs}` : (base || '#')
}

/**
 * SPA-navigate to the current URL with the filter slice patched in
 * place. `null` or empty-string values delete the key; non-empty values
 * set it. The accompanying `?page` is always cleared so users land on
 * the first page of the relaxed / tightened set. No-op on SSR.
 *
 * Used by every filter widget's "apply" / "clear" path (FilterSelect /
 * MultiSelect / DateRange / Form / QueryBuilder + ActiveFiltersBar).
 */
export function patchFilterUrl(
  navigate: NavigateFn,
  prefix:   string | undefined,
  patches:  Record<string, string | null>,
): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  for (const [name, value] of Object.entries(patches)) {
    const k = prefixK(prefix, name)
    if (value === null || value === '') url.searchParams.delete(k)
    else                                 url.searchParams.set(k, value)
  }
  url.searchParams.delete(prefixK(prefix, 'page'))
  void navigate(url.pathname + url.search)
}

export function nextSortDir(
  current: TableUrlState['sort'],
  column:  string,
): { column: string; direction: 'asc' | 'desc' } {
  if (current?.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { column, direction: 'asc' }
}
