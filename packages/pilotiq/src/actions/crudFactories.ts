/**
 * CRUD single-row Action factories — `create / edit / view / delete /
 * replicate / restore / forceDelete`, plus the notification `markAsRead`
 * factory.
 *
 * Each factory builds and returns a configured `Action`. The matching
 * `static` methods on the `Action` class are thin delegators that call
 * into these functions, preserving the public `Action.create(R, base)`
 * call shape.
 *
 * See `docs/plans/action-split.md` for the split plan.
 */

import { Action, type ReplicateOptions, type ResourceLike } from './Action.js'
import { buildReplica, callPredicate, isTrashed, resourceBase } from './factoryHelpers.js'

/** Create-action factory — link to `${basePath}/${R.slug}/create`.
 * Auto-hides when `R.canCreate(user)` returns false. */
export function createAction(R: ResourceLike, basePath: string): Action {
  return Action.make('create')
    .label(`New ${R.labelSingular}`)
    .href(`${resourceBase(basePath, R)}/create`)
    .visible(({ user }) => callPredicate(R.canCreate, user))
}

/**
 * Edit-action factory — link to the resource's edit page.
 *
 * Pass `recordId` when building actions for a single-record context
 * (e.g. `ViewPage.getActions()`); the URL is baked at config time.
 * Omit `recordId` for row context (`Table.recordActions(...)`); the
 * URL keeps the `:id` template and the renderer substitutes per-row.
 *
 * Auto-hides when `R.canEdit(user, record)` returns false. For row
 * context the per-row record threads in via `loadTableRecords`'s
 * per-row eval; for view-page context, `resolveSchema` provides the
 * resolved record on the eval context.
 */
export function editAction(R: ResourceLike, basePath: string, recordId?: string): Action {
  const id = recordId ?? ':id'
  return Action.make('edit')
    .label('Edit')
    .href(`${resourceBase(basePath, R)}/${id}/edit`)
    .visible(({ user, record }) => callPredicate(R.canEdit, user, record))
}

/** View-action factory — link to the resource's view page. See `editAction` for the `recordId` semantics.
 * Auto-hides when `R.canView(user, record)` returns false. */
export function viewAction(R: ResourceLike, basePath: string, recordId?: string): Action {
  const id = recordId ?? ':id'
  return Action.make('view')
    .label('View')
    .href(`${resourceBase(basePath, R)}/${id}`)
    .visible(({ user, record }) => callPredicate(R.canView, user, record))
}

/**
 * Delete-action factory — POSTs to the resource's delete route,
 * destructive style, with a confirmation prompt referencing the
 * resource label. Same `recordId` semantics as `editAction`.
 * Auto-hides when `R.canDelete(user, record)` returns false.
 *
 * Plan #13 — when `R.softDeletes = true`, additionally hides on
 * rows whose `deletedAtColumn` is set (already-trashed rows get the
 * Restore + ForceDelete pair instead, surfaced via the matching
 * factories below).
 */
export function deleteAction(R: ResourceLike, basePath: string, recordId?: string): Action {
  const id = recordId ?? ':id'
  return Action.make('delete')
    .label('Delete')
    .destructive()
    .method('post')
    .action(`${resourceBase(basePath, R)}/${id}/delete`)
    .confirm(`Delete this ${R.labelSingular.toLowerCase()}?`)
    .visible(async ({ user, record }) => {
      if (R.softDeletes && isTrashed(record, R)) return false
      return callPredicate(R.canDelete, user, record)
    })
}

/**
 * Replicate-action factory — handler-style. Loads the source record
 * from `ctx.record` (the `_action/:actionName` route already resolves
 * it through `R.query(ctx)` for row + single-target placements),
 * strips PK + soft-delete column + any `opts.excludeAttributes`,
 * optionally runs `opts.beforeReplicaSaved`, and creates a new row
 * via `R.model.create(...)`. Redirects to the new record's edit page
 * on success so the user can review + tweak before saving again.
 *
 * `recordId` kept in the signature for parity with `delete / edit /
 * view` so users can swap factories without rewriting call sites; the
 * dispatcher resolves the source record from the URL and hands it to
 * the handler as `ctx.record`, so we don't reference `recordId` here.
 *
 * Auto-hides when `R.canCreate(user)` returns false — replicating
 * writes a new row, so the gate is `canCreate`, not `canView`.
 */
export function replicateAction(
  R:        ResourceLike,
  basePath: string,
  recordId?: string,
  opts:     ReplicateOptions = {},
): Action {
  void recordId
  return Action.make('replicate')
    .label('Replicate')
    .handler(async (ctx) => {
      const source = ctx.record
      if (!source || typeof source !== 'object') {
        return { notify: { title: 'Replicate failed: source record missing', type: 'error' } as never }
      }
      const M = R.model
      if (!M || typeof M.create !== 'function') {
        return { notify: { title: 'Replicate not configured (resource has no model.create)', type: 'error' } as never }
      }

      let replica: Record<string, unknown>
      let pkCol: string
      try {
        ({ replica, pkCol } = await buildReplica(source, M, {
          excludeAttributes: opts.excludeAttributes,
          deletedAtColumn:   R.deletedAtColumn,
          beforeReplicaSaved: opts.beforeReplicaSaved,
        }))
      } catch (err) {
        return { notify: { title: `Replicate failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' } as never }
      }

      let created: unknown
      try {
        created = await M.create(replica)
      } catch (err) {
        return { notify: { title: `Replicate failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' } as never }
      }

      const newId = (created as Record<string, unknown> | null | undefined)?.[pkCol]
      const defaultRedirect = newId !== undefined && newId !== null
        ? `${resourceBase(basePath, R)}/${String(newId)}/edit`
        : `${resourceBase(basePath, R)}`
      // `!== undefined` rather than `??` so an override returning
      // `null`/empty-string isn't silently swallowed (see
      // feedback_nullish_swallows_explicit_null).
      const overrideRedirect = opts.getRedirectUrl
        ? await opts.getRedirectUrl({ replica: created, source })
        : undefined
      const redirect = overrideRedirect !== undefined ? overrideRedirect : defaultRedirect
      const overrideTitle = opts.getCreatedNotificationTitle
        ? await opts.getCreatedNotificationTitle({ replica: created, source })
        : undefined
      const title = overrideTitle !== undefined ? overrideTitle : `${R.labelSingular} replicated`
      return {
        redirect,
        notify: { title, type: 'success' } as never,
      }
    })
    .visible(({ user }) => callPredicate(R.canCreate, user))
}

/**
 * Plan #13 — Restore factory. POSTs to the resource's restore route,
 * success-styled, no confirm prompt (restoration is reversible).
 * Auto-hides on live (non-trashed) rows AND when `R.canRestore(user,
 * record)` returns false. Same `recordId` semantics as `editAction`.
 */
export function restoreAction(R: ResourceLike, basePath: string, recordId?: string): Action {
  const id = recordId ?? ':id'
  return Action.make('restore')
    .label('Restore')
    .color('success')
    .method('post')
    .action(`${resourceBase(basePath, R)}/${id}/restore`)
    .visible(async ({ user, record }) => {
      if (!isTrashed(record, R)) return false
      return callPredicate(R.canRestore, user, record)
    })
}

/**
 * Plan #13 — Force-delete factory. POSTs to the resource's
 * force-delete route, destructive-styled, with a stricter confirm
 * prompt referencing permanence. Auto-hides on live (non-trashed)
 * rows AND when `R.canForceDelete(user, record)` returns false.
 */
export function forceDeleteAction(R: ResourceLike, basePath: string, recordId?: string): Action {
  const id = recordId ?? ':id'
  return Action.make('forceDelete')
    .label('Delete forever')
    .destructive()
    .method('post')
    .action(`${resourceBase(basePath, R)}/${id}/force-delete`)
    .confirm(`Permanently delete this ${R.labelSingular.toLowerCase()}? This cannot be undone.`)
    .visible(async ({ user, record }) => {
      if (!isTrashed(record, R)) return false
      return callPredicate(R.canForceDelete, user, record)
    })
}

/**
 * Mark-as-read factory — POSTs to the panel's notification read
 * endpoint for the given notification id. The endpoint
 * (`${base}/_notifications/:id/read`) is mounted by
 * `Pilotiq.databaseNotifications()`, so calling this without
 * opting into the bell surface produces an Action whose POST 404s.
 *
 * `notificationId` is baked at config time. For row context where
 * the id varies per row, omit it and the URL keeps the `:id`
 * template; the renderer substitutes per-row at render time
 * (parallel to `editAction`'s row form).
 *
 * No auto-visibility. Wrap in `.visible(({ record }) => !record.readAt)`
 * to hide on already-read rows.
 */
export function markAsReadAction(basePath: string, notificationId?: string): Action {
  const id = notificationId ?? ':id'
  return Action.make('markAsRead')
    .label('Mark as read')
    .method('post')
    .action(`${basePath}/_notifications/${id}/read`)
}
