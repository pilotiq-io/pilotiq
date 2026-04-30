import { Element } from '../schema/Element.js'
import { Field, type AfterStateUpdatedContext } from '../fields/Field.js'
import { Form, type FormContext } from './Form.js'
import { validateSchema, type ValidationErrors } from '../validation/index.js'
import { resolveSavedNotification, type NotificationMeta } from '../notifications/index.js'

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

  const fieldErrors = validateSchema(children as Element[], body, ctx.record)

  const formValidatorErrors: string[] = []
  for (const v of form.getFormValidators()) {
    const msg = v(body, { values: body, ...(ctx.record !== undefined ? { record: ctx.record } : {}) })
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

  return { ok: true, record, redirect, notifications }
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
export function coerceFormValues(
  elements: Element[],
  body:     Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body }
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
        // YYYY-MM-DD(THH:mm) shapes — `new Date()` handles both.
        if (raw === undefined || raw === null || raw === '') {
          out[name] = null
        } else if (typeof raw === 'string') {
          out[name] = new Date(raw)
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
      case 'color': {
        // Empty string → null so DB nullable columns accept it. Otherwise
        // pass the hex string through verbatim.
        if (raw === undefined || raw === null || raw === '') {
          out[name] = null
        }
        break
      }
      case 'fileUpload': {
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
      default:
        // text/textarea/email/select/slug — leave as string.
        break
    }
  })
  return out
}

function walkFields(elements: Element[], visit: (f: Field) => void): void {
  for (const el of elements) {
    if (el instanceof Field) visit(el)
    const children = el.getChildren()
    if (children && children.length > 0) walkFields(children as Element[], visit)
  }
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
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
    }
  }
  walk(elements)
  return forms
}

/**
 * Pick the `Form` matching the submitted `_formId`, or fall back to the
 * first form on the page when no id was sent. Returns undefined if the page
 * has no forms.
 */
export function selectForm(forms: ReadonlyArray<Form>, submittedId: unknown): Form | undefined {
  if (typeof submittedId === 'string') {
    const match = forms.find(f => f.getFormId() === submittedId)
    if (match) return match
  }
  return forms[0]
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
 */
export async function applyStateUpdate<R = unknown>(
  form:    Form<R>,
  values:  Record<string, unknown>,
  changed: string,
  ctx:     StateUpdateContext<R> = {},
): Promise<StateUpdateResult | null> {
  const children = (form.getChildren() ?? []) as Element[]
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
    if (el instanceof Field && el.name === name) return el
    const children = el.getChildren()
    if (children && children.length > 0) {
      const hit = findFieldByName(children as Element[], name)
      if (hit) return hit
    }
  }
  return undefined
}
