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

import {
  findRelatedResource,
  relationManagerData,
  resolveRelationChain,
  safeManagerPolicy,
  type RelationManagerResult,
  type RelationManagerScope,
  type ResolvedChain,
} from './pageData/relationPages.js'

// Re-export relation manager builder surface for external consumers
// (routes.ts dispatches every relation-* role through these).
export type {
  RelationManagerResult,
  RelationManagerScope,
  ResolvedChain,
} from './pageData/relationPages.js'
export {
  findRelatedResource,
  relationManagerData,
  resolveRelationChain,
  safeManagerPolicy,
} from './pageData/relationPages.js'


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
