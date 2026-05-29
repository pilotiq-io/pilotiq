import type {
  PilotiqConfig,
  EditPageHydrator,
  EditPageHydratorContext,
} from '../Pilotiq.js'
import type { Page } from '../Page.js'
import { Element } from '../schema/Element.js'
import { Field } from '../fields/Field.js'
import type { SchemaContext, RenderContext } from '../schema/resolveSchema.js'
import { Form } from '../elements/Form.js'
import { Column } from '../Column.js'
import { SelectField } from '../fields/SelectField.js'
import { isRepeaterField, RepeaterField } from '../fields/RepeaterField.js'
import { isBuilderField, BuilderField } from '../fields/BuilderField.js'
import { isServerDataElement, type ServerDataElement } from '../schema/ServerDataElement.js'
import { findActions, findRowExtraActions } from '../elements/dispatchAction.js'
import { findForms, loadRelationRows } from '../elements/dispatchForm.js'
import { findTables } from '../elements/dispatchTable.js'
import {
  getMorphRelationDescriptor,
  getPrimaryKey,
  type ModelLike,
} from '../orm/modelDefaults.js'

// ─── pageData shared helpers ────────────────────────────────
//
// URL-tag helpers (stamp dispatch URLs / cell-edit endpoints / wizard
// endpoints / mention-resolve endpoints), the load-record fill pipeline
// (`applyFillPipeline` + relationship Repeater/Builder fills),
// server-data widget resolution, and the two `*Ctx` helpers that the
// per-role builders use to construct the `SchemaContext` they pass into
// `resolveSchema`. Pure (mostly stateless) helpers — no per-page-role
// orchestration.


export function userCtx<C extends SchemaContext>(ctx: C, user: unknown): C {
  if (user === null || user === undefined) return ctx
  return { ...ctx, user: user as NonNullable<SchemaContext['user']> }
}

/**
 * Run a (possibly async) boolean predicate; fail closed when it throws.
 *
 * Every page-builder pre-flight that consults `canX(user, …)` needs this
 * shape — predicates may be sync booleans, Promises, or throw at the
 * remote-auth layer; a throw must never propagate to the wire as an
 * unhandled 500.
 */
export async function safeBool(fn: () => boolean | Promise<boolean>): Promise<boolean> {
  try { return Boolean(await fn()) } catch { return false }
}

/** Plan #6 — stamp the panel-wide upload URL so `FileUpload` fields
 *  emit it on their meta. Single URL for the whole panel; no per-field
 *  variation. The route is always registered (see `_uploads` in
 *  `routes.ts`) — meta is stamped regardless of whether an adapter is
 *  configured so the renderer can show a clear error rather than
 *  silently breaking. The companion `hasUploadAdapter` flag distinguishes
 *  "URL exists but adapter missing" so fields with optional upload
 *  affordances (e.g. `MarkdownField`'s `attachFiles` button) can hide
 *  themselves rather than render a broken control. */
export function uploadCtx<C extends SchemaContext>(ctx: C, cfg: PilotiqConfig): C {
  return {
    ...ctx,
    uploadUrl: `${cfg.path}/_uploads`,
    ...(cfg.uploads ? { hasUploadAdapter: true } : {}),
    // App locale for built-in dateTime/money/numeric entry formatting, so the
    // server-stamped `_formatted` is deterministic (consumed in Entry.toMeta).
    ...(cfg.locale !== undefined ? { locale: cfg.locale } : {}),
  }
}


export async function callPageSchema(PageClass: typeof Page, ctx: SchemaContext): Promise<Element[]> {
  return Promise.resolve(PageClass.schema(ctx))
}

/** Mark every Form on the page with its action URL so the rendered <form> posts to itself. */
export function tagFormActions(elements: ReadonlyArray<Element>, action: string): void {
  for (const form of findForms(elements)) {
    if (!form.getAction()) form.action(action)
  }
}

/**
 * Plan #5 — stamp the partial-resolve endpoint URL on every form whose
 * descendants include at least one `live()` field. The client uses
 * `FormMeta.stateUrl` to flip into controlled-state mode; forms without
 * any live fields stay uncontrolled (zero-cost legacy path).
 *
 * `urlBuilder(formId)` lets the caller compose a per-form URL — the
 * endpoint shape is `${base}/${slug}/_form/${formId}/state` so each
 * form on a multi-form page gets its own route segment.
 */
export function tagFormStateUrls(
  elements:   ReadonlyArray<Element>,
  urlBuilder: (formId: string) => string,
): void {
  for (const form of findForms(elements)) {
    if (formHasLiveField(form)) {
      form.withStateUrl(urlBuilder(form.getFormId()))
    }
  }
}

/**
 * Reorderable rows — stamp the POST-reorder URL on every `Table` that
 * has `Table.reorderable()` set. The renderer reads `TableMeta.reorderUrl`
 * to wire the drop handler; tables that aren't reorderable skip wiring
 * entirely. Same shape as `tagFormStateUrls` so the call site stays
 * consistent.
 */
export function tagTableReorderUrls(
  elements: ReadonlyArray<Element>,
  url:      string,
): void {
  for (const table of findTables(elements)) {
    if (table.isReorderable() && !table.getReorderUrl()) {
      table.withReorderUrl(url)
    }
  }
}

// Marks every Table on the page deferred and stamps the URL the
// renderer will fetch from after mount. Must run BEFORE `loadTableRecords`
// so the records handler short-circuits.
export function tagTableDeferred(
  elements: ReadonlyArray<Element>,
  url:      string,
): void {
  for (const table of findTables(elements)) {
    table.withDeferred(true)
    table.withTableUrl(url)
  }
}

/**
 * Editable cell columns — walk every table on the page and stamp
 * `_cellEditUrls[colName]` per row, but only on rows that already
 * carry a `_cellEditable[colName]` marker (set by `loadTableRecords`
 * after `R.canEdit(user, row)` passed). The dispatcher stays
 * URL-shape-agnostic; URL building lives here parallel to
 * `tagFormStateUrls / tagTableReorderUrls`.
 *
 * `idOf` extracts the per-row primary key. Defaults to reading `id` —
 * works for the rudder ORM convention. Resources with a different
 * primary-key column should pass an override (none in v1).
 */
export function tagCellEditUrls(
  elements:  ReadonlyArray<Element>,
  resourceUrl: string,
  idOf:      (row: Record<string, unknown>) => unknown = row => row['id'],
): void {
  for (const table of findTables(elements)) {
    const rows = table.getRows() as ReadonlyArray<Record<string, unknown>> | undefined
    if (!rows || rows.length === 0) continue
    // Optimisation: skip the table when none of its columns are editable.
    const editable = (table.getChildren() ?? []).some(c => c instanceof Column && c.isEditable())
    if (!editable) continue
    for (const row of rows) {
      const editableMap = row['_cellEditable'] as Record<string, true> | undefined
      if (!editableMap) continue
      const id = idOf(row)
      if (id === undefined || id === null || id === '') continue
      const urls: Record<string, string> = {}
      for (const colName of Object.keys(editableMap)) {
        urls[colName] = `${resourceUrl}/${encodeURIComponent(String(id))}/_cell/${encodeURIComponent(colName)}`
      }
      ;(row as Record<string, unknown>)['_cellEditUrls'] = urls
    }
  }
}

/**
 * Plan #8 — stamp the wizard step-validate endpoint URL on every form
 * whose descendants include a `Wizard` element. `FormMeta.wizardUrl` is
 * what the client posts to on Next-button clicks; forms without a wizard
 * descendant skip wiring.
 */
export function tagFormWizardUrls(
  elements:   ReadonlyArray<Element>,
  urlBuilder: (formId: string) => string,
): void {
  for (const form of findForms(elements)) {
    if (formHasWizard(form)) {
      form.withWizardUrl(urlBuilder(form.getFormId()))
    }
  }
}

/**
 * Stamp `_agentRunBase` on every field element in the resolved
 * `ElementMeta[]` tree that carries `aiActions`. Operates on the
 * post-`resolveSchema` wire shape (plain objects) rather than on
 * `Element` instances — `aiActions` is added by the `field-ai.ts`
 * wrapper during `toMeta()`, so it isn't visible to pre-resolve walkers.
 *
 * Only called on edit pages where a `recordId` is known. Create pages
 * deliberately skip it — field AI actions target existing content.
 */
export function tagFieldAiUrls(
  elements: ReadonlyArray<Record<string, unknown>>,
  agentBase: string,
): void {
  for (const el of elements) {
    if (Array.isArray(el['aiActions']) && (el['aiActions'] as unknown[]).length > 0) {
      ;(el as Record<string, unknown>)['_agentRunBase'] = agentBase
    }
    const children = el['children']
    if (Array.isArray(children)) tagFieldAiUrls(children as Record<string, unknown>[], agentBase)
    // Repeater rows
    const rows = el['rows']
    if (Array.isArray(rows)) {
      for (const row of rows as Record<string, unknown>[]) {
        const rowChildren = row['children']
        if (Array.isArray(rowChildren)) tagFieldAiUrls(rowChildren as Record<string, unknown>[], agentBase)
      }
    }
  }
}

/**
 * Audit row 2026-05-07 cont'd⁸ — stamp the inline-create-option endpoint
 * URL on every `SelectField` that has called `createOptionForm()`. Walks
 * every form on the page so the URL carries the parent form's id; URL
 * shape `${formScopeUrl}/_form/${formId}/create-option/${fieldName}` so
 * the route handler can pick the form by id and the field by name.
 *
 * Mirrors `tagFormStateUrls / tagFormWizardUrls` — operates on the
 * un-resolved Element tree, mutates field-instance state via
 * `field.withCreateOptionUrl(url)`, and the field's `toMeta()` reads it
 * back to emit `createOption.url`.
 *
 * Stops at Repeater / Builder boundaries (parallel to the form-state /
 * wizard walkers): inside-row schemas are dispatched per-row and the
 * createOption shape doesn't compose with row body coercion in v1.
 */
export function tagSelectCreateOptionUrls(
  elements:   ReadonlyArray<Element>,
  urlBuilder: (formId: string, fieldName: string) => string,
): void {
  for (const form of findForms(elements)) {
    const formId = form.getFormId()
    walkSelectFields(form.getChildren() as Element[] ?? [], (field) => {
      if (field.hasCreateOption() && !field.getCreateOptionUrl()) {
        field.withCreateOptionUrl(urlBuilder(formId, field.name))
      }
    })
  }
}

export function walkSelectFields(elements: Element[], visit: (f: SelectField) => void): void {
  for (const el of elements) {
    if (el instanceof SelectField) {
      visit(el)
      // SelectField has no children of its own — no recursion needed.
      continue
    }
    // Stop at row-array boundaries — see comment on `tagSelectCreateOptionUrls`.
    if (el instanceof RepeaterField) continue
    if (el instanceof BuilderField)  continue
    const children = el.getChildren()
    if (children && children.length > 0) walkSelectFields(children as Element[], visit)
  }
}

/**
 * Adapter-package async-resolve walker. Stamps the per-form mentions URL
 * on every field that ducks like a "rich text with at least one async
 * mention provider". The duck-typed contract lives here (as opposed to
 * importing from `@pilotiq/tiptap`) so pilotiq core stays adapter-free —
 * any future field type with an async-resolve trigger can satisfy the
 * same shape and pick up URL stamping for free.
 *
 * Contract:
 *   - `getType() === 'richtext'`  (fast filter)
 *   - `hasAsyncMentions(): boolean`
 *   - `withMentionsUrl(url: string): unknown`
 *
 * Walks every form on the page so the URL builder can mint a per-form
 * URL (mirrors `tagFormStateUrls / tagFormWizardUrls`). The route handler
 * uses formId in the URL to select the form; the body carries `field`
 * + `trigger` + `query`. One URL per (form, scope), reused across every
 * async-mention field on that form.
 */
interface AsyncMentionFieldLike {
  hasAsyncMentions(): boolean
  withMentionsUrl(url: string): unknown
}

export function isAsyncMentionField(el: Element): el is Element & AsyncMentionFieldLike {
  if (el.getType() !== 'richtext') return false
  const candidate = el as unknown as Partial<AsyncMentionFieldLike>
  return typeof candidate.hasAsyncMentions === 'function'
      && typeof candidate.withMentionsUrl  === 'function'
}

export function tagRichTextMentionUrls(
  elements:   ReadonlyArray<Element>,
  urlBuilder: (formId: string) => string,
): void {
  for (const form of findForms(elements)) {
    const url = urlBuilder(form.getFormId())
    const visit = (els: ReadonlyArray<Element>): void => {
      for (const el of els) {
        // Don't cross into nested forms — each form gets its own URL.
        if (el !== form && el.getType() === 'form') continue
        if (isAsyncMentionField(el) && el.hasAsyncMentions()) {
          el.withMentionsUrl(url)
        }
        // Builder.getChildren() returns undefined to keep the field-level
        // walkers from treating heterogeneous rows as flat children. Manual
        // descent into each block's schema covers the URL-stamping path
        // without changing the no-cross posture for save/coerce.
        if (isBuilderField(el)) {
          for (const block of (el as BuilderField).getBlocks()) visit(block.getSchema())
          continue
        }
        const children = el.getChildren()
        if (children) visit(children)
      }
    }
    const children = form.getChildren()
    if (children) visit(children)
  }
}

export function formHasLiveField(form: Form): boolean {
  let found = false
  const visit = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (found) return
      // Either a server-side `live()` (drives a roundtrip) OR a
      // client-side `afterStateUpdatedJs(body)` (JS-only) is enough to
      // mount the controlled-form path: the FormStateProvider holds the
      // values map either path needs, and the client gates the actual
      // network POST on `live` separately. Cost of the over-stamp for
      // JS-only forms is one unused endpoint URL per form — endpoint
      // never gets hit because the client only POSTs on `live`.
      if (el instanceof Field && (el.isLive() || el.getAfterStateUpdatedJs() !== undefined)) {
        found = true
        return
      }
      const children = el.getChildren()
      if (children) visit(children)
    }
  }
  const children = form.getChildren()
  if (children) visit(children)
  return found
}

export function formHasWizard(form: Form): boolean {
  let found = false
  const visit = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (found) return
      if (el.getType() === 'wizard') { found = true; return }
      const children = el.getChildren()
      if (children) visit(children)
    }
  }
  const children = form.getChildren()
  if (children) visit(children)
  return found
}

/**
 * Run the edit-mode fill pipeline on a loaded record:
 *   mutateFormDataBeforeFill  →  fillFromRecord  →  mutateFormDataAfterFill
 *
 * `fillFromRecord` defaults to `{ ...record }` when not configured. Both
 * mutators are optional and may be async. `ctx.record` is the loaded
 * record so mutators can read from fields the form doesn't surface.
 */
export async function applyFillPipeline<R>(
  form:   Form<R>,
  record: R,
): Promise<Record<string, unknown>> {
  const recordObj = record as unknown as Record<string, unknown>
  let values: Record<string, unknown> = { ...recordObj }

  const before = form.getMutateFormDataBeforeFill()
  if (before) values = await before(values, { values, record })

  const fill = form.getFillFromRecord()
  if (fill) values = fill(record)

  const after = form.getMutateFormDataAfterFill()
  if (after) values = await after(values, { values, record })

  return normalizeArrayFieldStrings(form, values)
}

/**
 * Walk the form for Repeater / Builder field names whose value on `values`
 * is a JSON string (the shape a `String?` column produces when records are
 * seeded outside the pilotiq save path — raw SQL, migrations, imports).
 * Pilotiq's save path stringifies these arrays via `coerceFormValues`, but
 * the load path doesn't auto-parse — so a fresh `String?` column lands here
 * as a string, then `resolveRepeaterRows` sees `Array.isArray(string) === false`
 * and falls through to empty rows on first paint. The collab path is
 * symmetric: the string lands in the form-data Y.Map, `migrateLegacyArrays`
 * sees `Array.isArray(string) === false`, and silently skips migration.
 *
 * Parse defensively — anything that doesn't deserialize to an array is left
 * verbatim so a stray non-JSON string doesn't get clobbered. Non-string
 * values pass through untouched (already-array, null, undefined, number).
 */
export function normalizeArrayFieldStrings<R>(
  form:   Form<R>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const arrayFieldNames = collectArrayFieldNames(form.getChildren() ?? [])
  if (arrayFieldNames.length === 0) return values
  let out: Record<string, unknown> | null = null
  for (const name of arrayFieldNames) {
    const raw = values[name]
    if (typeof raw !== 'string') continue
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { continue }
    if (!Array.isArray(parsed)) continue
    if (!out) out = { ...values }
    out[name] = parsed
  }
  return out ?? values
}

/** Walk the form's children for top-level Repeater + Builder field names.
 *  Stops at array-row boundaries — nested Repeater/Builder fields live
 *  inside their parent's inner schema and aren't top-level form fields. */
function collectArrayFieldNames(elements: ReadonlyArray<Element>): string[] {
  const out: string[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (isRepeaterField(el) || isBuilderField(el)) {
        const name = (el as RepeaterField | BuilderField).name
        if (name) out.push(name)
        continue
      }
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
    }
  }
  walk(elements)
  return out
}

/**
 * Walk every hydrator registered via `Pilotiq.editPageHydrator(fn)` and
 * merge non-null returns onto `currentValues`. Hydrators run sequentially
 * in registration order; later returns override keys from earlier ones.
 *
 * Failure mode is permissive: a hydrator that throws or returns `null`
 * contributes nothing; the page still renders against the fill-pipeline
 * values it received. Errors emit a `console.warn` so the page isn't
 * silently relying on missing data.
 *
 * Returns the merged overlay (NOT the final values). The caller composes
 * the overlay onto the form via `form.withValues({ ...current, ...overlay })`
 * — keeps the merge order explicit at the call site (overlay wins).
 *
 * Empty hydrators array / no overrides → returns `{}` so callers can
 * skip the `withValues` call cheaply.
 */
export async function applyEditPageHydrators(
  hydrators: ReadonlyArray<EditPageHydrator>,
  ctx:       EditPageHydratorContext,
): Promise<Record<string, unknown>> {
  if (hydrators.length === 0) return {}
  let overlay: Record<string, unknown> = {}
  for (const fn of hydrators) {
    try {
      const result = await fn(ctx)
      if (result && typeof result === 'object') overlay = { ...overlay, ...result }
    } catch (err) {
      console.warn('[pilotiq] editPageHydrator threw — falling back to fill-pipeline values', err)
    }
  }
  return overlay
}

/**
 * Walk the form's top-level Repeaters and replace `values[fieldName]`
 * with rows fetched from `parent.related(name)` for any
 * relationship-backed Repeater. Each loaded row stamps `__id` to the
 * child's primary key so the renderer can round-trip identity through
 * a hidden input and the save-side diff can match submitted rows back
 * to existing records.
 *
 * No-op when the parent record is null (create mode), when no
 * relationship-backed Repeaters exist on the form, or when the
 * resource has no `R.model` (relation queries need it).
 *
 * Mutates and returns a fresh values object — never the input.
 */
export async function applyRelationshipRepeaterFill(
  form:        Form,
  values:      Record<string, unknown>,
  record:      unknown,
  parentModel: ModelLike | undefined,
): Promise<Record<string, unknown>> {
  if (record == null) return values
  if (!parentModel)  return values
  const repeaters = findRelationshipRepeaters(form.getChildren() ?? [])
  if (repeaters.length === 0) return values

  const out: Record<string, unknown> = { ...values }
  for (const repeater of repeaters) {
    const cfg = repeater.getRelationship()!
    const pivotColumns = cfg.pivotColumns
    let rows: unknown[]
    try {
      rows = await loadRelationRows(parentModel, record, cfg.name, pivotColumns)
    } catch {
      // Failed lookup (e.g. missing `relations` map on a test stub)
      // — fall back to whatever value applyFillPipeline produced
      // rather than wiping the field. Better to render stale data
      // than to silently empty the row list.
      continue
    }

    // The child model is opaque here — we don't have the full
    // descriptor at this seam, so use the configured override or
    // peek the parent's relations map for the FK column. Strip it
    // (and the PK) from each row's payload so the inner schema
    // doesn't surface them as form values. For morphMany the
    // attachment is two columns instead of one — strip both.
    const pkColumn   = pickChildPrimaryKey(parentModel, cfg.name) ?? 'id'
    const fkColumn   = cfg.foreignKey ?? pickChildForeignKey(parentModel, cfg.name)
    const morph      = getMorphRelationDescriptor(parentModel, cfg.name)
    const morphIdCol = morph ? `${morph.morphName}Id`   : undefined
    const morphTyCol = morph ? `${morph.morphName}Type` : undefined

    out[repeater.name] = rows.map(row => {
      const r = (row && typeof row === 'object') ? { ...(row as Record<string, unknown>) } : {}
      const pkValue = r[pkColumn]
      delete r[pkColumn]
      if (fkColumn)   delete r[fkColumn]
      if (morphIdCol) delete r[morphIdCol]
      if (morphTyCol) delete r[morphTyCol]
      // M2M pivot extras — flatten `row.pivot[col]` onto the row's data
      // so each pivot column round-trips through the inner schema as a
      // regular form field. The pivot envelope itself is dropped from
      // the values shape — the persist side splits pivot vs child
      // columns by name lookup against `cfg.pivotColumns`.
      const pivotEnvelope = r['pivot']
      delete r['pivot']
      const stamped: Record<string, unknown> = { ...r }
      if (pivotColumns && pivotColumns.length > 0
        && pivotEnvelope && typeof pivotEnvelope === 'object'
      ) {
        const pe = pivotEnvelope as Record<string, unknown>
        for (const col of pivotColumns) {
          if (col in pe) stamped[col] = pe[col]
        }
      }
      if (pkValue !== undefined && pkValue !== null) {
        stamped['__id'] = String(pkValue)
      }
      return stamped
    })
  }
  return out
}

/** Walk the form's children for top-level relationship-backed Repeaters. */
export function findRelationshipRepeaters(elements: ReadonlyArray<Element>): RepeaterField[] {
  const out: RepeaterField[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (isRepeaterField(el)) {
        const r = el as RepeaterField
        if (r.getRelationship()) out.push(r)
        // Don't dive into Repeater children — relationship-on-relationship
        // isn't supported in v1.
        continue
      }
      // Don't dive into Builder children either — relationship-backed
      // Builders are resolved separately by `findRelationshipBuilders`.
      if (isBuilderField(el)) continue
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
    }
  }
  walk(elements)
  return out
}

/**
 * Walk the form's top-level Builders and replace `values[fieldName]` with
 * rows fetched from `parent.related(name)` for any relationship-backed
 * Builder. Each loaded row stamps `__id` (child PK) + `type` (block
 * discriminator) + `data` (per-block JSON payload) so the renderer can
 * round-trip the heterogeneous envelope.
 *
 * Mirrors `applyRelationshipRepeaterFill`. No-op when the parent record
 * is null (create mode), the resource has no `R.model`, or no
 * relationship-backed Builders exist on the form.
 */
export async function applyRelationshipBuilderFill(
  form:        Form,
  values:      Record<string, unknown>,
  record:      unknown,
  parentModel: ModelLike | undefined,
): Promise<Record<string, unknown>> {
  if (record == null) return values
  if (!parentModel)  return values
  const builders = findRelationshipBuilders(form.getChildren() ?? [])
  if (builders.length === 0) return values

  const out: Record<string, unknown> = { ...values }
  for (const builder of builders) {
    const cfg = builder.getRelationship()!
    let rows: unknown[]
    try {
      rows = await loadRelationRows(parentModel, record, cfg.name)
    } catch {
      // Failed lookup (e.g. missing `relations` map on a test stub) —
      // fall back to whatever value applyFillPipeline produced rather
      // than wiping the field. Better stale than silently empty.
      continue
    }

    const pkColumn   = pickChildPrimaryKey(parentModel, cfg.name) ?? 'id'
    const fkColumn   = cfg.foreignKey ?? pickChildForeignKey(parentModel, cfg.name)
    const typeColumn = cfg.typeColumn ?? 'type'
    const dataColumn = cfg.dataColumn ?? 'data'

    out[builder.name] = rows.map(row => {
      const r = (row && typeof row === 'object') ? { ...(row as Record<string, unknown>) } : {}
      const pkValue   = r[pkColumn]
      const blockType = typeof r[typeColumn] === 'string' ? (r[typeColumn] as string) : ''
      const dataRaw   = r[dataColumn]
      const blockData = parseBuilderDataPayload(dataRaw)

      const stamped: Record<string, unknown> = {
        type: blockType,
        data: blockData,
      }
      if (pkValue !== undefined && pkValue !== null) {
        stamped['__id'] = String(pkValue)
      }
      // Non-`type` / `data` / FK / PK columns aren't surfaced — the
      // JSON envelope is the source of truth for per-block fields. If
      // a user denormalizes a column, they handle it via per-block
      // mutate hooks, not by leaking the column into row values.
      void fkColumn
      return stamped
    })
  }
  return out
}

/**
 * Normalize the JSON payload column into a plain object. Prisma
 * hydrates `Json` columns to objects; some adapters return strings.
 * Anything that isn't a parseable object falls back to `{}` so the
 * inner schema renders fresh defaults.
 */
export function parseBuilderDataPayload(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // fall through to {}
    }
  }
  return {}
}

/** Walk the form's children for top-level relationship-backed Builders. */
export function findRelationshipBuilders(elements: ReadonlyArray<Element>): BuilderField[] {
  const out: BuilderField[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (isBuilderField(el)) {
        const b = el as BuilderField
        if (b.getRelationship()) out.push(b)
        continue
      }
      // Don't dive into Repeater children either — both array-row
      // boundaries are walker stops here.
      if (isRepeaterField(el)) continue
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
    }
  }
  walk(elements)
  return out
}

/** Read the child model's PK column from the parent's relations map, when present. */
export function pickChildPrimaryKey(parentModel: ModelLike, name: string): string | undefined {
  const relations = (parentModel as unknown as Record<string, unknown>)['relations']
  if (!relations || typeof relations !== 'object') return undefined
  const entry = (relations as Record<string, unknown>)[name]
  if (!entry || typeof entry !== 'object') return undefined
  const e = entry as Record<string, unknown>
  if (typeof e['model'] !== 'function') return undefined
  try {
    const child = (e['model'] as () => ModelLike)()
    return getPrimaryKey(child)
  } catch {
    return undefined
  }
}

/** Read the FK column from the parent's relations map, when present. */
export function pickChildForeignKey(parentModel: ModelLike, name: string): string | undefined {
  const relations = (parentModel as unknown as Record<string, unknown>)['relations']
  if (!relations || typeof relations !== 'object') return undefined
  const entry = (relations as Record<string, unknown>)[name]
  if (!entry || typeof entry !== 'object') return undefined
  const e = entry as Record<string, unknown>
  return typeof e['foreignKey'] === 'string' ? (e['foreignKey'] as string) : undefined
}

// ─── Plan #15 server-data widgets ─────────────────────────────

/** Wire-shape of the per-widget data map shipped to the client.
 *  Lazy elements stamp `null` (renderer paints skeleton + fetches);
 *  eager elements stamp their resolved payload. Errors stamp
 *  `{ error: '<message>' }` so the renderer can surface a per-widget
 *  failure without blanking the page. */
export type ServerDataMap = Record<string, unknown>

/**
 * Plan #15 — collect every `ServerDataElement` in the schema tree and
 * resolve their `getServerData(ctx)` payloads in parallel. Returns a
 * map keyed by element id, ready to ship as `viewProps._widgetData`.
 *
 * Lazy elements (default — `lazy(false)` opts out) skip the hook and
 * stamp `null` so the renderer paints a skeleton and fetches the
 * payload via `POST {base}/_widget/:id` on mount. Eager elements
 * resolve synchronously and ship the data with the page.
 *
 * Per-widget errors are caught and surfaced as `{ error: '...' }` —
 * one flaky `getStats()` shouldn't 500 the entire dashboard.
 *
 * Visibility is **not** re-evaluated here. The schema resolver
 * (`resolveSchema → evaluateVisibility`) drops hidden layout elements
 * before any widget code runs. Widgets inside still-rendered branches
 * always resolve (or stamp lazy null).
 */
export async function resolveServerDataElements(
  elements: ReadonlyArray<Element>,
  ctx:      RenderContext,
): Promise<ServerDataMap> {
  const widgets = collectServerDataElements(elements)
  if (widgets.length === 0) return {}
  const out: ServerDataMap = {}
  await Promise.all(widgets.map(async (el) => {
    const id = el.getId()
    if (el.isLazy()) {
      out[id] = null  // sentinel — renderer paints skeleton, fetches on mount
      return
    }
    try {
      out[id] = await el.resolveServerData(ctx)
    } catch (err) {
      out[id] = { error: err instanceof Error ? err.message : 'Widget failed to load' }
    }
  }))
  return out
}

/** Walk the tree collecting every `ServerDataElement`. Walks into
 *  containers but stops at Form/Repeater/Builder boundaries — widgets
 *  inside an editable form don't make sense in v1. */
export function collectServerDataElements(elements: ReadonlyArray<Element>): ServerDataElement[] {
  const out: ServerDataElement[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (isServerDataElement(el)) {
        out.push(el)
        // Don't recurse into a widget's children — `View` etc. are leaves
        // for v1 (no nested widgets inside widgets).
        continue
      }
      // Skip walkers that imply per-row resolution — widgets inside
      // Repeater/Builder rows don't have a stable id space.
      const type = el.getType()
      if (type === 'form' || type === 'repeater' || type === 'builder' || type === 'table' || type === 'tableWidget') continue
      const children = el.getChildren()
      if (children) walk(children)
    }
  }
  walk(elements)
  return out
}

/**
 * Plan #15 — stamp the polling-endpoint URL on every `ServerDataElement`
 * in the tree. Mirrors `tagFormStateUrls / tagTableReorderUrls`. Walks
 * with the same boundaries as `collectServerDataElements` so the wire
 * stays in sync (no orphan widgets without URLs and vice versa).
 *
 * `urlBuilder(id)` typically produces `${base}/_widget/${id}` for
 * dashboard widgets and `${base}/${pageSlug}/_widget/${id}` for
 * custom-page widgets — the route handlers for both shapes are wired up
 * in `routes.ts` (see Phase A.4).
 */
export function tagWidgetUrls(
  elements:   ReadonlyArray<Element>,
  urlBuilder: (id: string) => string,
): void {
  for (const widget of collectServerDataElements(elements)) {
    if (widget.getWidgetUrl()) continue // user-set wins
    widget.withWidgetUrl(urlBuilder(widget.getId()))
  }
}

/**
 * Stamp every form-subresource URL the page might need in one pass:
 *  - `_form/${formId}/state`         (Plan #5 partial-resolve)
 *  - `_form/${formId}/wizard`        (Plan #8 step-validate)
 *  - `_form/${formId}/mentions`      (async-mention typeahead)
 *  - `_form/${formId}/create-option/${fieldName}` (SelectField inline-create)
 *
 * Every page-builder that mounts a form (dashboard / resource create+edit /
 * global edit / custom page) needs all four — the underlying taggers skip
 * forms that don't carry the matching feature, so this is always safe to
 * call. `base` is the route prefix (e.g. `${cfg.path}` / `${resourceBase}` /
 * `${resourceBase}/${recordId}` / `${pageUrl}`).
 */
export function tagFormSubresourceUrls(elements: ReadonlyArray<Element>, base: string): void {
  tagFormStateUrls(elements,          formId             => `${base}/_form/${formId}/state`)
  tagFormWizardUrls(elements,         formId             => `${base}/_form/${formId}/wizard`)
  tagRichTextMentionUrls(elements,    formId             => `${base}/_form/${formId}/mentions`)
  tagSelectCreateOptionUrls(elements, (formId, fieldName) => `${base}/_form/${formId}/create-option/${fieldName}`)
}

/** Stamp dispatchUrl on every handler-style Action so the client knows where to POST. */
export function tagActionDispatch(elements: ReadonlyArray<Element>, baseUrl: string): void {
  for (const action of findActions(elements)) {
    if (!action.getHandler()) continue
    if (action.getHref() || action.getMethod()) continue
    if (action.getDispatchUrl()) continue
    action.dispatchUrl(`${baseUrl}/_action/${action.name}`)
  }
  // Row-scoped extraItemActions (Repeater/Builder). Stamped here too so
  // the client can POST to the same `_action/:name` route — the renderer
  // attaches `_rowPath=<fieldName>.<index>` per click; the server's
  // dispatcher uses that to walk into the right row when building
  // `ctx.row`. See `findRowExtraActions` in `dispatchAction.ts`.
  for (const { action } of findRowExtraActions(elements)) {
    if (!action.getHandler()) continue
    if (action.getDispatchUrl()) continue
    action.dispatchUrl(`${baseUrl}/_action/${action.name}`)
  }
}
