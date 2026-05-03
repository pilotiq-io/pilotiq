import type { Element } from '../schema/Element.js'
import type { ResourceClass } from '../Resource.js'
import type { ModelLike, ModelQuery } from '../orm/modelDefaults.js'
import { getPrimaryKey } from '../orm/modelDefaults.js'
import { SelectField } from '../fields/SelectField.js'

/** Minimum shape required on the parent record to read related rows
 *  via the rudder ORM convention. The candidate-picker side uses this
 *  directly instead of `resolveRelatedQuery` because it doesn't need
 *  the `ModelLike.relatedQuery` override slot — the override only
 *  matters at table render time, not for "what's already attached?"
 *  filtering. */
interface ParentWithRelated {
  related(name: string): { paginate(page: number, perPage: number): Promise<{ data: unknown[]; total: number }> }
}

/**
 * Internals for `Action.relationAttach / relationDetach /
 * relationBulkDetach`. Lives in its own module so the relation-manager
 * factory side of `Action.ts` can call into the M2M-specific helpers
 * (candidate picker query, attach modal schema) without dragging
 * `SelectField` / model-defaults imports into the main file. Mirrors
 * the `importFactory.ts` / `exportFactory.ts` split.
 *
 * The picker is intentionally simple in v1 — fetch up to 50 candidates
 * client-resolved at page render time, filter out already-attached ids
 * server-side. Document the cap; users with high-cardinality relations
 * reach for `Resource.globalSearch` semantics or hand-roll an
 * `Action.handler` with a custom picker UI.
 */

export interface AttachableRow {
  /** Stringified primary key of the candidate record. */
  value: string
  /** Title text rendered in the picker. Resolved via the related
   *  Resource's `recordTitleAttribute` chain. */
  label: string
}

/**
 * Read the parent's already-attached ids under `relationship`. Used by
 * the candidate picker to filter them out (so a user can't accidentally
 * re-attach the same row). Reads through the parent's `related()`
 * accessor — not through the related model's `query()` — because the
 * accessor automatically scopes to the pivot rows for this parent.
 *
 * Returns `Set<string>` of stringified primary keys for fast lookup.
 * Quietly returns an empty set on failure (the picker still works,
 * just shows everything — the attach route's own duplicate handling
 * would pick up the dupe).
 */
export async function loadAttachedIds(
  parent:       unknown,
  relationship: string,
  relatedModel: ModelLike,
): Promise<Set<string>> {
  const p = parent as Partial<ParentWithRelated>
  if (typeof p?.related !== 'function') return new Set()
  try {
    const q   = (p as ParentWithRelated).related(relationship)
    const pk  = getPrimaryKey(relatedModel)
    const out = await q.paginate(1, 1000)
    const ids = new Set<string>()
    for (const row of out.data) {
      const id = (row as Record<string, unknown>)[pk]
      if (id !== undefined && id !== null) ids.add(String(id))
    }
    return ids
  } catch {
    return new Set()
  }
}

/**
 * Build the candidate list for the Attach modal's SelectField. Loads
 * up to `limit` rows from the related model (default 50), filters out
 * any that are already attached to the parent, and maps each to
 * `{ value, label }` using the related Resource's record-title chain.
 *
 * `recordTitleAttr` is resolved from the related Resource (or falls
 * back through the standard `name → title → id` chain). The PK comes
 * from `relatedModel`'s introspection.
 */
export async function loadAttachableCandidates(
  parent:         unknown,
  relationship:   string,
  relatedModel:   ModelLike,
  recordTitleAttr: string | undefined,
  limit:          number = 50,
): Promise<AttachableRow[]> {
  const attached = await loadAttachedIds(parent, relationship, relatedModel)

  // Use the related model's own query (not the relation accessor) so
  // we see all attachable rows, then subtract attached ids in memory.
  // For implicit Prisma pivots the accessor doesn't expose a
  // whereNotIn-on-pivot-keys helper, and even when it does the cost
  // of fetching ≤ 50 rows + a Set lookup is negligible.
  const q = (relatedModel as { query?: () => ModelQuery }).query?.()
  if (!q) return []

  const result = await q.paginate(1, limit + attached.size).catch(() => null)
  if (!result) return []

  const pk = getPrimaryKey(relatedModel)

  const rows: AttachableRow[] = []
  for (const row of result.data) {
    const r  = row as Record<string, unknown>
    const id = r[pk]
    if (id === undefined || id === null) continue
    const idStr = String(id)
    if (attached.has(idStr)) continue
    rows.push({ value: idStr, label: deriveLabel(r, recordTitleAttr, idStr) })
    if (rows.length >= limit) break
  }
  return rows
}

function deriveLabel(
  record: Record<string, unknown>,
  attr:   string | undefined,
  fallback: string,
): string {
  const explicit = attr && typeof record[attr] === 'string' ? (record[attr] as string) : undefined
  if (explicit && explicit.length > 0) return explicit
  for (const key of ['name', 'title', 'label']) {
    const v = record[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return fallback
}

/**
 * Build the modal-form schema for `Action.relationAttach`. A single
 * `SelectField` named `_attachId` populated by an async resolver that
 * defers to `loadAttachableCandidates` at render time. Server-side the
 * resolver runs while the table is being resolved (the parent record
 * lives on `RenderContext.record` because the manager's list-page mode
 * stamps it there).
 *
 * `recordTitleAttr` defaults to `'name'` when neither the manager nor
 * the related Resource has set it explicitly. The candidate query
 * limit is fixed at 50 in v1 — see plan doc for rationale.
 */
export function buildAttachModalSchema(deps: {
  Related:         ResourceClass
  relationship:    string
  recordTitleAttr: string | undefined
  labelSingular:   string
}): Element[] {
  const { Related, relationship, recordTitleAttr, labelSingular } = deps

  const select = SelectField.make('_attachId')
    .label(labelSingular)
    .required()
    .options(async (ctx) => {
      // The resolver runs at schema-resolve time. For a header action
      // on a manager list page the parent record is at `ctx.record`.
      const parent = ctx.record
      if (!parent) return []
      if (!Related.model) return []
      const rows = await loadAttachableCandidates(
        parent,
        relationship,
        Related.model,
        recordTitleAttr,
      )
      return rows
    })

  return [select]
}
