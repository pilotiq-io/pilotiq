import type { Pilotiq } from '../Pilotiq.js'
import type { Page } from '../Page.js'
import { Element } from '../schema/Element.js'
import { resolveSchema, type SchemaContext, type RenderContext } from '../schema/resolveSchema.js'
import { Form } from '../elements/Form.js'
import { applyStateUpdate, coerceFormValues, findForms, findWizardStep, selectFormById } from '../elements/dispatchForm.js'
import { findRecord } from '../orm/modelDefaults.js'
import { isRepeaterField, RepeaterField } from '../fields/RepeaterField.js'
import { isBuilderField, BuilderField } from '../fields/BuilderField.js'
import { SelectField } from '../fields/SelectField.js'
import { validateSchema } from '../validation/index.js'
import { callPageSchema, uploadCtx, userCtx } from './helpers.js'

// ─── Shared scope → page+form+record resolver ────────────────
//
// Every form-subresource builder (`formStateData / formWizardData /
// formCreateOptionData / mentionResolveData`) needs to: resolve the
// `FormStateScope` to a concrete `PageClass`, build the upload/user-aware
// `SchemaContext`, call the page's `schema()`, and pick the requested form
// by id. `resolveScopeForm` does that whole prelude in one async step.

interface ResolveScopeFormSuccess {
  ok:        true
  PageClass: typeof Page
  baseCtx:   SchemaContext
  elements:  Element[]
  form:      Form
  record:    unknown
  mode:      'create' | 'edit'
}

interface ResolveScopeFormFormMissing {
  ok:     false
  status: 404
  error:  string
}

/**
 * Resolve `FormStateScope` → `{ PageClass, baseCtx, elements, form, record, mode }`.
 *
 * Returns `null` when the scope's slug doesn't resolve to a real
 * resource/global/page or the matching page-role (`create`/`edit`) isn't
 * registered — caller returns 404 to the client. Returns
 * `{ ok: false, status: 404, error }` when the page resolves but the
 * requested `formId` isn't on it.
 */
async function resolveScopeForm(
  pilotiq: Pilotiq,
  scope:   FormStateScope,
  formId:  string,
  user:    unknown,
): Promise<ResolveScopeFormSuccess | ResolveScopeFormFormMissing | null> {
  const cfg = pilotiq.getConfig()

  let PageClass: typeof Page | undefined
  let mode: 'create' | 'edit'
  let record: unknown = undefined
  let baseCtxExtras: Record<string, unknown> = {}

  if (scope.kind === 'resource-create' || scope.kind === 'resource-edit') {
    const R = pilotiq.findResource(scope.slug)
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
    const G = pilotiq.findGlobal(scope.slug)
    if (!G) return null
    const pages = G.resolvePages()
    if (!pages.edit) return null
    PageClass = pages.edit
    mode = 'edit'
  } else {
    const P = pilotiq.findPage(scope.pageSlug)
    if (!P) return null
    PageClass = P
    // Custom pages don't have a record/edit-mode concept — pass mode
    // 'edit' so resolveSchema treats fields as form inputs (not table
    // cells / view-mode read-only).
    mode = 'edit'
  }

  const baseCtx: SchemaContext = uploadCtx(userCtx({ mode, basePath: cfg.path, ...baseCtxExtras }, user), cfg)
  const elements = await callPageSchema(PageClass, baseCtx)
  const form = selectFormById(findForms(elements), formId)
  if (!form) return { ok: false, status: 404, error: `Form "${formId}" not found on page` }

  return { ok: true, PageClass, baseCtx, elements, form, record, mode }
}

// ─── Form-related data builders ─────────────────────────────
//
// Plan #5 partial-resolve (formStateData), Plan #8 wizard step-validate
// (formWizardData), inline-create-option (formCreateOptionData), and
// async-mention resolve (mentionResolveData). All four sit downstream
// of `resolveSchema` and re-run the form lifecycle in narrower modes
// (just the changed field; just the requested step; etc.).


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
  const user = await pilotiq.resolveUser(req)
  const loaded = await resolveScopeForm(pilotiq, scope, body.formId, user)
  if (!loaded)     return null
  if (!loaded.ok)  return loaded
  const { baseCtx, form, record } = loaded

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
  const user = await pilotiq.resolveUser(req)
  const loaded = await resolveScopeForm(pilotiq, scope, body.formId, user)
  if (!loaded)     return null
  if (!loaded.ok)  return loaded
  const { form, record } = loaded

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
  const user = await pilotiq.resolveUser(req)
  const loaded = await resolveScopeForm(pilotiq, scope, body.formId, user)
  if (!loaded)     return null
  if (!loaded.ok)  return loaded
  const { baseCtx, form, record } = loaded

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
      const visCtx: import('../actions/Action.js').ActionVisibilityContext = {}
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
  const user = await pilotiq.resolveUser(req)
  const loaded = await resolveScopeForm(pilotiq, scope, body.formId, user)
  if (!loaded)     return null
  if (!loaded.ok)  return loaded
  const { form, record } = loaded

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
