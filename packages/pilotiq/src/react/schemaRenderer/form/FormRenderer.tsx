import React, { useRef, useState } from 'react'
import type { ElementMeta } from '../../../schema/Element.js'
import type { NotificationMeta } from '../../../notifications/Notification.js'
import { FormIdContext, FormStateProvider, useFormState } from '../../FormStateContext.js'
import { useNavigate } from '../../navigate.js'
import { useToast } from '../../Toaster.js'
import { renderField } from './renderField.js'

// ─── Form ───────────────────────────────────────────────────

type RenderElement = (el: ElementMeta, index: number) => React.ReactNode

/**
 * Top-level `<form>` element. Owns:
 *   - HTML form chrome (action, method, _method spoof, hidden formId)
 *   - Fetch + JSON submission with `Accept: application/json` (so the
 *     server can return 422 with field errors instead of re-rendering)
 *   - Inline error stamping (`_form` banner + per-field error strings)
 *   - `FormStateProvider` mount when the form has any reactive field
 *     (`live()` or `afterStateUpdatedJs`) and a `stateUrl` was stamped.
 *
 * `renderElement` is injected for non-field children inside the form
 * body (cards / dividers / fieldsets / etc).
 */
export function FormRenderer({
  el,
  renderElement,
}: {
  el: ElementMeta
  renderElement: RenderElement
}) {
  const formId = String(el['formId'] ?? '')
  const method = String(el['method'] ?? 'post').toLowerCase()
  const action = el['action'] ? String(el['action']) : undefined
  const stateUrl = el['stateUrl'] ? String(el['stateUrl']) : undefined
  const serverValues = (el['values'] as Record<string, unknown> | undefined) ?? {}
  const serverErrors = (el['errors'] as Record<string, string[]> | undefined) ?? {}

  // Methods other than GET/POST are spoofed via _method, mirroring Laravel.
  const httpMethod = method === 'get' ? 'get' : 'post'
  const spoofedMethod = method !== 'get' && method !== 'post' ? method : undefined

  const navigate = useNavigate()
  const { notify } = useToast()

  // Client-side errors override server-rendered ones after a fetch-mode
  // 422 response. Field values stay uncontrolled — the inputs in the DOM
  // still hold whatever the user typed, so we don't need to mirror them.
  const [clientErrors, setClientErrors] = useState<Record<string, string[]> | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const errors = clientErrors ?? serverErrors

  // Plan #14 — formRef is threaded into FormStateProvider so live triggers
  // can snapshot the form's full DOM state via FormData (captures
  // uncontrolled inner-Repeater inputs that don't participate in the
  // controlled values map).
  const formRef = useRef<HTMLFormElement | null>(null)

  const formErrors = errors['_form'] ?? []
  const hasFieldErrors = Object.keys(errors).some(k => k !== '_form')

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    if (!action) return                       // no action URL → fall through to native submit
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setClientErrors(null)

    try {
      // Thread `event.submitter` so the clicked submit button's
      // name/value pair lands in the FormData. Without this, secondary
      // submits like "Create & create another" can't signal which
      // button fired through the body. Supported in all evergreen
      // browsers since 2022; cast through `as any` because TS lib.dom
      // hasn't picked up the optional submitter argument on every
      // version.
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null
      const fd = new (FormData as any)(e.currentTarget, submitter ?? undefined) as FormData
      const res = await fetch(action, {
        method:  'POST',
        headers: { 'Accept': 'application/json' },
        body:    fd,
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 422) {
        const next = (data as { errors?: Record<string, string[]> }).errors ?? {}
        setClientErrors(next)
        // Surface a banner-level message if no field errors were returned
        // — the form-level _form key lights up the existing banner.
        setSubmitting(false)
        return
      }
      if (!res.ok) {
        const message = String((data as { error?: string }).error ?? `Request failed (${res.status})`)
        notify({ type: 'error', title: 'Save failed', body: message })
        setSubmitting(false)
        return
      }

      // Success — drain notifications and SPA-navigate to the redirect.
      const notifs = (data as { notifications?: NotificationMeta[] }).notifications
      if (notifs && notifs.length > 0) for (const n of notifs) notify(n)
      const redirect = String((data as { redirect?: string }).redirect ?? '')
      // The server may force a navigate even when the redirect equals
      // the current URL — used by "Create & create another" so the
      // form remounts with empty defaults instead of preserving the
      // just-submitted values. Otherwise: skip navigate when the
      // redirect matches the current URL, since re-fetching the same
      // page would force a form remount and reset scroll.
      const force = Boolean((data as { force?: boolean }).force)
      const currentUrl = typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : ''
      if (redirect && (force || redirect !== currentUrl)) {
        navigate(redirect)
        // Don't reset submitting on success — the navigation will unmount us.
      } else {
        setSubmitting(false)
      }
    } catch (err) {
      notify({ type: 'error', title: 'Save failed', body: err instanceof Error ? err.message : String(err) })
      setSubmitting(false)
    }
  }

  return (
    <form
      ref={formRef}
      id={formId || undefined}
      data-form-id={formId || undefined}
      method={httpMethod}
      action={action}
      onSubmit={onSubmit}
      className="flex flex-col gap-6"
    >
      {formId && <input type="hidden" name="_formId" value={formId} />}
      {spoofedMethod && <input type="hidden" name="_method" value={spoofedMethod} />}
      {(formErrors.length > 0 || hasFieldErrors) && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 text-destructive p-3 text-sm">
          {formErrors.length > 0 ? (
            <ul className="list-disc pl-4">
              {formErrors.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          ) : (
            'Please correct the errors below.'
          )}
        </div>
      )}
      <FormIdContext.Provider value={formId}>
        {stateUrl ? (
          <FormStateProvider initialMeta={el} initialErrors={errors} formRef={formRef}>
            <FormBody
              fallbackChildren={el.children ?? []}
              fallbackValues={serverValues}
              fallbackErrors={errors}
              renderElement={renderElement}
            />
          </FormStateProvider>
        ) : (
          (el.children ?? []).map((child, i) => renderFormChild(child, i, serverValues, errors, renderElement))
        )}
      </FormIdContext.Provider>
    </form>
  )
}

/**
 * Renders the controlled-form's children, sourcing them from the
 * `FormStateProvider`'s current `formMeta` (which gets replaced after
 * each live POST). Falls back to the props if (somehow) used outside a
 * provider — the shell only mounts this when `stateUrl` is set so the
 * fallback path is dead code in practice, but keeping it defensive.
 */
function FormBody({
  fallbackChildren, fallbackValues, fallbackErrors, renderElement,
}: {
  fallbackChildren: ElementMeta[]
  fallbackValues:   Record<string, unknown>
  fallbackErrors:   Record<string, string[]>
  renderElement:    RenderElement
}): React.ReactElement {
  const ctx = useFormState()
  if (!ctx) {
    return <>{fallbackChildren.map((child, i) => renderFormChild(child, i, fallbackValues, fallbackErrors, renderElement))}</>
  }
  const children = (ctx.formMeta.children ?? []) as ElementMeta[]
  return <>{children.map((child, i) => renderFormChild(child, i, ctx.values, ctx.errors, renderElement))}</>
}

/**
 * Render one child of a form's resolved schema with per-field values + errors.
 *
 * Field elements wrap in error-stamp chrome; non-field children fall
 * through to `renderElement` so the form body can host cards / dividers /
 * fieldsets / etc.
 */
export function renderFormChild(
  child:         ElementMeta,
  index:         number,
  values:        Record<string, unknown>,
  errors:        Record<string, string[]>,
  renderElement: RenderElement,
): React.ReactNode {
  if (child.type === 'field') {
    const name      = String(child['name'] ?? '')
    const fieldErrors = errors[name] ?? []
    const value     = values[name]
    return (
      <div key={index} className="flex flex-col gap-1">
        {renderFieldWithValue(child, index, value, renderElement)}
        {fieldErrors.map((msg, i) => (
          <p key={i} className="text-xs text-destructive">{msg}</p>
        ))}
      </div>
    )
  }
  return renderElement(child, index)
}

function renderFieldWithValue(
  el: ElementMeta,
  index: number,
  value: unknown,
  renderElement: RenderElement,
): React.ReactNode {
  // The form-state value (from `withValues` / record-fill) wins when present;
  // otherwise the meta's own `defaultValue` (Plan #6 `Field.default()`) survives.
  const enriched: ElementMeta = value !== undefined
    ? { ...el, defaultValue: value }
    : el
  return renderField(enriched, index, renderElement)
}
