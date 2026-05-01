import { Filter, type FilterKind, type FilterMeta } from './Filter.js'
import type { ModelQuery } from '../orm/modelDefaults.js'

/**
 * Plan #13 — three-state filter for soft-deleted resources.
 *
 *   `''` (default)    — active records only (default scope already
 *                       excludes trashed; no clause added)
 *   `'withTrashed'`   — active + trashed records together
 *   `'onlyTrashed'`   — trashed records only
 *
 * Auto-injected on `ListPage` for resources with `softDeletes = true`
 * unless the user attached one explicitly. URL key defaults to
 * `?trashed=…`; rename via `TrashedFilter.make('archived')` for
 * resources using a different column name (the URL key, not the
 * predicate path — the predicate always calls `query.withTrashed() /
 * onlyTrashed()` regardless of the filter's name).
 *
 * Renders as a `'select'` kind so the existing select-renderer handles
 * it without changes. The default `query()` handler short-circuits to
 * the running ORM query when `withTrashed / onlyTrashed` aren't on the
 * `ModelQuery` (e.g. during testing with a stub query) — production
 * paths always have them when the model has `softDeletes = true`.
 */
export class TrashedFilter extends Filter {
  static make(name = 'trashed'): TrashedFilter {
    const f = new TrashedFilter(name)
    f.query((q: ModelQuery, value: string) => {
      if (value === 'withTrashed' && typeof q.withTrashed === 'function') {
        return q.withTrashed()
      }
      if (value === 'onlyTrashed' && typeof q.onlyTrashed === 'function') {
        return q.onlyTrashed()
      }
      return q
    })
    return f
  }

  override getKind(): FilterKind { return 'select' }

  override toMeta(): FilterMeta {
    return {
      ...super.toMeta(),
      // Default-scope value (empty / "active only") is implicit — no
      // option needed. Users select withTrashed / onlyTrashed to
      // broaden; clearing the select returns to active-only.
      options: [
        { value: 'withTrashed', label: 'With trashed' },
        { value: 'onlyTrashed', label: 'Only trashed' },
      ],
      placeholder: this.getPlaceholder() ?? 'Active',
    }
  }
}
