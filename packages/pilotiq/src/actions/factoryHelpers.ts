/**
 * Shared helpers for the Action factory modules — `crudFactories.ts`,
 * `bulkFactories.ts`, `relationFactories.ts`, `m2mFactories.ts`.
 *
 * Lives in its own file so the per-phase factory modules stay focused
 * on their own factory bodies. Anything consumed by 2+ phase files
 * lands here; phase-local helpers stay alongside their phase's
 * factories.
 *
 * See `docs/plans/action-split.md` for the split plan.
 */

import type { ResourceLike } from './Action.js'
import type { RelationManagerContext } from '../RelationManager.js'

/** Cluster-aware resource base path. Mirrors `clusterPaths.resourceBasePath`
 *  but uses the structural `ResourceLike` shape so `Action.ts` stays
 *  cycle-free against `Resource.ts`. */
export function resourceBase(basePath: string, R: ResourceLike): string {
  if (R.cluster) return `${basePath}/${R.cluster.getSlug()}/${R.getSlug()}`
  return `${basePath}/${R.getSlug()}`
}

/** Call a (possibly undefined) Resource predicate. When unset, the
 * predicate is treated as "allowed" (returns true) so the factory
 * doesn't hide actions on Resources that haven't opted into Plan #10. */
export function callPredicate(
  fn: ((user: unknown, record?: unknown) => boolean | Promise<boolean>) | undefined,
  user: unknown,
  record?: unknown,
): boolean | Promise<boolean> {
  if (!fn) return true
  return fn(user, record)
}

/** Read `record[R.deletedAtColumn ?? 'deletedAt']` and return true when
 *  the row is currently trashed (soft-deleted). Permissive on shape —
 *  bare `null` / `undefined` count as live; any other truthy value is
 *  trashed. */
export function isTrashed(record: unknown, R: ResourceLike): boolean {
  if (!record || typeof record !== 'object') return false
  const col = R.deletedAtColumn ?? 'deletedAt'
  const v = (record as Record<string, unknown>)[col]
  return v !== null && v !== undefined
}

/** True when a `RelationManagerContext.mode` denotes a pivot-mutation
 *  shape — i.e. a many-to-many relation. All three modes share the
 *  `attach` / `detach` / `sync` accessor surface (the rudder ORM stamps
 *  + filters the polymorphic discriminator transparently for the morph
 *  variants). The `relationCreate / Edit / Delete` factories auto-hide
 *  under any of these modes because per-pivot-row create / edit / delete
 *  is meaningless — users create the related record via its own Resource,
 *  then attach via `relationAttach`. */
export function isM2MMode(mode: RelationManagerContext['mode']): boolean {
  return mode === 'belongsToMany' || mode === 'morphToMany' || mode === 'morphedByMany'
}

/**
 * Build the URL prefix for a relation factory action. Without
 * a `chain` (depth-1 manager), this is the familiar
 * `${base}/${parentSlug}/${parentId}/${relationship}`. With a chain
 * (depth-2 nested manager), it threads the outer record + relationship
 * between the parent slug and the leaf parent id:
 *
 *   `${base}/${parentSlug}/${chain[0].recordId}/${chain[0].relationship}/${parentId}/${relationship}`
 *
 * Pure; takes a `RelationManagerContext` and emits a string. The leaf
 * record id (and trailing `/edit`, `/delete`, etc.) gets appended by
 * the caller.
 */
export function relationUrlPrefix(ctx: RelationManagerContext): string {
  const head = `${ctx.basePath}/${ctx.parentSlug}`
  const chain = ctx.chain ?? []
  let mid = ''
  for (const step of chain) {
    mid += `/${step.recordId}/${step.relationship}`
  }
  return `${head}${mid}/${ctx.parentId}/${ctx.relationship}`
}
