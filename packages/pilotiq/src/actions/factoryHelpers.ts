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

/** Options bag for `buildReplica`. Optional fields explicitly accept
 *  `undefined` so call sites can pass `opts.excludeAttributes` through
 *  unconditionally under `exactOptionalPropertyTypes: true`. */
export interface BuildReplicaOptions {
  /** Attribute keys to drop from the replicated payload IN ADDITION TO
   *  the model's primary key and soft-delete column. */
  excludeAttributes?: readonly string[] | undefined
  /** Soft-delete column name on the source Resource. Defaults to
   *  `'deletedAt'`. Read separately from the model because the column
   *  lives on the Resource shape (`R.deletedAtColumn`) rather than on
   *  the model itself. */
  deletedAtColumn?: string | undefined
  /** Force-pinned columns applied AFTER the strip and BEFORE the user
   *  `beforeReplicaSaved` mutator. Used by the relation replicate
   *  factories to re-stamp the parent attachment FK / morph columns
   *  so a tampered source row can't slip a different parent in. */
  pin?: Record<string, unknown> | undefined
  /** Optional user mutator. Runs after the strip + pin. */
  beforeReplicaSaved?: ((
    replica: Record<string, unknown>,
    source:  unknown,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>) | undefined
}

/**
 * Build a replica payload from a source record. Used by every replicate
 * factory (`replicateAction / bulkReplicateAction / relationReplicateAction
 * / relationBulkReplicateAction`).
 *
 * Strips the model's primary key (`model.primaryKey`, defaulting to
 * `'id'`), the soft-delete column (defaulting to `'deletedAt'`), and any
 * `excludeAttributes` keys. Applies `pin` columns (parent attachment
 * for relation factories), then runs the optional `beforeReplicaSaved`
 * user mutator. Returns the replica AND the resolved primary-key column
 * name (callers need it to read `created[pkCol]` for redirect URLs).
 *
 * Does NOT call `model.create` — callers wrap their own create + error
 * handling around the returned replica.
 */
export async function buildReplica(
  source: unknown,
  model:  { primaryKey?: string },
  opts:   BuildReplicaOptions = {},
): Promise<{ replica: Record<string, unknown>; pkCol: string }> {
  const pkCol      = model.primaryKey ?? 'id'
  const trashedCol = opts.deletedAtColumn ?? 'deletedAt'
  const skip       = new Set<string>([pkCol, trashedCol, ...(opts.excludeAttributes ?? [])])
  let replica: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
    if (skip.has(k)) continue
    replica[k] = v
  }
  if (opts.pin) Object.assign(replica, opts.pin)
  if (opts.beforeReplicaSaved) {
    replica = await opts.beforeReplicaSaved(replica, source)
  }
  return { replica, pkCol }
}

/**
 * Iterate `records`, run the policy probe in parallel up-front (only
 * allowed rows enter the serial work loop), call `op(id, record)` per
 * allowed row, swallow per-row throws (the aggregate notification shows
 * the count succeeded). Returns the success count.
 *
 * Used by every bulk handler (`bulkDeleteAction / bulkRestoreAction /
 * bulkForceDeleteAction / bulkReplicateAction / relationBulkReplicateAction
 * / relationBulkDetachAction`-style pattern).
 *
 * Rows whose `record.id` coerces to an empty string are skipped without
 * counting them as an attempt. The policy probe runs via `Promise.all`
 * so backend round-trips parallelize, but the write loop stays serial
 * (no transaction in v1 — concurrent writes would muddy failure
 * semantics).
 */
export async function forEachAllowed(
  records:   readonly unknown[],
  isAllowed: (record: unknown, index: number) => boolean | Promise<boolean>,
  op:        (id: string, record: unknown, index: number) => Promise<void>,
): Promise<number> {
  const allowedFlags = await Promise.all(
    records.map((r, i) => isAllowed(r, i)),
  )
  let n = 0
  for (let i = 0; i < records.length; i++) {
    if (!allowedFlags[i]) continue
    const record = records[i]
    const id = String((record as { id?: unknown } | null | undefined)?.id ?? '')
    if (!id) continue
    try {
      await op(id, record, i)
      n++
    } catch { /* skip — agg notify shows total */ }
  }
  return n
}
