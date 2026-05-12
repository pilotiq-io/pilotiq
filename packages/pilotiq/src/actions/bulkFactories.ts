/**
 * Bulk-placement Action factories — `bulkDelete / bulkRestore /
 * bulkForceDelete / bulkReplicate`. Handler-style: iterate
 * `ctx.records`, run policy per-row, call the matching Resource /
 * Model method. No new routes — the existing `/_action/:actionName`
 * dispatcher already handles bulk via `ctx.records`.
 *
 * Drop into `bulkActions([...])` from inside `Resource.table()`. Each
 * returns a notification with the count succeeded; rows whose policy
 * denied (or whose call threw) are silently skipped — surface them
 * via your own logging if needed.
 *
 * See `docs/plans/action-split.md` for the split plan.
 */

import { Action, type ReplicateOptions, type ResourceLike } from './Action.js'
import { callPredicate } from './factoryHelpers.js'

/** Pick the right label form for a count — `labelSingular` for 1,
 *  `label` (plural, lowercased) for any other count. Fall back to a
 *  naive `${labelSingular}s` when no plural label is set. Used by bulk
 *  notification copy so we don't ship "1 posts moved to trash". */
function labelForCount(R: ResourceLike, n: number): string {
  if (n === 1) return R.labelSingular.toLowerCase()
  const plural = R.label?.toLowerCase()
  return plural ?? `${R.labelSingular.toLowerCase()}s`
}

/** Bulk delete — calls `R.deleteRecord(id)` per row. On a
 *  soft-delete resource that hits `Model.delete()` which writes
 *  `deletedAt`. Notification: "N posts moved to trash" / "N posts
 *  deleted" depending on `R.softDeletes`. */
export function bulkDeleteAction(R: ResourceLike, _basePath: string): Action {
  return Action.make('bulkDelete')
    .label('Delete selected')
    .destructive()
    .bulk()
    .confirm(`Delete the selected ${labelForCount(R, 0)}?`)
    .handler(async (ctx) => {
      const records = ctx.records ?? []
      const Rfull = R as ResourceLike & { deleteRecord(id: string): Promise<void> }
      let n = 0
      for (const record of records) {
        const id = String((record as { id?: unknown }).id ?? '')
        if (!id) continue
        const allowed = await callPredicate(R.canDelete, ctx.user, record)
        if (!allowed) continue
        try { await Rfull.deleteRecord(id); n++ } catch { /* skip — agg notify shows total */ }
      }
      const verb = R.softDeletes ? 'moved to trash' : 'deleted'
      return { notify: { title: `${n} ${labelForCount(R, n)} ${verb}`, type: 'success' } as never }
    })
}

/** Bulk restore — calls `R.model.restore(id)` per row. Visible only
 *  on soft-delete resources (the entire bulk-restore concept is
 *  specific to them). */
export function bulkRestoreAction(R: ResourceLike, _basePath: string): Action {
  return Action.make('bulkRestore')
    .label('Restore selected')
    .color('success')
    .bulk()
    .confirm(`Restore the selected ${labelForCount(R, 0)}?`)
    .handler(async (ctx) => {
      const records = ctx.records ?? []
      const Rfull = R as ResourceLike & { model?: { restore?(id: string | number): Promise<unknown> } }
      const restore = Rfull.model?.restore
      if (!restore) {
        return { notify: { title: 'Restore not configured', type: 'error' } as never }
      }
      let n = 0
      for (const record of records) {
        const id = String((record as { id?: unknown }).id ?? '')
        if (!id) continue
        const allowed = await callPredicate(R.canRestore, ctx.user, record)
        if (!allowed) continue
        try { await restore(id); n++ } catch { /* skip */ }
      }
      return { notify: { title: `${n} ${labelForCount(R, n)} restored`, type: 'success' } as never }
    })
}

/** Bulk force-delete — calls `R.model.forceDelete(id)` per row. Same
 *  destructive confirm as the per-row variant. Visible only on
 *  soft-delete resources. */
export function bulkForceDeleteAction(R: ResourceLike, _basePath: string): Action {
  return Action.make('bulkForceDelete')
    .label('Delete forever')
    .destructive()
    .bulk()
    .confirm(`Permanently delete the selected ${labelForCount(R, 0)}? This cannot be undone.`)
    .handler(async (ctx) => {
      const records = ctx.records ?? []
      const Rfull = R as ResourceLike & { model?: { forceDelete?(id: string | number): Promise<void> } }
      const forceDelete = Rfull.model?.forceDelete
      if (!forceDelete) {
        return { notify: { title: 'Force-delete not configured', type: 'error' } as never }
      }
      let n = 0
      for (const record of records) {
        const id = String((record as { id?: unknown }).id ?? '')
        if (!id) continue
        const allowed = await callPredicate(R.canForceDelete, ctx.user, record)
        if (!allowed) continue
        try { await forceDelete(id); n++ } catch { /* skip */ }
      }
      return { notify: { title: `${n} ${labelForCount(R, n)} permanently deleted`, type: 'success' } as never }
    })
}

/**
 * Bulk replicate — calls `R.model.create(...)` once per selected row
 * with the source row's attributes minus PK / soft-delete column /
 * `opts.excludeAttributes`. Optional `opts.beforeReplicaSaved(replica,
 * source)` runs per-row. Rows that throw during create are skipped
 * silently so a single bad row doesn't abort the batch (the user sees
 * the success count on the toast). Visibility delegates to
 * `R.canCreate(user)`.
 *
 * Sibling of `replicateAction` — same options bag, same strip set,
 * same authorization gate. Stays on the list page (no per-row
 * redirect possible for N rows).
 */
export function bulkReplicateAction(
  R:        ResourceLike,
  _basePath: string,
  opts:     ReplicateOptions = {},
): Action {
  return Action.make('bulkReplicate')
    .label('Replicate selected')
    .bulk()
    .confirm(`Replicate the selected ${labelForCount(R, 0)}?`)
    .handler(async (ctx) => {
      const M = R.model
      if (!M || typeof M.create !== 'function') {
        return { notify: { title: 'Replicate not configured (resource has no model.create)', type: 'error' } as never }
      }
      const records = ctx.records ?? []
      const pkCol      = (M as { primaryKey?: string }).primaryKey ?? 'id'
      const trashedCol = R.deletedAtColumn ?? 'deletedAt'
      const skip = new Set<string>([pkCol, trashedCol, ...(opts.excludeAttributes ?? [])])
      let n = 0
      for (const source of records) {
        if (!source || typeof source !== 'object') continue
        const allowed = await callPredicate(R.canCreate, ctx.user)
        if (!allowed) continue
        let replica: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
          if (skip.has(k)) continue
          replica[k] = v
        }
        if (opts.beforeReplicaSaved) {
          try { replica = await opts.beforeReplicaSaved(replica, source) }
          catch { continue }
        }
        try { await M.create(replica); n++ } catch { /* skip — agg notify shows total */ }
      }
      const defaultTitle = `${n} ${labelForCount(R, n)} replicated`
      const overrideTitle = opts.getCreatedNotificationTitle
        ? await opts.getCreatedNotificationTitle({ count: n, records })
        : undefined
      const title = overrideTitle !== undefined ? overrideTitle : defaultTitle
      return { notify: { title, type: 'success' } as never }
    })
    .visible(({ user }) => callPredicate(R.canCreate, user))
}
