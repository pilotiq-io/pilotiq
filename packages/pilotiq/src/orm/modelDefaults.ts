import type { Column } from '../Column.js'
import type { Table, TableRecordsHandler, TableRecordsResult } from '../elements/Table.js'
import type { SaveHandler, LoadRecordHandler, FormContext } from '../elements/Form.js'

/**
 * SQL-style operators understood by `ModelLike.query()`. Mirrors the
 * `WhereOperator` set from `@rudderjs/contracts` so any rudder Model is
 * structurally assignable to `ModelLike` — but pilotiq doesn't import
 * `@rudderjs/contracts` here to keep this file dependency-light.
 */
export type ModelWhereOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'IN' | 'NOT IN'

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

/** Default `Form.loadRecord` handler for resources with `static model = …`. */
export function modelLoadRecord(M: ModelLike): LoadRecordHandler {
  return async (id: string): Promise<unknown> => M.find(id)
}

/**
 * Build a default `Table.records` handler from a `ModelLike` plus the
 * `Table` instance the page just configured. Reads the column children
 * to drive search (any `Column.searchable()` joins via `LIKE`/`orWhere`)
 * and sort fallback (`Table.defaultSort()` when the URL didn't override).
 *
 * The handler hits `model.query().paginate(page, perPage)` once per
 * page render — search/sort/pagination all push down to the ORM rather
 * than loading everything and slicing in memory.
 */
export function modelTableRecords(M: ModelLike, table: Table): TableRecordsHandler {
  // Snapshot the column-derived config at handler-construction time so
  // we don't re-walk the children on every request.
  const columns: Column[]    = table.getColumns()
  const searchable: string[] = columns.filter(c => c.isSearchable()).map(c => c.name)
  const filters             = table.getFilters()

  return async (ctx): Promise<TableRecordsResult> => {
    let q = M.query()

    if (ctx.search && searchable.length > 0) {
      const needle = `%${ctx.search}%`
      searchable.forEach((col, i) => {
        q = i === 0
          ? q.where(col, 'LIKE', needle)
          : q.orWhere(col, 'LIKE', needle)
      })
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
      const needle = `%${ctx.search}%`
      searchable.forEach((col, i) => {
        q = i === 0
          ? q.where(col, 'LIKE', needle)
          : q.orWhere(col, 'LIKE', needle)
      })
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

    if (ctx.sort) {
      q = q.orderBy(ctx.sort.column, ctx.sort.direction === 'desc' ? 'DESC' : 'ASC')
    }

    const page    = ctx.page    ?? 1
    const perPage = ctx.perPage ?? table.getPerPage() ?? 15

    const result = await q.paginate(page, perPage)
    return { rows: result.data, total: result.total }
  }
}
