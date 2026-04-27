import { Element } from '../schema/Element.js'
import { Form, type FormContext } from './Form.js'
import { validateSchema, type ValidationErrors } from '../validation/index.js'

export interface DispatchSuccess<R> {
  ok:       true
  record:   R
  redirect: string | undefined
}

export interface DispatchFailure {
  ok:     false
  errors: ValidationErrors
}

export type DispatchResult<R> = DispatchSuccess<R> | DispatchFailure

/**
 * Run the full form submit lifecycle on a `Form` element:
 *
 *   validateSchema → form-level validators → mutateData → beforeSave →
 *   save → afterSave → redirectAfterSave
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

  let data: Record<string, unknown> = body
  const mutate = form.getMutateData()
  if (mutate) data = await mutate(data, { ...ctx, values: data })

  const before = form.getBeforeSave()
  if (before) await before(data, { ...ctx, values: data })

  const save = form.getSave()
  if (!save) {
    throw new Error(
      '[Pilotiq] Form has no save() handler. Configure Form.save() on the page schema, or override Resource.pages() with a Page that supplies one.',
    )
  }
  const record = await save(data, { ...ctx, values: data })

  const after = form.getAfterSave()
  if (after) await after(record, { ...ctx, record, values: data })

  const redirectFn = form.getRedirectAfterSave()
  const redirect = redirectFn ? redirectFn(record, { ...ctx, record, values: data }) : undefined

  return { ok: true, record, redirect }
}

/**
 * Walk an Element tree and return every `Form` instance, in document order.
 * Used by route handlers to locate the form being submitted on a page that
 * may declare more than one.
 */
export function findForms(elements: ReadonlyArray<Element>): Form[] {
  const forms: Form[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (el instanceof Form) forms.push(el)
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
