import type { Column } from '../Column.js'
import type { Table, TableRecordsHandler, TableRecordsResult } from '../elements/Table.js'
import type { SaveHandler, LoadRecordHandler, FormContext } from '../elements/Form.js'

/**
 * SQL-style operators understood by `ModelLike.query()`. Mirrors the
 * `WhereOperator` set from `@rudderjs/contracts` so any rudder Model is
 * structurally assignable to `ModelLike` — but pilotiq doesn't import
 * `@rudderjs/contracts` here to keep this file dependency-light.
 */
export type ModelWhereOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'NOT LIKE' | 'IN' | 'NOT IN'

/**
 * Context passed into `Resource.query(ctx)`. Carries the resolved user so
 * tenant-scoping / role-driven default ordering / etc. can branch on it.
 * Optional everywhere; bare `R.query()` calls receive `undefined`.
 */
export interface QueryContext {
  /** Whatever `Pilotiq.user(req => …)` returned for the current request.
   * `undefined` for anonymous routes or when no user resolver is set. */
  user?: unknown
}

/**
 * Minimal structural shape of a `Resource` class as far as the ORM helpers
 * here need to see it — `name` for diagnostics, `model` for the default
 * branch, and `query(ctx?)` for the override hook. Declared here (instead
 * of importing `ResourceClass` from `../Resource.js`) to avoid a
 * `Resource → modelDefaults → Resource` import cycle. The real
 * `Resource` static class is structurally assignable to this shape.
 */
export interface ResourceLike {
  name:    string
  model?:  ModelLike
  query(ctx?: QueryContext): ModelQuery
}

/**
 * Eloquent-style query builder pilotiq drives when it auto-generates
 * `Table.records()` / `Form.save()` / `Form.loadRecord()` from a
 * Resource's `static model`. Any query builder that satisfies this shape
 * works — the rudder `QueryBuilder<T>` from `@rudderjs/contracts` does,
 * and so does anything user-supplied with the same method names.
 */
export interface ModelQuery {
  where(column: string, value: unknown): ModelQuery
  where(column: string, operator: ModelWhereOperator, value: unknown): ModelQuery
  orWhere(column: string, value: unknown): ModelQuery
  orWhere(column: string, operator: ModelWhereOperator, value: unknown): ModelQuery
  orderBy(column: string, direction?: 'ASC' | 'DESC'): ModelQuery
  paginate(page: number, perPage?: number): Promise<{ data: unknown[]; total: number }>

  /**
   * Single-row `LIMIT 1` SELECT — Laravel-parity sibling of `paginate`
   * for the "first matching row" case. Optional on the structural shape;
   * the `@rudderjs/orm` `QueryBuilder` ships it, test stubs typically
   * don't. Callers that need it should fall back to
   * `(await q.paginate(1, 1)).data[0]` when absent — see `findRecord` /
   * `loadSingularRecord` / `childBelongsToParent` for the pattern.
   */
  first?(): Promise<unknown | null>

  /**
   * Plan #13 — soft-delete query scopes. Optional on the structural
   * shape; the `@rudderjs/orm-prisma` QueryBuilder ships them when
   * `Model.softDeletes = true`. Pilotiq's `TrashedFilter` checks for
   * presence at runtime and no-ops when missing (so non-soft-delete
   * resources don't pay the cost).
   */
  withTrashed?(): ModelQuery
  onlyTrashed?(): ModelQuery

  /**
   * Optional `IS NULL` clause used by `TernaryFilter`'s `'blank'` value.
   * When absent, `TernaryFilter` falls back to `where(name, null)` —
   * accurate against rudder's QueryBuilder, less reliable against bare
   * Knex/raw drivers. The rudder ORM ships this; the structural shape
   * keeps it optional so test stubs don't need to implement it.
   */
  whereNull?(column: string): ModelQuery

  /**
   * M2M pivot-extra projection — declares which pivot-table columns to
   * surface on each loaded related row under `row.pivot = { col: val }`.
   * Used by `Repeater.relationship.pivotColumns([...])`. No-op (or
   * irrelevant) on hasMany / morphMany queries; the rudder ORM
   * implements this only on the M2M deferred-QB family. Optional on
   * the structural shape so test stubs don't need to implement it.
   */
  withPivot?(...columns: string[]): ModelQuery

  /**
   * Wrap a chain of `where`/`orWhere` (and nested `whereGroup`s) in a
   * single AND-grouped clause. Used by `QueryBuilderFilter` v2 to
   * translate nested AND/OR trees into parenthesized SQL groups. The
   * callback receives a fresh sub-builder and may return it explicitly
   * or implicitly (`void`); in either case the clauses recorded inside
   * are spliced back into this builder as one composite clause.
   *
   * Optional on the structural shape — when missing, `applyTreeToQuery`
   * falls back to flat AND chaining (v1 behaviour). The rudder ORM ships
   * this on every QueryBuilder; test stubs don't have to.
   */
  whereGroup?(fn: (q: ModelQuery) => ModelQuery | void): ModelQuery

  /** OR-rooted variant of {@link whereGroup}. */
  orWhereGroup?(fn: (q: ModelQuery) => ModelQuery | void): ModelQuery
}

/**
 * Apply a multi-column `LIKE` search as a single grouped OR clause —
 * `(col0 LIKE x OR col1 LIKE x OR …)` — so it AND-composes with any
 * surrounding scope (soft-delete `deletedAt IS NULL`, a relation's
 * `foreignKey = parentId`, applied filters, a `Resource.query()`
 * override) instead of the OR leaking to the query root.
 *
 * Without the group, `scope.where(col0).orWhere(col1)` is adapter-
 * precedence-dependent: `@rudderjs/orm-prisma` ≥2.0 honours Laravel-
 * parity `(scope AND col0) OR col1`, which leaks scoped-out rows (e.g.
 * trashed records, or another parent's rows in a relation manager) into
 * search hits. Wrapping makes the result correct and adapter-independent.
 *
 * `whereGroup` is optional on {@link ModelQuery} (test stubs / bare
 * drivers skip it); when absent we fall back to the flat `where`/
 * `orWhere` chain — the legacy shape — for those callers.
 */
export function applyColumnSearch(q: ModelQuery, columns: string[], needle: string): ModelQuery {
  const build = (qb: ModelQuery): void => {
    columns.forEach((col, i) => {
      i === 0
        ? qb.where(col, 'LIKE', needle)
        : qb.orWhere(col, 'LIKE', needle)
    })
  }
  if (typeof q.whereGroup === 'function') {
    return q.whereGroup(g => { build(g) })
  }
  build(q)
  return q
}

/**
 * Structural shape pilotiq calls to wire ORM defaults. A class extending
 * `@rudderjs/orm`'s `Model` satisfies this automatically via its static
 * methods. Users with a different ORM can build their own object.
 */
export interface ModelLike {
  /** Primary-key column name. Defaults to `'id'`. */
  primaryKey?: string

  find(id: string | number):                                 Promise<unknown>
  create(data: Record<string, unknown>):                     Promise<unknown>
  update(id: string | number, data: Record<string, unknown>): Promise<unknown>
  delete(id: string | number):                               Promise<void>
  query():                                                   ModelQuery

  /**
   * Plan #11 — return a `ModelQuery` scoped to the given parent record's
   * relation. Optional. When absent, pilotiq falls back to the rudder ORM
   * convention `parent.related(relationName)`. Override when your ORM
   * doesn't follow that convention or when you need a custom join shape.
   */
  relatedQuery?(parent: unknown, relationName: string): ModelQuery

  /**
   * Plan #13 — restore a soft-deleted record. Optional on the structural
   * shape; rudder's `Model.restore` ships when `softDeletes = true`. Pilotiq
   * detects presence at boot when `Resource.softDeletes = true` and throws
   * a clear error pointing at the rudder upgrade if absent.
   */
  restore?(id: string | number): Promise<unknown>

  /**
   * Plan #13 — permanently delete a record (bypassing soft-delete).
   * Optional on the structural shape; same boot-time check as `restore`.
   */
  forceDelete?(id: string | number): Promise<void>

  /**
   * Reorderable rows — write a new explicit ordering for the rows whose
   * primary keys are in `ids`. The implementation overwrites the
   * configured sort column (`Table.reorderable(col)`) so each id's value
   * matches its position in the array (1..n). Optional on the structural
   * shape; pilotiq throws a clear boot error when `Table.reorderable()`
   * is set but this is missing.
   */
  reorder?(ids: Array<string | number>): Promise<void>
}

/** Read the configured primary key (default `'id'`) off a `ModelLike`. */
export function getPrimaryKey(M: ModelLike): string {
  return M.primaryKey ?? 'id'
}

/**
 * Default `Form.save` handler for resources with `static model = …`.
 * Discriminates create vs update by reading the primary-key off
 * `ctx.record` (set by the route handler in edit mode after `loadRecord`
 * + `fillFromRecord`). Create mode has no `ctx.record`, so we hit
 * `model.create(data)`.
 */
export function modelSave(M: ModelLike): SaveHandler {
  return async (data: Record<string, unknown>, ctx: FormContext): Promise<unknown> => {
    const pk       = getPrimaryKey(M)
    const existing = ctx.record as Record<string, unknown> | undefined
    const id       = existing?.[pk] as string | number | undefined
    if (id !== undefined && id !== null) {
      return M.update(id, data)
    }
    return M.create(data)
  }
}

/**
 * Default `Form.loadRecord` handler for resources with `static model = …`.
 * Routes through `R.query(ctx)` so tenant scopes / default-ordering hooks
 * the user installed on `Resource.query(ctx)` ALSO scope the per-record
 * load — without this, a tampered `:id` URL could load a record outside
 * the user's scope and pass it to the form for editing. Falls back to the
 * bare `M.find(id)` only when `R.query()` is missing — defensive against
 * test stubs that hand-roll a partial Resource shape.
 */
export function modelLoadRecord(R: ResourceLike): LoadRecordHandler {
  return async (id: string, ctx): Promise<unknown> => {
    const user = (ctx as { user?: unknown } | undefined)?.user
    const found = await findRecord(R, id, user !== undefined ? { user } : undefined)
    return found ?? null
  }
}

/**
 * Default `Form.loadRecord` handler for the singular-record settings
 * pattern — one row in a table, auto-loaded on every page render.
 * `Global` subclasses with `static model = M` set get this wired
 * automatically by `defaultGlobalEditPage`.
 *
 * Default strategy: `.first()` — i.e. the first matching row. Pass
 * `findSingular` to switch to a fixed-id lookup
 * (`(q) => q.where('id', '=', 1)`) or a slug-style lookup
 * (`(q) => q.where('key', '=', 'site')`).
 *
 * Returns `null` when no row exists yet — the paired `modelSave(M)`
 * handler will then run `M.create(data)` on the first POST so the
 * record auto-creates on first save.
 */
export function loadSingularRecord(
  M:     ModelLike,
  opts?: { findSingular?: (q: ModelQuery) => ModelQuery },
): LoadRecordHandler {
  return async (): Promise<unknown> => {
    let q = M.query()
    if (opts?.findSingular) q = opts.findSingular(q)
    if (q.first) return (await q.first()) ?? null
    const result = await q.paginate(1, 1)
    const data = (result?.data ?? []) as unknown[]
    return data[0] ?? null
  }
}

/**
 * Find a record by primary key through `R.query(ctx)`. The standard
 * "load record for edit / view / policy" path — replaces direct
 * `R.model.find(id)` calls so user `Resource.query` overrides scope the
 * lookup too. Returns `undefined` when no row matches (or no `R.model`
 * is set), letting callers convert to 404 / fail closed.
 *
 * Soft-delete restore / force-delete deliberately bypass this helper —
 * those paths build their own `query().withTrashed().where(pk, id)` so a
 * record's own user-installed scope (which typically excludes trashed
 * rows) doesn't hide a row the operator is trying to recover.
 */
export async function findRecord<T = unknown>(
  R:   ResourceLike,
  id:  string | number,
  ctx?: QueryContext,
): Promise<T | undefined> {
  const M = R.model
  if (!M) return undefined
  const pk = getPrimaryKey(M)
  const q = R.query(ctx).where(pk, '=', id)
  if (q.first) return ((await q.first()) ?? undefined) as T | undefined
  const result = await q.paginate(1, 1)
  const data = (result?.data ?? []) as unknown[]
  return data[0] as T | undefined
}

/**
 * Build a default `Table.records` handler from a `Resource` class plus
 * the `Table` instance the page just configured. Reads the column
 * children to drive search (any `Column.searchable()` joins via
 * `LIKE`/`orWhere`) and sort fallback (`Table.defaultSort()` when the
 * URL didn't override).
 *
 * The handler hits `R.query(ctx).paginate(page, perPage)` once per page
 * render — search/sort/pagination all push down to the ORM rather than
 * loading everything and slicing in memory. Going through `R.query(ctx)`
 * (instead of `R.model.query()` directly) means user-installed scopes
 * — tenant filters, default ordering, soft-delete-default behavior —
 * apply to list pages out of the box.
 */
export function modelTableRecords(R: ResourceLike, table: Table): TableRecordsHandler {
  // Snapshot the column-derived config at handler-construction time so
  // we don't re-walk the children on every request.
  const columns: Column[]    = table.getColumns()
  const searchable: string[] = columns.filter(c => c.isSearchable()).map(c => c.name)
  const filters             = table.getFilters()

  return async (ctx): Promise<TableRecordsResult> => {
    const user = (ctx as { user?: unknown }).user
    let q = R.query(user !== undefined ? { user } : undefined)

    if (ctx.search && searchable.length > 0) {
      q = applyColumnSearch(q, searchable, `%${ctx.search}%`)
    }

    // Apply filters. Each Filter contributes a `where` clause with type
    // coercion based on its `kind` — boolean filters cast '1'/'true' to
    // a real boolean. Custom `Filter.query(fn)` overrides the default.
    const filterValues = ctx.filters ?? {}
    for (const filter of filters) {
      const value = filterValues[filter.name]
      if (value === undefined || value === '') continue
      const customQuery = filter.getQuery()
      if (customQuery) {
        q = customQuery(q, value)
      } else if (filter.getKind() === 'boolean') {
        const bool = value === '1' || value === 'true' || value === 'yes' || value === 'on'
        q = q.where(filter.name, bool)
      } else {
        q = q.where(filter.name, value)
      }
    }

    // Apply the active list-page tab's query modifier (from
    // `ListTab.modifyQuery(fn)`). Tabs are the primary axis (status,
    // type) and filters are secondary refinements within a tab — running
    // the tab's predicate after filters keeps that mental model intact
    // and lets a tab's narrower `where` win on collision.
    if (ctx.tabQuery) q = ctx.tabQuery(q)

    // Apply group drill-in scoper when the user clicked a banded heading.
    // Runs after filters + tab so the bucket narrowing composes on top of
    // whatever scope the page already had. User-supplied
    // `TableGroup.scopeQueryByKey(fn)` wins over the framework default
    // (exact-match `where(column, '=', key)` / whole-day range for date
    // groups); throwing scopers propagate so a config bug surfaces loudly
    // rather than silently rendering every row.
    if (ctx.groupScope) {
      const scope = ctx.groupScope
      const scoper = scope.group.resolveScoper<ModelQuery>()
      q = scoper(q, scope.key)
    }

    if (ctx.sort) {
      q = q.orderBy(ctx.sort.column, ctx.sort.direction === 'desc' ? 'DESC' : 'ASC')
    }

    const page    = ctx.page    ?? 1
    const perPage = ctx.perPage ?? table.getPerPage() ?? 15

    const result = await q.paginate(page, perPage)
    return { rows: result.data, total: result.total }
  }
}

// ─── Repeater.relationship — parent relation descriptor ──────

/**
 * Structural shape of a single entry in the parent model's
 * `static relations` map (rudder ORM convention). The `model` thunk
 * defers child-class resolution to call time so circular imports
 * between sibling models still work.
 *
 * Pilotiq doesn't import this from `@rudderjs/orm` — keeping the
 * shape duck-typed lets users stub a relations map for tests without
 * pulling in the full ORM.
 */
export interface ParentRelationDescriptor {
  /** Relation type. v1 of `Repeater.relationship` only handles `'hasMany'`. */
  type:        string
  /** Thunk returning the child model class (a `ModelLike`). */
  model:       () => ModelLike
  /** FK column on the child pointing back at the parent. */
  foreignKey:  string
}

/**
 * Read a single entry off a parent model's `static relations` map.
 * Returns `undefined` when the map is missing, the named relation is
 * absent, or the entry doesn't have the required `model` thunk +
 * `foreignKey` string. Callers (e.g. `Repeater.relationship`'s save
 * pipeline) throw a clear error from outside to surface configuration
 * problems eagerly.
 */
export function getParentRelationDescriptor(
  parentModel: ModelLike,
  name:        string,
): ParentRelationDescriptor | undefined {
  const relations = (parentModel as unknown as Record<string, unknown>)['relations']
  if (!relations || typeof relations !== 'object') return undefined
  const entry = (relations as Record<string, unknown>)[name]
  if (!entry || typeof entry !== 'object') return undefined
  const e = entry as Record<string, unknown>
  if (typeof e['foreignKey'] !== 'string') return undefined
  if (typeof e['model']      !== 'function') return undefined
  // `type` defaults to 'hasMany' when missing — keeps test stubs lean.
  const type = typeof e['type'] === 'string' ? (e['type'] as string) : 'hasMany'
  return {
    type,
    model:      e['model'] as () => ModelLike,
    foreignKey: e['foreignKey'] as string,
  }
}

/**
 * Read just the `type` field off a parent's `static relations[name]`.
 * Returns `'hasMany'` when the relations map is missing the entry or
 * doesn't expose a string `type` — same lenient default as
 * `getParentRelationDescriptor`. Used by `relationManagerData` to set
 * `RelationManagerContext.mode` for action injection / factory short-
 * circuiting under M2M. Doesn't require the `foreignKey` field that
 * `getParentRelationDescriptor` insists on, because M2M relations
 * don't carry one (they have pivot keys instead).
 */
export function getRelationType(
  parentModel: ModelLike,
  name:        string,
): string {
  const relations = (parentModel as unknown as Record<string, unknown>)['relations']
  if (!relations || typeof relations !== 'object') return 'hasMany'
  const entry = (relations as Record<string, unknown>)[name]
  if (!entry || typeof entry !== 'object') return 'hasMany'
  const e = entry as Record<string, unknown>
  return typeof e['type'] === 'string' ? (e['type'] as string) : 'hasMany'
}

/**
 * Many-to-many relation descriptor read off a parent's `static
 * relations[name]`. Returned by `getM2MRelationDescriptor` for the
 * three M2M variants (`belongsToMany`, `morphToMany`, `morphedByMany`).
 *
 * Shape is intentionally minimal — pilotiq's M2M dispatch uses the
 * `parent[rel]()` accessor for pivot writes, so neither `pivotTable`
 * nor `morphName` need to surface here. The `model` thunk is the only
 * field consumed by `Repeater.relationship`'s save pipeline (for
 * `M.create` / `M.update` calls on the related child).
 */
export interface M2MRelationDescriptor {
  /** Relation type. Discriminator for the `Repeater.relationship` M2M
   *  branches; all three share the same persist-side dispatch but the
   *  type round-trips into error messages and tests. */
  type:  'belongsToMany' | 'morphToMany' | 'morphedByMany'
  /** Thunk returning the related (child) model class. */
  model: () => ModelLike
}

/**
 * Read a many-to-many relation entry off a parent model's `static
 * relations[name]`. Returns `undefined` when the entry is missing,
 * isn't an M2M type, or doesn't carry a `model` thunk. Lenient on
 * the structural shape so test stubs can supply just `{ type, model }`.
 *
 * Caller responsibility: the lookup checks `relations[name].type`
 * against the three M2M variants. Other relation types (hasMany,
 * morphMany, etc.) return `undefined` so callers (e.g.
 * `resolveChildAndAttachment`) can fall through to the corresponding
 * descriptor lookup.
 */
export function getM2MRelationDescriptor(
  parentModel: ModelLike,
  name:        string,
): M2MRelationDescriptor | undefined {
  const relations = (parentModel as unknown as Record<string, unknown>)['relations']
  if (!relations || typeof relations !== 'object') return undefined
  const entry = (relations as Record<string, unknown>)[name]
  if (!entry || typeof entry !== 'object') return undefined
  const e    = entry as Record<string, unknown>
  const type = e['type']
  if (type !== 'belongsToMany' && type !== 'morphToMany' && type !== 'morphedByMany') return undefined
  if (typeof e['model'] !== 'function') return undefined
  return {
    type:  type as M2MRelationDescriptor['type'],
    model: e['model'] as () => ModelLike,
  }
}

/**
 * Polymorphic relation descriptor read off a parent's `static relations[name]`.
 * Returned by `getMorphRelationDescriptor` for `morphMany` / `morphOne` (where
 * the parent IS the polymorphic owner — `Post.comments`). For `morphTo`, the
 * `model` thunk is missing on the rudder side (the child has a `types: () =>
 * [...]` list instead) — `getMorphRelationDescriptor` returns `undefined` in
 * that case because `RelationManager` on the morphTo side requires
 * `M.relatedResource` to be set anyway (auto-discovery is impossible).
 */
export interface MorphRelationDescriptor {
  /** Polymorphic relation name. Drives column names: `{morphName}Id`,
   *  `{morphName}Type`. e.g. `'commentable'` → `commentableId` / `commentableType`. */
  morphName: string
  /** Override for the discriminator value persisted in `{morphName}Type`.
   *  Defaults to `parent.constructor.morphAlias ?? parent.constructor.name`
   *  when missing. */
  morphType?: string
  /** Thunk returning the related (child) model class — present for
   *  `morphMany` / `morphOne`, absent for `morphTo`. */
  model?: () => ModelLike
}

/**
 * Read a polymorphic-relation entry off a parent model's `static
 * relations[name]`. Returns `undefined` when the entry is missing,
 * isn't a polymorphic type, or doesn't carry a string `morphName`.
 * Lenient on the structural shape so test stubs can supply just the
 * fields the consumer needs.
 *
 * Caller responsibility: the lookup checks
 * `relations[name].type === 'morphMany' | 'morphOne'`. For `morphTo` —
 * which has no `model` thunk on the rudder side — this returns
 * `undefined`. The consumer (relation-create POST handler) only uses
 * this for the morphMany auto-injection path; morphTo managers don't
 * need it (they require `static relatedResource` and don't auto-fill
 * any columns).
 */
export function getMorphRelationDescriptor(
  parentModel: ModelLike,
  name:        string,
): MorphRelationDescriptor | undefined {
  const relations = (parentModel as unknown as Record<string, unknown>)['relations']
  if (!relations || typeof relations !== 'object') return undefined
  const entry = (relations as Record<string, unknown>)[name]
  if (!entry || typeof entry !== 'object') return undefined
  const e = entry as Record<string, unknown>
  const type = e['type']
  if (type !== 'morphMany' && type !== 'morphOne') return undefined
  if (typeof e['morphName'] !== 'string') return undefined
  return {
    morphName: e['morphName'] as string,
    ...(typeof e['morphType'] === 'string' ? { morphType: e['morphType'] as string } : {}),
    ...(typeof e['model']    === 'function' ? { model:     e['model']    as () => ModelLike } : {}),
  }
}

/**
 * Compute the `{ <morphName>Id, <morphName>Type }` payload for a
 * polymorphic write. Mirrors rudder's `Model.morph(name, parent)` but
 * lives here so pilotiq stays free of a runtime `@rudderjs/orm` dep.
 *
 * Resolution rules:
 * - `<morphName>Id` ← `parent[parent.constructor.primaryKey ?? 'id']`
 * - `<morphName>Type` ← `descriptor.morphType` if set, else
 *   `parent.constructor.morphAlias ?? parent.constructor.name`
 *
 * Throws when the parent's primary key is unset (matches rudder's
 * `Model.morph` behavior — a parent must be saved before a child can
 * be linked).
 */
export function computeMorphPayload(
  parent:     unknown,
  descriptor: MorphRelationDescriptor,
): Record<string, unknown> {
  const ctor = (parent as { constructor?: { name?: string; primaryKey?: string; morphAlias?: string } } | null | undefined)?.constructor
  const pkColumn = ctor?.primaryKey ?? 'id'
  const pk = (parent as Record<string, unknown> | null | undefined)?.[pkColumn]
  if (pk === undefined || pk === null) {
    throw new Error(
      `[Pilotiq] computeMorphPayload("${descriptor.morphName}", parent): ` +
      `parent.${pkColumn} is unset — parent record must be saved before linking a polymorphic child.`,
    )
  }
  const typeAlias = descriptor.morphType ?? ctor?.morphAlias ?? ctor?.name
  if (typeAlias === undefined) {
    throw new Error(
      `[Pilotiq] computeMorphPayload("${descriptor.morphName}", parent): ` +
      `cannot resolve discriminator — parent has no constructor.name or morphAlias. ` +
      `Set \`static morphAlias = '<value>'\` on the parent model, or pass \`morphType\` on the relation entry.`,
    )
  }
  return {
    [`${descriptor.morphName}Id`]:   pk,
    [`${descriptor.morphName}Type`]: typeAlias,
  }
}

// ─── Plan #11: relation helpers ────────────────────────────

/** Minimal shape we need on a parent record to resolve a relation under
 * the rudder ORM convention. */
interface ParentWithRelated {
  related(name: string): ModelQuery
}

/**
 * Default relation-query resolver. Calls `parent.related(relationName)`
 * — the rudder ORM convention — and returns the resulting `ModelQuery`.
 * Throws a clear error when the parent record doesn't expose `.related()`,
 * pointing the user at `ModelLike.relatedQuery` as the override slot.
 */
export function defaultRelatedQuery(parent: unknown, relationName: string): ModelQuery {
  const p = parent as Partial<ParentWithRelated>
  if (typeof p?.related !== 'function') {
    throw new Error(
      `[Pilotiq] Cannot resolve relation "${relationName}" — parent record has no .related() method. ` +
      `Implement ModelLike.relatedQuery(parent, name) on the parent's static model to provide a custom resolver.`,
    )
  }
  return (p as ParentWithRelated).related(relationName)
}

/**
 * Resolve a relation query by preferring the parent model's
 * `relatedQuery` override and falling back to the rudder convention.
 * The single entry point pilotiq's manager code calls.
 */
export function resolveRelatedQuery(
  M:           ModelLike,
  parent:      unknown,
  relationName: string,
): ModelQuery {
  if (typeof M.relatedQuery === 'function') {
    return M.relatedQuery(parent, relationName)
  }
  return defaultRelatedQuery(parent, relationName)
}

/**
 * Sibling of `modelTableRecords` for `RelationManager` tables. Drives
 * pagination/search/sort/filters against `parent.related(relationName)`
 * (or the parent model's `relatedQuery` override) instead of the related
 * model's bare `query()`. Used by the page-data builder when a manager's
 * `Table.records()` hasn't been set explicitly.
 *
 * `parentModel` is the **parent's** ModelLike (where `relatedQuery` lives
 * if a custom override was set); `parent` is the resolved parent record
 * instance the manager is scoped under.
 */
export function modelRelationTableRecords(
  parentModel:  ModelLike,
  parent:       unknown,
  relationName: string,
  table:        Table,
): TableRecordsHandler {
  const columns: Column[]    = table.getColumns()
  const searchable: string[] = columns.filter(c => c.isSearchable()).map(c => c.name)
  const filters             = table.getFilters()

  return async (ctx): Promise<TableRecordsResult> => {
    let q = resolveRelatedQuery(parentModel, parent, relationName)

    if (ctx.search && searchable.length > 0) {
      q = applyColumnSearch(q, searchable, `%${ctx.search}%`)
    }

    const filterValues = ctx.filters ?? {}
    for (const filter of filters) {
      const value = filterValues[filter.name]
      if (value === undefined || value === '') continue
      const customQuery = filter.getQuery()
      if (customQuery) {
        q = customQuery(q, value)
      } else if (filter.getKind() === 'boolean') {
        const bool = value === '1' || value === 'true' || value === 'yes' || value === 'on'
        q = q.where(filter.name, bool)
      } else {
        q = q.where(filter.name, value)
      }
    }

    if (ctx.tabQuery) q = ctx.tabQuery(q)

    // Group drill-in scoper — same shape as `modelTableRecords`. Composes
    // with `relatedQuery` since the scoper just chains another `where`.
    if (ctx.groupScope) {
      const scope  = ctx.groupScope
      const scoper = scope.group.resolveScoper<ModelQuery>()
      q = scoper(q, scope.key)
    }

    if (ctx.sort) {
      q = q.orderBy(ctx.sort.column, ctx.sort.direction === 'desc' ? 'DESC' : 'ASC')
    }

    const page    = ctx.page    ?? 1
    const perPage = ctx.perPage ?? table.getPerPage() ?? 15

    const result = await q.paginate(page, perPage)
    return { rows: result.data, total: result.total }
  }
}
