import { Element } from '../schema/Element.js'
import { Field, type AfterStateUpdatedContext } from '../fields/Field.js'
import { FileUploadField, isFileUploadField } from '../fields/FileUploadField.js'
import { RepeaterField, isRepeaterField } from '../fields/RepeaterField.js'
import type { RepeaterRelationshipConfig, RepeaterRowContext } from '../fields/RepeaterField.js'
import { BuilderField, isBuilderField } from '../fields/BuilderField.js'
import type { BuilderRelationshipConfig } from '../fields/BuilderField.js'
import { Form, type FormContext } from './Form.js'
import { validateSchema, type ValidationErrors } from '../validation/index.js'
import { resolveSavedNotification, type NotificationMeta } from '../notifications/index.js'
import {
  getParentRelationDescriptor,
  getMorphRelationDescriptor,
  getM2MRelationDescriptor,
  computeMorphPayload,
  getPrimaryKey,
  resolveRelatedQuery,
  type ModelLike,
  type MorphRelationDescriptor,
} from '../orm/modelDefaults.js'
import { resolveM2MAccessor } from '../orm/m2mAccessor.js'
import { parseDateTimeWire } from '../fields/dateTimeWire.js'

/**
 * Server-emitted rename of a `Repeater.relationship` / `Builder.relationship`
 * row's stable id. When a brand-new row is submitted with a renderer-minted
 * UUID `__id`, `persistRelationshipRows` calls `model.create(...)` and the
 * DB assigns a real primary key — the row's identity then switches from
 * the UUID to `String(pk)`. The submitter learns the new id from the
 * reloaded form's `initialRows`; other collab peers don't, leaving their
 * Y.Doc row state keyed by the orphan UUID. Phase B (see
 * `pilotiq-pro/docs/plans/repeater-relationship-pk-switch.md`) lets a
 * collab adapter subscribe to these renames from the form-submit JSON
 * response and rename the row in the shared CRDT so other peers converge
 * without reloading. Carries no opinion about transport — emitted unconditionally
 * on every relationship-backed row create; consumers without a collab
 * binding ignore the field.
 */
export interface RelationshipRename {
  /** Field name on the form (the `Repeater.make(...)` / `Builder.make(...)` name). */
  field: string
  /** The id the renderer submitted — usually a UUID, occasionally a numeric string
   *  when the consumer pre-assigned an id. May equal `new` when the consumer's
   *  pre-assigned id matched the DB-assigned PK; consumers can no-op in that case. */
  old:   string
  /** The DB-assigned primary key, stringified. */
  new:   string
}

export interface DispatchSuccess<R> {
  ok:            true
  record:        R
  redirect:      string | undefined
  /**
   * Resolved success notifications to flash to the client. Empty when the
   * form has `disableSavedNotification()` or no spec configured. Currently
   * only delivered through the JSON action-modal path; the form-post 303
   * path drops them until a flash mechanism lands.
   */
  notifications: NotificationMeta[]
  /**
   * Per-row UUID → PK renames emitted by `Repeater.relationship` /
   * `Builder.relationship` creates. Empty when the submitted form had
   * no relationship-backed fields or no new rows. See {@link RelationshipRename}.
   */
  relationshipRenames: RelationshipRename[]
}

export interface DispatchFailure {
  ok:     false
  errors: ValidationErrors
}

export type DispatchResult<R> = DispatchSuccess<R> | DispatchFailure

/**
 * Run the full form submit lifecycle on a `Form` element. Mode is inferred
 * from `ctx.record`: undefined → create, set → update. Mode-specific hooks
 * fire after their generic counterparts so cross-cutting logic (auth
 * stamping, audit fields) lives above mode-specific business rules.
 *
 * Order:
 *
 *   validateSchema
 *     → form-level validators
 *     → mutateData (both modes)
 *     → mutateDataBeforeCreate / mutateDataBeforeUpdate
 *     → beforeSave (both modes)
 *     → beforeCreate / beforeUpdate
 *     → handleCreate || handleUpdate || save     ← persistence
 *     → afterCreate / afterUpdate
 *     → afterSave (both modes)
 *     → redirectAfterSave
 *
 * Validation failures short-circuit and return `{ ok: false, errors }`. On
 * success the result includes the saved record and the resolved redirect URL
 * (when `redirectAfterSave` is configured).
 *
 * Form-level validator errors are keyed under `_form` so the renderer can
 * surface them as a top-of-form banner without colliding with field names.
 */
export async function dispatchFormSubmit<R = unknown>(
  form: Form<R>,
  body:  Record<string, unknown>,
  ctx:   FormContext<R>,
): Promise<DispatchResult<R>> {
  const children = form.getChildren() ?? []
  const isCreate = ctx.record === undefined

  const fieldErrors = await validateSchema(children as Element[], body, ctx.record)

  const formValidatorErrors: string[] = []
  for (const v of form.getFormValidators()) {
    const msg = await v(body, { values: body, ...(ctx.record !== undefined ? { record: ctx.record } : {}) })
    if (msg) formValidatorErrors.push(msg)
  }

  const errors: ValidationErrors = { ...fieldErrors }
  if (formValidatorErrors.length > 0) {
    errors['_form'] = formValidatorErrors
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }

  let data: Record<string, unknown> = coerceFormValues(children as Element[], body)
  // Flatten `simple()` Repeaters from the wrapped `[{name: v}]` pipeline
  // shape to the user-declared `[v]` storage shape before any user-side
  // transform runs. Non-simple repeaters are untouched.
  data = unwrapSimpleRepeaters(children as Element[], data)

  // Pull relationship-backed Repeater values OUT of `data` so the
  // parent's save handler doesn't try to write them as a JSON column.
  // The deferral list holds the rows + the field reference; we run
  // the create/update/delete diff against the relation AFTER the
  // parent save returns (so we have a parent PK in create mode).
  const relationshipDeferrals = extractRelationshipRepeaters(children as Element[], data)
  // Same trick for Builders. Heterogeneous-row sibling — each row is a
  // `{ __id?, type, data }` envelope persisted as a child carrying a
  // discriminator column + a JSON payload column.
  const builderRelationshipDeferrals = extractRelationshipBuilders(children as Element[], data)
  // And for relationship-backed multi-selects — the selected ids sync
  // through the M2M accessor after the parent save; the parent has no
  // matching column.
  const selectRelationshipDeferrals = extractRelationshipSelects(children as Element[], data)

  // Per-field submit transforms — `Field.dehydrateStateUsing(fn)`. Runs
  // AFTER coercion + the relationship extracts (values are typed; relation-
  // backed fields have already left `data`) and BEFORE the form-level
  // `mutateData` hook so it observes the final per-field shapes.
  data = await applyDehydrateTransforms(children as Element[], data, ctx.record)

  const mutate = form.getMutateData()
  if (mutate) data = await mutate(data, { ...ctx, values: data })

  const modeMutate = isCreate ? form.getMutateDataBeforeCreate() : form.getMutateDataBeforeUpdate()
  if (modeMutate) data = await modeMutate(data, { ...ctx, values: data })

  const before = form.getBeforeSave()
  if (before) await before(data, { ...ctx, values: data })

  const modeBefore = isCreate ? form.getBeforeCreate() : form.getBeforeUpdate()
  if (modeBefore) await modeBefore(data, { ...ctx, values: data })

  const persist = (isCreate ? form.getHandleCreate() : form.getHandleUpdate()) ?? form.getSave()
  if (!persist) {
    throw new Error(
      '[Pilotiq] Form has no save() handler. Configure Form.save() (or handleCreate/handleUpdate) on the page schema, or override Resource.pages() with a Page that supplies one.',
    )
  }
  const record = await persist(data, { ...ctx, values: data })

  // Persist the relationship-backed Repeater diffs against the saved
  // parent. Runs BEFORE `afterCreate / afterUpdate` so user hooks can
  // observe the fully-saved tree (parent + children).
  const relationshipRenames: RelationshipRename[] = []
  if (relationshipDeferrals.length > 0 || builderRelationshipDeferrals.length > 0) {
    const parentModel = (ctx as { parentModel?: ModelLike }).parentModel
    if (!parentModel) {
      throw new Error(
        '[Pilotiq] Repeater/Builder.relationship: form has relationship-backed rows but no parentModel on the FormContext. ' +
        'Routes that submit forms with relationship-backed Repeaters/Builders must set ctx.parentModel = R.model.',
      )
    }
    for (const deferral of relationshipDeferrals) {
      const renames = await persistRelationshipRows(record, deferral, parentModel)
      relationshipRenames.push(...renames)
    }
    for (const deferral of builderRelationshipDeferrals) {
      const renames = await persistRelationshipBuilderRows(record, deferral, parentModel)
      relationshipRenames.push(...renames)
    }
  }

  // Sync relationship-backed multi-selects against the saved parent.
  // Same placement contract as the Repeater/Builder persists: BEFORE
  // `afterCreate / afterUpdate` so user hooks observe the synced pivots.
  for (const deferral of selectRelationshipDeferrals) {
    await syncRelationshipSelect(record, deferral)
  }

  const modeAfter = isCreate ? form.getAfterCreate() : form.getAfterUpdate()
  if (modeAfter) await modeAfter(record, { ...ctx, record, values: data })

  const after = form.getAfterSave()
  if (after) await after(record, { ...ctx, record, values: data })

  const redirectFn = form.getRedirectAfterSave()
  const redirect = redirectFn ? redirectFn(record, { ...ctx, record, values: data }) : undefined

  const notification = resolveSavedNotification(
    form,
    isCreate ? 'create' : 'update',
    record,
    { ...ctx, record, values: data },
  )
  const notifications = notification ? [notification] : []

  return { ok: true, record, redirect, notifications, relationshipRenames }
}

/**
 * Coerce raw form-body strings into the runtime types each field expects:
 * booleans for toggles, numbers for number inputs, Dates for dates. The
 * browser submits everything as a string by default, but ORM layers (Prisma,
 * etc.) expect actual booleans/numbers/Dates. Runs after validation so
 * validators still see the raw submitted text.
 *
 * Empty / missing values are normalized:
 *   - `toggle`  → `false` when missing or 'false'/empty; `true` otherwise.
 *   - `number`  → `null` when empty; otherwise `Number(v)` (NaN passes through).
 *   - `date`    → `null` when empty; otherwise a `Date` parsed from the string.
 *
 * Other field types are passed through untouched.
 */
/** Remove every occurrence of any character in `chars` from `value`.
 *  O(n) — uses a Set for membership lookup. Multi-codepoint entries
 *  in `chars` (e.g. an emoji passed as one mask token) are matched
 *  whole; the function compares against `Array.from(value)` so
 *  surrogate pairs round-trip correctly. */
function stripChars(value: string, chars: string[]): string {
  const set = new Set(chars)
  let out = ''
  for (const ch of value) if (!set.has(ch)) out += ch
  return out
}

export function coerceFormValues(
  elements: Element[],
  body:     Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body }

  // Plan #14 — Repeater pass. Run BEFORE the regular field coercion so
  // each row's body is coerced against the inner schema (recursive
  // `coerceFormValues` call), not against the parent form. Two body
  // shapes supported: array-valued JSON (`out[name]` already an array)
  // and flat-keyed form bodies (`name.0.childName=…`). Flat-shape keys
  // are removed from `out` after the Repeater value is composed so they
  // don't leak into the persisted record.
  walkRepeatersTopLevel(elements, repeater => {
    if (repeater.isDehydrated() === false) {
      delete out[repeater.name]
      return
    }
    out[repeater.name] = coerceRepeaterValue(repeater, out)
    const prefix = `${repeater.name}.`
    for (const key of Object.keys(out)) {
      if (key.startsWith(prefix)) delete out[key]
    }
  })

  // Plan #14 follow-up — Builder pass. Same disposition as Repeater
  // (run BEFORE the generic field walker so per-row inner-schema
  // coercion uses the row's own body, not the parent form's), but each
  // row's coercion is dispatched against the block matching the row's
  // `type` discriminator. Rows whose `type` doesn't match a registered
  // block have their `data` body passed through verbatim — better to
  // round-trip than to silently drop unknown content.
  walkBuildersTopLevel(elements, builder => {
    if (builder.isDehydrated() === false) {
      delete out[builder.name]
      return
    }
    out[builder.name] = coerceBuilderValue(builder, out)
    const prefix = `${builder.name}.`
    for (const key of Object.keys(out)) {
      if (key.startsWith(prefix)) delete out[key]
    }
  })

  walkFields(elements, field => {
    const name = field.name

    // Plan #6 — `dehydrated(false)` fields are decorative / computed;
    // their value never enters the persisted record. Drop the body key
    // before any coercion or validation runs so downstream code can't
    // see it.
    if (field.isDehydrated() === false) {
      delete out[name]
      return
    }

    const raw  = out[name]
    switch (field.fieldType) {
      case 'toggle':
      case 'checkbox': {
        if (raw === undefined || raw === null || raw === '' || raw === 'false' || raw === '0' || raw === false) {
          out[name] = false
        } else {
          out[name] = true
        }
        break
      }
      case 'number':
      case 'slider': {
        if (raw === undefined || raw === null || raw === '') {
          out[name] = null
        } else if (typeof raw === 'string') {
          out[name] = Number(raw)
        }
        break
      }
      case 'date':
      case 'dateTime': {
        // Both 'date' and 'dateTime' accept ISO strings and
        // YYYY-MM-DD(THH:mm) shapes. Naive date-times parse as
        // wall-clock UTC (matching the renderer's wire formatting) or
        // in the field's `timezone()` when set — structural getter
        // probe, not `instanceof` (Vite SSR module-cache duplication).
        if (raw === undefined || raw === null || raw === '') {
          out[name] = null
        } else if (typeof raw === 'string') {
          const getTz = (field as { getTimezone?: () => string | undefined }).getTimezone
          out[name] = parseDateTimeWire(raw, typeof getTz === 'function' ? getTz.call(field) : undefined)
        }
        break
      }
      case 'checkboxList': {
        // HTML form bodies post checkbox-lists as either an array (when
        // multiple boxes are checked) or a single string (one checked) or
        // undefined (none). Normalize all three to `string[]`.
        if (raw === undefined || raw === null) {
          out[name] = []
        } else if (Array.isArray(raw)) {
          out[name] = raw.map(v => String(v))
        } else {
          out[name] = [String(raw)]
        }
        break
      }
      case 'select': {
        // Single-select stays a string passthrough. Multi-select mirrors
        // `tagsInput` — the client serializes the selected ids as a
        // JSON-encoded string in a single hidden input; parse back into
        // `string[]`. Structural check, not `instanceof` (Vite SSR
        // module-cache duplication).
        if (!isMultiSelectField(field)) break
        if (raw === undefined || raw === null || raw === '') {
          out[name] = []
        } else if (Array.isArray(raw)) {
          out[name] = raw.map(v => String(v))
        } else if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw)
            out[name] = Array.isArray(parsed) ? parsed.map(v => String(v)) : []
          } catch {
            out[name] = []
          }
        } else {
          out[name] = []
        }
        break
      }
      case 'tagsInput': {
        // Client serializes the chip set as a JSON-encoded string in a
        // single hidden input. Parse back into `string[]`. Already-array
        // values pass through (e.g. when a `live()` partial-resolve has
        // already shipped structured data, or when a server-side default
        // landed pre-coerce). Empty / null / unparseable → `[]`.
        if (raw === undefined || raw === null || raw === '') {
          out[name] = []
        } else if (Array.isArray(raw)) {
          out[name] = raw.map(v => String(v))
        } else if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) {
              out[name] = parsed.map(v => String(v))
            } else {
              out[name] = []
            }
          } catch {
            out[name] = []
          }
        } else {
          out[name] = []
        }
        break
      }
      case 'color': {
        // Empty string → null so DB nullable columns accept it. Otherwise
        // pass the hex string through verbatim.
        if (raw === undefined || raw === null || raw === '') {
          out[name] = null
        }
        break
      }
      case 'fileUpload': {
        const fileMultiple = (field as { isMultiple?: () => boolean }).isMultiple?.() === true
        // `metaFields()` mode — the value is a rich object (single) or an
        // array of them (multi): `{ url, <meta>… }`. The client serializes
        // it as JSON in the hidden input; a live-resolve may already ship a
        // structured object/array. Legacy plain-string values coerce to
        // `{ url }` so old columns read back. Structural probe, not
        // `instanceof` (Vite SSR module-cache duplication).
        if ((field as { hasMetaFields?: () => boolean }).hasMetaFields?.() === true) {
          const refs = coerceFileUploadRefs(raw)
          out[name] = fileMultiple ? refs : (refs[0] ?? null)
          break
        }
        // The browser already turned uploaded files into URLs via the
        // `_uploads` route; what arrives here is either a string, a
        // string[] (multi-mode), or a JSON-encoded array (when the
        // client serialized through a hidden input). Normalize to the
        // declared shape: array bodies → string[], string body → string.
        if (raw === undefined || raw === null || raw === '') {
          out[name] = null
        } else if (Array.isArray(raw)) {
          out[name] = raw.map(v => String(v))
        } else if (typeof raw === 'string') {
          // Try JSON-decode for multi-file fields encoded as JSON; otherwise pass through.
          if (raw.startsWith('[')) {
            try {
              const parsed = JSON.parse(raw)
              if (Array.isArray(parsed)) { out[name] = parsed.map(v => String(v)); break }
            } catch { /* fall through */ }
          }
          out[name] = raw
        }
        break
      }
      case 'keyValue': {
        // Client serializes the row map as a JSON string in a hidden
        // input. Parse back into a Record<string,string>; filter empty
        // rows (`{ "": "" }`) before yielding so the persisted record
        // doesn't carry placeholder noise. Already-object values pass
        // through (e.g. when the `live()` partial-resolve already shipped
        // structured data).
        let parsed: Record<string, string> = {}
        if (raw === undefined || raw === null || raw === '') {
          parsed = {}
        } else if (typeof raw === 'string') {
          try {
            const obj = JSON.parse(raw)
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
              for (const [k, v] of Object.entries(obj)) {
                parsed[String(k)] = v == null ? '' : String(v)
              }
            }
          } catch { parsed = {} }
        } else if (typeof raw === 'object' && !Array.isArray(raw)) {
          for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            parsed[String(k)] = v == null ? '' : String(v)
          }
        }
        const filtered: Record<string, string> = {}
        for (const [k, v] of Object.entries(parsed)) {
          if (k === '' && v === '') continue
          filtered[k] = v
        }
        out[name] = filtered
        break
      }
      case 'richtext': {
        // Editor posts the document as a JSON-encoded string via a hidden
        // input. Prisma's Json column wants a real object, so parse here.
        // Empty / unparseable → null so the column accepts it.
        if (raw === undefined || raw === null || raw === '') {
          out[name] = null
        } else if (typeof raw === 'string') {
          try { out[name] = JSON.parse(raw) }
          catch { out[name] = null }
        }
        break
      }
      case 'media': {
        // `@pilotiq/media`'s MediaField posts a stable media reference as a
        // JSON-encoded string via a hidden input — an object (single) or an
        // array (multiple). Parse to a real value so the `'json'`-cast column
        // persists it; empty / unparseable → null. Already-structured values
        // (e.g. from a `live()` resolve) pass through.
        if (raw === undefined || raw === null || raw === '') {
          out[name] = null
        } else if (typeof raw === 'string') {
          try { out[name] = JSON.parse(raw) }
          catch { out[name] = null }
        }
        break
      }
      default:
        // text/textarea/email/select/slug — leave as string.
        break
    }

    // `TextField.trim()` — strips leading/trailing whitespace from the
    // submitted value. Runs BEFORE stripCharacters so a value like
    // `'  (415) 555-1212  '` first trims, then has the listed mask
    // characters removed. Skipped for non-strings.
    const trimmer = (field as { getTrim?: () => boolean }).getTrim
    if (typeof trimmer === 'function' && trimmer.call(field)) {
      const cur = out[name]
      if (typeof cur === 'string') out[name] = cur.trim()
    }

    // `TextField.stripCharacters([…])` — applies after type-specific
    // coercion so the persisted value never carries the listed
    // characters. Duck-typed: any Field whose `getStripCharacters?`
    // returns a non-empty list opts in. Skipped for non-strings (the
    // pre-coerce switch may have produced numbers / booleans / arrays).
    const stripper = (field as { getStripCharacters?: () => string[] | undefined }).getStripCharacters
    if (typeof stripper === 'function') {
      const chars = stripper.call(field)
      if (chars && chars.length > 0) {
        const cur = out[name]
        if (typeof cur === 'string' && cur.length > 0) {
          out[name] = stripChars(cur, chars)
        }
      }
    }
  })
  return out
}

/**
 * Apply every field's `dehydrateStateUsing(fn)` transform to the coerced
 * data map. Top-level fields transform `out[name]` in place; Repeater /
 * Builder rows transform each row's own values against the inner schema
 * (the row's data map is what `ctx.values` exposes there). `simple()`
 * Repeaters map the inner field's handler over the flat item array. A
 * handler set on the Repeater / Builder field itself runs LAST and
 * receives the whole array.
 *
 * Skips fields that are `dehydrated(false)` (their key never reaches the
 * payload) and fields whose key is absent from `data` (a transform must
 * not invent keys the client never submitted). Relationship-backed
 * Repeaters / Builders / multi-selects are skipped — their values are
 * extracted off `data` before this pass and persist through the relation
 * diff, not the parent payload.
 */
export async function applyDehydrateTransforms(
  elements: Element[],
  data:     Record<string, unknown>,
  record?:  unknown,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...data }
  await dehydrateWalk(elements, out, record)
  return out
}

async function dehydrateWalk(
  elements: Element[],
  values:   Record<string, unknown>,
  record:   unknown,
): Promise<void> {
  for (const el of elements) {
    if (el.getType() === 'field') {
      // Array-row fields own their rows' transforms — don't let the
      // surrounding walk recurse into the inner schema against the
      // wrong values map (mirrors `walkFields`' boundary). Structural
      // checks (not `instanceof`) survive Vite SSR module duplication.
      if (isRepeaterField(el)) { await dehydrateRepeaterRows(el as RepeaterField, values, record); continue }
      if (isBuilderField(el))  { await dehydrateBuilderRows(el as BuilderField, values, record);  continue }
      if (isFileUploadField(el) && (el as FileUploadField).hasMetaColumn()) splitFileUploadMetaColumn(el as FileUploadField, values)
      await applyFieldDehydrate(el as Field, values, record)
    }
    const children = el.getChildren()
    if (children && children.length > 0) await dehydrateWalk(children as Element[], values, record)
  }
}

async function applyFieldDehydrate(
  field:  Field,
  values: Record<string, unknown>,
  record: unknown,
): Promise<void> {
  const fn = field.getDehydrateStateUsing()
  if (!fn || field.isDehydrated() === false || !(field.name in values)) return
  values[field.name] = await fn(values[field.name], { record, values })
}

/**
 * Split a `FileUpload.metaColumn()` rich value into its two columns:
 *   - `values[field.name]`  → bare URL string (single) or string[] (multi)
 *   - `values[metaColumn]`  → meta object (single) or meta object[] (multi)
 *
 * Runs BEFORE `applyFieldDehydrate` so any user-defined `dehydrateStateUsing`
 * sees the already-split URL string, not the rich `{ url, …meta }` envelope.
 * Mutates `values` in place.
 */
function splitFileUploadMetaColumn(
  field:  FileUploadField,
  values: Record<string, unknown>,
): void {
  const metaCol = field.getMetaColumn()!
  const raw = values[field.name]

  if (raw === null || raw === undefined) {
    values[metaCol] = null
    return
  }

  if (Array.isArray(raw)) {
    const urls: string[]                   = []
    const metas: Record<string, unknown>[] = []
    for (const item of raw) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const { url, ...meta } = item as { url: unknown } & Record<string, unknown>
        urls.push(typeof url === 'string' ? url : String(url ?? ''))
        metas.push(meta)
      }
    }
    values[field.name] = urls
    values[metaCol]    = metas
    return
  }

  if (typeof raw === 'object') {
    const { url, ...meta } = raw as { url: unknown } & Record<string, unknown>
    values[field.name] = typeof url === 'string' ? url : (url != null ? String(url) : null)
    values[metaCol]    = meta
  }
}

async function dehydrateRepeaterRows(
  repeater: RepeaterField,
  values:   Record<string, unknown>,
  record:   unknown,
): Promise<void> {
  const rows = values[repeater.name]
  if (Array.isArray(rows) && !repeater.isRelationship()) {
    if (repeater.isSimple()) {
      // Flat `[v, v, …]` storage (already unwrapped) — map the single
      // inner field's handler over each item.
      const inner = repeater.getSimpleInnerField()
      const fn = inner?.getDehydrateStateUsing()
      if (inner && fn) {
        for (let i = 0; i < rows.length; i++) {
          rows[i] = await fn(rows[i], { record, values: { [inner.name]: rows[i] } })
        }
      }
    } else {
      for (const row of rows) {
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          await dehydrateWalk((repeater.getChildren() ?? []) as Element[], row as Record<string, unknown>, record)
        }
      }
    }
  }
  // The Repeater's own handler runs last — whole-array transform.
  await applyFieldDehydrate(repeater, values, record)
}

async function dehydrateBuilderRows(
  builder: BuilderField,
  values:  Record<string, unknown>,
  record:  unknown,
): Promise<void> {
  const rows = values[builder.name]
  if (Array.isArray(rows) && !builder.isRelationship()) {
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      const envelope = row as { type?: unknown; data?: unknown }
      const block = builder.getBlocks().find(b => b.name === envelope.type)
      const rowData = envelope.data
      // Unknown block types round-trip verbatim (config-rollback safety).
      if (!block || !rowData || typeof rowData !== 'object' || Array.isArray(rowData)) continue
      await dehydrateWalk(block.getSchema(), rowData as Record<string, unknown>, record)
    }
  }
  await applyFieldDehydrate(builder, values, record)
}

function walkFields(elements: Element[], visit: (f: Field) => void): void {
  for (const el of elements) {
    if (el.getType() === 'field') {
      visit(el as Field)
      // Plan #14 — don't recurse into Repeater / Builder children. Their
      // inner schemas belong to row bodies, not the parent form's body,
      // so the parent walker would coerce siblings against the wrong
      // values map. The dedicated Repeater + Builder passes in
      // `coerceFormValues` recurse into rows with the proper per-row body.
      // Structural checks survive Vite SSR module duplication.
      if (isRepeaterField(el)) continue
      if (isBuilderField(el))  continue
    }
    const children = el.getChildren()
    if (children && children.length > 0) walkFields(children as Element[], visit)
  }
}

/**
 * Walk an element tree and visit every top-level Repeater — i.e., every
 * `RepeaterField` that isn't itself nested inside another Repeater. Inner
 * Repeaters are handled recursively when the outer Repeater coerces its
 * row bodies against the inner schema (which then enters this walker
 * again from `coerceFormValues`).
 */
function walkRepeatersTopLevel(
  elements: Element[],
  visit:    (f: RepeaterField) => void,
): void {
  for (const el of elements) {
    if (isRepeaterField(el)) {
      visit(el as RepeaterField)
      continue
    }
    // Builder boundaries are also opaque — its inner schemas live per-row
    // and never need to be visited by the Repeater pass.
    if (isBuilderField(el)) continue
    const children = el.getChildren()
    if (children && children.length > 0) walkRepeatersTopLevel(children as Element[], visit)
  }
}

/**
 * Walk an Element tree and visit every top-level Builder — i.e., every
 * `BuilderField` that isn't itself nested inside a Repeater or another
 * Builder. Inner Builders are reached recursively when the outer
 * array-row field coerces its row bodies (which then re-enters this
 * walker via `coerceFormValues`).
 */
function walkBuildersTopLevel(
  elements: Element[],
  visit:    (f: BuilderField) => void,
): void {
  for (const el of elements) {
    if (isBuilderField(el)) {
      visit(el as BuilderField)
      continue
    }
    if (isRepeaterField(el)) continue
    const children = el.getChildren()
    if (children && children.length > 0) walkBuildersTopLevel(children as Element[], visit)
  }
}

/**
 * Build the coerced array value for a single Builder field from the
 * parent form body. Two body shapes are supported:
 *
 * 1. **JSON-shape** — `body[name]` is `unknown[]`. Each entry should be
 *    an object with shape `{ __id?, type, data?: {…} }`. Non-object
 *    entries coerce to a sentinel empty row; missing / non-string `type`
 *    rounds to `''` (resolver flags as `unknownType`).
 * 2. **Flat-shape** — body has keys like `${name}.${i}.type`,
 *    `${name}.${i}.__id`, `${name}.${i}.data.${childName}`. Indices are
 *    grouped, gaps filled with empty rows, and the per-block schema
 *    drives coercion of `data.*` keys.
 *
 * Trailing rows whose `data` body is empty are trimmed (matching
 * Repeater's posture). The row's `__id` and `type` alone don't keep a
 * row alive — same trim semantics.
 */
function coerceBuilderValue(
  field: BuilderField,
  body:  Record<string, unknown>,
): Array<Record<string, unknown>> {
  const fieldName = field.name
  const raw       = body[fieldName]

  type RawRow = { __id?: string; type: string; data: Record<string, unknown> }
  let rows: RawRow[] = []

  if (Array.isArray(raw)) {
    rows = raw.map(coerceBuilderRowEntry)
  } else {
    const prefix  = `${fieldName}.`
    const grouped = new Map<number, RawRow>()
    let maxIdx = -1
    for (const key of Object.keys(body)) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      const dot  = rest.indexOf('.')
      if (dot < 0) continue
      const idxStr = rest.slice(0, dot)
      const tail   = rest.slice(dot + 1)
      const idx    = Number(idxStr)
      if (!Number.isInteger(idx) || idx < 0) continue
      if (idx > maxIdx) maxIdx = idx
      let row = grouped.get(idx)
      if (!row) { row = { type: '', data: {} }; grouped.set(idx, row) }
      const value = body[key]
      if (tail === '__id') {
        if (typeof value === 'string') row.__id = value
      } else if (tail === 'type') {
        if (typeof value === 'string') row.type = value
      } else if (tail.startsWith('data.')) {
        row.data[tail.slice('data.'.length)] = value
      } else if (tail === 'data') {
        // Whole `data` body posted as a single value (rare — typically
        // a stringified JSON blob from a hidden input). Best-effort parse.
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          row.data = { ...(value as Record<string, unknown>) }
        } else if (typeof value === 'string' && value !== '') {
          try {
            const parsed = JSON.parse(value)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              row.data = parsed as Record<string, unknown>
            }
          } catch { /* leave row.data alone */ }
        }
      }
    }
    if (maxIdx >= 0) {
      rows = Array.from({ length: maxIdx + 1 }, (_, i) => grouped.get(i) ?? { type: '', data: {} })
    }
  }

  // Trim trailing empty rows (matches Repeater). A row counts as empty
  // when its `data` body has no values beyond round-tripped sentinels.
  // Note we don't gate on `type` — a freshly-picked block with no fields
  // typed in is still "untouched" for the purposes of submit-trim.
  while (rows.length > 0 && isBuilderRowEmpty(rows[rows.length - 1]!)) {
    rows.pop()
  }

  return rows.map(row => {
    const block = field.getBlock(row.type)
    let coercedData: Record<string, unknown>
    if (block) {
      coercedData = coerceFormValues(block.getSchema(), row.data)
    } else {
      // Unknown block type — pass `data` through verbatim so a stale
      // record with a since-removed block type doesn't lose its
      // contents on the next save. Validation will surface the issue.
      coercedData = { ...row.data }
    }
    const out: Record<string, unknown> = { type: row.type, data: coercedData }
    if (typeof row.__id === 'string') out['__id'] = row.__id
    return out
  })
}

function coerceBuilderRowEntry(raw: unknown): { __id?: string; type: string; data: Record<string, unknown> } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { type: '', data: {} }
  }
  const r = raw as Record<string, unknown>
  const type = typeof r['type'] === 'string' ? (r['type'] as string) : ''
  const dataRaw = r['data']
  const data: Record<string, unknown> = (dataRaw && typeof dataRaw === 'object' && !Array.isArray(dataRaw))
    ? { ...(dataRaw as Record<string, unknown>) }
    : {}
  const out: { __id?: string; type: string; data: Record<string, unknown> } = { type, data }
  if (typeof r['__id'] === 'string') out.__id = r['__id'] as string
  return out
}

function isBuilderRowEmpty(row: { type: string; data: Record<string, unknown> }): boolean {
  for (const [k, v] of Object.entries(row.data)) {
    if (v === undefined || v === null || v === '') continue
    void k
    return false
  }
  return true
}

/**
 * Build the coerced array value for a single Repeater field from the
 * parent form body. Two body shapes are supported:
 *
 * 1. **JSON-shape** — `body[name]` is an `unknown[]`. Each element should
 *    be an object; non-object entries coerce to `{}`. This is the SPA
 *    `fetch+JSON` path (the default since `feedback_action_dispatch_fetch_vs_303.md`).
 * 2. **Flat-shape** — body has keys like `${name}.${i}.${childName}`.
 *    The browser submits these for `application/x-www-form-urlencoded`
 *    bodies when the form-post 303 fallback path is used. Indices are
 *    grouped, gaps are filled with `{}`, and the resulting per-row
 *    bodies feed into the recursive coercion call.
 *
 * Empty trailing rows (no entered values, only `__id` carrying through
 * from the previous render) are trimmed before the coerced array is
 * returned.
 */
function coerceRepeaterValue(
  field: RepeaterField,
  body:  Record<string, unknown>,
): Array<Record<string, unknown>> {
  const inner     = field.getInnerSchema()
  const fieldName = field.name
  const raw       = body[fieldName]
  const simpleInner = field.getSimpleInnerField()

  let rowBodies: Array<Record<string, unknown>> = []
  if (Array.isArray(raw)) {
    rowBodies = raw.map(r => simpleInner ? coerceSimpleEntry(r, simpleInner.name) : coerceRowEntry(r))
  } else {
    const prefix = `${fieldName}.`
    const grouped = new Map<number, Record<string, unknown>>()
    let maxIdx = -1
    for (const key of Object.keys(body)) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      const dot = rest.indexOf('.')
      if (dot < 0) continue
      const idxStr = rest.slice(0, dot)
      const childKey = rest.slice(dot + 1)
      const idx = Number(idxStr)
      if (!Number.isInteger(idx) || idx < 0) continue
      if (idx > maxIdx) maxIdx = idx
      let row = grouped.get(idx)
      if (!row) { row = {}; grouped.set(idx, row) }
      row[childKey] = body[key]
    }
    if (maxIdx >= 0) {
      rowBodies = Array.from({ length: maxIdx + 1 }, (_, i) => grouped.get(i) ?? {})
    }
  }

  // Trim trailing rows where the user didn't enter anything beyond the
  // round-tripped `__id`. We trim BEFORE coercion so default fills (e.g.
  // toggle → false, number → null) don't disguise an untouched row as a
  // touched one. Only trailing emptiness — gaps in the middle survive.
  while (rowBodies.length > 0 && isRawRowEmpty(rowBodies[rowBodies.length - 1]!)) {
    rowBodies.pop()
  }

  return rowBodies.map(rowBody => {
    const coerced = coerceFormValues(inner, rowBody)
    if (typeof rowBody['__id'] === 'string') coerced['__id'] = rowBody['__id']
    return coerced
  })
}

function coerceRowEntry(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }
  return {}
}

/**
 * Variant of `coerceRowEntry` for `Repeater.simple(field)`. Wraps a
 * primitive entry under the inner field's name so the rest of the
 * coerce pipeline keeps using `{ <innerName>: v }` row shape. Object
 * entries pass through. The unwrap (back to `[v]`) happens once at the
 * top of `dispatchFormSubmit` via `unwrapSimpleRepeaters`.
 */
function coerceSimpleEntry(raw: unknown, innerName: string): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }
  if (raw === undefined) return {}
  return { [innerName]: raw }
}

/**
 * After `coerceFormValues` has produced wrapped `[{<innerName>: v}]`
 * rows for every Repeater in the schema, flatten the `simple()` ones
 * back to `[v, v, …]` for storage. Non-simple repeaters are left alone.
 *
 * Runs before `mutateData` / `save` so user-facing data already uses
 * the storage shape they declared via `.simple(field)` — they don't
 * have to remember the internal wrapping at the save site.
 *
 * Tolerates already-flat input (e.g. when a `dehydrated(false)` upstream
 * has dropped wrapping, or when the user manually fed a flat array
 * through `withValues`) by re-emitting verbatim.
 */
export function unwrapSimpleRepeaters(
  elements: Element[],
  values:   Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values }
  walkRepeatersTopLevel(elements, repeater => {
    const innerName = repeater.getSimpleInnerField()?.name
    if (!innerName) return
    const rows = out[repeater.name]
    if (!Array.isArray(rows)) return
    out[repeater.name] = rows.map(row => {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        return (row as Record<string, unknown>)[innerName]
      }
      return row
    })
  })
  return out
}

function isRawRowEmpty(rowBody: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(rowBody)) {
    if (k === '__id') continue
    if (v === undefined || v === null || v === '') continue
    return false
  }
  return true
}

/**
 * Walk an Element tree and return every `Form` instance, in document order.
 * Used by route handlers to locate the form being submitted on a page that
 * may declare more than one.
 *
 * Uses a structural `getType() === 'form'` check rather than `instanceof
 * Form`. Vite's SSR module cache can load the package through two
 * different module paths during a single dev session — the path used by
 * the rudder SSR route and the path used by Vike's `+data` hook for SPA
 * navigations end up importing different `Form` classes, so `instanceof`
 * silently returns false and the form goes "missing" on SPA nav while
 * SSR keeps working. The structural check is robust to that and matches
 * the convention used elsewhere in the codebase (see Filter, Column,
 * Action — all keyed on the serialized type, not class identity).
 */
export function findForms(elements: ReadonlyArray<Element>): Form[] {
  const forms: Form[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (el.getType() === 'form') forms.push(el as Form)
      // Plan #14 — don't dive into Repeater / Builder children. Forms
      // inside an array-row field don't have row context for dispatch,
      // so finding them at the parent level would mis-route submissions.
      // Use structural checks (not `instanceof`) per the Vite SSR module
      // duplication note above.
      if (isRepeaterField(el)) continue
      if (isBuilderField(el))  continue
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
    }
  }
  walk(elements)
  return forms
}

/**
 * Plan #8 — locate the Wizard step Element at the given index inside the
 * form's tree. Returns the live Step instance so callers can read both
 * its children (`step.getChildren()`) and any hooks attached to it
 * (`getBeforeValidation / getAfterValidation`). Walks structurally
 * (`getType() === 'wizard'/'step'`) to stay robust to Vite SSR
 * module-cache duplication. `undefined` when the form has no Wizard
 * descendant or the step index is out of range.
 */
export function findWizardStep(
  formChildren: ReadonlyArray<Element>,
  stepIndex:    number,
): Element | undefined {
  let wizard: Element | undefined
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (el.getType() === 'wizard') { wizard = el; return }
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
      if (wizard) return
    }
  }
  walk(formChildren)
  if (!wizard) return undefined
  const steps = (wizard.getChildren() ?? []).filter(c => c.getType() === 'step')
  return steps[stepIndex]
}

/**
 * Sibling helper: returns just the children of the Wizard step at the
 * given index. Thin wrapper over `findWizardStep` for callers that only
 * need to validate the step's fields without touching the Step instance
 * itself. `undefined` when the step is missing.
 */
export function findWizardStepFields(
  formChildren: ReadonlyArray<Element>,
  stepIndex:    number,
): Element[] | undefined {
  const step = findWizardStep(formChildren, stepIndex)
  if (!step) return undefined
  return step.getChildren() ?? []
}

/**
 * Pick the `Form` matching the submitted `_formId`, or fall back to the
 * first form on the page when no id was sent OR the submitted id misses.
 *
 * Use this on **legacy form-submit paths** (POST create / edit / global-edit
 * / custom-page) where a single page may host multiple forms and the
 * fallback to "first form" is a back-compat affordance for submissions that
 * predate the `_formId` hidden input.
 *
 * Do NOT use this on partial-resolve paths (Plan #5 form-state, Plan #8
 * wizard step-validate) — those must hard-fail on a mismatched id so the
 * client gets a 404 instead of silently writing the wrong form's state.
 * Use `selectFormById` there.
 */
export function selectForm(forms: ReadonlyArray<Form>, submittedId: unknown): Form | undefined {
  if (typeof submittedId === 'string') {
    const match = forms.find(f => f.getFormId() === submittedId)
    if (match) return match
  }
  return forms[0]
}

/**
 * ID-match counterpart to `selectForm`, used by partial-resolve endpoints
 * (Plan #5 form-state, Plan #8 wizard step-validate).
 *
 * - If `id` matches a form, return it.
 * - If there's no match AND the page has exactly one form, return that
 *   form. This is safe — there's no ambiguity about which form the POST
 *   meant — and it removes the auto-counter desync footgun: the GET
 *   render and the partial-resolve POST run through `Form.make()` in
 *   different requests, so the process-global formId counter ticks
 *   forward and a strict match would 404. See
 *   `feedback_pilotiq_live_forms_pin_formid.md`.
 * - Otherwise return `undefined`. Multi-form pages with a missing/wrong
 *   id must hard-fail so the client surfaces a 404 instead of writing
 *   the wrong form's state.
 *
 * Pages with multiple reactive forms still need to pin a stable
 * `Form.make().formId(...)` to disambiguate.
 */
export function selectFormById(forms: ReadonlyArray<Form>, id: string): Form | undefined {
  const match = forms.find(f => f.getFormId() === id)
  if (match) return match
  if (forms.length === 1) return forms[0]
  return undefined
}

// ─── Plan #5: applyStateUpdate ────────────────────────────

export interface StateUpdateContext<R = unknown> {
  record?: R
  user?:   unknown
  request?: unknown
}

export interface StateUpdateResult {
  /**
   * Updated values map after coercing the changed field and running
   * its `afterStateUpdated` hook. The same object the client should
   * rebind to its inputs on the next render.
   */
  values: Record<string, unknown>
  /**
   * Field names whose value was written via `$set` during this resolve.
   * Includes the changed field itself. The client uses this to decide
   * which inputs to update without disrupting focus on others.
   */
  dirty:  string[]
}

/**
 * Apply a partial-resolve update from the client. Coerces the changed
 * field's value (other fields keep whatever the client sent), runs the
 * field's `afterStateUpdated` hook with bound `$get / $set` helpers,
 * and returns the updated values + names of fields whose values were
 * mutated. The caller (the partial-resolve route handler) feeds the
 * resulting values into `resolveSchema` to produce a fresh form meta.
 *
 * Returns `null` when the changed field name doesn't correspond to a
 * field on the form — the route handler turns this into a 404.
 *
 * Plan #14 — `changed` may be a dotted path into a Repeater row
 * (`items.2.quantity` or, for nested Repeaters, `items.0.modifiers.1.name`).
 * The dotted form routes through `applyRepeaterStateUpdate` which scopes
 * `$get / $set` to the innermost row by default; cross-row reads / writes
 * go through the parent `$get / $set` using a full dotted path.
 */
export async function applyStateUpdate<R = unknown>(
  form:    Form<R>,
  values:  Record<string, unknown>,
  changed: string,
  ctx:     StateUpdateContext<R> = {},
): Promise<StateUpdateResult | null> {
  const children = (form.getChildren() ?? []) as Element[]

  if (changed.includes('.')) {
    // Plan #14 — dotted paths route to the array-row field that owns
    // the path's first segment. Builder paths look like `name.<i>.data.<leaf>`
    // (the literal `data` segment is the giveaway); Repeater paths look
    // like `name.<i>.<leaf>`. Inspect the first segment's field on the
    // schema to dispatch.
    const head = changed.split('.', 1)[0]!
    const headField = findFieldDirect(children, head)
    if (headField && isBuilderField(headField)) {
      return applyBuilderStateUpdate(headField as BuilderField, values, changed, ctx)
    }
    return applyRepeaterStateUpdate(children, values, changed, ctx)
  }

  const target = findFieldByName(children, changed)
  if (!target) return null

  // Coerce the changed field only — other fields may have been mid-edit
  // on the client and we don't want to clobber their in-flight state.
  const coerced = { ...values }
  const subset: Record<string, unknown> = { [changed]: values[changed] }
  const after  = coerceFormValues([target], subset)
  coerced[changed] = after[changed]

  const dirty = new Set<string>([changed])

  const hook = target.getAfterStateUpdated()
  if (hook) {
    const $get = (name: string): unknown => coerced[name]
    const $set = (name: string, v: unknown): void => {
      coerced[name] = v
      dirty.add(name)
    }
    const hookCtx: AfterStateUpdatedContext = {
      $get,
      $set,
      values: coerced,
      ...(ctx.record  !== undefined ? { record:  ctx.record  } : {}),
      ...(ctx.user    !== undefined ? { user:    ctx.user    } : {}),
      ...(ctx.request !== undefined ? { request: ctx.request } : {}),
    }
    await hook(coerced[changed], hookCtx)
  }

  return { values: coerced, dirty: Array.from(dirty) }
}

function findFieldByName(elements: Element[], name: string): Field | undefined {
  for (const el of elements) {
    if (el.getType() === 'field' && (el as Field).name === name) return el as Field
    // Plan #14 — don't dive into Repeater / Builder inner schemas when
    // looking for a top-level field; row-local fields are addressed via
    // dotted paths through `applyRepeaterStateUpdate` /
    // `applyBuilderStateUpdate`.
    if (isRepeaterField(el)) continue
    if (isBuilderField(el))  continue
    const children = el.getChildren()
    if (children && children.length > 0) {
      const hit = findFieldByName(children as Element[], name)
      if (hit) return hit
    }
  }
  return undefined
}

/**
 * Plan #14 — resolve a dotted-path live-update into a Repeater row.
 *
 * `changed` looks like `items.2.quantity` (one level) or
 * `items.0.modifiers.1.name` (nested). Segments alternate field-name and
 * row-index. The leaf must be a real Field inside the innermost
 * Repeater's inner schema. Returns `null` (→ 404) when the path doesn't
 * resolve.
 *
 * Mutates a shallow-cloned `values` so the caller gets a fresh map and
 * the input isn't aliased. Row arrays + row maps along the path are
 * cloned to avoid mutating shared state in the input.
 */
async function applyRepeaterStateUpdate<R>(
  children: Element[],
  values:   Record<string, unknown>,
  changed:  string,
  ctx:      StateUpdateContext<R>,
): Promise<StateUpdateResult | null> {
  const resolved = resolveRepeaterPath(children, changed)
  if (!resolved) return null
  const { field, rowPath } = resolved

  const coerced = { ...values }

  // Clone path-traversed arrays + row maps so we can mutate them without
  // touching the caller's input. Final row map is the innermost row.
  const rowMap = ensureRowAtPath(coerced, rowPath)

  // Coerce only the leaf field's value — read raw value from the existing
  // row map, then run it through `coerceFormValues` against the leaf field
  // alone, and write the coerced value back.
  const rawAtPath = rowMap[field.name]
  const coercedSubset = coerceFormValues([field], { [field.name]: rawAtPath })
  rowMap[field.name] = coercedSubset[field.name]

  const dirty = new Set<string>([changed])

  const hook = field.getAfterStateUpdated()
  if (hook) {
    const innermost = rowPath[rowPath.length - 1]!
    const rowPrefix = rowPath.map(r => `${r.repeater.name}.${r.index}`).join('.')

    const $get = (name: string): unknown => {
      if (name.includes('.')) return readDottedPath(coerced, name)
      return rowMap[name]
    }
    const $set = (name: string, v: unknown): void => {
      if (name.includes('.')) {
        writeDottedPath(coerced, name, v)
        dirty.add(name)
        return
      }
      rowMap[name] = v
      dirty.add(`${rowPrefix}.${name}`)
    }

    const row = {
      index: innermost.index,
      $get:  (name: string): unknown => rowMap[name],
      $set:  (name: string, v: unknown): void => {
        rowMap[name] = v
        dirty.add(`${rowPrefix}.${name}`)
      },
    }

    const hookCtx: AfterStateUpdatedContext = {
      $get,
      $set,
      values: coerced,
      row,
      ...(ctx.record  !== undefined ? { record:  ctx.record  } : {}),
      ...(ctx.user    !== undefined ? { user:    ctx.user    } : {}),
      ...(ctx.request !== undefined ? { request: ctx.request } : {}),
    }

    await hook(rowMap[field.name], hookCtx)
  }

  return { values: coerced, dirty: Array.from(dirty) }
}

interface ResolvedPath {
  field:   Field
  rowPath: Array<{ repeater: RepeaterField; index: number }>
}

/**
 * Walk a dotted path against an Element tree. Segments alternate
 * field-name and row-index. Returns the leaf Field plus the chain of
 * (Repeater, index) hops needed to reach it.
 */
function resolveRepeaterPath(elements: Element[], path: string): ResolvedPath | null {
  const segments = path.split('.')
  const rowPath: Array<{ repeater: RepeaterField; index: number }> = []

  let currentElements = elements
  let i = 0
  while (i < segments.length) {
    const seg = segments[i]!
    const field = findFieldDirect(currentElements, seg)
    if (!field) return null

    if (i === segments.length - 1) {
      return { field, rowPath }
    }

    if (!isRepeaterField(field)) return null
    const repeaterField = field as RepeaterField
    const idxStr = segments[i + 1]
    if (idxStr === undefined) return null
    const idx = Number(idxStr)
    if (!Number.isInteger(idx) || idx < 0) return null

    rowPath.push({ repeater: repeaterField, index: idx })
    currentElements = repeaterField.getInnerSchema()
    i += 2
  }

  return null
}

/**
 * Find a top-level field by name inside an element tree, walking through
 * non-Repeater containers but stopping at Repeater boundaries (those need
 * a dotted path to address inner fields).
 */
function findFieldDirect(elements: Element[], name: string): Field | undefined {
  for (const el of elements) {
    if (el.getType() === 'field' && (el as Field).name === name) return el as Field
    if (isRepeaterField(el)) continue
    const children = el.getChildren()
    if (children && children.length > 0) {
      const hit = findFieldDirect(children as Element[], name)
      if (hit) return hit
    }
  }
  return undefined
}

/**
 * Walk + clone the row arrays/maps along `rowPath`, ensuring each row
 * exists, then return the innermost row map. Mutations on the returned
 * object propagate up to `coerced` because we replace each step's
 * container with a fresh clone in the parent.
 */
function ensureRowAtPath(
  coerced: Record<string, unknown>,
  rowPath: Array<{ repeater: RepeaterField; index: number }>,
): Record<string, unknown> {
  let parent: Record<string, unknown> | unknown[] = coerced
  for (const { repeater, index } of rowPath) {
    const arrName = repeater.name
    let arr: unknown[]
    if (Array.isArray(parent)) {
      // Should never happen at the outer iteration (parent starts as
      // `coerced`, an object); guard anyway.
      arr = (parent as unknown[]).slice()
    } else {
      const existing = (parent as Record<string, unknown>)[arrName]
      arr = Array.isArray(existing) ? existing.slice() : []
      ;(parent as Record<string, unknown>)[arrName] = arr
    }
    while (arr.length <= index) arr.push({})
    const existingRow = arr[index]
    const row: Record<string, unknown> = (existingRow && typeof existingRow === 'object' && !Array.isArray(existingRow))
      ? { ...(existingRow as Record<string, unknown>) }
      : {}
    arr[index] = row
    parent = row
  }
  return parent as Record<string, unknown>
}

function readDottedPath(values: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.')
  let cur: unknown = values
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx)) return undefined
      cur = cur[idx]
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return cur
}

function writeDottedPath(values: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.')
  let cur: Record<string, unknown> | unknown[] = values
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!
    const nextSeg = segments[i + 1]!
    const childIsIndex = /^\d+$/.test(nextSeg)
    if (Array.isArray(cur)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx)) return
      while (cur.length <= idx) cur.push(childIsIndex ? [] : {})
      let next = cur[idx]
      if (next === undefined || next === null) {
        next = childIsIndex ? [] : {}
        cur[idx] = next
      }
      cur = next as Record<string, unknown> | unknown[]
    } else {
      let next = (cur as Record<string, unknown>)[seg]
      if (next === undefined || next === null) {
        next = childIsIndex ? [] : {}
        ;(cur as Record<string, unknown>)[seg] = next
      }
      cur = next as Record<string, unknown> | unknown[]
    }
  }
  const last = segments[segments.length - 1]!
  if (Array.isArray(cur)) {
    const idx = Number(last)
    if (!Number.isInteger(idx)) return
    cur[idx] = value
  } else {
    (cur as Record<string, unknown>)[last] = value
  }
}

// ─── Plan #14 follow-up: Builder partial-resolve ─────────

/**
 * Resolve a dotted-path live-update into a Builder row.
 *
 * Path shape: `<name>.<i>.data.<leaf>`. The literal `data` segment
 * separates the row's envelope (`__id`, `type`) from the block-scoped
 * inner field. The row's block schema is selected from the values map
 * via `values[name][i].type` — Builder rows are heterogeneous, so the
 * schema can't be derived from the field alone.
 *
 * Nested array-row fields inside a block (Repeater-in-Builder, etc.)
 * aren't supported in v1 — same posture as nested Repeater leaf depth
 * past one level. Returns `null` (→ 404) on any unsupported shape.
 *
 * Mutates a shallow-cloned `values` so the caller gets a fresh map; the
 * row array + row map + `data` map along the path are cloned to avoid
 * aliasing the input.
 */
async function applyBuilderStateUpdate<R>(
  field:    BuilderField,
  values:   Record<string, unknown>,
  changed:  string,
  ctx:      StateUpdateContext<R>,
): Promise<StateUpdateResult | null> {
  const segments = changed.split('.')
  // Expected: name (already matched by caller), <i>, 'data', <leaf>...
  if (segments.length < 4) return null
  const name    = segments[0]!
  if (name !== field.name) return null
  const idxStr  = segments[1]!
  const idx     = Number(idxStr)
  if (!Number.isInteger(idx) || idx < 0) return null
  if (segments[2] !== 'data') return null
  const leafName = segments[3]!
  // Nested-array path past `data.<leaf>` not supported in v1.
  if (segments.length > 4) return null

  // Look up the row's block from the submitted values.
  const arrRaw = values[name]
  if (!Array.isArray(arrRaw)) return null
  const rowRaw = arrRaw[idx]
  if (!rowRaw || typeof rowRaw !== 'object' || Array.isArray(rowRaw)) return null
  const blockName = (rowRaw as Record<string, unknown>)['type']
  if (typeof blockName !== 'string' || blockName === '') return null
  const block = field.getBlock(blockName)
  if (!block) return null

  // Locate the leaf field inside the block's schema.
  const leafField = findFieldDirect(block.getSchema(), leafName)
  if (!leafField) return null

  // Clone path-traversed containers.
  const coerced = { ...values }
  const arrClone = (coerced[name] as unknown[]).slice()
  coerced[name] = arrClone
  const rowSrc = arrClone[idx] as Record<string, unknown>
  const rowClone: Record<string, unknown> = { ...rowSrc }
  arrClone[idx] = rowClone
  const dataSrc = rowClone['data']
  const dataClone: Record<string, unknown> = (dataSrc && typeof dataSrc === 'object' && !Array.isArray(dataSrc))
    ? { ...(dataSrc as Record<string, unknown>) }
    : {}
  rowClone['data'] = dataClone

  // Coerce the leaf field's value only.
  const rawLeaf      = dataClone[leafName]
  const coercedSubset = coerceFormValues([leafField], { [leafName]: rawLeaf })
  dataClone[leafName] = coercedSubset[leafName]

  const dirty = new Set<string>([changed])

  const hook = leafField.getAfterStateUpdated()
  if (hook) {
    const rowPrefix = `${name}.${idx}.data`

    const $get = (n: string): unknown => {
      if (n.includes('.')) return readDottedPath(coerced, n)
      return dataClone[n]
    }
    const $set = (n: string, v: unknown): void => {
      if (n.includes('.')) {
        writeDottedPath(coerced, n, v)
        dirty.add(n)
        return
      }
      dataClone[n] = v
      dirty.add(`${rowPrefix}.${n}`)
    }

    const row = {
      index:     idx,
      blockType: block.name,
      $get:      (n: string): unknown => dataClone[n],
      $set:      (n: string, v: unknown): void => {
        dataClone[n] = v
        dirty.add(`${rowPrefix}.${n}`)
      },
    }

    const hookCtx: AfterStateUpdatedContext = {
      $get,
      $set,
      values: coerced,
      row,
      ...(ctx.record  !== undefined ? { record:  ctx.record  } : {}),
      ...(ctx.user    !== undefined ? { user:    ctx.user    } : {}),
      ...(ctx.request !== undefined ? { request: ctx.request } : {}),
    }

    await hook(dataClone[leafName], hookCtx)
  }

  return { values: coerced, dirty: Array.from(dirty) }
}

// ─── SelectField.relationship — extraction + sync ────────────

/** Structural multi-select probe. `instanceof SelectField` breaks under
 *  Vite SSR module-cache duplication, so check the shape instead. */
function isMultiSelectField(field: Field): boolean {
  if (field.fieldType !== 'select') return false
  const f = field as { isMultiple?: () => boolean }
  return typeof f.isMultiple === 'function' && f.isMultiple()
}

/**
 * Normalize a `FileUpload.metaFields()` body into an array of rich refs
 * (`{ url, …meta }`). Accepts the JSON the client serializes (object or
 * array), an already-structured value from a live-resolve, and legacy bare
 * URL strings (→ `{ url }`). Entries without a usable `url` are dropped.
 */
function coerceFileUploadRefs(raw: unknown): Array<Record<string, unknown>> {
  if (raw === undefined || raw === null || raw === '') return []
  let val: unknown = raw
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (s.startsWith('{') || s.startsWith('[')) {
      try { val = JSON.parse(s) } catch { val = raw }
    }
  }
  const list = Array.isArray(val) ? val : [val]
  const refs: Array<Record<string, unknown>> = []
  for (const entry of list) {
    if (entry === undefined || entry === null || entry === '') continue
    if (typeof entry === 'string') {
      refs.push({ url: entry })
    } else if (typeof entry === 'object') {
      const obj = entry as Record<string, unknown>
      const url = obj.url
      if (typeof url === 'string' && url !== '') refs.push({ ...obj, url })
    }
  }
  return refs
}

interface SelectRelationshipDeferral {
  /** Relation name on the parent model's static relations map. */
  name: string
  /** Field name on the form — usually equals `name`. */
  field: string
  /** The submitted (coerced) id set to sync the pivot to. */
  ids:  string[]
}

/**
 * Walk the form's fields and extract values for relationship-backed
 * multi-selects (`SelectField.multiple().relationship(name)`). Returns
 * the deferral list and mutates `data` in place by deleting each
 * extracted key — the relation has no matching column on the parent, so
 * the parent's save handler must never see the value.
 *
 * Recurses through layout containers but stops at Repeater / Builder
 * boundaries (row-scoped selects can't address a parent relation).
 */
export function extractRelationshipSelects(
  elements: Element[],
  data:     Record<string, unknown>,
): SelectRelationshipDeferral[] {
  const out: SelectRelationshipDeferral[] = []
  const visit = (els: Element[]): void => {
    for (const el of els) {
      if (isRepeaterField(el) || isBuilderField(el)) continue
      if (el.getType() === 'field') {
        const f = el as Field
        if (!isMultiSelectField(f)) continue
        const cfg = (f as { getRelationship?: () => { name: string } | undefined }).getRelationship?.()
        if (!cfg) continue
        const value = data[f.name]
        delete data[f.name]
        out.push({
          name:  cfg.name,
          field: f.name,
          ids:   Array.isArray(value) ? value.map(v => String(v)) : [],
        })
        continue
      }
      const children = el.getChildren()
      if (children && children.length > 0) visit(children as Element[])
    }
  }
  visit(elements)
  return out
}

/**
 * Sync one relationship-backed multi-select against the saved parent.
 * The pivot mutation goes through the ORM's M2M accessor
 * (`parent[rel]().sync(ids)`); a missing accessor is a configuration
 * error (wrong relation name, non-M2M relation type, or a save handler
 * that didn't return the model instance).
 *
 * Form values are always strings while numeric-PK pivots store
 * numbers — the ORM's sync/attach/detach compare ids loosely (String()
 * form) and write DB-typed values since @rudderjs/orm 1.17.1, so the
 * submitted string ids can be handed over as-is.
 */
async function syncRelationshipSelect(
  record:   unknown,
  deferral: SelectRelationshipDeferral,
): Promise<void> {
  const accessor = resolveM2MAccessor(record, deferral.name)
  if (!accessor) {
    throw new Error(
      `[Pilotiq] SelectField('${deferral.field}').relationship('${deferral.name}'): ` +
      `the saved record exposes no M2M accessor for '${deferral.name}'. ` +
      `Check that the relation is declared on the parent model's static relations map ` +
      `with an M2M type (belongsToMany / morphToMany / morphedByMany), and that the ` +
      `form's save handler returns the model instance.`,
    )
  }
  if (typeof accessor.sync !== 'function') {
    throw new Error(
      `[Pilotiq] SelectField('${deferral.field}').relationship('${deferral.name}'): ` +
      `the M2M accessor for '${deferral.name}' has no sync().`,
    )
  }
  await accessor.sync(deferral.ids)
}

// ─── Repeater.relationship — extraction + persistence ────────

interface RelationshipDeferral {
  field: RepeaterField
  rows:  Array<Record<string, unknown>>
  cfg:   RepeaterRelationshipConfig
}

/**
 * Walk the form's top-level Repeaters and extract values for any that
 * have a `relationship(...)` config. Returns the deferral list and
 * mutates `data` in place by deleting each extracted key — the parent's
 * save handler doesn't need to see those values (they aren't real
 * columns on the parent).
 *
 * Inner / nested Repeaters aren't supported in v1; we only walk the top
 * level (consistent with the existing `walkRepeatersTopLevel` helper)
 * so a relationship-backed Repeater nested inside a JSON-backed
 * Repeater silently falls back to JSON storage. Documented as a
 * v1 limitation in `docs/plans/repeater-relationship.md`.
 */
export function extractRelationshipRepeaters(
  elements: Element[],
  data:     Record<string, unknown>,
): RelationshipDeferral[] {
  const out: RelationshipDeferral[] = []
  walkRepeatersTopLevel(elements, repeater => {
    const cfg = repeater.getRelationship()
    if (!cfg) return
    const value = data[repeater.name]
    delete data[repeater.name]
    if (!Array.isArray(value)) return
    out.push({
      field: repeater,
      rows:  value as Array<Record<string, unknown>>,
      cfg,
    })
  })
  return out
}

/**
 * Resolved attachment shape for a relationship-backed Repeater. Five
 * variants reflect the persisted-relation kinds we know how to write
 * back from a Repeater submit:
 *
 *   - `hasMany`        — single FK column on the child.
 *   - `morphMany`      — polymorphic owner side; `<morphName>Id` +
 *                        `<morphName>Type` stamped on the child.
 *                        `morphOne` collapses into this kind (storage
 *                        shape is identical; "one row" is enforced
 *                        upstream).
 *   - `belongsToMany`  — pivot-table M2M; the child has no parent
 *                        attachment column, so create + attach goes
 *                        through `parent[rel]().attach([childPk])` and
 *                        delete-from-row goes through `.detach([pk])`.
 *   - `morphToMany`    — polymorphic pivot M2M; pivot row carries
 *                        `<morphName>Type` + the parent's PK, written
 *                        transparently by the accessor.
 *   - `morphedByMany`  — inverse polymorphic pivot. Same accessor
 *                        surface.
 *
 * The three M2M variants carry only the relation name — the persist
 * pipeline reaches the accessor via `resolveM2MAccessor(parent, relation)`.
 */
type RepeaterChildAttachment =
  | { kind: 'hasMany';        model: ModelLike; foreignKey: string }
  | { kind: 'morphMany';      model: ModelLike; morph:      MorphRelationDescriptor }
  | { kind: 'belongsToMany';  model: ModelLike; relation:   string }
  | { kind: 'morphToMany';    model: ModelLike; relation:   string }
  | { kind: 'morphedByMany';  model: ModelLike; relation:   string }

/**
 * Resolve the child model + parent-attachment shape for a
 * relationship-backed Repeater. Five supported modes:
 *
 *   - `hasMany`         — single foreign key on the child.
 *   - `morphMany` / `morphOne` — polymorphic owner side.
 *   - `belongsToMany`   — pivot-table M2M.
 *   - `morphToMany` / `morphedByMany` — polymorphic pivot M2M.
 *
 * Detection order: M2M descriptor (covers all three M2M variants) →
 * morph descriptor (morphMany / morphOne) → hasMany. The order matters
 * because `getParentRelationDescriptor` accepts entries with
 * `foreignKey: string` even if the type is M2M, so checking M2M first
 * keeps mis-shaped entries from falling through to the hasMany branch.
 *
 * `cfg.orderColumn` is rejected under M2M because pivot-side ordering
 * needs ORM `orderByPivot` which v1 doesn't expose. Throwing here
 * beats silently writing into a non-existent column on the related
 * model.
 *
 * Throws a clear configuration error when the relation type isn't one
 * of the five, or when descriptor lookup fails entirely.
 */
function resolveChildAndAttachment(
  parentModel: ModelLike,
  cfg:         RepeaterRelationshipConfig,
): RepeaterChildAttachment {
  const m2mDescriptor = getM2MRelationDescriptor(parentModel, cfg.name)
  if (m2mDescriptor) {
    if (cfg.orderColumn !== undefined) {
      throw new Error(
        `[Pilotiq] Repeater.relationship("${cfg.name}"): orderColumn() is not supported under ` +
        `'${m2mDescriptor.type}' v1. Pivot-side ordering needs ORM \`orderByPivot\` which is deferred.`,
      )
    }
    const model = cfg.model ?? m2mDescriptor.model()
    if (!model) {
      throw new Error(
        `[Pilotiq] Repeater.relationship("${cfg.name}"): could not resolve the related model. ` +
        `Pass it explicitly via .relationship({ name, model: RelatedModel }) or declare ` +
        `the relation's \`model\` thunk on the parent model's static relations map.`,
      )
    }
    return { kind: m2mDescriptor.type, model, relation: cfg.name }
  }

  const parentDescriptor = getParentRelationDescriptor(parentModel, cfg.name)
  const morphDescriptor  = getMorphRelationDescriptor(parentModel, cfg.name)
  const type             = parentDescriptor?.type
                        ?? (morphDescriptor ? 'morphMany' : 'hasMany')

  if (type === 'morphMany' || type === 'morphOne') {
    const model = cfg.model ?? morphDescriptor?.model?.()
    if (!model) {
      throw new Error(
        `[Pilotiq] Repeater.relationship("${cfg.name}"): could not resolve the child model. ` +
        `Pass it explicitly via .relationship({ name, model: ChildModel }) or declare ` +
        `the relation's \`model\` thunk on the parent model's static relations map.`,
      )
    }
    if (!morphDescriptor) {
      throw new Error(
        `[Pilotiq] Repeater.relationship("${cfg.name}"): polymorphic relation entry is missing \`morphName\`. ` +
        `Set \`relations.${cfg.name} = { type: 'morphMany', morphName: '<name>', model: () => ChildModel }\` on the parent.`,
      )
    }
    return { kind: 'morphMany', model, morph: morphDescriptor }
  }

  const model      = cfg.model ?? parentDescriptor?.model()
  const foreignKey = cfg.foreignKey ?? parentDescriptor?.foreignKey

  if (!model) {
    throw new Error(
      `[Pilotiq] Repeater.relationship("${cfg.name}"): could not resolve the child model. ` +
      `Pass it explicitly via .relationship({ name, model: ChildModel }) or declare ` +
      `the relation on the parent model's static relations map.`,
    )
  }
  if (!foreignKey) {
    throw new Error(
      `[Pilotiq] Repeater.relationship("${cfg.name}"): could not resolve the foreign-key column. ` +
      `Pass it explicitly via .relationship({ name, foreignKey: 'parentId' }) or declare ` +
      `it on the parent model's static relations map.`,
    )
  }
  if (type !== 'hasMany') {
    throw new Error(
      `[Pilotiq] Repeater.relationship("${cfg.name}"): unsupported relation type '${type}'. ` +
      `Supported: hasMany, morphMany, morphOne, belongsToMany, morphToMany, morphedByMany.`,
    )
  }

  return { kind: 'hasMany', model, foreignKey }
}

/**
 * Diff submitted rows against the existing related rows and apply
 * create / update / delete operations through the child model.
 *
 * Identity:
 *   - Submitted row with `__id` matching an existing PK → update.
 *   - Submitted row without `__id` (or with one not in the existing
 *     set) → create. The FK is stamped onto the create payload.
 *   - Existing PK not present in any submitted `__id` → delete.
 *
 * Order:
 *   - When `cfg.orderColumn` is set, every create / update payload
 *     stamps it with the row's 0-based index.
 *
 * Errors propagate. v1 isn't transactional — partial failure leaves
 * the parent saved and some children unchanged. See plan doc for the
 * follow-up.
 */
async function persistRelationshipRows(
  parent:      unknown,
  deferral:    RelationshipDeferral,
  parentModel: ModelLike,
): Promise<RelationshipRename[]> {
  const renames: RelationshipRename[] = []
  const { rows, cfg, field } = deferral
  const attachment  = resolveChildAndAttachment(parentModel, cfg)
  const { model }   = attachment
  const pk          = getPrimaryKey(model)
  const orderColumn = cfg.orderColumn
  const parentPk    = (parent as Record<string, unknown> | undefined)?.[getPrimaryKey(parentModel)]
  if (parentPk === undefined || parentPk === null) {
    throw new Error(
      `[Pilotiq] Repeater.relationship("${cfg.name}"): parent record has no primary key after save. ` +
      `Form.save() / handleCreate() must return a record with a primary key set.`,
    )
  }

  // Per-row hooks — fire after each create / update / delete completes.
  // No-op when the field hasn't registered the corresponding handler.
  // Errors propagate; v1 isn't transactional so a throwing handler
  // leaves earlier rows persisted.
  const afterCreate = field.getAfterCreate()
  const afterUpdate = field.getAfterUpdate()
  const afterDelete = field.getAfterDelete()
  const buildRowCtx = (index: number): RepeaterRowContext => ({
    parent,
    parentId: parentPk as string | number,
    field:    field.name,
    index,
    mode:     attachment.kind,
  })

  // Compute the morph stamp once — `computeMorphPayload` is pure.
  const morphStamp = attachment.kind === 'morphMany'
    ? computeMorphPayload(parent, attachment.morph)
    : undefined

  // Resolve the M2M pivot-mutation accessor once — fails closed with a
  // clear error if the parent doesn't expose `parent[rel]()` or a
  // legacy `parent.related(rel)` shape returning attach/detach.
  const isM2M = attachment.kind === 'belongsToMany'
             || attachment.kind === 'morphToMany'
             || attachment.kind === 'morphedByMany'
  const m2mAccessor = isM2M
    ? resolveM2MAccessor(parent, (attachment as { relation: string }).relation)
    : undefined
  if (isM2M && !m2mAccessor) {
    throw new Error(
      `[Pilotiq] Repeater.relationship("${cfg.name}"): could not resolve the pivot-mutation accessor on the parent record. ` +
      `Expected \`parent.${cfg.name}()\` to return \`{ attach, detach, sync }\` (rudder ORM convention). ` +
      `Make sure the parent model declares the relation under \`static relations\` and that the prototype method is installed.`,
    )
  }

  const existing = await loadRelationRows(parentModel, parent, cfg.name)
  const existingByPk = new Map<string, Record<string, unknown>>()
  for (const row of existing) {
    const key = String((row as Record<string, unknown>)[pk])
    existingByPk.set(key, row as Record<string, unknown>)
  }

  const keptPks = new Set<string>()

  // M2M-only: the user may have declared `pivotColumns([…])`. Those
  // names live on the pivot table, NOT the child model — split them
  // out before each create / update so the child writes never see
  // them and the pivot writes only see them.
  const pivotColumnSet = (isM2M && cfg.pivotColumns && cfg.pivotColumns.length > 0)
    ? new Set(cfg.pivotColumns)
    : undefined

  for (let idx = 0; idx < rows.length; idx++) {
    const submitted = rows[idx] ?? {}
    const submittedId = typeof submitted['__id'] === 'string' ? submitted['__id'] : undefined
    const isUpdate = submittedId !== undefined && existingByPk.has(submittedId)

    // Strip framework keys before constructing the payload — the
    // child model never sees `__id`, and the parent attachment cols
    // are stamped explicitly below so user-supplied values are
    // ignored (FK / morph cols can't be retargeted; order is
    // canonical from row index).
    const payload: Record<string, unknown> = {}
    const pivotPayload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(submitted)) {
      if (k === '__id') continue
      if (pivotColumnSet?.has(k)) {
        pivotPayload[k] = v
      } else {
        payload[k] = v
      }
    }
    if (orderColumn !== undefined) payload[orderColumn] = idx
    const hasPivotPayload = pivotColumnSet !== undefined
      && Object.keys(pivotPayload).length > 0

    if (isUpdate) {
      // Don't overwrite the parent attachment on update — for hasMany
      // the FK is already correct; for morphMany the `<morphName>Id`
      // + `<morphName>Type` cols are too. Defense against a tampered
      // client trying to re-link the child to a different (poly)
      // parent. M2M variants have no parent-attachment column on the
      // child to strip — pivot lives on its own table.
      if (attachment.kind === 'hasMany') {
        delete payload[attachment.foreignKey]
      } else if (attachment.kind === 'morphMany') {
        for (const k of Object.keys(morphStamp!)) delete payload[k]
      }
      // For M2M without pivot extras the row still benefits from a
      // child-row update (user may have edited the child's own
      // columns through the Repeater). Skip the child write only
      // when the payload would be empty (M2M + pivot-only edits).
      let updatedRecord: unknown = existingByPk.get(submittedId!)
      if (Object.keys(payload).length > 0) {
        const ret = await model.update(submittedId!, payload)
        // ModelLike.update may return the updated record OR void; fall
        // back to the existing snapshot merged with the payload so the
        // hook always receives a usable record shape.
        if (ret !== undefined && ret !== null) {
          updatedRecord = ret
        } else {
          updatedRecord = { ...(existingByPk.get(submittedId!) ?? {}), ...payload }
        }
      }
      if (hasPivotPayload) {
        if (typeof m2mAccessor!.updatePivot !== 'function') {
          throw new Error(
            `[Pilotiq] Repeater.relationship("${cfg.name}").pivotColumns(...) requires a rudder ORM with \`updatePivot\` ` +
            `on the M2M accessor (shipped via \`feat(orm): pivot-extras read/update\`). ` +
            `Upgrade @rudderjs/orm or drop the pivotColumns call.`,
          )
        }
        await m2mAccessor!.updatePivot(submittedId!, pivotPayload)
      }
      keptPks.add(submittedId!)
      if (afterUpdate) await afterUpdate(updatedRecord, buildRowCtx(idx))
    } else {
      let createdRecord: unknown
      if (attachment.kind === 'hasMany') {
        payload[attachment.foreignKey] = parentPk
        createdRecord = await model.create(payload)
      } else if (attachment.kind === 'morphMany') {
        Object.assign(payload, morphStamp)
        createdRecord = await model.create(payload)
      } else {
        // M2M: create the related record first, then attach via the
        // pivot accessor. The accessor handles polymorphic stamping
        // (`<morphName>Type`) transparently for morphToMany /
        // morphedByMany. When `pivotColumns` is set the per-id
        // attach map ferries pivot extras into the new pivot row.
        const created = await model.create(payload)
        const newPk   = (created as Record<string, unknown> | null | undefined)?.[pk]
        if (newPk === undefined || newPk === null) {
          throw new Error(
            `[Pilotiq] Repeater.relationship("${cfg.name}"): newly created related record has no primary key — ` +
            `cannot attach pivot row. Check that \`${(model as { name?: string }).name ?? 'related model'}.create()\` ` +
            `returns a record with the primary key set.`,
          )
        }
        if (hasPivotPayload) {
          await m2mAccessor!.attach!({ [String(newPk)]: pivotPayload })
        } else {
          await m2mAccessor!.attach!([newPk as string | number])
        }
        createdRecord = created
      }
      // Phase B PK-switch — emit the rename so a collab adapter can swap
      // the row's id in the shared CRDT. Skipped when the submitter didn't
      // pass an `__id` (rare: only happens when consumer code constructs
      // a row server-side); skipped when old === new (consumer pre-assigned
      // the DB PK on the row).
      const createdPk = (createdRecord as Record<string, unknown> | null | undefined)?.[pk]
      if (submittedId !== undefined && createdPk !== undefined && createdPk !== null) {
        const newId = String(createdPk)
        if (submittedId !== newId) {
          renames.push({ field: cfg.name, old: submittedId, new: newId })
        }
      }
      if (afterCreate) await afterCreate(createdRecord, buildRowCtx(idx))
    }
  }

  for (const [pkVal, removedRow] of existingByPk) {
    if (keptPks.has(pkVal)) continue
    if (isM2M) {
      // Detach the pivot link only — the related record may still be
      // attached to other parents. `cascadeDelete` opt-in is a Tier-2
      // follow-up.
      await m2mAccessor!.detach!([pkVal])
    } else {
      await model.delete(pkVal)
    }
    if (afterDelete) await afterDelete(removedRow, buildRowCtx(-1))
  }
  return renames
}

/**
 * Read all rows from `parent.related(name)`. Used both by the load-
 * side fill (in pageData) and the save-side diff (above). Caps at
 * 10k — admin Repeaters should never get that large; if they do we'll
 * add explicit pagination.
 */
export async function loadRelationRows(
  parentModel:  ModelLike,
  parent:       unknown,
  name:         string,
  pivotColumns?: readonly string[],
): Promise<unknown[]> {
  let q = resolveRelatedQuery(parentModel, parent, name)
  if (pivotColumns && pivotColumns.length > 0 && typeof q.withPivot === 'function') {
    q = q.withPivot(...pivotColumns)
  }
  const result = await q.paginate(1, 10000)
  return result.data
}

// ─── Builder.relationship — extraction + persistence ─────────

interface BuilderRelationshipDeferral {
  field: BuilderField
  rows:  Array<Record<string, unknown>>
  cfg:   BuilderRelationshipConfig
}

/**
 * Walk the form's top-level Builders and extract values for any that have
 * a `relationship(...)` config. Same shape + posture as
 * `extractRelationshipRepeaters`; mutates `data` in place by deleting each
 * extracted key. Heterogeneous-row sibling — each row is a
 * `{ __id?, type, data: {…} }` envelope after `coerceBuilderValue`.
 */
export function extractRelationshipBuilders(
  elements: Element[],
  data:     Record<string, unknown>,
): BuilderRelationshipDeferral[] {
  const out: BuilderRelationshipDeferral[] = []
  walkBuildersTopLevel(elements, builder => {
    const cfg = builder.getRelationship()
    if (!cfg) return
    const value = data[builder.name]
    delete data[builder.name]
    if (!Array.isArray(value)) return
    out.push({
      field: builder,
      rows:  value as Array<Record<string, unknown>>,
      cfg,
    })
  })
  return out
}

/**
 * Resolved attachment shape for a relationship-backed Builder. v1 of
 * Builder.relationship handled `hasMany` only; the morphMany variant
 * stamps `<morphName>Id` + `<morphName>Type` on every create instead of
 * a single FK column. The two branches share the load path
 * (`parent.related(name)` already filters morph cols) but differ in the
 * persist payload.
 */
type BuilderChildAttachment =
  | { kind: 'hasMany';   model: ModelLike; foreignKey: string }
  | { kind: 'morphMany'; model: ModelLike; morph:      MorphRelationDescriptor }

/**
 * Resolve the child model + parent-attachment shape for a
 * relationship-backed Builder. Two supported modes:
 *
 *   - `hasMany`   — single foreign key on the child. Falls back to
 *                   `cfg.model` / `cfg.foreignKey` overrides when the
 *                   parent's `static relations[name]` doesn't expose them.
 *   - `morphMany` — polymorphic owner side. Reads the morph descriptor
 *                   off the parent's `static relations[name]` (no
 *                   override path — the discriminator + id columns are
 *                   driven entirely by `morphName`). `morphOne` collapses
 *                   into the same branch (the storage shape is identical;
 *                   "one row" is enforced upstream by the schema).
 *
 * Throws a clear configuration error when the relation type isn't one of
 * those two, or when the descriptor lookup fails entirely.
 */
function resolveBuilderChildAndAttachment(
  parentModel: ModelLike,
  cfg:         BuilderRelationshipConfig,
): BuilderChildAttachment {
  // Detect M2M first — a `belongsToMany` / `morphToMany` /
  // `morphedByMany` entry has no `foreignKey`, so it would silently
  // fall through to the hasMany branch below and surface a less-useful
  // "could not resolve foreign-key" error. Builder rows
  // (`{ type, data }`) don't compose with M2M pivot semantics, so this
  // is the surface where we point users at Repeater.relationship.
  const m2mDescriptor = getM2MRelationDescriptor(parentModel, cfg.name)
  if (m2mDescriptor) {
    throw new Error(
      `[Pilotiq] Builder.relationship("${cfg.name}"): unsupported relation type '${m2mDescriptor.type}'. ` +
      `Only 'hasMany' and 'morphMany' / 'morphOne' are supported on Builder.relationship in v1. ` +
      `belongsToMany / morphToMany / morphedByMany are not supported — the heterogeneous {type, data} ` +
      `envelope doesn't compose cleanly with M2M pivot semantics. Use a hasMany or morphMany relation, ` +
      `or use Repeater.relationship if your rows are homogeneous.`,
    )
  }

  const parentDescriptor = getParentRelationDescriptor(parentModel, cfg.name)
  const morphDescriptor  = getMorphRelationDescriptor(parentModel, cfg.name)
  const type             = parentDescriptor?.type
                        ?? (morphDescriptor ? 'morphMany' : 'hasMany')

  if (type === 'morphMany' || type === 'morphOne') {
    const model = cfg.model ?? morphDescriptor?.model?.()
    if (!model) {
      throw new Error(
        `[Pilotiq] Builder.relationship("${cfg.name}"): could not resolve the child model. ` +
        `Pass it explicitly via .relationship({ name, model: ChildModel }) or declare ` +
        `the relation's \`model\` thunk on the parent model's static relations map.`,
      )
    }
    if (!morphDescriptor) {
      throw new Error(
        `[Pilotiq] Builder.relationship("${cfg.name}"): polymorphic relation entry is missing \`morphName\`. ` +
        `Set \`relations.${cfg.name} = { type: 'morphMany', morphName: '<name>', model: () => ChildModel }\` on the parent.`,
      )
    }
    return { kind: 'morphMany', model, morph: morphDescriptor }
  }

  const model      = cfg.model ?? parentDescriptor?.model()
  const foreignKey = cfg.foreignKey ?? parentDescriptor?.foreignKey

  if (!model) {
    throw new Error(
      `[Pilotiq] Builder.relationship("${cfg.name}"): could not resolve the child model. ` +
      `Pass it explicitly via .relationship({ name, model: ChildModel }) or declare ` +
      `the relation on the parent model's static relations map.`,
    )
  }
  if (!foreignKey) {
    throw new Error(
      `[Pilotiq] Builder.relationship("${cfg.name}"): could not resolve the foreign-key column. ` +
      `Pass it explicitly via .relationship({ name, foreignKey: 'parentId' }) or declare ` +
      `it on the parent model's static relations map.`,
    )
  }
  if (type !== 'hasMany') {
    throw new Error(
      `[Pilotiq] Builder.relationship("${cfg.name}"): unsupported relation type '${type}'. ` +
      `Only 'hasMany' and 'morphMany' / 'morphOne' are supported on Builder.relationship in v1. ` +
      `belongsToMany / morphToMany / morphedByMany are not supported — the heterogeneous {type, data} ` +
      `envelope doesn't compose cleanly with M2M pivot semantics. Use a hasMany or morphMany relation, ` +
      `or use Repeater.relationship if your rows are homogeneous.`,
    )
  }

  return { kind: 'hasMany', model, foreignKey }
}

/**
 * Diff submitted Builder rows against the existing related rows and apply
 * create / update / delete operations through the child model. Same
 * identity rules as the Repeater pair — `__id` matches an existing PK →
 * update, missing → create, existing PK absent from submitted set →
 * delete. Each row writes its `type` discriminator + JSON `data` payload
 * to the configured columns.
 */
async function persistRelationshipBuilderRows(
  parent:      unknown,
  deferral:    BuilderRelationshipDeferral,
  parentModel: ModelLike,
): Promise<RelationshipRename[]> {
  const renames: RelationshipRename[] = []
  const { rows, cfg } = deferral
  const attachment  = resolveBuilderChildAndAttachment(parentModel, cfg)
  const { model }   = attachment
  const pk          = getPrimaryKey(model)
  const typeColumn  = cfg.typeColumn ?? 'type'
  const dataColumn  = cfg.dataColumn ?? 'data'
  const orderColumn = cfg.orderColumn
  const parentPk    = (parent as Record<string, unknown> | undefined)?.[getPrimaryKey(parentModel)]
  if (parentPk === undefined || parentPk === null) {
    throw new Error(
      `[Pilotiq] Builder.relationship("${cfg.name}"): parent record has no primary key after save. ` +
      `Form.save() / handleCreate() must return a record with a primary key set.`,
    )
  }

  // Compute the morph stamp once — `computeMorphPayload` is pure.
  const morphStamp = attachment.kind === 'morphMany'
    ? computeMorphPayload(parent, attachment.morph)
    : undefined

  const existing = await loadRelationRows(parentModel, parent, cfg.name)
  const existingByPk = new Map<string, Record<string, unknown>>()
  for (const row of existing) {
    const key = String((row as Record<string, unknown>)[pk])
    existingByPk.set(key, row as Record<string, unknown>)
  }

  const keptPks = new Set<string>()

  for (let idx = 0; idx < rows.length; idx++) {
    const submitted   = rows[idx] ?? {}
    const submittedId = typeof submitted['__id'] === 'string' ? submitted['__id'] : undefined
    const isUpdate    = submittedId !== undefined && existingByPk.has(submittedId)

    const blockType = typeof submitted['type'] === 'string' ? submitted['type'] : ''
    const blockData = (submitted['data'] && typeof submitted['data'] === 'object')
      ? submitted['data']
      : {}

    const payload: Record<string, unknown> = {
      [typeColumn]: blockType,
      [dataColumn]: blockData,
    }
    if (orderColumn !== undefined) payload[orderColumn] = idx

    if (isUpdate) {
      // Don't overwrite the parent attachment on update — for hasMany the
      // FK is already correct; for morphMany the `<morphName>Id` +
      // `<morphName>Type` cols are too. Defense against a tampered
      // client trying to re-link the child to a different polymorphic
      // parent.
      await model.update(submittedId!, payload)
      keptPks.add(submittedId!)
    } else {
      if (attachment.kind === 'hasMany') {
        payload[attachment.foreignKey] = parentPk
      } else {
        Object.assign(payload, morphStamp)
      }
      const createdRecord = await model.create(payload)
      // Phase B PK-switch — see persistRelationshipRows for the contract.
      const createdPk = (createdRecord as Record<string, unknown> | null | undefined)?.[pk]
      if (submittedId !== undefined && createdPk !== undefined && createdPk !== null) {
        const newId = String(createdPk)
        if (submittedId !== newId) {
          renames.push({ field: cfg.name, old: submittedId, new: newId })
        }
      }
    }
  }

  for (const [pkVal] of existingByPk) {
    if (keptPks.has(pkVal)) continue
    await model.delete(pkVal)
  }
  return renames
}
