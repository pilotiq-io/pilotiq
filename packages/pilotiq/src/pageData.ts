/**
 * Per-page-role data builders. The framework's GET route handlers and
 * Vike's auto-generated `+data.ts` hooks both call these to produce the
 * exact props the page renderer needs.
 *
 * Why this exists: SSR runs through the rudder router (which calls
 * `view(...)` and populates `pageContext.viewProps`). SPA navigation only
 * triggers Vike's `+data` hook — the rudder handler doesn't run, so the
 * data needs to come from the same builder. Routing both paths through a
 * single builder keeps them in sync.
 */
import type { Pilotiq, PilotiqConfig } from './Pilotiq.js'
import { PilotiqRegistry } from './PilotiqRegistry.js'
import type { Page } from './Page.js'
import type { ResourceClass, NavigationBadgeColor } from './Resource.js'
import type { GlobalClass } from './Global.js'
import { resourceBasePath, globalBasePath, pageBasePath, clusterBasePath } from './clusterPaths.js'
import type { ClusterClass } from './Cluster.js'
import { Element, type ElementMeta } from './schema/Element.js'
import { Field } from './fields/Field.js'
import { resolveSchema, type RenderContext, type SchemaContext } from './schema/resolveSchema.js'
import { isServerDataElement, type ServerDataElement } from './schema/ServerDataElement.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { applyStateUpdate, coerceFormValues, findForms, findWizardStep, loadRelationRows, selectFormById } from './elements/dispatchForm.js'
import { isRepeaterField, RepeaterField } from './fields/RepeaterField.js'
import { isBuilderField, BuilderField } from './fields/BuilderField.js'
import { SelectField } from './fields/SelectField.js'
import { validateSchema } from './validation/index.js'
import { searchAllResources, type GlobalSearchResult } from './search.js'
import { loadTableRecords, findTables, type QueryParams } from './elements/dispatchTable.js'
import { findActions, findRowExtraActions } from './elements/dispatchAction.js'
import { Filter } from './filters/Filter.js'
import { TrashedFilter } from './filters/TrashedFilter.js'
import { ListTabs } from './elements/ListTabs.js'
import { ListTab } from './Tab.js'
import { resolveTheme } from './theme/resolve.js'
import type { ThemeMeta } from './theme/types.js'
import { consumeFlashedNotifications } from './notifications/flash.js'
import {
  notificationChannel,
  NOTIFICATION_CREATED_EVENT,
} from './notifications/broadcast.js'
import { serializeIcon, type SerializedIcon, type IconValue } from './icons/types.js'
import {
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
} from './RightPanel.js'
import type { UserMenuItemMeta } from './UserMenuItem.js'
import {
  RelationManager,
  safeManagerPolicy as safeManagerPolicyImpl,
  type ManagerCanMethod as ManagerCanMethodType,
  type RelationManagerContext,
} from './RelationManager.js'
import { RelationTabs, relationTab, type RelationTabMeta } from './schema/RelationTabs.js'
import { Breadcrumbs, type BreadcrumbItem } from './schema/Breadcrumbs.js'
import {
  resolveRenderHooks,
  CHROME_HOOK_NAMES,
  type RenderHookContext,
  type RenderHookMap,
  type RenderHookName,
} from './RenderHook.js'
import { applyPageHooks, pageHooksFor, type PageRole } from './applyPageHooks.js'
import {
  modelSave, modelLoadRecord, modelRelationTableRecords, findRecord, getPrimaryKey,
  getRelationType,
  getMorphRelationDescriptor,
  type ModelLike, type ModelQuery,
} from './orm/modelDefaults.js'
import { normalizeRelationMode, type RelationMode } from './RelationManager.js'
import {
  buildBreadcrumbs,
  clusterBreadcrumb,
  customPageBreadcrumbs,
  globalBreadcrumbs,
  homeBreadcrumb,
  nestedRelationCreateBreadcrumbs,
  nestedRelationEditBreadcrumbs,
  nestedRelationListBreadcrumbs,
  nestedRelationViewBreadcrumbs,
  relationBreadcrumbPrefix,
  relationCreateBreadcrumbs,
  relationEditBreadcrumbs,
  relationListBreadcrumbs,
  relationViewBreadcrumbs,
  resourceCreateBreadcrumbs,
  resourceEditBreadcrumbs,
  resourceListBreadcrumbs,
  resourceViewBreadcrumbs,
  type RelationChainStep,
} from './pageData/breadcrumbs.js'

// Re-export `RelationChainStep` so external callsites importing it via
// `./pageData.js` keep working.
export type { RelationChainStep } from './pageData/breadcrumbs.js'

import {
  applyFillPipeline,
  applyRelationshipBuilderFill,
  applyRelationshipRepeaterFill,
  callPageSchema,
  resolveServerDataElements,
  tagActionDispatch,
  tagCellEditUrls,
  tagFieldAiUrls,
  tagFormActions,
  tagFormStateUrls,
  tagFormWizardUrls,
  tagRichTextMentionUrls,
  tagSelectCreateOptionUrls,
  tagTableDeferred,
  tagTableReorderUrls,
  tagWidgetUrls,
  uploadCtx,
  userCtx,
  type ServerDataMap,
} from './pageData/helpers.js'

// Re-export `ServerDataMap` so external imports via `./pageData.js` keep
// working — the type is also surfaced from `packages/pilotiq/src/index.ts`.
export type { ServerDataMap } from './pageData/helpers.js'

// Re-export the URL-tag helpers + fill pipeline + server-data resolver
// for consumers that import them through `./pageData.js`.
export {
  applyFillPipeline,
  applyRelationshipBuilderFill,
  applyRelationshipRepeaterFill,
  callPageSchema,
  resolveServerDataElements,
  tagActionDispatch,
  tagCellEditUrls,
  tagFieldAiUrls,
  tagFormActions,
  tagFormStateUrls,
  tagFormWizardUrls,
  tagRichTextMentionUrls,
  tagSelectCreateOptionUrls,
  tagTableDeferred,
  tagTableReorderUrls,
  tagWidgetUrls,
} from './pageData/helpers.js'

import {
  applyRoleHooks,
  panelInfo,
  resolvePageHooks,
  type DatabaseNotificationsMeta,
  type NavItem,
  type PanelInfoRoute,
  type RightPanelMeta,
  type RightSidebarMeta,
  type UserMenuMeta,
} from './pageData/navigation.js'

// Re-export navigation chrome surface so external callsites importing
// it via `./pageData.js` keep working (e.g. routes/test harnesses).
export type {
  DatabaseNotificationsMeta,
  NavItem,
  PanelInfoRoute,
  RightPanelMeta,
  RightSidebarMeta,
  UserMenuMeta,
} from './pageData/navigation.js'
export {
  applyRoleHooks,
  panelInfo,
  resolvePageHooks,
} from './pageData/navigation.js'

import {
  dashboardData,
  resourceCreateData,
  resourceEditData,
  resourceIndexData,
  resourceRecordPageData,
  resourceTableData,
  resourceViewData,
} from './pageData/resourcePages.js'

// Re-export resource page builders so external callsites importing
// through `./pageData.js` keep working (e.g. routes.ts handlers, tests).
export {
  dashboardData,
  resolveActiveTab,
  resourceCreateData,
  resourceEditData,
  resourceIndexData,
  resourceRecordPageData,
  resourceTableData,
  resourceViewData,
} from './pageData/resourcePages.js'

import {
  buildNestedRelationTabs,
  buildRelationTabs,
  deriveParentTitle,
  safeBool,
} from './pageData/relationTabs.js'


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
    const result = await q.where(childPk, '=', childId).paginate(1, 1)
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

async function safePolicy(fn: () => Promise<boolean> | boolean): Promise<boolean> {
  try { return Boolean(await fn()) } catch { return false }
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

  const R = cfg.resources.find(r => r.getSlug() === scope.slug)
  if (!R) return null

  const M = findManager(R, scope.relationship)
  if (!M) return null

  const user = await pilotiq.resolveUser(req)

  // Layer 1: parent access. canAccess gates the resource entirely;
  // canEdit gates managing its relations (managers are read-write
  // surfaces — read-only inline views opt in by overriding the
  // manager's can*). Cluster gate composes with R.canAccess — both
  // must pass when the parent resource is inside a cluster.
  if (R.cluster && !await safePolicy(() => R.cluster!.canAccess(user))) return { ok: false, status: 403 }
  if (!await safePolicy(() => R.canAccess(user))) return { ok: false, status: 403 }

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

  if (!await safePolicy(() => R.canEdit(user, parentRecord))) return { ok: false, status: 403 }

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
  const managerCtx: RelationManagerContext = {
    basePath:     base,
    parentSlug:   scope.slug,
    parentId:     scope.recordId,
    relationship: scope.relationship,
    parentRecord,
    related:      Related,
    mode,
  }
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
  await loadTableRecords(elements, scope.query ?? {}, listUrl, user)

  const tabs = await buildRelationTabs(R, scope.recordId, base, scope.relationship, user, parentRecord)
  if (tabs) elements.unshift(tabs)

  const breadcrumbs = relationListBreadcrumbs(
    cfg, R, M, scope.recordId, deriveParentTitle(R, parentRecord),
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const relationListRoute: PanelInfoRoute = { resource: R, recordId: scope.recordId }
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'relation-list',
    await resolveSchema(elements, ctx),
    relationListRoute,
  )

  return {
    pageType: 'relation-list',
    panel:    await panelInfo(pilotiq, req, relationListRoute),
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

  const managerCtx: RelationManagerContext = {
    basePath:     base,
    parentSlug:   scope.slug,
    parentId:     scope.recordId,
    relationship: scope.relationship,
    parentRecord,
    related:      Related,
    mode,
  }
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
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'relation-create',
    await resolveSchema(elements, ctx),
    relationCreateRoute,
  )

  return {
    pageType: 'relation-create',
    panel:    await panelInfo(pilotiq, req, relationCreateRoute),
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

  const belongs = await childBelongsToParent(
    R.model as ModelLike, parentRecord, scope.relationship, childPk, scope.childId,
  )
  if (!belongs) return null

  const child = await findRecord(Related, scope.childId, { user }).catch(() => undefined)
  if (!child) return null

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

  const breadcrumbs = relationViewBreadcrumbs(
    cfg, R, M, scope.recordId,
    deriveParentTitle(R, parentRecord),
    deriveParentTitle(Related, child, M),
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'view',
    basePath: base,
    record:   child,
    recordId: scope.childId,
  }, user), cfg)

  const relationViewRoute: PanelInfoRoute = { resource: R, recordId: scope.childId }
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'relation-view',
    await resolveSchema(elements, ctx),
    relationViewRoute,
  )

  return {
    pageType: 'relation-view',
    panel:    await panelInfo(pilotiq, req, relationViewRoute),
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

  // IDOR check first — confirm the child actually belongs to the
  // parent under this relationship before doing anything else. Guards
  // against URL tampering swapping `:childId`.
  const belongs = await childBelongsToParent(
    R.model as ModelLike, parentRecord, scope.relationship, childPk, scope.childId,
  )
  if (!belongs) return null

  const child = await findRecord(Related, scope.childId, { user }).catch(() => undefined)
  if (!child) return null

  if (!await safeManagerPolicy(M, 'canEdit', Related, user, parentRecord, child)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path
  const resourceBase = resourceBasePath(base, R)
  const editUrl = `${resourceBase}/${scope.recordId}/${scope.relationship}/${scope.childId}/edit`

  const managerCtx: RelationManagerContext = {
    basePath:     base,
    parentSlug:   scope.slug,
    parentId:     scope.recordId,
    relationship: scope.relationship,
    parentRecord,
    related:      Related,
    mode,
  }
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

  const breadcrumbs = relationEditBreadcrumbs(
    cfg, R, M, scope.recordId,
    deriveParentTitle(R, parentRecord),
    scope.childId,
    deriveParentTitle(Related, child, M),
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'edit',
    basePath: base,
    record:   child,
    recordId: scope.childId,
  }, user), cfg)

  const relationEditRoute: PanelInfoRoute = { resource: R, recordId: scope.childId }
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'relation-edit',
    await resolveSchema(elements, ctx),
    relationEditRoute,
  )

  return {
    pageType: 'relation-edit',
    panel:    await panelInfo(pilotiq, req, relationEditRoute),
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
  const cfg = pilotiq.getConfig()

  const R = cfg.resources.find(r => r.getSlug() === scope.slug)
  if (!R) return null

  // Layer 0 — same gates as the depth-1 pipeline.
  if (R.cluster && !await safePolicy(() => R.cluster!.canAccess(user))) return { ok: false, status: 403 }
  if (!await safePolicy(() => R.canAccess(user))) return { ok: false, status: 403 }

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
  if (!await safePolicy(() => R.canEdit(user, parentRecord))) return { ok: false, status: 403 }

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

  // IDOR #1 — confirm the leaf parent (`step1.recordId`) actually
  // belongs to the top parent under the first relationship key.
  const child1Pk = getPrimaryKey(Related1.model)
  const belongs1 = await childBelongsToParent(
    R.model as ModelLike, parentRecord, step0.relationship, child1Pk, step1.recordId,
  )
  if (!belongs1) return null

  const child1 = await findRecord(Related1, step1.recordId, { user }).catch(() => undefined)
  if (!child1) return null

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

  return {
    pageType,
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
  await loadTableRecords(elements, scope.query ?? {}, listUrl, user)

  const tabs = await buildNestedRelationTabs(resolved.R, resolved.M1, base, scope.chain[0], scope.chain[1].recordId, scope.chain[1].relationship, user, resolved.child1)
  if (tabs) elements.unshift(tabs)

  const breadcrumbs = nestedRelationListBreadcrumbs(
    cfg, resolved.R, resolved.M1, M2, scope.chain[0],
    deriveParentTitle(resolved.R, resolved.parentRecord),
    scope.chain[1].recordId,
    deriveParentTitle(Related1, child1, resolved.M1),
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const nestedListRoute: PanelInfoRoute = { resource: resolved.R, recordId: scope.chain[1].recordId }
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'relation-list',
    await resolveSchema(elements, ctx),
    nestedListRoute,
  )

  return {
    ...nestedResponseEnvelope('nested-relation-list', pilotiq, base, scope, resolved, req),
    panel:    await panelInfo(pilotiq, req, nestedListRoute),
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
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'relation-create',
    await resolveSchema(elements, ctx),
    nestedCreateRoute,
  )

  return {
    ...nestedResponseEnvelope('nested-relation-create', pilotiq, base, scope, resolved, req),
    panel:    await panelInfo(pilotiq, req, nestedCreateRoute),
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

  const belongs2 = await childBelongsToParent(
    Related1.model as ModelLike, child1, step1.relationship, child2Pk, scope.childId,
  )
  if (!belongs2) return null

  const child2 = await findRecord(Related2, scope.childId, { user }).catch(() => undefined)
  if (!child2) return null

  if (!await safeManagerPolicy(M2, 'canView', Related2, user, child1, child2)) return { ok: false, status: 403 }

  const cfg = pilotiq.getConfig()
  const base = cfg.path

  const elements: Element[] = M2.detail(child2, child1)

  const tabs = await buildNestedRelationTabs(resolved.R, resolved.M1, base, scope.chain[0], scope.chain[1].recordId, scope.chain[1].relationship, user, resolved.child1)
  if (tabs) elements.unshift(tabs)

  const breadcrumbs = nestedRelationViewBreadcrumbs(
    cfg, resolved.R, resolved.M1, M2, scope.chain[0],
    deriveParentTitle(resolved.R, resolved.parentRecord),
    scope.chain[1].recordId,
    deriveParentTitle(Related1, child1, resolved.M1),
    deriveParentTitle(Related2, child2, M2),
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'view',
    basePath: base,
    record:   child2,
    recordId: scope.childId,
  }, user), cfg)

  const nestedViewRoute: PanelInfoRoute = { resource: resolved.R, recordId: scope.childId }
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'relation-view',
    await resolveSchema(elements, ctx),
    nestedViewRoute,
  )

  return {
    ...nestedResponseEnvelope('nested-relation-view', pilotiq, base, scope, resolved, req),
    panel:    await panelInfo(pilotiq, req, nestedViewRoute),
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

  const belongs2 = await childBelongsToParent(
    Related1.model as ModelLike, child1, step1.relationship, child2Pk, scope.childId,
  )
  if (!belongs2) return null

  const child2 = await findRecord(Related2, scope.childId, { user }).catch(() => undefined)
  if (!child2) return null

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

  const breadcrumbs = nestedRelationEditBreadcrumbs(
    cfg, resolved.R, resolved.M1, M2, scope.chain[0],
    deriveParentTitle(resolved.R, resolved.parentRecord),
    scope.chain[1].recordId,
    deriveParentTitle(Related1, child1, resolved.M1),
    scope.childId,
    deriveParentTitle(Related2, child2, M2),
  )
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const ctx: SchemaContext = uploadCtx(userCtx({
    mode:     'edit',
    basePath: base,
    record:   child2,
    recordId: scope.childId,
  }, user), cfg)

  const nestedEditRoute: PanelInfoRoute = { resource: resolved.R, recordId: scope.childId }
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'relation-edit',
    await resolveSchema(elements, ctx),
    nestedEditRoute,
  )

  return {
    ...nestedResponseEnvelope('nested-relation-edit', pilotiq, base, scope, resolved, req),
    panel:    await panelInfo(pilotiq, req, nestedEditRoute),
    mode:     'edit' as const,
    childId:  scope.childId,
    schemaData,
    ...(scope.prefill?.errors ? { hasErrors: true } : {}),
  }
}



// ─── Plan #5 partial-resolve data builder ────────────────────

export type FormStateScope =
  | { kind: 'resource-create'; slug: string }
  | { kind: 'resource-edit';   slug: string; recordId: string }
  | { kind: 'global-edit';     slug: string }
  | { kind: 'page';            pageSlug: string }

export interface FormStateRequest {
  formId:  string
  changed: string
  values:  Record<string, unknown>
}

export interface FormStateResult {
  ok:    true
  form:  Record<string, unknown>      // resolved FormMeta
  dirty: string[]
}

export interface FormStateError {
  ok:     false
  status: 404 | 422
  error:  string
}

/**
 * Plan #5 — handle a partial-resolve roundtrip from a `live()` field.
 *
 * Locates the page's schema, finds the targeted form by `formId`, runs
 * `applyStateUpdate` to apply the changed value + run
 * `afterStateUpdated`, then re-resolves the form's children with the
 * mutated values + bound `$get / $set` so dependent options /
 * conditional visibility re-evaluate. Returns the resolved FormMeta the
 * client uses to replace its rendered form.
 *
 * Returns `null` when the route prefix doesn't resolve to a real
 * resource/global/page — the route handler turns this into a 404. The
 * inner `{ status: 422 }` failure is for "form found but `changed`
 * field doesn't exist on it" — also a client-side bug.
 */
export async function formStateData(
  pilotiq: Pilotiq,
  scope:   FormStateScope,
  body:    FormStateRequest,
  req?:    unknown,
): Promise<FormStateResult | FormStateError | null> {
  const cfg = pilotiq.getConfig()
  const user = await pilotiq.resolveUser(req)

  let PageClass: typeof Page | undefined
  let mode: 'create' | 'edit'
  let record: unknown = undefined
  let recordId: string | undefined
  let baseCtxExtras: Record<string, unknown> = {}

  if (scope.kind === 'resource-create' || scope.kind === 'resource-edit') {
    const R = cfg.resources.find(r => r.getSlug() === scope.slug)
    if (!R) return null
    const pages = R.resolvePages()
    if (scope.kind === 'resource-create') {
      if (!pages.create) return null
      PageClass = pages.create
      mode = 'create'
    } else {
      if (!pages.edit) return null
      PageClass = pages.edit
      mode = 'edit'
      recordId = scope.recordId
      baseCtxExtras = { recordId }
      if (R.model) {
        try { record = await findRecord(R, scope.recordId, { user }) } catch { /* ignore */ }
      } else if (recordId) {
        record = { id: recordId }
      }
    }
  } else if (scope.kind === 'global-edit') {
    const G = cfg.globals.find(g => g.getSlug() === scope.slug)
    if (!G) return null
    const pages = G.resolvePages()
    if (!pages.edit) return null
    PageClass = pages.edit
    mode = 'edit'
  } else {
    const P = cfg.pages.find(p => p.getSlug() === scope.pageSlug)
    if (!P) return null
    PageClass = P
    // Custom pages don't have a record/edit-mode concept — pass mode
    // 'edit' so resolveSchema treats fields as form inputs (not table
    // cells / view-mode read-only).
    mode = 'edit'
  }

  if (!PageClass) return null

  const baseCtx: SchemaContext = uploadCtx(userCtx({ mode, basePath: cfg.path, ...baseCtxExtras }, user), cfg)
  const elements = await callPageSchema(PageClass, baseCtx)
  const form = selectFormById(findForms(elements), body.formId)
  if (!form) return { ok: false, status: 404, error: `Form "${body.formId}" not found on page` }

  const update = await applyStateUpdate(form, body.values, body.changed, {
    ...(record  !== undefined ? { record } : {}),
    ...(user    !== null      ? { user   } : {}),
    request: req,
  })
  if (!update) {
    return { ok: false, status: 422, error: `Field "${body.changed}" not found on form "${body.formId}"` }
  }

  // Re-resolve the form with the mutated values bound. We bind
  // `$get / $set` against the post-update values map so further
  // resolve-time logic (SelectField.options(fn), reactive
  // visibility) reads current state.
  const $get = (name: string): unknown => update.values[name]
  // $set on the resolve pass is a no-op — only afterStateUpdated
  // mutations survive into the response. Resolve-time `$set` would
  // race against the client's view of the world.
  const $set = (_name: string, _v: unknown): void => { /* intentional no-op */ }

  const resolveCtx = {
    ...baseCtx,
    values: update.values,
    $get,
    $set,
    changed: body.changed,
    ...(record !== undefined ? { record } : {}),
  }
  // Snapshot values onto the form so its FormMeta carries them.
  form.withValues(update.values)
  const resolved = await resolveSchema([form], resolveCtx)
  const formMeta = resolved[0]
  if (!formMeta || formMeta.type !== 'form') {
    return { ok: false, status: 422, error: 'Form re-resolved to non-form meta' }
  }

  return { ok: true, form: formMeta, dirty: update.dirty }
}

// ─── Plan #8 wizard step-validate data builder ────────────────

export interface FormWizardRequest {
  formId: string
  step:   number
  values: Record<string, unknown>
}

export interface FormWizardSuccess {
  ok: true
}

export interface FormWizardFailure {
  ok:     false
  status: 404 | 422
  error?: string
  errors?: Record<string, string[]>
}

/**
 * Plan #8 — handle a Wizard step-validate POST. Locates the form by id,
 * walks to the Wizard descendant, validates only the fields inside step
 * `step` against `values`. Returns `{ ok: true }` on success or
 * `{ ok: false, status: 422, errors }` when fields fail validation.
 *
 * Errors are keyed by field name, same shape as the form-submit 422 path,
 * so the client (`FormStateApi.applyErrors`) can surface them in-place.
 */
export async function formWizardData(
  pilotiq: Pilotiq,
  scope:   FormStateScope,
  body:    FormWizardRequest,
  req?:    unknown,
): Promise<FormWizardSuccess | FormWizardFailure | null> {
  const cfg = pilotiq.getConfig()
  const user = await pilotiq.resolveUser(req)

  let PageClass: typeof Page | undefined
  let mode: 'create' | 'edit'
  let record: unknown = undefined
  let baseCtxExtras: Record<string, unknown> = {}

  if (scope.kind === 'resource-create' || scope.kind === 'resource-edit') {
    const R = cfg.resources.find(r => r.getSlug() === scope.slug)
    if (!R) return null
    const pages = R.resolvePages()
    if (scope.kind === 'resource-create') {
      if (!pages.create) return null
      PageClass = pages.create
      mode = 'create'
    } else {
      if (!pages.edit) return null
      PageClass = pages.edit
      mode = 'edit'
      baseCtxExtras = { recordId: scope.recordId }
      if (R.model) {
        try { record = await findRecord(R, scope.recordId, { user }) } catch { /* ignore */ }
      } else {
        record = { id: scope.recordId }
      }
    }
  } else if (scope.kind === 'global-edit') {
    const G = cfg.globals.find(g => g.getSlug() === scope.slug)
    if (!G) return null
    const pages = G.resolvePages()
    if (!pages.edit) return null
    PageClass = pages.edit
    mode = 'edit'
  } else {
    const P = cfg.pages.find(p => p.getSlug() === scope.pageSlug)
    if (!P) return null
    PageClass = P
    mode = 'edit'
  }

  if (!PageClass) return null

  const baseCtx: SchemaContext = uploadCtx(userCtx({ mode, basePath: cfg.path, ...baseCtxExtras }, user), cfg)
  const elements = await callPageSchema(PageClass, baseCtx)
  const form = selectFormById(findForms(elements), body.formId)
  if (!form) return { ok: false, status: 404, error: `Form "${body.formId}" not found on page` }

  const formChildren = form.getChildren() ?? []
  const step = findWizardStep(formChildren, body.step)
  if (!step) return { ok: false, status: 404, error: `Step ${body.step} not found on form "${body.formId}"` }

  // Step.beforeValidation — runs before validators. May mutate `body.values`
  // in place (the validator reads from the same object), or throw to halt
  // with a 422 stamped under the reserved `_step` key.
  type StepHook = (values: Record<string, unknown>, ctx: { record?: unknown; user?: unknown }) => void | Promise<void>
  const stepHooks = step as {
    getBeforeValidation?: () => StepHook | undefined
    getAfterValidation?:  () => StepHook | undefined
  }
  const beforeHook = stepHooks.getBeforeValidation?.call(step)
  if (beforeHook) {
    try { await beforeHook(body.values, { record, user }) }
    catch (err) {
      return { ok: false, status: 422, errors: { _step: [stepHookErrorMessage(err)] } }
    }
  }

  const errors = await validateSchema(step.getChildren() ?? [], body.values, record)
  if (Object.keys(errors).length > 0) {
    return { ok: false, status: 422, errors }
  }

  // Step.afterValidation — fires only when validators pass. Same throw →
  // 422 contract as beforeValidation.
  const afterHook = stepHooks.getAfterValidation?.call(step)
  if (afterHook) {
    try { await afterHook(body.values, { record, user }) }
    catch (err) {
      return { ok: false, status: 422, errors: { _step: [stepHookErrorMessage(err)] } }
    }
  }

  return { ok: true }
}

function stepHookErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err.length > 0) return err
  return 'Step validation failed'
}

// ─── SelectField inline-create-option data builder ───────────

export interface FormCreateOptionRequest {
  formId:    string
  fieldName: string
  values:    Record<string, unknown>
}

export interface FormCreateOptionSuccess {
  ok:     true
  option: { value: string; label: string }
}

export interface FormCreateOptionFailure {
  ok:     false
  status: 403 | 404 | 422 | 500
  error?:  string
  errors?: Record<string, string[]>
}

/** Find a `SelectField` by name inside a form's children, walking through
 *  layout containers but stopping at Repeater / Builder boundaries
 *  (parallel to `tagSelectCreateOptionUrls`'s walker). Returns the first
 *  match or `undefined`. */
function findSelectFieldByName(elements: Element[], name: string): SelectField | undefined {
  for (const el of elements) {
    if (el instanceof SelectField) {
      if (el.name === name) return el
      continue
    }
    if (el instanceof RepeaterField) continue
    if (el instanceof BuilderField)  continue
    const children = el.getChildren()
    if (children && children.length > 0) {
      const found = findSelectFieldByName(children as Element[], name)
      if (found) return found
    }
  }
  return undefined
}

/**
 * Audit row 2026-05-07 cont'd⁸ — handle a `SelectField.createOptionForm()`
 * modal submit. Locates the parent form by `formId`, finds the SelectField
 * by `fieldName`, re-evaluates the `createOptionAuthorize` rule (so a
 * tampered URL can't bypass), coerces + validates the body against the
 * sub-form's fields, then calls `createOptionUsing(handler)` and returns
 * `{ option }` for the client to append + select.
 *
 * Returns `null` when the route prefix doesn't resolve to a real
 * resource/global/page (route handler turns into 404).
 */
export async function formCreateOptionData(
  pilotiq: Pilotiq,
  scope:   FormStateScope,
  body:    FormCreateOptionRequest,
  req?:    unknown,
): Promise<FormCreateOptionSuccess | FormCreateOptionFailure | null> {
  const cfg = pilotiq.getConfig()
  const user = await pilotiq.resolveUser(req)

  let PageClass: typeof Page | undefined
  let mode: 'create' | 'edit'
  let record: unknown = undefined
  let baseCtxExtras: Record<string, unknown> = {}

  if (scope.kind === 'resource-create' || scope.kind === 'resource-edit') {
    const R = cfg.resources.find(r => r.getSlug() === scope.slug)
    if (!R) return null
    const pages = R.resolvePages()
    if (scope.kind === 'resource-create') {
      if (!pages.create) return null
      PageClass = pages.create
      mode = 'create'
    } else {
      if (!pages.edit) return null
      PageClass = pages.edit
      mode = 'edit'
      baseCtxExtras = { recordId: scope.recordId }
      if (R.model) {
        try { record = await findRecord(R, scope.recordId, { user }) } catch { /* ignore */ }
      } else {
        record = { id: scope.recordId }
      }
    }
  } else if (scope.kind === 'global-edit') {
    const G = cfg.globals.find(g => g.getSlug() === scope.slug)
    if (!G) return null
    const pages = G.resolvePages()
    if (!pages.edit) return null
    PageClass = pages.edit
    mode = 'edit'
  } else {
    const P = cfg.pages.find(p => p.getSlug() === scope.pageSlug)
    if (!P) return null
    PageClass = P
    mode = 'edit'
  }

  if (!PageClass) return null

  const baseCtx: SchemaContext = uploadCtx(userCtx({ mode, basePath: cfg.path, ...baseCtxExtras }, user), cfg)
  const elements = await callPageSchema(PageClass, baseCtx)
  const form = selectFormById(findForms(elements), body.formId)
  if (!form) return { ok: false, status: 404, error: `Form "${body.formId}" not found on page` }

  const field = findSelectFieldByName(form.getChildren() as Element[] ?? [], body.fieldName)
  if (!field) return { ok: false, status: 404, error: `SelectField "${body.fieldName}" not found on form "${body.formId}"` }
  if (!field.hasCreateOption()) return { ok: false, status: 404, error: `SelectField "${body.fieldName}" does not configure createOptionForm()` }

  const createForm = field.getCreateOptionForm()!
  const handler    = field.getCreateOptionHandler()
  if (!handler) {
    return { ok: false, status: 500, error: `SelectField "${body.fieldName}" has createOptionForm() but no createOptionUsing() handler` }
  }

  // Re-evaluate authorize. Build the same ActionVisibilityContext shape
  // the field's `toMeta` did — keeps server / meta-build paths consistent.
  const authorize = field.getCreateOptionAuthorize()
  if (authorize !== undefined) {
    const authVisible = await (async () => {
      if (typeof authorize !== 'function') return authorize
      const visCtx: import('./actions/Action.js').ActionVisibilityContext = {}
      if (record !== undefined) visCtx.record = record
      if (user   !== null     ) visCtx.user   = user
      try { return await authorize(visCtx) } catch { return false }
    })()
    if (!authVisible) return { ok: false, status: 403, error: 'createOptionAuthorize denied' }
  }

  // Coerce + validate body against the sub-form's fields. The createOption
  // sub-schema is detached from the parent form so we run it against its
  // own children only — coerceFormValues mutates `out` to normalize toggle
  // / number / date / etc. shapes (same shape parent forms use).
  const coerced = coerceFormValues(createForm, { ...body.values })
  const errors  = await validateSchema(createForm, coerced, undefined)
  if (Object.keys(errors).length > 0) {
    return { ok: false, status: 422, errors }
  }

  const ctx: RenderContext = {
    ...baseCtx,
    values: coerced,
    ...(record !== undefined ? { record } : {}),
  }
  let option: { value: string; label: string }
  try {
    option = await handler(coerced, ctx)
  } catch (e) {
    return { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) }
  }

  if (!option || typeof option.value !== 'string' || typeof option.label !== 'string') {
    return { ok: false, status: 500, error: `createOptionUsing must return { value: string, label: string }` }
  }

  return { ok: true, option }
}

// ─── Async-mention resolve data builder ──────────────────────

export interface MentionResolveRequest {
  formId:  string
  field:   string
  trigger: string
  query:   string
}

/** Wire-side shape for a single resolved item — mirrors `MentionItem` from
 *  `@pilotiq/tiptap`. Pilotiq core doesn't import that package, so the
 *  duck-typed shape lives here. */
export interface MentionResolveItem {
  id:     string
  label:  string
  group?: string
}

export interface MentionResolveSuccess {
  ok:    true
  items: MentionResolveItem[]
}

export interface MentionResolveError {
  ok:     false
  status: 404 | 422
  error:  string
}

interface AsyncMentionResolverField {
  resolveMention(
    trigger: string,
    query:   string,
    ctx:     { user?: unknown; record?: unknown; request?: unknown },
  ): Promise<MentionResolveItem[] | null>
}

function isMentionResolverField(el: Element): el is Element & AsyncMentionResolverField {
  if (el.getType() !== 'richtext') return false
  const candidate = el as unknown as Partial<AsyncMentionResolverField>
  return typeof candidate.resolveMention === 'function'
}

/**
 * Walk a form's tree looking for the named field. Descends into Repeater /
 * Builder rows when the requested name carries the row-prefix shape:
 *
 *   - Repeater rows: `<repeaterName>.<index>.<innerPath>` — looks up
 *     `<innerPath>` against the Repeater's template schema. Field config
 *     (providers, async resolver) is shared across rows, so any row index
 *     resolves to the same template field.
 *   - Builder rows: `<builderName>.<index>.data.<innerPath>` — looks up
 *     `<innerPath>` against every block's schema; first match wins. Block
 *     schemas often share leaf names — if two blocks define a RichTextField
 *     with the same name and different async-mention providers, only the
 *     first block in declaration order is reachable here. Authors needing
 *     per-block resolution should give the leaves distinct names.
 *
 * Mirrors the boundary-stopping posture of `findFieldByName` inside
 * `dispatchForm.ts` for top-level matches — only the dotted-prefix branch
 * crosses into row schemas.
 */
function findRichTextFieldByName(
  elements: ReadonlyArray<Element>,
  name:     string,
): (Element & AsyncMentionResolverField) | undefined {
  for (const el of elements) {
    if (isMentionResolverField(el) && (el as unknown as { name: string }).name === name) {
      return el
    }
    if (isRepeaterField(el)) {
      const inner = stripRepeaterRowPrefix(name, (el as RepeaterField).name)
      if (inner !== undefined) {
        const hit = findRichTextFieldByName((el as RepeaterField).getInnerSchema(), inner)
        if (hit) return hit
      }
      continue
    }
    if (isBuilderField(el)) {
      const inner = stripBuilderRowPrefix(name, (el as BuilderField).name)
      if (inner !== undefined) {
        for (const block of (el as BuilderField).getBlocks()) {
          const hit = findRichTextFieldByName(block.getSchema(), inner)
          if (hit) return hit
        }
      }
      continue
    }
    const children = el.getChildren()
    if (children && children.length > 0) {
      const hit = findRichTextFieldByName(children, name)
      if (hit) return hit
    }
  }
  return undefined
}

/**
 * `items.0.body` → `body`. Returns `undefined` when the path doesn't match
 * the `<repeaterName>.<digits>.<rest>` shape so the walker keeps searching
 * other branches instead of misinterpreting an unrelated dotted name.
 */
function stripRepeaterRowPrefix(path: string, repeaterName: string): string | undefined {
  const parts = path.split('.')
  if (parts.length < 3) return undefined
  if (parts[0] !== repeaterName) return undefined
  if (!/^\d+$/.test(parts[1] ?? '')) return undefined
  return parts.slice(2).join('.')
}

/**
 * `blocks.0.data.heading` → `heading`. The literal `data` segment matches
 * Builder's wire shape (`{ __id, type, data: {…} }`) and distinguishes a
 * Builder leaf from a Repeater leaf at the same depth.
 */
function stripBuilderRowPrefix(path: string, builderName: string): string | undefined {
  const parts = path.split('.')
  if (parts.length < 4) return undefined
  if (parts[0] !== builderName) return undefined
  if (!/^\d+$/.test(parts[1] ?? '')) return undefined
  if (parts[2] !== 'data') return undefined
  return parts.slice(3).join('.')
}

/**
 * Resolve one async-mention round-trip. Locates the page's schema, finds
 * the form by `formId` and the RichTextField by `field`, calls its
 * `resolveMention(trigger, query, ctx)`. Returns `{ ok, items }`, a 404
 * when the form / field / trigger isn't present, or `null` for a missing
 * page (the route handler turns `null` into a 404 too).
 *
 * The dispatcher is duck-typed against the contract in `@pilotiq/tiptap`'s
 * `RichTextField` — pilotiq core never imports the adapter. Any future
 * field-type that ships an async-resolve trigger can implement the same
 * shape and pick up routing for free.
 */
export async function mentionResolveData(
  pilotiq: Pilotiq,
  scope:   FormStateScope,
  body:    MentionResolveRequest,
  req?:    unknown,
): Promise<MentionResolveSuccess | MentionResolveError | null> {
  const cfg = pilotiq.getConfig()
  const user = await pilotiq.resolveUser(req)

  let PageClass: typeof Page | undefined
  let mode: 'create' | 'edit'
  let record: unknown = undefined
  let baseCtxExtras: Record<string, unknown> = {}

  if (scope.kind === 'resource-create' || scope.kind === 'resource-edit') {
    const R = cfg.resources.find(r => r.getSlug() === scope.slug)
    if (!R) return null
    const pages = R.resolvePages()
    if (scope.kind === 'resource-create') {
      if (!pages.create) return null
      PageClass = pages.create
      mode = 'create'
    } else {
      if (!pages.edit) return null
      PageClass = pages.edit
      mode = 'edit'
      baseCtxExtras = { recordId: scope.recordId }
      if (R.model) {
        try { record = await findRecord(R, scope.recordId, { user }) } catch { /* ignore */ }
      } else {
        record = { id: scope.recordId }
      }
    }
  } else if (scope.kind === 'global-edit') {
    const G = cfg.globals.find(g => g.getSlug() === scope.slug)
    if (!G) return null
    const pages = G.resolvePages()
    if (!pages.edit) return null
    PageClass = pages.edit
    mode = 'edit'
  } else {
    const P = cfg.pages.find(p => p.getSlug() === scope.pageSlug)
    if (!P) return null
    PageClass = P
    mode = 'edit'
  }

  if (!PageClass) return null

  const baseCtx: SchemaContext = uploadCtx(userCtx({ mode, basePath: cfg.path, ...baseCtxExtras }, user), cfg)
  const elements = await callPageSchema(PageClass, baseCtx)
  const form = selectFormById(findForms(elements), body.formId)
  if (!form) return { ok: false, status: 404, error: `Form "${body.formId}" not found on page` }

  const field = findRichTextFieldByName(form.getChildren() ?? [], body.field)
  if (!field) {
    return { ok: false, status: 404, error: `Rich-text field "${body.field}" not found on form "${body.formId}"` }
  }

  let items: MentionResolveItem[] | null
  try {
    items = await field.resolveMention(body.trigger, body.query, {
      ...(record !== undefined ? { record } : {}),
      ...(user   !== null      ? { user   } : {}),
      request: req,
    })
  } catch (err) {
    return {
      ok:     false,
      status: 422,
      error:  err instanceof Error ? err.message : 'Mention resolver threw',
    }
  }

  if (items === null) {
    return { ok: false, status: 404, error: `No mention provider for trigger "${body.trigger}" on field "${body.field}"` }
  }

  return { ok: true, items }
}


export async function globalEditData(
  pilotiq: Pilotiq,
  slug:    string,
  prefill?: { values?: Record<string, unknown>; errors?: Record<string, string[]> },
  req?:    unknown,
): Promise<Record<string, unknown> | null> {
  const cfg = pilotiq.getConfig()
  const G = cfg.globals.find(g => g.getSlug() === slug)
  if (!G) return null
  const pages = G.resolvePages()
  if (!pages.edit) return null
  const PageClass = pages.edit

  const editUrl = globalBasePath(cfg.path, G)
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'edit', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, editUrl)
  tagFormStateUrls(elements, formId => `${editUrl}/_form/${formId}/state`)
  tagFormWizardUrls(elements, formId => `${editUrl}/_form/${formId}/wizard`)
  tagRichTextMentionUrls(elements, formId => `${editUrl}/_form/${formId}/mentions`)
  tagSelectCreateOptionUrls(elements, (formId, fieldName) => `${editUrl}/_form/${formId}/create-option/${fieldName}`)

  const form = findForms(elements)[0]
  let record: unknown = undefined
  if (form?.getLoadRecord()) {
    try { record = await form.getLoadRecord()!('', { values: prefill?.values ?? {} }) } catch { /* ignore */ }
    if (!prefill?.values && record != null) {
      const values = await applyFillPipeline(form, record)
      form.withValues(values)
    } else if (prefill?.values) {
      form.withValues(prefill.values)
    }
    if (prefill?.errors) form.withErrors(prefill.errors)
  }

  const breadcrumbs = globalBreadcrumbs(cfg, G)
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const globalEditRoute: PanelInfoRoute = { global: G, page: PageClass }
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'global-edit',
    await resolveSchema(
      elements,
      record !== undefined ? { ...ctx, record } : ctx,
    ),
    globalEditRoute,
  )

  return {
    pageType: 'global',
    panel:    await panelInfo(pilotiq, req, globalEditRoute),
    page:     PageClass.toMeta(),
    global:   { name: G.name, label: G.label, labelSingular: G.labelSingular, slug, icon: serializeIcon(G.icon, G.name) },
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
    ...(prefill?.errors ? { hasErrors: true } : {}),
  }
}

export async function globalViewData(
  pilotiq: Pilotiq,
  slug:    string,
  req?:    unknown,
): Promise<Record<string, unknown> | null> {
  const cfg = pilotiq.getConfig()
  const G = cfg.globals.find(g => g.getSlug() === slug)
  if (!G) return null
  const pages = G.resolvePages()
  if (!pages.view) return null
  const PageClass = pages.view

  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({ mode: 'view', basePath: cfg.path }, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)

  const breadcrumbs = globalBreadcrumbs(cfg, G)
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const globalViewRoute: PanelInfoRoute = { global: G, page: PageClass }
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'global-view',
    await resolveSchema(elements, ctx),
    globalViewRoute,
  )

  return {
    panel:    await panelInfo(pilotiq, req, globalViewRoute),
    page:     PageClass.toMeta(),
    global:   { name: G.name, label: G.label, labelSingular: G.labelSingular, slug, icon: serializeIcon(G.icon, G.name) },
    basePath: cfg.path,
    layout:   cfg.layout,
    schemaData,
    notifications: consumeFlashedNotifications(req),
  }
}

export async function customPageData(
  pilotiq: Pilotiq,
  pageSlug: string,
  req?:    unknown,
): Promise<Record<string, unknown> | null> {
  const cfg = pilotiq.getConfig()
  const PageClass = cfg.pages.find(P => P.getSlug() === pageSlug)
  if (!PageClass) return null

  const pageUrl = pageBasePath(cfg.path, PageClass)
  const user = await pilotiq.resolveUser(req)
  const ctx: SchemaContext = uploadCtx(userCtx({}, user), cfg)
  const elements = await callPageSchema(PageClass, ctx)
  tagFormActions(elements, pageUrl)
  tagFormStateUrls(elements, formId => `${pageUrl}/_form/${formId}/state`)
  tagFormWizardUrls(elements, formId => `${pageUrl}/_form/${formId}/wizard`)
  tagRichTextMentionUrls(elements, formId => `${pageUrl}/_form/${formId}/mentions`)
  tagSelectCreateOptionUrls(elements, (formId, fieldName) => `${pageUrl}/_form/${formId}/create-option/${fieldName}`)
  tagActionDispatch(elements, pageUrl)
  // Page-scope polling URL (mirrors `${base}/${pageSlug}/_widget/:id`
  // route registered in routes.ts).
  tagWidgetUrls(elements, id => `${pageUrl}/_widget/${id}`)
  const widgetData = await resolveServerDataElements(elements, ctx)

  const breadcrumbs = customPageBreadcrumbs(cfg, PageClass)
  if (breadcrumbs) elements.unshift(breadcrumbs)

  const customRoute: PanelInfoRoute = { page: PageClass }
  const schemaData = await applyRoleHooks(
    pilotiq, user, 'page',
    await resolveSchema(elements, ctx),
    customRoute,
  )

  return {
    pageType: 'page',
    panel:    await panelInfo(pilotiq, req, customRoute),
    page:     PageClass.toMeta(),
    schemaData,
    _widgetData: widgetData,
    basePath: cfg.path,
    layout:   cfg.layout,
    notifications: consumeFlashedNotifications(req),
  }
}

// ─── Plan #15 widget polling data builder ────────────────────

/**
 * Scopes the polling endpoint resolves against. Mirrors the
 * form-state / wizard scope discriminator.
 *
 *   panel:    dashboard page (`POST {base}/_widget/:id`)
 *   page:     custom page    (`POST {base}/{pageSlug}/_widget/:id`)
 *   resource: list page      (`POST {base}/{slug}/_widget/:id`) —
 *             resolves the resource's index `Page.schema()` so widgets
 *             from `Resource.headerSchema()` / `footerSchema()` are
 *             reachable. Auth runs `R.canAccess + R.canViewAny` in
 *             front of the per-widget visibility check.
 */
export type WidgetScope =
  | { kind: 'panel' }
  | { kind: 'page';     pageSlug: string }
  | { kind: 'resource'; slug:     string }

export interface WidgetRequest {
  id:      string
  filter?: string
}

export interface WidgetSuccess {
  ok:        true
  data:      unknown
  timestamp: number
}

export interface WidgetFailure {
  ok:     false
  status: 403 | 404 | 500
  error:  string
}

/**
 * Plan #15 — re-resolve the active page's schema, find the widget by
 * id, fail-closed via `evaluateVisibility`, then run
 * `resolveServerData(ctx)` and return the payload.
 *
 *   - 404 when the page or widget id doesn't exist.
 *   - 403 when the layout-level `visible(rule)` says the widget is
 *     hidden (server doesn't show data for hidden surfaces).
 *   - 500 when the hook itself throws.
 *
 * `body.filter` rides along on `RenderContext.filter` so per-chart
 * filter dropdowns can re-fetch with the new filter value. Treated as
 * an opaque string — widget hooks decode it however they want.
 */
export async function widgetData(
  pilotiq: Pilotiq,
  scope:   WidgetScope,
  body:    WidgetRequest,
  req?:    unknown,
): Promise<WidgetSuccess | WidgetFailure> {
  const cfg = pilotiq.getConfig()
  const user = await pilotiq.resolveUser(req)

  let elements: Element[]
  let ctx: RenderContext

  if (scope.kind === 'panel') {
    if (!cfg.dashboardPage) return { ok: false, status: 404, error: 'No dashboard page registered' }
    ctx = uploadCtx(userCtx({ basePath: cfg.path }, user), cfg)
    elements = await callPageSchema(cfg.dashboardPage, ctx)
  } else if (scope.kind === 'page') {
    const P = cfg.pages.find(p => p.getSlug() === scope.pageSlug)
    if (!P) return { ok: false, status: 404, error: 'Page not found' }
    ctx = uploadCtx(userCtx({ basePath: cfg.path }, user), cfg)
    elements = await callPageSchema(P, ctx)
  } else {
    // Resource-scope: re-resolve the list page's schema so widgets from
    // `Resource.headerSchema()` / `footerSchema()` are reachable.
    const R = cfg.resources.find(r => r.getSlug() === scope.slug)
    if (!R) return { ok: false, status: 404, error: 'Resource not found' }
    const pages = R.resolvePages()
    if (!pages.index) return { ok: false, status: 404, error: 'Resource has no list page' }
    ctx = uploadCtx(userCtx({ mode: 'table', basePath: cfg.path }, user), cfg)
    elements = await callPageSchema(pages.index, ctx)
  }

  // Stamp the request's filter onto the render context so widget hooks
  // can branch on it. Opaque string — widgets decode their own format.
  if (body.filter !== undefined) ctx = { ...ctx, filter: body.filter } as RenderContext

  const widget = findWidgetById(elements, body.id)
  if (!widget) return { ok: false, status: 404, error: `Widget "${body.id}" not found` }

  // Layout-level visibility re-check — if the widget is hidden by a
  // visible(rule), refuse to ship data. Same fail-closed posture as
  // the schema resolver. (Parent-container `visible(false)` would
  // already drop the widget from the schema tree at SSR time, so a
  // direct hidden-widget probe here covers the visible-rule-only case.)
  const layoutCtx: import('./schema/Element.js').LayoutContext = {}
  if (user !== null && user !== undefined) layoutCtx.user = user
  if (!await widget.evaluateVisibility(layoutCtx)) {
    return { ok: false, status: 403, error: 'Widget hidden' }
  }

  try {
    const data = await widget.resolveServerData(ctx)
    return { ok: true, data, timestamp: Date.now() }
  } catch (err) {
    return {
      ok:     false,
      status: 500,
      error:  err instanceof Error ? err.message : 'Widget failed',
    }
  }
}

/** Walk the element tree looking for a server-data element with the
 *  given id. Same walker as `collectServerDataElements` but stops on
 *  first match. */
function findWidgetById(elements: ReadonlyArray<Element>, id: string): ServerDataElement | undefined {
  let found: ServerDataElement | undefined
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (found) return
      if (isServerDataElement(el)) {
        if (el.getId() === id) { found = el; return }
        continue
      }
      const type = el.getType()
      if (type === 'form' || type === 'repeater' || type === 'builder' || type === 'table' || type === 'tableWidget') continue
      const children = el.getChildren()
      if (children) walk(children)
    }
  }
  walk(elements)
  return found
}

// ─── Plan #12 global search data builder ─────────────────────

/**
 * Resolve the user via `pilotiq.resolveUser(req)` and run the
 * panel-wide search. Mirrors the formStateData/formWizardData
 * shape so the `/_search` route handler stays a thin wrapper.
 *
 * Also resolves the `panels::global-search.results.before/.after`
 * render hooks when the panel registered any — sparse, absent when
 * neither slot has registered fns. Sent as a `RenderHookMap` so the
 * client `<CommandPalette>` can mount `<RenderHookSlot>` above and
 * below the result list (same pattern chrome slots use).
 */
export async function searchData(
  pilotiq: Pilotiq,
  query:   string,
  req?:    unknown,
): Promise<{
  ok: true
  results: GlobalSearchResult[]
  renderHooks?: RenderHookMap
}> {
  const user = await pilotiq.resolveUser(req)
  const results = await searchAllResources(pilotiq, query, user)
  const cfg = pilotiq.getConfig()
  const out: { ok: true; results: GlobalSearchResult[]; renderHooks?: RenderHookMap } = {
    ok: true,
    results,
  }
  if (cfg.renderHooks && cfg.renderHooks.length > 0) {
    const hooks = await resolvePageHooks(
      pilotiq,
      user,
      pageHooksFor('search'),
      { url: `${cfg.path}/_search` },
    )
    if (Object.keys(hooks).length > 0) out.renderHooks = hooks
  }
  return out
}

// ─── Vike +data dispatcher ───────────────────────────────────

export interface PageContextLike {
  urlPathname?: string
  urlOriginal?: string
  urlParsed?:   { search?: Record<string, string>; searchOriginal?: string }
  routeParams?: Record<string, string | undefined>
  pageId?:      string
}

/**
 * Single entry point Vike's `+data` hook calls. Inspects the page id and
 * route params, finds the panel via `PilotiqRegistry`, and dispatches to
 * the matching builder. Returns the same shape SSR's `viewProps` carries.
 */
export async function dispatchPageData(pageContext: PageContextLike): Promise<unknown | null> {
  const { pageId, routeParams = {} } = pageContext
  const search = pageContext.urlParsed?.search ?? {}
  const basePathParam = routeParams['basePath']
  const basePath = basePathParam ? `/${basePathParam}` : ''
  const panel = basePath ? PilotiqRegistry.findByPath(basePath) : null

  if (!panel) return null

  switch (pageId) {
    case '/pages/(pilotiq)/dashboard':
      return dashboardData(panel)

    case '/pages/(pilotiq)/slug': {
      // 2-segment URL: could be a resource list, a global edit, or a custom page.
      const slug = routeParams['slug']
      if (!slug) return null
      const cfg = panel.getConfig()
      if (cfg.resources.some(R => R.getSlug() === slug)) {
        return resourceIndexData(panel, slug, search)
      }
      if (cfg.globals.some(G => G.getSlug() === slug)) {
        return globalEditData(panel, slug)
      }
      return customPageData(panel, slug)
    }

    case '/pages/(pilotiq)/resource-create': {
      const slug = routeParams['slug']
      if (!slug) return null
      return resourceCreateData(panel, slug)
    }

    case '/pages/(pilotiq)/resource-edit': {
      const slug = routeParams['slug']
      const id = routeParams['id']
      if (!slug || !id) return null
      return resourceEditData(panel, slug, id)
    }

    case '/pages/(pilotiq)/resource-view': {
      const slug = routeParams['slug']
      const id = routeParams['id']
      if (!slug) return null
      // Globals also use this route under `/{slug}/view` — id will be 'view'.
      if (id === 'view') return globalViewData(panel, slug)
      if (!id) return null
      return resourceViewData(panel, slug, id)
    }

    case '/pages/(pilotiq)/relation-list': {
      const slug         = routeParams['slug']
      const id           = routeParams['id']
      const relationship = routeParams['relationship']
      if (!slug || !id || !relationship) return null
      const out = await relationManagerData(panel, {
        kind: 'relation-list', slug, recordId: id, relationship,
        query: search as Record<string, string>,
      })
      // Tagged failure shapes (`{ ok: false, status: 403 }`) leak straight
      // through to the +Page renderer, which can branch on the shape.
      // null = no manager named `relationship` on R; fall through to the
      // record sub-page lookup so URLs like `/admin/users/u1/activity`
      // (where `activity` is registered under `pages().record`) route
      // through `resourceRecordPageData` rather than 404ing.
      if (out !== null) return out as Record<string, unknown>
      const recordOut = await resourceRecordPageData(panel, slug, id, relationship)
      return recordOut === null ? null : (recordOut as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/relation-create': {
      const slug         = routeParams['slug']
      const id           = routeParams['id']
      const relationship = routeParams['relationship']
      if (!slug || !id || !relationship) return null
      const out = await relationManagerData(panel, {
        kind: 'relation-create', slug, recordId: id, relationship,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/relation-view': {
      const slug         = routeParams['slug']
      const id           = routeParams['id']
      const relationship = routeParams['relationship']
      const childId      = routeParams['childId']
      if (!slug || !id || !relationship || !childId) return null
      const out = await relationManagerData(panel, {
        kind: 'relation-view', slug, recordId: id, relationship, childId,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/relation-edit': {
      const slug         = routeParams['slug']
      const id           = routeParams['id']
      const relationship = routeParams['relationship']
      const childId      = routeParams['childId']
      if (!slug || !id || !relationship || !childId) return null
      const out = await relationManagerData(panel, {
        kind: 'relation-edit', slug, recordId: id, relationship, childId,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    // Phase B nested-relation routes. Param names match those declared
    // by the auto-gen Vike stubs in `src/vite.ts`:
    //   id, relationship, childId1, relationship2, childId2.
    case '/pages/(pilotiq)/nested-relation-list': {
      const slug          = routeParams['slug']
      const id            = routeParams['id']
      const relationship  = routeParams['relationship']
      const childId1      = routeParams['childId1']
      const relationship2 = routeParams['relationship2']
      if (!slug || !id || !relationship || !childId1 || !relationship2) return null
      const out = await relationManagerData(panel, {
        kind: 'nested-relation-list', slug,
        chain: [
          { recordId: id,       relationship },
          { recordId: childId1, relationship: relationship2 },
        ],
        query: search as Record<string, string>,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/nested-relation-create': {
      const slug          = routeParams['slug']
      const id            = routeParams['id']
      const relationship  = routeParams['relationship']
      const childId1      = routeParams['childId1']
      const relationship2 = routeParams['relationship2']
      if (!slug || !id || !relationship || !childId1 || !relationship2) return null
      const out = await relationManagerData(panel, {
        kind: 'nested-relation-create', slug,
        chain: [
          { recordId: id,       relationship },
          { recordId: childId1, relationship: relationship2 },
        ],
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/nested-relation-view': {
      const slug          = routeParams['slug']
      const id            = routeParams['id']
      const relationship  = routeParams['relationship']
      const childId1      = routeParams['childId1']
      const relationship2 = routeParams['relationship2']
      const childId2      = routeParams['childId2']
      if (!slug || !id || !relationship || !childId1 || !relationship2 || !childId2) return null
      const out = await relationManagerData(panel, {
        kind: 'nested-relation-view', slug,
        chain: [
          { recordId: id,       relationship },
          { recordId: childId1, relationship: relationship2 },
        ],
        childId: childId2,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/nested-relation-edit': {
      const slug          = routeParams['slug']
      const id            = routeParams['id']
      const relationship  = routeParams['relationship']
      const childId1      = routeParams['childId1']
      const relationship2 = routeParams['relationship2']
      const childId2      = routeParams['childId2']
      if (!slug || !id || !relationship || !childId1 || !relationship2 || !childId2) return null
      const out = await relationManagerData(panel, {
        kind: 'nested-relation-edit', slug,
        chain: [
          { recordId: id,       relationship },
          { recordId: childId1, relationship: relationship2 },
        ],
        childId: childId2,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    default:
      return null
  }
}
