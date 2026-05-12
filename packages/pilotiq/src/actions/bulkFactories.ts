/**
 * Bulk-placement Action factories — `bulkDelete / bulkRestore /
 * bulkForceDelete / bulkReplicate`. Handler-style: iterate
 * `ctx.records`, run policy per-row (parallelized via
 * `forEachAllowed`), call the matching Resource / Model method. No new
 * routes — the existing `/_action/:actionName` dispatcher already
 * handles bulk via `ctx.records`.
 *
 * Drop into `bulkActions([...])` from inside `Resource.table()`. Each
 * returns a notification with the count succeeded; rows whose policy
 * denied (or whose call threw) are silently skipped — surface them
 * via your own logging if needed. When no rows succeed (empty
 * selection, all denied, all threw) the handler emits a `'warning'`
 * toast instead of misleading "0 X deleted" success.
 *
 * See `docs/plans/action-split.md` for the split plan.
 */

import { Action, type ReplicateOptions, type ResourceLike } from './Action.js'
import { buildReplica, callPredicate, forEachAllowed } from './factoryHelpers.js'

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
      const verb = R.softDeletes ? 'moved to trash' : 'deleted'
      const n = await forEachAllowed(
        records,
        (record) => callPredicate(R.canDelete, ctx.user, record),
        async (id) => { await Rfull.deleteRecord(id) },
      )
      if (n === 0) {
        return { notify: { title: `Nothing to delete (no permitted rows)`, type: 'warning' } as never }
      }
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
      const Rfull = R as ResourceLike & { model?: { restore?(id: string | number): Promise<unknown> } }
      const restore = Rfull.model?.restore
      if (!restore) {
        return { notify: { title: 'Restore not configured', type: 'error' } as never }
      }
      const records = ctx.records ?? []
      const n = await forEachAllowed(
        records,
        (record) => callPredicate(R.canRestore, ctx.user, record),
        async (id) => { await restore(id) },
      )
      if (n === 0) {
        return { notify: { title: `Nothing to restore (no permitted rows)`, type: 'warning' } as never }
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
      const Rfull = R as ResourceLike & { model?: { forceDelete?(id: string | number): Promise<void> } }
      const forceDelete = Rfull.model?.forceDelete
      if (!forceDelete) {
        return { notify: { title: 'Force-delete not configured', type: 'error' } as never }
      }
      const records = ctx.records ?? []
      const n = await forEachAllowed(
        records,
        (record) => callPredicate(R.canForceDelete, ctx.user, record),
        async (id) => { await forceDelete(id) },
      )
      if (n === 0) {
        return { notify: { title: `Nothing to delete (no permitted rows)`, type: 'warning' } as never }
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
      // Per-row predicate eval preserved — `canCreate` ignores the record
      // in the common case, but users may write stateful predicates that
      // gate per-attempt.
      const n = await forEachAllowed(
        records,
        () => callPredicate(R.canCreate, ctx.user),
        async (_id, source) => {
          const { replica } = await buildReplica(source, M, {
            excludeAttributes:  opts.excludeAttributes,
            deletedAtColumn:    R.deletedAtColumn,
            beforeReplicaSaved: opts.beforeReplicaSaved,
          })
          await M.create(replica)
        },
      )
      if (n === 0) {
        return { notify: { title: `Nothing to replicate (no permitted rows)`, type: 'warning' } as never }
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
