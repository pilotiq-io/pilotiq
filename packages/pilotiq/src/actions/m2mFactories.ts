/**
 * M2M relation Action factories — `relationAttach` (header, modal-form
 * picker → POST `_action/relationAttach`), `relationDetach` (row, direct
 * POST to `_detach/:childId`), `relationBulkDetach` (bulk, handler-
 * dispatched).
 *
 * Sibling of `relationCreate / Edit / Delete` for every M2M mode
 * (`belongsToMany`, `morphToMany` (owning polymorphic side),
 * `morphedByMany` (inverse polymorphic side)). All three modes share
 * the same `attach` / `detach` / `sync` accessor surface — the rudder
 * ORM stamps + filters the polymorphic discriminator on the morph
 * variants automatically, so pilotiq's pivot factories are mode-agnostic
 * beyond the visibility gate.
 *
 * All three auto-hide outside any M2M mode so dropping a factory into
 * a non-M2M manager is a no-op (visible=false) instead of a confusing
 * 404.
 *
 * The first and third route through the manager-scoped
 * `_action/:actionName` endpoint (added in routes.ts) so handlers
 * see `ctx.relation = { parent, parentId, relationship }`.
 *
 * See `docs/plans/action-split.md` for the split plan.
 */

import { Action } from './Action.js'
import {
  safeManagerPolicy,
  type RelationManager,
  type RelationManagerContext,
} from '../RelationManager.js'
import { resolveM2MAccessor } from '../orm/m2mAccessor.js'
import { buildAttachModalSchema } from './attachFactory.js'
import { isM2MMode, relationUrlPrefix } from './factoryHelpers.js'

/** Header-placement attach factory — opens a modal with a SelectField
 *  listing related records that aren't already attached, and POSTs the
 *  selected id to the manager's `_action/relationAttach` endpoint.
 *
 *  Visibility delegates to `M.canAttach(user, parentRecord)` AND
 *  guards against being dropped into a non-M2M manager. */
export function relationAttachAction(
  M:   typeof RelationManager,
  ctx: RelationManagerContext,
): Action {
  const labelSingular = M.getLabelSingular()
  const a = Action.make('relationAttach')
    .label(`Attach ${labelSingular}`)
    .header()
    .modalHeading(`Attach ${labelSingular}`)
    .modalSubmitLabel('Attach')
    .modalCancelLabel('Cancel')
    .handler(async (hctx) => {
      const rel = hctx.relation
      if (!rel) {
        return { notify: { title: 'Attach handler missing parent context — manager-scoped _action route not wired', type: 'error' } as never }
      }
      const Related = ctx.related
      if (!Related?.model) {
        return { notify: { title: 'Cannot attach: related Resource has no model', type: 'error' } as never }
      }
      const idStr = String((hctx.values?.['_attachId'] as unknown) ?? '')
      if (idStr.length === 0) {
        return { notify: { title: 'Pick a record to attach', type: 'error' } as never }
      }
      const accessor = resolveM2MAccessor(rel.parent, rel.relationship)
      if (!accessor || typeof accessor.attach !== 'function') {
        return { notify: { title: `Pivot accessor missing on ${rel.relationship} — wrong relation type or ORM version?`, type: 'error' } as never }
      }
      try {
        await accessor.attach([idStr])
      } catch (err) {
        return { notify: { title: `Attach failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' } as never }
      }
      return { notify: { title: `${labelSingular} attached`, type: 'success' } as never }
    })
    .visible(({ user }) => {
      if (!isM2MMode(ctx.mode)) return false
      return safeManagerPolicy(M, 'canAttach', ctx.related, user, ctx.parentRecord)
    })

  // Build the modal-form schema only when this is actually an M2M
  // manager — non-M2M drops keep the action hidden via the visibility
  // predicate, but still need a schema-less Action so the meta walker
  // doesn't blow up. Static import is fine: `attachFactory` only
  // depends on `SelectField` + ORM helpers, no cycle back to Action.
  if (isM2MMode(ctx.mode) && ctx.related?.model) {
    a.schema(buildAttachModalSchema({
      Related:         ctx.related,
      relationship:    ctx.relationship,
      recordTitleAttr: M.getRecordTitleAttribute() ?? ctx.related.recordTitleAttribute,
      labelSingular,
    }))
  }
  return a
}

/** Row-placement detach factory — POSTs to
 *  `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/_detach`,
 *  destructive style with a confirmation prompt that says "Detach"
 *  (not "Delete") so users understand the target record stays.
 *  Visibility delegates to `M.canDetach`. */
export function relationDetachAction(
  M:        typeof RelationManager,
  ctx:      RelationManagerContext,
  recordId?: string,
): Action {
  const id = recordId ?? ':id'
  const singular = M.getLabelSingular().toLowerCase()
  return Action.make('relationDetach')
    .label('Detach')
    .destructive()
    .method('post')
    .action(`${relationUrlPrefix(ctx)}/${id}/_detach`)
    .confirm(`Detach this ${singular}? The ${singular} record stays in place; only the link is removed.`)
    .visible(async ({ user, record }) => {
      if (!isM2MMode(ctx.mode)) return false
      return safeManagerPolicy(M, 'canDetach', ctx.related, user, ctx.parentRecord, record)
    })
}

/** Bulk-placement bulk-detach factory — handler-dispatched. Calls
 *  `parent.related(rel).detach(ids)` for the selected rows. Visibility
 *  delegates to `M.canAttach` (acts like a "manager admin" gate; we
 *  intentionally don't enforce per-row `canDetach` on the visibility
 *  side because the bulk button needs to be visible before the user
 *  has selected anything — per-row gating happens inside the handler). */
export function relationBulkDetachAction(
  M:   typeof RelationManager,
  ctx: RelationManagerContext,
): Action {
  const labelPlural = M.getLabel().toLowerCase()
  return Action.make('relationBulkDetach')
    .label('Detach selected')
    .destructive()
    .bulk()
    .confirm(`Detach the selected ${labelPlural}? The records stay in place; only the links are removed.`)
    .handler(async (hctx) => {
      const rel = hctx.relation
      if (!rel) {
        return { notify: { title: 'Bulk-detach handler missing parent context — manager-scoped _action route not wired', type: 'error' } as never }
      }
      const records = hctx.records ?? []
      const ids: string[] = []
      for (const r of records) {
        const id = String((r as { id?: unknown }).id ?? '')
        if (!id) continue
        const allowed = await safeManagerPolicy(M, 'canDetach', ctx.related, hctx.user, ctx.parentRecord, r)
        if (!allowed) continue
        ids.push(id)
      }
      if (ids.length === 0) {
        return { notify: { title: 'Nothing to detach (no permitted rows)', type: 'warning' } as never }
      }
      const accessor = resolveM2MAccessor(rel.parent, rel.relationship)
      if (!accessor || typeof accessor.detach !== 'function') {
        return { notify: { title: `Pivot accessor missing on ${rel.relationship} — wrong relation type or ORM version?`, type: 'error' } as never }
      }
      try {
        await accessor.detach(ids)
      } catch (err) {
        return { notify: { title: `Bulk detach failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' } as never }
      }
      return { notify: { title: `${ids.length} ${labelPlural} detached`, type: 'success' } as never }
    })
    .visible(({ user }) => {
      if (!isM2MMode(ctx.mode)) return false
      // Bulk gate uses canAttach as a stand-in for "manager admin" —
      // per-row canDetach is enforced inside the handler.
      return safeManagerPolicy(M, 'canAttach', ctx.related, user, ctx.parentRecord)
    })
}
