/**
 * Relation-manager Action factories — `relationCreate / relationEdit /
 * relationDelete / relationRestore / relationForceDelete` (hasMany +
 * morphMany) and `relationReplicate / relationBulkReplicate` (clone
 * with force-pinned parent attachment).
 *
 * Designed to be called inside `RelationManager.static table()` — the
 * page-data builder pipes `RelationManagerContext` into that
 * configurator so users get `basePath`, `parentId`, and the discovered
 * Related resource without threading them by hand.
 *
 * Visibility predicates use `safeManagerPolicy` so the manager's
 * `canX` (when overridden) wins, otherwise falls through to the
 * related Resource's `canX`. Throws absorb as `false`.
 *
 * M2M factories (`relationAttach / relationDetach / relationBulkDetach`)
 * live in `m2mFactories.ts`.
 *
 * See `docs/plans/action-split.md` for the split plan.
 */

import {
  Action,
  type ActionContext,
  type ActionResult,
  type ReplicateOptions,
  type ResourceLike,
} from './Action.js'
import {
  safeManagerPolicy,
  type RelationManager,
  type RelationManagerContext,
} from '../RelationManager.js'
import {
  computeMorphPayload,
  getMorphRelationDescriptor,
  getParentRelationDescriptor,
  type ModelLike,
} from '../orm/modelDefaults.js'
import { buildReplica, forEachAllowed, isM2MMode, isTrashed, relationUrlPrefix } from './factoryHelpers.js'

/**
 * Compute the parent-attachment payload to force-pin onto a relation
 * replica. For `hasMany`, returns `{ [foreignKey]: parentId }` from the
 * parent's `static relations[name]` descriptor. For `morphMany` /
 * `morphOne`, returns `{ <morphName>Id, <morphName>Type }` via
 * `computeMorphPayload(parentRecord)`. Returns `{}` when no descriptor
 * matches — the route dispatcher already auto-hides under M2M / morphTo,
 * so missing descriptors there are a no-op rather than an error. Pure;
 * exported for tests and re-used by both factories.
 */
function computeRelationPin(
  ctx: RelationManagerContext,
): Record<string, unknown> {
  const parentModel = (ctx.parentRecord as { constructor?: ModelLike } | null | undefined)?.constructor
  if (!parentModel) return {}
  const rel = ctx.relationship
  // Polymorphic owner side first — `morphMany` carries no foreignKey
  // and would fail the hasMany descriptor's gate.
  if (ctx.mode === 'morphMany') {
    const morph = getMorphRelationDescriptor(parentModel, rel)
    if (!morph) return {}
    try { return computeMorphPayload(ctx.parentRecord, morph) }
    catch { return {} }
  }
  const desc = getParentRelationDescriptor(parentModel, rel)
  if (!desc) return {}
  return { [desc.foreignKey]: ctx.parentId }
}

/**
 * Build + persist a single relation replica. Runs the strip set
 * (PK + soft-delete column on the **related** Resource +
 * `opts.excludeAttributes`), force-pins the parent attachment columns,
 * runs the optional `beforeReplicaSaved` hook, and calls
 * `Related.model.create(...)`. Returns the model's create result so
 * callers can read its primary key for redirect targeting.
 *
 * Throws when the related Resource has no model — caller (single-row
 * factory) catches and surfaces an error notification; bulk caller
 * checks the model presence ahead of the loop.
 */
async function persistRelationReplica(
  _M:     typeof RelationManager,
  ctx:    RelationManagerContext,
  source: unknown,
  opts:   ReplicateOptions,
): Promise<unknown> {
  const Related = ctx.related
  if (!Related?.model || typeof Related.model.create !== 'function') {
    throw new Error('Related Resource has no model.create')
  }
  const M2 = Related.model as ModelLike
  // Force-pin the parent attachment via `pin` so `beforeReplicaSaved` can
  // still read / override the FK if it really wants to (rare); tampered
  // source rows can't slip a different parent in by riding their own FK
  // column — the pin overwrites whatever value was there.
  const { replica } = await buildReplica(source, M2, {
    excludeAttributes:  opts.excludeAttributes,
    deletedAtColumn:    Related.deletedAtColumn,
    pin:                computeRelationPin(ctx),
    beforeReplicaSaved: opts.beforeReplicaSaved,
  })
  return M2.create(replica)
}

/**
 * Single-row dispatch for `relationReplicateAction`. Resolves
 * `ctx.record` (loaded by the route's resolveRecord hook), validates,
 * persists the replica, and shapes the success notification. Errors
 * are caught and surfaced as error toasts.
 */
async function runRelationReplicateRow(
  M:    typeof RelationManager,
  ctx:  RelationManagerContext,
  hctx: ActionContext,
  opts: ReplicateOptions,
): Promise<ActionResult> {
  const source = hctx.record
  if (!source || typeof source !== 'object') {
    return { notify: { title: 'Replicate failed: source record missing', type: 'error' } as never }
  }
  const Related = ctx.related
  if (!Related?.model || typeof Related.model.create !== 'function') {
    return { notify: { title: 'Replicate not configured (related Resource has no model.create)', type: 'error' } as never }
  }
  let created: unknown
  try {
    created = await persistRelationReplica(M, ctx, source, opts)
  } catch (err) {
    return { notify: { title: `Replicate failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' } as never }
  }
  const overrideTitle = opts.getCreatedNotificationTitle
    ? await opts.getCreatedNotificationTitle({ replica: created, source })
    : undefined
  const title = overrideTitle !== undefined ? overrideTitle : `${M.getLabelSingular()} replicated`
  // The manager-scoped `_action/:actionName` route falls back to the
  // manager list URL when `result.redirect` is undefined, so we only
  // emit `redirect` when the user override returned a string. That
  // way default behavior (route owns the fallback) is unchanged.
  const overrideRedirect = opts.getRedirectUrl
    ? await opts.getRedirectUrl({ replica: created, source })
    : undefined
  return {
    ...(overrideRedirect !== undefined ? { redirect: overrideRedirect } : {}),
    notify: { title, type: 'success' } as never,
  }
}

/** Relation create-action factory — link to
 * `${base}/${parentSlug}/${parentId}/${relationship}/create`.
 *
 * Visibility delegates to `M.canCreate(user, parentRecord)` (or the
 * related Resource's `canCreate(user)` when the manager hasn't
 * overridden). Drop into `headerActions([...])` from inside
 * `RelationManager.table(table, ctx)`.
 */
export function relationCreateAction(
  M:   typeof RelationManager,
  ctx: RelationManagerContext,
): Action {
  const labelSingular = M.getLabelSingular()
  return Action.make('create')
    .label(`New ${labelSingular}`)
    .href(`${relationUrlPrefix(ctx)}/create`)
    .visible(({ user }) => {
      // M2M managers don't have a per-pivot-row create surface — the
      // related record is created via its own Resource, then attached
      // via `relationAttach`. Auto-hide so dropping this factory into
      // any M2M manager (belongsToMany / morphToMany / morphedByMany)
      // is a no-op (visible=false) instead of a 404-on-click foot-gun.
      if (isM2MMode(ctx.mode)) return false
      return safeManagerPolicy(M, 'canCreate', ctx.related, user, ctx.parentRecord)
    })
}

/** Relation edit-action factory — link to
 * `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/edit`.
 *
 * Same `recordId` semantics as `editAction`: omit for row context
 * so the renderer substitutes `:id` per row; pass explicitly when
 * building actions for a single-record context. Visibility delegates
 * to `M.canEdit(user, child, parentRecord)` with fall-through to the
 * related Resource's `canEdit(user, record)`.
 */
export function relationEditAction(
  M:        typeof RelationManager,
  ctx:      RelationManagerContext,
  recordId?: string,
): Action {
  const id = recordId ?? ':id'
  return Action.make('edit')
    .label('Edit')
    .href(`${relationUrlPrefix(ctx)}/${id}/edit`)
    .visible(({ user, record }) => {
      // M2M: per-pivot-row "edit" doesn't exist; users edit the
      // related record via its own Resource. Auto-hide for every M2M
      // mode (belongsToMany / morphToMany / morphedByMany).
      if (isM2MMode(ctx.mode)) return false
      return safeManagerPolicy(M, 'canEdit', ctx.related, user, ctx.parentRecord, record)
    })
}

/** Relation delete-action factory — POST to
 * `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/delete`,
 * destructive style with a labeled confirmation. Visibility delegates
 * to `M.canDelete(user, child, parentRecord)` with fall-through to the
 * related Resource's `canDelete(user, record)`.
 */
export function relationDeleteAction(
  M:        typeof RelationManager,
  ctx:      RelationManagerContext,
  recordId?: string,
): Action {
  const id = recordId ?? ':id'
  const singular = M.getLabelSingular().toLowerCase()
  return Action.make('delete')
    .label('Delete')
    .destructive()
    .method('post')
    .action(`${relationUrlPrefix(ctx)}/${id}/delete`)
    .confirm(`Delete this ${singular}?`)
    .visible(async ({ user, record }) => {
      // M2M: "delete" of the related record is destructive in a way
      // that "detach" isn't — surface only `relationDetach` on every
      // M2M manager (belongsToMany / morphToMany / morphedByMany).
      // Users who genuinely want to delete the related record reach
      // for `Action.delete(R)` on the related Resource instead.
      if (isM2MMode(ctx.mode)) return false
      if (ctx.related?.softDeletes && isTrashed(record, ctx.related as ResourceLike)) return false
      return safeManagerPolicy(M, 'canDelete', ctx.related, user, ctx.parentRecord, record)
    })
}

/**
 * Plan #13 polish — Restore factory for relation managers. POSTs to
 * `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/restore`,
 * success-styled, no confirm prompt. Auto-hides on live (non-trashed)
 * rows AND when `M.canRestore` (or related Resource fall-through)
 * denies. Drop into `recordActions([...])` from `RelationManager.table(table, ctx)`.
 */
export function relationRestoreAction(
  M:        typeof RelationManager,
  ctx:      RelationManagerContext,
  recordId?: string,
): Action {
  const id = recordId ?? ':id'
  return Action.make('restore')
    .label('Restore')
    .color('success')
    .method('post')
    .action(`${relationUrlPrefix(ctx)}/${id}/restore`)
    .visible(async ({ user, record }) => {
      if (!ctx.related?.softDeletes) return false
      if (!isTrashed(record, ctx.related as ResourceLike)) return false
      return safeManagerPolicy(M, 'canRestore', ctx.related, user, ctx.parentRecord, record)
    })
}

/**
 * Plan #13 polish — Force-delete factory for relation managers. POSTs
 * to `${base}/${parentSlug}/${parentId}/${relationship}/${recordId ?? ':id'}/force-delete`,
 * destructive style with a permanence-aware confirmation. Auto-hides on
 * live (non-trashed) rows and when policy denies.
 */
export function relationForceDeleteAction(
  M:        typeof RelationManager,
  ctx:      RelationManagerContext,
  recordId?: string,
): Action {
  const id = recordId ?? ':id'
  const singular = M.getLabelSingular().toLowerCase()
  return Action.make('forceDelete')
    .label('Delete forever')
    .destructive()
    .method('post')
    .action(`${relationUrlPrefix(ctx)}/${id}/force-delete`)
    .confirm(`Permanently delete this ${singular}? This cannot be undone.`)
    .visible(async ({ user, record }) => {
      if (!ctx.related?.softDeletes) return false
      if (!isTrashed(record, ctx.related as ResourceLike)) return false
      return safeManagerPolicy(M, 'canForceDelete', ctx.related, user, ctx.parentRecord, record)
    })
}

/**
 * Relation row-replicate factory. Clones the row's child record
 * inside the manager's parent scope.
 *
 * Strips the related model's primary key, soft-delete column, and
 * `opts.excludeAttributes`. Re-applies the parent attachment columns
 * after the strip + before the optional `beforeReplicaSaved` hook,
 * so user code can still mutate non-FK fields without accidentally
 * unlinking the replica.
 *
 * On success the manager-scoped route falls back to the manager
 * list URL (`${base}/${parentSlug}/${parentId}/${relationship}`)
 * because no explicit `redirect` is returned — same default as the
 * other handler-style relation factories.
 *
 * `recordId` kept in the signature for parity with the rest of the
 * relation factory family. The dispatcher resolves the source row
 * from the request body, so it isn't referenced here.
 */
export function relationReplicateAction(
  M:        typeof RelationManager,
  ctx:      RelationManagerContext,
  recordId?: string,
  opts:     ReplicateOptions = {},
): Action {
  void recordId
  return Action.make('relationReplicate')
    .label('Replicate')
    .row()
    .handler(async (hctx) => {
      const result = await runRelationReplicateRow(M, ctx, hctx, opts)
      return result
    })
    .visible(({ user }) => {
      if (isM2MMode(ctx.mode) || ctx.mode === 'morphTo') return false
      return safeManagerPolicy(M, 'canCreate', ctx.related, user, ctx.parentRecord)
    })
}

/**
 * Bulk sibling — replicates every selected child row inside the
 * manager's parent scope. Same strip + force-pin pipeline applied
 * per row. Per-row `safeManagerPolicy(M, 'canCreate', …)` runs
 * inside the loop so a partially-permitted selection still proceeds
 * for the rows that pass. Rows that throw are skipped silently —
 * the toast count reflects only successful creates.
 */
export function relationBulkReplicateAction(
  M:    typeof RelationManager,
  ctx:  RelationManagerContext,
  opts: ReplicateOptions = {},
): Action {
  const labelPlural = M.getLabel().toLowerCase()
  const labelSingular = M.getLabelSingular().toLowerCase()
  return Action.make('relationBulkReplicate')
    .label('Replicate selected')
    .bulk()
    .confirm(`Replicate the selected ${labelPlural}?`)
    .handler(async (hctx) => {
      const Related = ctx.related
      if (!Related?.model || typeof Related.model.create !== 'function') {
        return { notify: { title: 'Replicate not configured (related Resource has no model.create)', type: 'error' } as never }
      }
      const records = hctx.records ?? []
      // Per-row predicate eval preserved — users may write stateful predicates that gate per-attempt.
      const n = await forEachAllowed(
        records,
        () => safeManagerPolicy(M, 'canCreate', Related, hctx.user, ctx.parentRecord),
        async (_id, source) => { await persistRelationReplica(M, ctx, source, opts) },
      )
      if (n === 0) {
        return { notify: { title: `Nothing to replicate (no permitted rows)`, type: 'warning' } as never }
      }
      const defaultTitle = `${n} ${n === 1 ? labelSingular : labelPlural} replicated`
      const overrideTitle = opts.getCreatedNotificationTitle
        ? await opts.getCreatedNotificationTitle({ count: n, records })
        : undefined
      const title = overrideTitle !== undefined ? overrideTitle : defaultTitle
      return {
        notify: { title, type: 'success' } as never,
      }
    })
    .visible(({ user }) => {
      if (isM2MMode(ctx.mode) || ctx.mode === 'morphTo') return false
      return safeManagerPolicy(M, 'canCreate', ctx.related, user, ctx.parentRecord)
    })
}
