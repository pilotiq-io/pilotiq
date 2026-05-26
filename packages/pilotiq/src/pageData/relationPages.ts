import type { Pilotiq, PilotiqConfig } from '../Pilotiq.js'
import { livePanel } from '../PilotiqRegistry.js'
import type { ResourceClass } from '../Resource.js'
import { resourceBasePath } from '../clusterPaths.js'
import { Element } from '../schema/Element.js'
import { resolveSchema, type SchemaContext } from '../schema/resolveSchema.js'
import { Form } from '../elements/Form.js'
import { Table } from '../elements/Table.js'
import { Column } from '../Column.js'
import { findForms } from '../elements/dispatchForm.js'
import { Filter } from '../filters/Filter.js'
import { TrashedFilter } from '../filters/TrashedFilter.js'
import { loadTableRecords } from '../elements/dispatchTable.js'
import { consumeFlashedNotifications } from '../notifications/flash.js'
import { serializeIcon, type SerializedIcon } from '../icons/types.js'
import {
  RelationManager,
  safeManagerPolicy as safeManagerPolicyImpl,
  type ManagerCanMethod as ManagerCanMethodType,
  type RelationManagerContext,
} from '../RelationManager.js'
import { RelationTabs } from '../schema/RelationTabs.js'
import {
  findRecord,
  getMorphRelationDescriptor,
  getPrimaryKey,
  getRelationType,
  modelLoadRecord,
  modelRelationTableRecords,
  modelSave,
  type ModelLike,
  type ModelQuery,
} from '../orm/modelDefaults.js'
import { normalizeRelationMode, type RelationMode } from '../RelationManager.js'
import {
  nestedRelationCreateBreadcrumbs,
  nestedRelationEditBreadcrumbs,
  nestedRelationListBreadcrumbs,
  nestedRelationViewBreadcrumbs,
  relationCreateBreadcrumbs,
  relationEditBreadcrumbs,
  relationListBreadcrumbs,
  relationViewBreadcrumbs,
  type RelationChainStep,
} from './breadcrumbs.js'
import {
  applyFillPipeline,
  applyRelationshipBuilderFill,
  applyRelationshipRepeaterFill,
  callPageSchema,
  resolveServerDataElements,
  tagActionDispatch,
  tagCellEditUrls,
  tagFormActions,
  tagTableDeferred,
  tagTableReorderUrls,
  tagWidgetUrls,
  uploadCtx,
  userCtx,
} from './helpers.js'
import {
  applyRoleHooks,
  panelInfo,
  type PanelInfoRoute,
} from './navigation.js'
import {
  buildNestedRelationTabs,
  buildRelationTabs,
  deriveParentTitle,
  safeBool,
} from './relationTabs.js'

// ─── Plan #11 relation-manager data builders ────────────────
//
// Depth-1 + depth-2 relation manager URL roles (list / create / view /
// edit) for a parent record's manager-scoped projection. Each builder
// loads the parent + manager + (optionally) child, runs the two-layer
// policy gate (parent canAccess+canEdit, then manager-scope canX), and
// resolves a tab strip + form/table from the manager's configurators.
// Submit-side handlers live in `routes.ts`.




// ─── Plan #11 relation-manager data builder ─────────────────

/**
 * Plan #11 — three scopes a single relation-manager URL space resolves to:
 *
 *   list:    GET    {base}/{slug}/:id/{rel}
 *   create:  GET    {base}/{slug}/:id/{rel}/create
 *   edit:    GET    {base}/{slug}/:id/{rel}/{childId}/edit
 *
 * Each carries enough state for `relationManagerData` to load the right
 * parent + (for edit) child + form/table context. Submit-side handlers
 * live in `routes.ts` and reuse `dispatchFormSubmit`.
 */
export type RelationManagerScope =
  | { kind: 'relation-list';   slug: string; recordId: string; relationship: string; query?: Record<string, string> }
  | { kind: 'relation-create'; slug: string; recordId: string; relationship: string; prefill?: { values?: Record<string, unknown>; errors?: Record<string, string[]> } }
  | { kind: 'relation-view';   slug: string; recordId: string; relationship: string; childId: string }
  | { kind: 'relation-edit';   slug: string; recordId: string; relationship: string; childId: string; prefill?: { values?: Record<string, unknown>; errors?: Record<string, string[]> } }
  // Phase B nested resources — the leaf is one manager deeper than the
  // depth-1 variants. The two-step `chain` carries the (recordId,
  // relationship) for each layer; the trailing `childId` (when present)
  // is the leaf record's id under chain[1].
  | { kind: 'nested-relation-list';   slug: string; chain: [RelationChainStep, RelationChainStep]; query?: Record<string, string> }
  | { kind: 'nested-relation-create'; slug: string; chain: [RelationChainStep, RelationChainStep]; prefill?: { values?: Record<string, unknown>; errors?: Record<string, string[]> } }
  | { kind: 'nested-relation-view';   slug: string; chain: [RelationChainStep, RelationChainStep]; childId: string }
  | { kind: 'nested-relation-edit';   slug: string; chain: [RelationChainStep, RelationChainStep]; childId: string; prefill?: { values?: Record<string, unknown>; errors?: Record<string, string[]> } }

/** Phase B — one parent layer in a nested-resources URL chain. The list
 *  of these identifies a path through the manager tree:
 *    `[ { recordId: '123', relationship: 'comments' } ]` picks comment
 *    "456 under post 123" when paired with `childId: '456'`. */
// `RelationChainStep` now lives in `./pageData/breadcrumbs.ts` since
// both the breadcrumb builders and the depth-2 relation manager
// builders consume it. Re-exported below for back-compat with any
// external callsite that imports through `pageData.js`.

/**
 * Failure outcomes the data builder discriminates back to the route
 * handler, which decides between 403 / 404 / HTML / JSON shapes.
 *
 *   `null`            — unknown panel / parent / manager / child;
 *                        route returns 404
 *   `{ ok: false, status: 403 }` — policy denied; route returns 403
 *
 * Success returns the schemaData payload directly (a record, not
 * tagged) for parity with `resourceIndexData / resourceCreateData`.
 */
export type RelationManagerResult =
  | Record<string, unknown>
  | { ok: false; status: 403 }
  | null

/**
 * Discover the related Resource for a manager. Order:
 *   1. `M.relatedResource` explicit override (skip discovery).
 *   2. Rudder ORM convention: walk
 *      `R.model.relations[manager.relationship].model()` and find
 *      `cfg.resources[i].model === relatedModel`.
 *   3. Otherwise undefined — caller must error or fall back.
 *
 * A returned Resource is the one whose `model` backs the related
 * table. Callers use it for `Related.model.find(childId)`,
 * `Related.canEdit(user, child)`, and the auto-wired form save handler.
 */
export function findRelatedResource(
  M:   typeof RelationManager,
  R:   ResourceClass,
  cfg: ReturnType<Pilotiq['getConfig']>,
): ResourceClass | undefined {
  if (M.relatedResource) return M.relatedResource
  const ParentModel = R.model as unknown as { relations?: Record<string, { model?: () => unknown }> } | undefined
  if (!ParentModel) return undefined
  const def = ParentModel.relations?.[M.getRelationship()]
  const RelatedModel = typeof def?.model === 'function' ? def.model() : undefined
  if (!RelatedModel) return undefined
  return cfg.resources.find(r => (r.model as unknown) === RelatedModel)
}

/** Find a registered manager on a Resource by its relationship key.
 *  Throws on unknown manager — so the route can 404 cleanly. */
function findManager(
  R:            ResourceClass,
  relationship: string,
): typeof RelationManager | undefined {
  return R.relations().find(M => {
    try { return M.getRelationship() === relationship } catch { return false }
  })
}

/**
 * Verify a child record actually belongs to the given parent under the
 * declared relationship. Anti-IDOR — without this an attacker can swap
 * the `:childId` segment to load any related-model row regardless of
 * whether it's actually owned by the parent.
 *
 * Strategy: re-resolve the parent's relation query and check whether
 * the child's primary key shows up in `where(pk, '=', childId).paginate(1, 1)`.
 * Yes, it's a second round-trip — but it's the single point of trust
 * for IDOR safety, and it fits naturally into the same query path
 * `modelRelationTableRecords` uses.
 */
async function childBelongsToParent(
  parentModel:  ModelLike,
  parent:       unknown,
  relationship: string,
  childPk:      string,
  childId:      string,
): Promise<boolean> {
  try {
    const q: ModelQuery = (parentModel.relatedQuery
      ? parentModel.relatedQuery(parent, relationship)
      : (parent as { related: (n: string) => ModelQuery }).related(relationship))
      .where(childPk, '=', childId)
    if (q.first) return (await q.first()) !== null
    const result = await q.paginate(1, 1)
    return result.total > 0
  } catch {
    return false
  }
}

/**
 * Auto-wire the manager's table records loader against the parent's
 * relation query when the user didn't set `Table.records()` themselves.
 * Mirrors `defaultPages`'s wiring of `Table.records()` from `R.model`
 * for the resource list page.
 */
function autoWireManagerTable(
  table:        Table,
  parentModel:  ModelLike,
  parent:       unknown,
  relationship: string,
): void {
  if (table.getRecords()) return  // user wired it explicitly
  table.records(modelRelationTableRecords(parentModel, parent, relationship, table))
}

/**
 * Plan #13 polish — auto-inject `TrashedFilter` on a relation manager's
 * table when the **related** Resource opts into soft deletes. Mirrors the
 * resource-list pattern in `defaultPages.applyTableDefaults`. The check
 * is on the related Resource (not the manager), because soft-delete is a
 * model-level capability — if the child model supports trashing, the
 * manager's table should expose the toggle.
 *
 * No-op when:
 *   - the related Resource hasn't set `softDeletes = true`
 *   - the user already attached a `TrashedFilter` in `M.table()`
 */
function injectManagerTrashedFilter(
  table:   Table,
  Related: ResourceClass | undefined,
): void {
  if (!Related?.softDeletes) return
  const children = table.getChildren() ?? []
  const hasTrashed = children.some(c => c instanceof TrashedFilter)
  if (hasTrashed) return
  const existing = children.filter(c => c instanceof Filter) as Filter[]
  table.filters([...existing, TrashedFilter.make()])
}

/**
 * Auto-wire the manager's form save + loadRecord handlers against the
 * **related** Resource's `model` when the user didn't set them. The
 * route handler is responsible for stamping the parent context
 * (parent, parentRecord, parentId, relationship) onto the
 * `FormContext` so user-supplied `mutateDataBeforeCreate` etc. can
 * read them.
 */
function autoWireManagerForm(form: Form, Related: ResourceClass): void {
  const RelatedModel = Related.model
  if (!RelatedModel) return
  if (!form.getSave())       form.save(modelSave(RelatedModel))
  if (!form.getLoadRecord()) form.loadRecord(modelLoadRecord(Related))
}

/** Plan #11 — authorization predicate names a `RelationManager` carries.
 *  Re-exported from `RelationManager.ts`. */
export type ManagerCanMethod = ManagerCanMethodType

/** Plan #11 — authorize a relation-manager action with sensible defaults.
 *  Re-exported from `RelationManager.ts` so external callers (route
 *  handlers, third-party plugins) keep their existing import path. */
export const safeManagerPolicy = safeManagerPolicyImpl

/**
 * Plan #11 — render data for the three relation-manager URL scopes.
 * Mirrors the resource* builders' shape so routes and Vike +data hooks
 * consume identical props. Authorization runs inline (parent
 * `canAccess + canEdit(parent)` then manager-scoped predicate); IDOR
 * check on `relation-edit` runs against the parent's relation query.
 *
 * Returns:
 *   - `null` when panel / parent / manager / child don't exist.
 *   - `{ ok: false, status: 403 }` when authorization denies.
 *   - the props record on success (route picks SSR view / SPA prop
 *     downstream).
 */
export async function relationManagerData(
  pilotiq: Pilotiq,
  scope:   RelationManagerScope,
  req?:    unknown,
): Promise<RelationManagerResult> {
  pilotiq = livePanel(pilotiq)
  // Phase B nested-relation-* scopes split out into their own pipeline
  // — the chain walking + per-layer auth differs enough from the
  // depth-1 path that interleaving them would mostly hurt readability.
  if (scope.kind === 'nested-relation-list'
   || scope.kind === 'nested-relation-create'
   || scope.kind === 'nested-relation-view'
   || scope.kind === 'nested-relation-edit') {
    return nestedRelationManagerData(pilotiq, scope, req)
  }

  const cfg = pilotiq.getConfig()

  const R = pilotiq.findResource(scope.slug)
  if (!R) return null

  const M = findManager(R, scope.relationship)
  if (!M) return null

  const user = await pilotiq.resolveUser(req)

  // Layer 1: parent access. canAccess gates the resource entirely;
  // canEdit gates managing its relations (managers are read-write
  // surfaces — read-only inline views opt in by overriding the
  // manager's can*). Cluster gate composes with R.canAccess — both
  // must pass when the parent resource is inside a cluster.
  const [clusterOk, accessOk] = await Promise.all([
    R.cluster ? safeBool(() => R.cluster!.canAccess(user)) : Promise.resolve(true),
    safeBool(() => R.canAccess(user)),
  ])
  if (!clusterOk || !accessOk) return { ok: false, status: 403 }

  if (!R.model) {
    // Without a model on the parent we can't load the parent record,
    // and without that we can't IDOR-check children. Point users at
    // the missing wiring rather than silent 500s.
    throw new Error(
      `[Pilotiq] Resource "${R.name}" has relations(${M.name}) but no static model. ` +
      `Set Resource.model = … to enable relation managers, or remove the manager.`,
    )
  }

  const parentRecord = await findRecord(R, scope.recordId, { user }).catch(() => undefined)
  if (!parentRecord) return null

  if (!await safeBool(() => R.canEdit(user, parentRecord))) return { ok: false, status: 403 }

  // Read the relation type off the parent's relations map once,
  // normalize to the six-way `RelationMode` the manager-side logic
  // uses. `belongsToMany` / `morphToMany` (owning polymorphic) /
  // `morphedByMany` (inverse polymorphic) all flip into pivot-mutation
  // mode (attach / detach / sync — same accessor surface), `morphMany|
  // morphOne` collapses to `'morphMany'` (parent-side polymorphic —
  // auto-fills morph columns on create), `morphTo` is the child-side
  // polymorphic (no auto-actions; requires explicit `M.relatedResource`).
  // Everything else collapses to `'hasMany'`.
  const relationType = getRelationType(R.model, scope.relationship)
  const mode: RelationMode = normalizeRelationMode(relationType)

  const Related = findRelatedResource(M, R, cfg)
  // Related Resource is required for: edit/create form auto-wire,
  // child loading on edit, related URL generation. Throw when missing
  // *only* if we'd otherwise need it — for `relation-list` it's
  // optional (the table can be hand-wired by the user).
  const needRelated = scope.kind !== 'relation-list'
  if (needRelated && !Related) {
    throw new Error(
      `[Pilotiq] RelationManager ${M.name} on ${R.name} could not resolve its related Resource. ` +
      `Set static relatedResource on the manager, or ensure the parent's model declares relations[${JSON.stringify(M.getRelationship())}].`,
    )
  }

  switch (scope.kind) {
    case 'relation-list':
      return buildRelationListData(pilotiq, R, M, Related, parentRecord, scope, req, user, mode)
    case 'relation-create':
      return buildRelationCreateData(pilotiq, R, M, Related!, parentRecord, scope, req, user, mode)
    case 'relation-view':
      return buildRelationViewData(pilotiq, R, M, Related!, parentRecord, scope, req, user, mode)
    case 'relation-edit':
      return buildRelationEditData(pilotiq, R, M, Related!, parentRecord, scope, req, user, mode)
  }
}

async function buildRelationListData(
  pilotiq: Pilotiq,
  R: ResourceClass,
  M: typeof RelationManager,
  Related: ResourceClass | undefined,
  parentRecord: unknown,
  scope: Extract<RelationManagerScope, { kind: 'relation-list' }>,
  req: unknown,
  user: unknown,
  mode: RelationMode,
): Promise<RelationManagerResult> {
  if (!await safeManagerPolicy(M, 'canViewAny', Related, user, parentRecord)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const resourceBase = resourceBasePath(base, R)
  const listUrl = `${resourceBase}/${scope.recordId}/${scope.relationship}`

  // Build a single Table by piping a fresh Table through M.table(table, ctx).
  // Context lets the user wire `Action.relationCreate / relationEdit /
  // relationDelete(M, ctx)` factories inside `static table()` to template
  // URLs without threading basePath / parentId by hand.
  const managerCtx = buildRelationManagerCtx(base, scope, parentRecord, Related, mode)
  const table = M.table(Table.make(), managerCtx)
  autoWireManagerTable(table, R.model as ModelLike, parentRecord, scope.relationship)
  injectManagerTrashedFilter(table, Related)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'table',
    basePath: base,
    record:   parentRecord,
  }, user), cfg)

  const elements: Element[] = [table]
  tagActionDispatch(elements, listUrl)
  // Independent work — records load against the parent's relation
  // accessor; tabs probe per-tab `safeManagerPolicy` predicates that
  // don't touch the records pipeline.
  const [, tabs] = await Promise.all([
    loadTableRecords(elements, scope.query ?? {}, listUrl, user),
    buildRelationTabs(R, scope.recordId, base, scope.relationship, user, parentRecord),
  ])
  if (tabs) elements.unshift(tabs)

  const breadcrumbs = relationListBreadcrumbs(
    cfg, R, M, scope.recordId, deriveParentTitle(R, parentRecord),
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const relationListRoute: PanelInfoRoute = { resource: R, recordId: scope.recordId }
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, relationListRoute),
    resolveSchema(elements, ctx).then(metas => applyRoleHooks(pilotiq, user, 'relation-list', metas, relationListRoute)),
  ])

  return {
    pageType: 'relation-list',
    panel,
    title:    M.getLabel(),
    resource: { name: R.name, label: R.label, labelSingular: R.labelSingular, slug: scope.slug, icon: serializeIcon(R.icon, R.name) },
    relation: {
      name:          M.name,
      label:         M.getLabel(),
      labelSingular: M.getLabelSingular(),
      relationship:  scope.relationship,
      icon:          M.getIcon() ? serializeIcon(M.getIcon()!, M.name) : undefined,
      relatedSlug:   Related?.getSlug(),
    },
    parent: {
      id:    scope.recordId,
      title: deriveParentTitle(R, parentRecord),
    },
    basePath: base,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
  }
}

async function buildRelationCreateData(
  pilotiq: Pilotiq,
  R: ResourceClass,
  M: typeof RelationManager,
  Related: ResourceClass,
  parentRecord: unknown,
  scope: Extract<RelationManagerScope, { kind: 'relation-create' }>,
  req: unknown,
  user: unknown,
  mode: RelationMode,
): Promise<RelationManagerResult> {
  if (!await safeManagerPolicy(M, 'canCreate', Related, user, parentRecord)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const resourceBase = resourceBasePath(base, R)
  const createUrl = `${resourceBase}/${scope.recordId}/${scope.relationship}/create`

  const managerCtx = buildRelationManagerCtx(base, scope, parentRecord, Related, mode)
  const form = M.form(Form.make(), managerCtx)
  if (Related.model) autoWireManagerForm(form, Related)

  const elements: Element[] = [form]
  tagFormActions(elements, createUrl)

  if (scope.prefill) {
    if (scope.prefill.values) form.withValues(scope.prefill.values)
    if (scope.prefill.errors) form.withErrors(scope.prefill.errors)
  }

  const tabs = await buildRelationTabs(R, scope.recordId, base, scope.relationship, user, parentRecord)
  if (tabs) elements.unshift(tabs)

  const breadcrumbs = relationCreateBreadcrumbs(
    cfg, R, M, scope.recordId, deriveParentTitle(R, parentRecord),
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'create',
    basePath: base,
    record:   parentRecord,
  }, user), cfg)

  const relationCreateRoute: PanelInfoRoute = { resource: R, recordId: scope.recordId }
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, relationCreateRoute),
    resolveSchema(elements, ctx).then(metas => applyRoleHooks(pilotiq, user, 'relation-create', metas, relationCreateRoute)),
  ])

  return {
    pageType: 'relation-create',
    panel,
    title:    `Create ${M.getLabelSingular()}`,
    resource: { name: R.name, label: R.labelSingular, slug: scope.slug, icon: serializeIcon(R.icon, R.name) },
    relation: {
      name:          M.name,
      label:         M.getLabel(),
      labelSingular: M.getLabelSingular(),
      relationship:  scope.relationship,
      icon:          M.getIcon() ? serializeIcon(M.getIcon()!, M.name) : undefined,
      relatedSlug:   Related.getSlug(),
    },
    parent: {
      id:    scope.recordId,
      title: deriveParentTitle(R, parentRecord),
    },
    mode:     'create' as const,
    basePath: base,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
    ...(scope.prefill?.errors ? { hasErrors: true } : {}),
  }
}

/**
 * Phase A — read-only view page for a related record at depth-2:
 * `${base}/${slug}/:id/${rel}/:childId`. Mirrors `buildRelationEditData`'s
 * IDOR + auth posture but resolves the manager's `static detail(child,
 * parent)` instead of its form. The default `detail()` returns `[]` —
 * managers opt in by overriding it; the chrome (RelationTabs strip)
 * still renders so users can sideways-nav between sibling managers.
 */
async function buildRelationViewData(
  pilotiq: Pilotiq,
  R: ResourceClass,
  M: typeof RelationManager,
  Related: ResourceClass,
  parentRecord: unknown,
  scope: Extract<RelationManagerScope, { kind: 'relation-view' }>,
  req: unknown,
  user: unknown,
  _mode: RelationMode,
): Promise<RelationManagerResult> {
  if (!Related.model) {
    throw new Error(
      `[Pilotiq] Cannot load child record for ${M.name}: Related Resource ${Related.name} has no static model.`,
    )
  }
  const childPk = getPrimaryKey(Related.model)

  const [belongs, child] = await Promise.all([
    childBelongsToParent(R.model as ModelLike, parentRecord, scope.relationship, childPk, scope.childId),
    findRecord(Related, scope.childId, { user }).catch(() => undefined),
  ])
  if (!belongs || !child) return null

  if (!await safeManagerPolicy(M, 'canView', Related, user, parentRecord, child)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path

  const elements: Element[] = M.detail(child, parentRecord)

  // Phase B polish — when M declares nested managers, surface them on
  // this page too. The strip lists the leaf parent's view tab plus one
  // tab per sibling nested manager so users can jump from the Phase A
  // view straight into a grandchild list / create / view / edit page.
  // Active key `'__view'` because the user is currently viewing the
  // leaf parent record itself, not any nested manager.
  const nestedTabs = await buildNestedRelationTabs(
    R, M, base,
    { recordId: scope.recordId, relationship: scope.relationship },
    scope.childId,
    '__view',
    user, child,
  )
  if (nestedTabs) elements.unshift(nestedTabs)

  const tabs = await buildRelationTabs(R, scope.recordId, base, scope.relationship, user, parentRecord)
  if (tabs) elements.unshift(tabs)

  const childTitle = deriveParentTitle(Related, child, M)
  const breadcrumbs = relationViewBreadcrumbs(
    cfg, R, M, scope.recordId,
    deriveParentTitle(R, parentRecord),
    childTitle,
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'view',
    basePath: base,
    record:   child,
    recordId: scope.childId,
  }, user), cfg)

  const relationViewRoute: PanelInfoRoute = { resource: R, recordId: scope.childId }
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, relationViewRoute),
    resolveSchema(elements, ctx).then(metas => applyRoleHooks(pilotiq, user, 'relation-view', metas, relationViewRoute)),
  ])

  return {
    pageType: 'relation-view',
    panel,
    title:    childTitle,
    resource: { name: R.name, label: R.labelSingular, slug: scope.slug, icon: serializeIcon(R.icon, R.name) },
    relation: {
      name:          M.name,
      label:         M.getLabel(),
      labelSingular: M.getLabelSingular(),
      relationship:  scope.relationship,
      icon:          M.getIcon() ? serializeIcon(M.getIcon()!, M.name) : undefined,
      relatedSlug:   Related.getSlug(),
    },
    parent: {
      id:    scope.recordId,
      title: deriveParentTitle(R, parentRecord),
    },
    mode:     'view' as const,
    childId:  scope.childId,
    basePath: base,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
  }
}

async function buildRelationEditData(
  pilotiq: Pilotiq,
  R: ResourceClass,
  M: typeof RelationManager,
  Related: ResourceClass,
  parentRecord: unknown,
  scope: Extract<RelationManagerScope, { kind: 'relation-edit' }>,
  req: unknown,
  user: unknown,
  mode: RelationMode,
): Promise<RelationManagerResult> {
  if (!Related.model) {
    throw new Error(
      `[Pilotiq] Cannot load child record for ${M.name}: Related Resource ${Related.name} has no static model.`,
    )
  }
  const childPk = getPrimaryKey(Related.model)

  // IDOR check + child load in parallel. Both fail-paths collapse to
  // the same `return null` so behavior matches the serial version; the
  // independent queries (parent's relation accessor vs related model's
  // find) save one RTT on every relation-edit request.
  const [belongs, child] = await Promise.all([
    childBelongsToParent(R.model as ModelLike, parentRecord, scope.relationship, childPk, scope.childId),
    findRecord(Related, scope.childId, { user }).catch(() => undefined),
  ])
  if (!belongs || !child) return null

  if (!await safeManagerPolicy(M, 'canEdit', Related, user, parentRecord, child)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const resourceBase = resourceBasePath(base, R)
  const editUrl = `${resourceBase}/${scope.recordId}/${scope.relationship}/${scope.childId}/edit`

  const managerCtx = buildRelationManagerCtx(base, scope, parentRecord, Related, mode)
  const form = M.form(Form.make(), managerCtx)
  autoWireManagerForm(form, Related)

  const elements: Element[] = [form]
  tagFormActions(elements, editUrl)

  // Prefill values: explicit prefill (re-render after 422) wins,
  // otherwise pipe the loaded child through Form's fill pipeline.
  if (scope.prefill?.values) {
    form.withValues(scope.prefill.values)
    if (scope.prefill.errors) form.withErrors(scope.prefill.errors)
  } else if (child != null) {
    const values = await applyFillPipeline(form, child)
    form.withValues(values)
  }

  const tabs = await buildRelationTabs(R, scope.recordId, base, scope.relationship, user, parentRecord)
  if (tabs) elements.unshift(tabs)

  const childTitle = deriveParentTitle(Related, child, M)
  const breadcrumbs = relationEditBreadcrumbs(
    cfg, R, M, scope.recordId,
    deriveParentTitle(R, parentRecord),
    scope.childId,
    childTitle,
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'edit',
    basePath: base,
    record:   child,
    recordId: scope.childId,
  }, user), cfg)

  const relationEditRoute: PanelInfoRoute = { resource: R, recordId: scope.childId }
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, relationEditRoute),
    resolveSchema(elements, ctx).then(metas => applyRoleHooks(pilotiq, user, 'relation-edit', metas, relationEditRoute)),
  ])

  return {
    pageType: 'relation-edit',
    panel,
    title:    `Edit ${childTitle}`,
    resource: { name: R.name, label: R.labelSingular, slug: scope.slug, icon: serializeIcon(R.icon, R.name) },
    relation: {
      name:          M.name,
      label:         M.getLabel(),
      labelSingular: M.getLabelSingular(),
      relationship:  scope.relationship,
      icon:          M.getIcon() ? serializeIcon(M.getIcon()!, M.name) : undefined,
      relatedSlug:   Related.getSlug(),
    },
    parent: {
      id:    scope.recordId,
      title: deriveParentTitle(R, parentRecord),
    },
    mode:     'edit' as const,
    childId:  scope.childId,
    basePath: base,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
    ...(scope.prefill?.errors ? { hasErrors: true } : {}),
  }
}

// ─── Phase B nested-relation pipeline ────────────────────────

/**
 * Phase B — narrow `scope` discriminator for nested-relation-*. Lets
 * the helpers below avoid restating the union for every parameter.
 */
type NestedRelationScope = Extract<RelationManagerScope, { kind: `nested-relation-${string}` }>

/**
 * Phase B — chain walk result. Resolved layer-by-layer in
 * `resolveRelationChain`; nested builders consume it. Failures bubble
 * up as the same `{ ok: false, status: 403 }` / `null` shape the
 * depth-1 path uses.
 */
export interface ResolvedChain {
  R:                ResourceClass
  parentRecord:     unknown
  M1:               typeof RelationManager
  Related1:         ResourceClass
  child1:           unknown
  child1Mode:       RelationMode
  M2:               typeof RelationManager
  Related2:         ResourceClass | undefined
  child2Mode:       RelationMode
}

/**
 * Phase B — resolve a depth-2 chain, running every auth + IDOR layer:
 *   Layer 0 — top-level Resource: cluster gate, R.canAccess.
 *   Layer 1 — parent record: R.canEdit(parent) (Phase A gate to manage relations).
 *   Layer 2 — first manager M1: relationship discovered, related resource discovered.
 *   IDOR #1 — child1 (the leaf parent) must belong to parentRecord under chain[0].relationship.
 *   Layer 3 — M1.canView(child1, parent) (Filament-style: must be allowed
 *             to view the child to drill into its sub-relations).
 *   Layer 4 — second manager M2 lookup; relation type read off Related1.model.
 *
 * The leaf manager's per-scope predicate (canViewAny / canCreate /
 * canView / canEdit) runs inside the per-scope builders below, since
 * each predicate has different arguments.
 */
export async function resolveRelationChain(
  pilotiq: Pilotiq,
  scope:   NestedRelationScope,
  user:    unknown,
): Promise<ResolvedChain | { ok: false; status: 403 } | null> {
  pilotiq = livePanel(pilotiq)
  const cfg = pilotiq.getConfig()

  const R = pilotiq.findResource(scope.slug)
  if (!R) return null

  // Layer 0 — same gates as the depth-1 pipeline.
  const [clusterOk, accessOk] = await Promise.all([
    R.cluster ? safeBool(() => R.cluster!.canAccess(user)) : Promise.resolve(true),
    safeBool(() => R.canAccess(user)),
  ])
  if (!clusterOk || !accessOk) return { ok: false, status: 403 }

  if (!R.model) {
    throw new Error(
      `[Pilotiq] Resource "${R.name}" has nested relations but no static model. ` +
      `Set Resource.model = … or remove the manager.`,
    )
  }

  const [step0, step1] = scope.chain
  const parentRecord = await findRecord(R, step0.recordId, { user }).catch(() => undefined)
  if (!parentRecord) return null

  // Layer 1 — parent record gate.
  if (!await safeBool(() => R.canEdit(user, parentRecord))) return { ok: false, status: 403 }

  // Layer 2 — first manager M1.
  const M1 = findManager(R, step0.relationship)
  if (!M1) return null
  const Related1 = findRelatedResource(M1, R, cfg)
  if (!Related1) {
    throw new Error(
      `[Pilotiq] RelationManager ${M1.name} on ${R.name} could not resolve its related Resource. ` +
      `Set static relatedResource on the manager, or ensure the parent's model declares relations[${JSON.stringify(M1.getRelationship())}].`,
    )
  }
  if (!Related1.model) {
    throw new Error(
      `[Pilotiq] Related Resource ${Related1.name} has no static model — ` +
      `cannot resolve nested manager chain through it.`,
    )
  }
  const child1Mode: RelationMode = normalizeRelationMode(getRelationType(R.model, step0.relationship))

  // IDOR #1 + child1 load in parallel — confirm the leaf parent
  // (`step1.recordId`) actually belongs to the top parent under the
  // first relationship key. Independent queries.
  const child1Pk = getPrimaryKey(Related1.model)
  const [belongs1, child1] = await Promise.all([
    childBelongsToParent(R.model as ModelLike, parentRecord, step0.relationship, child1Pk, step1.recordId),
    findRecord(Related1, step1.recordId, { user }).catch(() => undefined),
  ])
  if (!belongs1 || !child1) return null

  // Layer 3 — M1.canView(child1, parent) gate. Filament-style: viewing
  // the child is the prerequisite for entering its nested manager strip.
  if (!await safeManagerPolicy(M1, 'canView', Related1, user, parentRecord, child1)) return { ok: false, status: 403 }

  // Layer 4 — second manager M2 declared under M1.relations().
  const M2 = M1.relations().find(N => {
    try { return N.getRelationship() === step1.relationship } catch { return false }
  })
  if (!M2) return null
  const Related2 = findRelatedResource(M2, Related1, cfg)
  const child2Mode: RelationMode = normalizeRelationMode(getRelationType(Related1.model, step1.relationship))

  return { R, parentRecord, M1, Related1, child1, child1Mode, M2, Related2, child2Mode }
}

/**
 * Phase B dispatcher — splits the four nested scopes onto their builders
 * after the shared chain walk. Mirrors the depth-1 `relationManagerData`
 * function shape.
 */
async function nestedRelationManagerData(
  pilotiq: Pilotiq,
  scope:   NestedRelationScope,
  req?:    unknown,
): Promise<RelationManagerResult> {
  const user = await pilotiq.resolveUser(req)
  const resolved = await resolveRelationChain(pilotiq, scope, user)
  if (resolved === null) return null
  if ('ok' in resolved) return resolved

  // For create / view / edit we strictly need a registered Related2 so
  // we can load the leaf record + auto-wire the form save.
  const needRelated2 = scope.kind !== 'nested-relation-list'
  if (needRelated2 && !resolved.Related2) {
    throw new Error(
      `[Pilotiq] Nested RelationManager ${resolved.M2.name} under ${resolved.M1.name} ` +
      `on ${resolved.R.name} could not resolve its related Resource. ` +
      `Set static relatedResource on the manager, or ensure the parent's model declares ` +
      `relations[${JSON.stringify(resolved.M2.getRelationship())}].`,
    )
  }

  switch (scope.kind) {
    case 'nested-relation-list':
      return buildNestedRelationListData(pilotiq, scope, resolved, req, user)
    case 'nested-relation-create':
      return buildNestedRelationCreateData(pilotiq, scope, resolved, req, user)
    case 'nested-relation-view':
      return buildNestedRelationViewData(pilotiq, scope, resolved, req, user)
    case 'nested-relation-edit':
      return buildNestedRelationEditData(pilotiq, scope, resolved, req, user)
  }
}

/** Phase B — build the manager context for a nested leaf manager. The
 *  parent here is `child1` (the chain's leaf parent record); the URL
 *  prefix comes from `scope.chain[0]` via `Action.relation*` factories
 *  reading `ctx.chain`. */
/** Depth-1 manager context constructor — mirror of `nestedManagerCtx` for
 *  the four `relation-*` page roles. Three call sites (list / create / edit)
 *  build identical shapes; the helper keeps them in lock-step. */
function buildRelationManagerCtx(
  base:         string,
  scope:        { slug: string; recordId: string; relationship: string },
  parentRecord: unknown,
  Related:      ResourceClass | undefined,
  mode:         RelationMode,
): RelationManagerContext {
  return {
    basePath:     base,
    parentSlug:   scope.slug,
    parentId:     scope.recordId,
    relationship: scope.relationship,
    parentRecord,
    related:      Related,
    mode,
  }
}

function nestedManagerCtx(
  base:     string,
  scope:    NestedRelationScope,
  resolved: ResolvedChain,
): RelationManagerContext {
  const [step0, step1] = scope.chain
  return {
    basePath:     base,
    parentSlug:   resolved.R.getSlug(),
    parentId:     step1.recordId,           // immediate parent = child1's id
    relationship: step1.relationship,       // leaf manager's relationship
    parentRecord: resolved.child1,          // immediate parent record = child1
    related:      resolved.Related2,
    mode:         resolved.child2Mode,
    chain:        [{
      slug:         resolved.R.getSlug(),
      recordId:     step0.recordId,
      relationship: step0.relationship,
    }],
  }
}

/** Phase B — assemble the response shape that mirrors the depth-1
 *  builders but adds a `chain` array so renderers can build breadcrumbs
 *  and back-links without re-deriving them. */
function nestedResponseEnvelope(
  pageType: 'nested-relation-list' | 'nested-relation-create' | 'nested-relation-view' | 'nested-relation-edit',
  pilotiq:  Pilotiq,
  base:     string,
  scope:    NestedRelationScope,
  resolved: ResolvedChain,
  req:      unknown,
): {
  pageType: typeof pageType
  title:    string
  resource: { name: string; label?: string | undefined; slug: string; icon?: SerializedIcon | undefined }
  parentRelation: { name: string; relationship: string; label: string; relatedSlug?: string | undefined }
  parentChild:    { id: string; title: string }
  relation:       { name: string; relationship: string; label: string; labelSingular: string; icon?: SerializedIcon | undefined; relatedSlug?: string | undefined }
  parent:         { id: string; title: string }
  basePath: string
  layout:   PilotiqConfig['layout']
  notifications: ReturnType<typeof consumeFlashedNotifications>
} {
  const { R, M1, Related1, child1, M2, Related2 } = resolved
  const [step0, step1] = scope.chain
  const parentChildTitle = deriveParentTitle(Related1, child1, M1)

  // List + create derive from the leaf manager; view + edit override
  // this after the spread with the grandchild record's title.
  const title = pageType === 'nested-relation-create'
    ? `Create ${M2.getLabelSingular()}`
    : M2.getLabel()

  return {
    pageType,
    title,
    resource: { name: R.name, label: R.labelSingular, slug: R.getSlug(), icon: serializeIcon(R.icon, R.name) },
    parentRelation: {
      name:         M1.name,
      relationship: step0.relationship,
      label:        M1.getLabel(),
      relatedSlug:  Related1.getSlug(),
    },
    parentChild: {
      id:    step1.recordId,
      title: parentChildTitle,
    },
    relation: {
      name:          M2.name,
      relationship:  step1.relationship,
      label:         M2.getLabel(),
      labelSingular: M2.getLabelSingular(),
      icon:          M2.getIcon() ? serializeIcon(M2.getIcon()!, M2.name) : undefined,
      relatedSlug:   Related2?.getSlug(),
    },
    parent: {
      // Top-of-chain record — same shape the depth-1 builders ship as
      // `parent` so renderers can reuse the back-to-resource link.
      id:    step0.recordId,
      title: deriveParentTitle(R, resolved.parentRecord),
    },
    basePath: base,
    layout:   pilotiq.getConfig().layout,
    notifications: consumeFlashedNotifications(req),
  }
}

async function buildNestedRelationListData(
  pilotiq:  Pilotiq,
  scope:    Extract<NestedRelationScope, { kind: 'nested-relation-list' }>,
  resolved: ResolvedChain,
  req:      unknown,
  user:     unknown,
): Promise<RelationManagerResult> {
  const { Related1, child1, M2, Related2 } = resolved

  if (!await safeManagerPolicy(M2, 'canViewAny', Related2, user, child1)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const [step0, step1] = scope.chain
  const resourceBase = resourceBasePath(base, resolved.R)
  const listUrl = `${resourceBase}/${step0.recordId}/${step0.relationship}/${step1.recordId}/${step1.relationship}`

  const managerCtx = nestedManagerCtx(base, scope, resolved)
  const table = M2.table(Table.make(), managerCtx)
  if (Related1.model) {
    autoWireManagerTable(table, Related1.model as ModelLike, child1, step1.relationship)
  }
  injectManagerTrashedFilter(table, Related2)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'table',
    basePath: base,
    record:   child1,
  }, user), cfg)

  const elements: Element[] = [table]
  tagActionDispatch(elements, listUrl)
  const [, tabs] = await Promise.all([
    loadTableRecords(elements, scope.query ?? {}, listUrl, user),
    buildNestedRelationTabs(resolved.R, resolved.M1, base, scope.chain[0], scope.chain[1].recordId, scope.chain[1].relationship, user, resolved.child1),
  ])
  if (tabs) elements.unshift(tabs)

  const breadcrumbs = nestedRelationListBreadcrumbs(
    cfg, resolved.R, resolved.M1, M2, scope.chain[0],
    deriveParentTitle(resolved.R, resolved.parentRecord),
    scope.chain[1].recordId,
    deriveParentTitle(Related1, child1, resolved.M1),
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const nestedListRoute: PanelInfoRoute = { resource: resolved.R, recordId: scope.chain[1].recordId }
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, nestedListRoute),
    resolveSchema(elements, ctx).then(metas => applyRoleHooks(pilotiq, user, 'relation-list', metas, nestedListRoute)),
  ])

  return {
    ...nestedResponseEnvelope('nested-relation-list', pilotiq, base, scope, resolved, req),
    panel,
    schemaData,
  }
}

async function buildNestedRelationCreateData(
  pilotiq:  Pilotiq,
  scope:    Extract<NestedRelationScope, { kind: 'nested-relation-create' }>,
  resolved: ResolvedChain,
  req:      unknown,
  user:     unknown,
): Promise<RelationManagerResult> {
  const { child1, M2, Related2 } = resolved

  if (!await safeManagerPolicy(M2, 'canCreate', Related2, user, child1)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const [step0, step1] = scope.chain
  const resourceBase = resourceBasePath(base, resolved.R)
  const createUrl = `${resourceBase}/${step0.recordId}/${step0.relationship}/${step1.recordId}/${step1.relationship}/create`

  const managerCtx = nestedManagerCtx(base, scope, resolved)
  const form = M2.form(Form.make(), managerCtx)
  if (Related2?.model) autoWireManagerForm(form, Related2)

  const elements: Element[] = [form]
  tagFormActions(elements, createUrl)

  if (scope.prefill) {
    if (scope.prefill.values) form.withValues(scope.prefill.values)
    if (scope.prefill.errors) form.withErrors(scope.prefill.errors)
  }

  const tabs = await buildNestedRelationTabs(resolved.R, resolved.M1, base, scope.chain[0], scope.chain[1].recordId, scope.chain[1].relationship, user, resolved.child1)
  if (tabs) elements.unshift(tabs)

  const breadcrumbs = nestedRelationCreateBreadcrumbs(
    cfg, resolved.R, resolved.M1, M2, scope.chain[0],
    deriveParentTitle(resolved.R, resolved.parentRecord),
    scope.chain[1].recordId,
    deriveParentTitle(resolved.Related1, child1, resolved.M1),
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'create',
    basePath: base,
    record:   child1,
  }, user), cfg)

  const nestedCreateRoute: PanelInfoRoute = { resource: resolved.R, recordId: scope.chain[1].recordId }
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, nestedCreateRoute),
    resolveSchema(elements, ctx).then(metas => applyRoleHooks(pilotiq, user, 'relation-create', metas, nestedCreateRoute)),
  ])

  return {
    ...nestedResponseEnvelope('nested-relation-create', pilotiq, base, scope, resolved, req),
    panel,
    mode:     'create' as const,
    schemaData,
    ...(scope.prefill?.errors ? { hasErrors: true } : {}),
  }
}

async function buildNestedRelationViewData(
  pilotiq:  Pilotiq,
  scope:    Extract<NestedRelationScope, { kind: 'nested-relation-view' }>,
  resolved: ResolvedChain,
  req:      unknown,
  user:     unknown,
): Promise<RelationManagerResult> {
  const { Related1, child1, M2, Related2 } = resolved
  if (!Related2?.model) {
    throw new Error(
      `[Pilotiq] Cannot load child record for nested manager ${M2.name}: ` +
      `Related Resource ${Related2?.name ?? '(none)'} has no static model.`,
    )
  }
  const [, step1] = scope.chain
  const child2Pk = getPrimaryKey(Related2.model)

  const [belongs2, child2] = await Promise.all([
    childBelongsToParent(Related1.model as ModelLike, child1, step1.relationship, child2Pk, scope.childId),
    findRecord(Related2, scope.childId, { user }).catch(() => undefined),
  ])
  if (!belongs2 || !child2) return null

  if (!await safeManagerPolicy(M2, 'canView', Related2, user, child1, child2)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path

  const elements: Element[] = M2.detail(child2, child1)

  const tabs = await buildNestedRelationTabs(resolved.R, resolved.M1, base, scope.chain[0], scope.chain[1].recordId, scope.chain[1].relationship, user, resolved.child1)
  if (tabs) elements.unshift(tabs)

  const child2Title = deriveParentTitle(Related2, child2, M2)
  const breadcrumbs = nestedRelationViewBreadcrumbs(
    cfg, resolved.R, resolved.M1, M2, scope.chain[0],
    deriveParentTitle(resolved.R, resolved.parentRecord),
    scope.chain[1].recordId,
    deriveParentTitle(Related1, child1, resolved.M1),
    child2Title,
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'view',
    basePath: base,
    record:   child2,
    recordId: scope.childId,
  }, user), cfg)

  const nestedViewRoute: PanelInfoRoute = { resource: resolved.R, recordId: scope.childId }
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, nestedViewRoute),
    resolveSchema(elements, ctx).then(metas => applyRoleHooks(pilotiq, user, 'relation-view', metas, nestedViewRoute)),
  ])

  return {
    ...nestedResponseEnvelope('nested-relation-view', pilotiq, base, scope, resolved, req),
    panel,
    title:    child2Title,
    mode:     'view' as const,
    childId:  scope.childId,
    schemaData,
  }
}

async function buildNestedRelationEditData(
  pilotiq:  Pilotiq,
  scope:    Extract<NestedRelationScope, { kind: 'nested-relation-edit' }>,
  resolved: ResolvedChain,
  req:      unknown,
  user:     unknown,
): Promise<RelationManagerResult> {
  const { Related1, child1, M2, Related2 } = resolved
  if (!Related2?.model) {
    throw new Error(
      `[Pilotiq] Cannot load child record for nested manager ${M2.name}: ` +
      `Related Resource ${Related2?.name ?? '(none)'} has no static model.`,
    )
  }
  const [step0, step1] = scope.chain
  const child2Pk = getPrimaryKey(Related2.model)

  const [belongs2, child2] = await Promise.all([
    childBelongsToParent(Related1.model as ModelLike, child1, step1.relationship, child2Pk, scope.childId),
    findRecord(Related2, scope.childId, { user }).catch(() => undefined),
  ])
  if (!belongs2 || !child2) return null

  if (!await safeManagerPolicy(M2, 'canEdit', Related2, user, child1, child2)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const resourceBase = resourceBasePath(base, resolved.R)
  const editUrl = `${resourceBase}/${step0.recordId}/${step0.relationship}/${step1.recordId}/${step1.relationship}/${scope.childId}/edit`

  const managerCtx = nestedManagerCtx(base, scope, resolved)
  const form = M2.form(Form.make(), managerCtx)
  autoWireManagerForm(form, Related2)

  const elements: Element[] = [form]
  tagFormActions(elements, editUrl)

  if (scope.prefill?.values) {
    form.withValues(scope.prefill.values)
    if (scope.prefill.errors) form.withErrors(scope.prefill.errors)
  } else if (child2 != null) {
    const values = await applyFillPipeline(form, child2)
    form.withValues(values)
  }

  const tabs = await buildNestedRelationTabs(resolved.R, resolved.M1, base, scope.chain[0], scope.chain[1].recordId, scope.chain[1].relationship, user, resolved.child1)
  if (tabs) elements.unshift(tabs)

  const child2Title = deriveParentTitle(Related2, child2, M2)
  const breadcrumbs = nestedRelationEditBreadcrumbs(
    cfg, resolved.R, resolved.M1, M2, scope.chain[0],
    deriveParentTitle(resolved.R, resolved.parentRecord),
    scope.chain[1].recordId,
    deriveParentTitle(Related1, child1, resolved.M1),
    scope.childId,
    child2Title,
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'edit',
    basePath: base,
    record:   child2,
    recordId: scope.childId,
  }, user), cfg)

  const nestedEditRoute: PanelInfoRoute = { resource: resolved.R, recordId: scope.childId }
  const [panel, schemaData] = await Promise.all([
    panelInfo(pilotiq, req, nestedEditRoute),
    resolveSchema(elements, ctx).then(metas => applyRoleHooks(pilotiq, user, 'relation-edit', metas, nestedEditRoute)),
  ])

  return {
    ...nestedResponseEnvelope('nested-relation-edit', pilotiq, base, scope, resolved, req),
    panel,
    title:    `Edit ${child2Title}`,
    mode:     'edit' as const,
    childId:  scope.childId,
    schemaData,
    ...(scope.prefill?.errors ? { hasErrors: true } : {}),
  }
}
