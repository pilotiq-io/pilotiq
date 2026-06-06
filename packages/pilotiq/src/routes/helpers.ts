import type { AppRequest, AppResponse } from '@rudderjs/contracts'
import type { Pilotiq } from '../Pilotiq.js'
import { findActions, findRowExtraActions, type DispatchActionResult } from '../elements/dispatchAction.js'
import type { RelationshipRename } from '../elements/dispatchForm.js'
import { flashNotifications } from '../notifications/flash.js'
import type { NotificationMeta } from '../notifications/Notification.js'
import { findRecord, type ModelQuery } from '../orm/modelDefaults.js'
import type { ResourceClass } from '../Resource.js'
import {
  formStateData, type FormStateScope,
  formWizardData,
  formCreateOptionData,
  mentionResolveData,
  widgetData, type WidgetScope,
} from '../pageData.js'

/** True when the client wants a JSON response (modal-form action submitting
 * via fetch), false for a browser-style form post that wants a 303 redirect.
 * Both action endpoints honor this so confirm/handler buttons (form-post)
 * keep working unchanged while modal dialogs use fetch. */
export function wantsJson(req: AppRequest): boolean {
  const headers = req.headers ?? {}
  const accept = headers['accept'] ?? headers['Accept'] ?? ''
  return accept.includes('application/json')
}

/**
 * Read the request body as a `Record<string, unknown>`. The hono adapter
 * auto-parses JSON, but `application/x-www-form-urlencoded` and
 * `multipart/form-data` need a manual fall-through to Hono's own parser.
 */
export async function readFormBody(req: AppRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return { ...(req.body as Record<string, unknown>) }
  }
  const raw = req.raw as { req?: { parseBody?: () => Promise<Record<string, unknown>> } } | undefined
  if (raw?.req?.parseBody) {
    try {
      const parsed = await raw.req.parseBody()
      return parsed && typeof parsed === 'object' ? { ...parsed } : {}
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * Normalize a user-supplied redirect URL. Returns absolute URLs and
 * scheme-prefixed URLs unchanged. Bare relative paths (no leading `/`)
 * are joined under the panel's `basePath` — without this, the browser
 * resolves the redirect against the current request URL and produces
 * paths like `/admin/articles/{id}/articles/{id}/edit`.
 *
 * `getRedirectUrl` page hooks and `Form.redirectAfterSave` callbacks
 * are user-authored; this protects the framework against the common
 * authoring slip while keeping absolute URLs (the documented form)
 * working as-is.
 */
export function normalizeRedirect(url: string | undefined, basePath: string): string | undefined {
  if (!url) return undefined
  if (url.startsWith('/')) return url
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url   // http(s):, mailto:, etc.
  const trimmedBase = basePath.replace(/\/$/, '')
  return `${trimmedBase}/${url}`
}

/** Strip framework meta keys (`_formId`, `_method`, `_continueCreate`)
 * from a parsed body. `continueCreate` mirrors the secondary
 * "Create & create another" submit on `CreatePage`: when `'1'`, the
 * create POST handler routes the redirect back to the create URL
 * instead of the new record's edit page. */
export function splitMeta(body: Record<string, unknown>): {
  values:         Record<string, unknown>
  formId:         string | undefined
  continueCreate: boolean
} {
  const { _formId, _method: _omitMethod, _continueCreate, ...rest } = body
  return {
    values: rest,
    formId: typeof _formId === 'string' ? _formId : undefined,
    continueCreate: _continueCreate === '1' || _continueCreate === 1 || _continueCreate === true,
  }
}

/** Strip control characters (`"\\\r\n`) from a download filename so
 *  the `Content-Disposition: attachment; filename="…"` header stays
 *  unbreakable. Defends against a handler that returns a hostile
 *  filename string. Empty fallback `'export'`. */
export function sanitizeFilename(name: string): string {
  const cleaned = (name ?? '').replace(/[\r\n"\\]/g, '').trim()
  return cleaned.length > 0 ? cleaned : 'export'
}

/** Write an `Action`-handler download envelope as the response. Sets
 *  `Content-Type` + `Content-Disposition: attachment` and ends with
 *  the body. Mutually exclusive with redirect — call sites consult
 *  `result.download` first. */
export function sendDownload(
  res: AppResponse,
  env: { filename: string; contentType: string; body: string },
): void {
  res.header('Content-Type', env.contentType)
  res.header('Content-Disposition', `attachment; filename="${sanitizeFilename(env.filename)}"`)
  res.send(env.body)
}

/** Low-level success-or-redirect responder. Either emits a JSON envelope
 *  (`{ ok: true, redirect, notifications?, force?, relationshipRenames? }`)
 *  when the client asked for JSON, or flashes notifications to the next
 *  request and issues a 303 redirect. Shared by `sendActionResult`,
 *  `sendMutationSuccess`, and the form-submit success branches in
 *  resources / globals / pages / relations.
 *
 *  `relationshipRenames` are emitted only on the JSON path — they're a
 *  collab-side concern (per-row UUID → PK renames from
 *  `Repeater.relationship` / `Builder.relationship` creates) consumed
 *  by client-side adapters that own a CRDT binding. The 303 path drops
 *  them silently; non-collab flows are unaffected. */
export function sendRedirectResponse(
  req:           AppRequest,
  res:           AppResponse,
  json:          boolean,
  redirect:      string,
  notifications: ReadonlyArray<NotificationMeta> | undefined,
  extras?:       { force?: boolean; relationshipRenames?: ReadonlyArray<RelationshipRename> },
): unknown {
  if (json) {
    return res.json({
      ok: true,
      redirect,
      ...(extras?.force ? { force: true } : {}),
      ...(notifications && notifications.length > 0 ? { notifications } : {}),
      ...(extras?.relationshipRenames && extras.relationshipRenames.length > 0
        ? { relationshipRenames: extras.relationshipRenames }
        : {}),
    })
  }
  flashNotifications(req, notifications)
  return res.redirect(redirect, 303)
}

/** Action-dispatch result responder. Branches on `result.ok` / download
 *  envelope / redirect. Consumed by every `_action/:actionName` endpoint
 *  in resources / pages / relations.
 *
 *  - `!result.ok` → 422 (with `errors`) or 500 (`error` only). JSON path
 *    returns `{ ok: false, error, errors? }`; HTML path sends `error`.
 *  - `result.download` → calls `sendDownload` (mutually exclusive with
 *    `redirect`; binary response has no JSON envelope to carry
 *    notifications).
 *  - otherwise → `sendRedirectResponse` with the normalized redirect
 *    (defaulting to `fallbackUrl`) and `result.notifications`. */
export function sendActionResult(
  req:         AppRequest,
  res:         AppResponse,
  json:        boolean,
  result:      DispatchActionResult,
  base:        string,
  fallbackUrl: string,
): unknown {
  if (!result.ok) {
    if (json) {
      res.status(result.errors ? 422 : 500)
      return res.json({
        ok:    false,
        error: result.error,
        ...(result.errors ? { errors: result.errors } : {}),
      })
    }
    res.status(500)
    return res.send(result.error)
  }
  if (result.download) return sendDownload(res, result.download)
  const redirect = normalizeRedirect(result.redirect, base) ?? fallbackUrl
  return sendRedirectResponse(req, res, json, redirect, result.notifications)
}

/** Synthetic-notification mutation responder for delete / restore /
 *  force-delete / detach routes. The form-method 303 path doesn't have
 *  the form-lifecycle toast pipeline; this synthesizes one
 *  notification so the SPA path gets the same toast UX as a JSON-
 *  dispatched action handler. `kind` becomes part of the notification
 *  id (`n-${kind}-${id}-${Date.now()}`) so the client can dedupe. */
export function sendMutationSuccess(
  req:  AppRequest,
  res:  AppResponse,
  json: boolean,
  opts: { id: string; kind: string; title: string; redirect: string },
): unknown {
  const notifications: NotificationMeta[] = [
    { id: `n-${opts.kind}-${opts.id}-${Date.now()}`, type: 'success', title: opts.title } as never,
  ]
  return sendRedirectResponse(req, res, json, opts.redirect, notifications)
}

/** Soft-delete record lookup. Runs `q.withTrashed().where(pk, '=', id)
 *  .paginate(1, 1)` and returns the first row, or `undefined` when the
 *  query has no `withTrashed()` method (caller falls back to a normal
 *  `M.find(id)` or returns 404). `.catch(...)` swallows the paginate
 *  error so a bad query shape surfaces as "not found" rather than a
 *  500. */
export async function findInQueryWithTrashed(
  q:  ModelQuery,
  pk: string,
  id: string,
): Promise<unknown> {
  if (typeof q.withTrashed !== 'function') return undefined
  const result = await q.withTrashed()
    .where(pk, '=', id)
    .paginate(1, 1)
    .catch(() => ({ data: [] as unknown[] }))
  return Array.isArray(result.data) ? result.data[0] : undefined
}

/**
 * Is this request Vike's client-router pageContext fetch? On SPA nav the
 * client requests `/<path>/index.pageContext.json`; `@rudderjs/server-hono`
 * rewrites it onto the matching controller route and stashes the original
 * URL on `x-rudder-original-url` (the ViewResponse path hands it back to
 * renderPage so Vike emits JSON). When a policy gate short-circuits the
 * handler instead, the response must still be a Vike-parseable JSON
 * envelope — a plain `text/plain` 403 crashes the client router with a
 * Content-Type assertion ("Something went wrong" + console noise).
 */
export function isPageContextRequest(req: AppRequest): boolean {
  // AppRequest exposes headers as a plain Record (adapter-lowercased);
  // tolerate a header() accessor too for duck-typed test doubles.
  const r = req as {
    headers?: Record<string, string>
    header?: (name: string) => string | undefined
    url?: string
  }
  const orig = r.headers?.['x-rudder-original-url']
    ?? (typeof r.header === 'function' ? r.header('x-rudder-original-url') : undefined)
  if (typeof orig === 'string' && orig.includes('.pageContext.json')) return true
  return typeof r.url === 'string' && r.url.includes('.pageContext.json')
}

/**
 * Vike abort envelope — the JSON shape `isAbortPageContext` accepts on the
 * client (`abortStatusCode` + `_abortCall`), making the client router run
 * its abort path and render the app's error page with the status, exactly
 * as if the server had called Vike's `render(status)`.
 */
export function vikeAbort(res: AppResponse, status: 401 | 403, reason: string): unknown {
  res.status(status)
  return res.json({ abortStatusCode: status, _abortCall: `render(${status})`, abortReason: reason })
}

/**
 * Vike redirect envelope — the pageContext-JSON sibling of `vikeAbort`.
 * `isAbortPageContext` on the client accepts `_urlRedirect` (the shape
 * `throw redirect(url)` serializes to), making the SPA router navigate
 * to `url` instead of rendering an error page. Used by the guard's
 * `redirectTo` path for SPA navigations.
 */
export function vikeRedirect(res: AppResponse, url: string): unknown {
  res.status(200)
  return res.json({ _abortCall: `redirect(${JSON.stringify(url)})`, _urlRedirect: { url, statusCode: 302 } })
}

/**
 * Build the guard's redirect target, carrying the originally-requested
 * URL as `?redirect=<path>` so the login flow can bounce back after
 * sign-in. PageContext fetches rewrite onto `…/index.pageContext.json`
 * — strip that suffix so the bounce lands on the real page URL. Skips
 * the param when `redirectTo` already carries a query string or the
 * original path can't be derived.
 */
export function guardRedirectTarget(req: AppRequest, redirectTo: string): string {
  if (redirectTo.includes('?')) return redirectTo
  const r = req as { headers?: Record<string, string>; url?: string }
  let original = r.headers?.['x-rudder-original-url'] ?? r.url ?? ''
  if (original.startsWith('http')) {
    try {
      const u = new URL(original)
      original = u.pathname + u.search
    } catch { return redirectTo }
  }
  original = original.replace(/\/index\.pageContext\.json[^?]*/, '') || '/'
  if (!original.startsWith('/')) return redirectTo
  return `${redirectTo}?redirect=${encodeURIComponent(original)}`
}

/** Minimal self-contained 403 page for direct (non-SPA, non-JSON) loads —
 *  a bare `res.send('Forbidden')` reads like a broken server. */
export function forbiddenPage(res: AppResponse): unknown {
  res.header('Content-Type', 'text/html; charset=utf-8')
  return res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>403 — Forbidden</title>
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100svh;align-items:center;justify-content:center;margin:0;background:#fafaf9;color:#1a1a1a}main{text-align:center;padding:2rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#666;margin:0 0 1.25rem}a{color:#d97757}</style>
</head><body><main><h1>403 — You don't have access</h1><p>Your account isn't allowed to view this page.</p><a href="javascript:history.back()">&larr; Go back</a></main></body></html>`)
}

/** Plan #10 — send a 403 response. Branches three ways: Vike pageContext
 * fetches get the abort envelope (clean SPA error page), JSON clients get
 * the `{ ok:false }` shape the action / form dispatch paths use, and
 * direct browser loads get a small styled page. We deliberately do NOT
 * redirect to login: 403 means "authenticated but not allowed"; the
 * 401-unauthenticated case is `Pilotiq.guard()`'s job. */
export function forbidden(req: AppRequest, res: AppResponse, json: boolean): unknown {
  if (isPageContextRequest(req)) return vikeAbort(res, 403, 'Forbidden')
  res.status(403)
  if (json) return res.json({ ok: false, error: 'Forbidden' })
  return forbiddenPage(res)
}

/** Extract a user-facing message from a thrown value inside an editable
 *  column's beforeStateUpdated / afterStateUpdated hook. Stamped under
 *  the reserved `_cell` key in the 422 response. */
export function cellHookErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err.length > 0) return err
  return 'Update halted'
}

/** Run a `canX(...)` predicate, treating throws as `false`. The predicate
 * is user-authored and we want a flaky check to fail closed (deny) rather
 * than 500 the page. */
export async function checkPolicy(fn: () => boolean | Promise<boolean>): Promise<boolean> {
  try { return Boolean(await fn()) } catch { return false }
}

export async function policyAccess(
  owner: {
    canAccess: (user: unknown) => boolean | Promise<boolean>
    cluster?: { canAccess: (user: unknown) => boolean | Promise<boolean> }
  },
  user: unknown,
): Promise<boolean> {
  const [ownerOk, clusterOk] = await Promise.all([
    checkPolicy(() => owner.canAccess(user)),
    owner.cluster
      ? checkPolicy(() => owner.cluster!.canAccess(user))
      : Promise.resolve(true),
  ])
  return ownerOk && clusterOk
}

/**
 * Two-predicate policy gate. Runs `policyAccess(owner, user)` in
 * parallel with `checkPolicy(predicate)` and returns true only when
 * both resolve truthy. Use this when the predicate does NOT depend on a
 * record loaded between the two checks — record-dependent gates (e.g.
 * `canEdit(user, record)` where `record` is loaded mid-handler) must
 * stay sequential.
 *
 * Both checks fail-closed (throw → false). The pair runs whenever the
 * route handler enters; replacing the serial pair halves the wait when
 * either predicate makes a network round-trip.
 */
export async function policyGate(
  owner: Parameters<typeof policyAccess>[0],
  user: unknown,
  predicate: () => boolean | Promise<boolean>,
): Promise<boolean> {
  const [accessOk, predOk] = await Promise.all([
    policyAccess(owner, user),
    checkPolicy(predicate),
  ])
  return accessOk && predOk
}

/** Run `policyAccess(R, user)` and `findRecord(R, recordId, { user })`
 *  in parallel. Both depend only on `user`, so the two round-trips
 *  overlap instead of waiting on each other. When `R.model` isn't set
 *  the record falls back to a stub `{ id: recordId }` so record-aware
 *  predicates can still pattern-match. Throws are caught — a failed
 *  record load resolves to `undefined`, mirroring the pre-helper inline
 *  shape `findRecord(...).catch(() => undefined)`. */
export async function loadAccessGated(
  R:        ResourceClass,
  recordId: string,
  user:     unknown,
): Promise<{ access: boolean; record: unknown }> {
  const [access, record] = await Promise.all([
    policyAccess(R, user),
    R.model
      ? findRecord(R, recordId, { user }).catch(() => undefined)
      : Promise.resolve({ id: recordId }),
  ])
  return { access, record }
}

/**
 * Locate an action by name in a resolved page schema. Looks at both
 * page-level actions (`findActions`) AND row-scoped extraItemActions on
 * Repeater/Builder fields (`findRowExtraActions`). When the match is
 * row-scoped, also returns the parent field reference and the form
 * schema array — the dispatcher uses both to coerce the form body and
 * navigate to the right row when stamping `ctx.row`.
 *
 * Page-level matches win when a page-level + row-scoped action share the
 * same name (page-level is strictly more privileged: it has access to
 * the full form, not just one row). The collision is undocumented
 * behavior — authors should use distinct names.
 */
export function resolveDispatchTarget(
  elements:   import('../schema/Element.js').Element[],
  actionName: string,
): {
  action:      import('../actions/Action.js').Action
  rowField?:   import('../fields/RepeaterField.js').RepeaterField | import('../fields/BuilderField.js').BuilderField
  formSchema?: import('../schema/Element.js').Element[]
} | null {
  const pageLevel = findActions(elements).find(a => a.name === actionName)
  if (pageLevel) return { action: pageLevel }

  const rowMatches = findRowExtraActions(elements).filter(r => r.action.name === actionName)
  if (rowMatches.length === 0) return null
  if (rowMatches.length > 1) {
    console.warn(
      `[pilotiq] Action "${actionName}" registered as extraItemActions on multiple ` +
      `fields. Using the first match — disambiguate by renaming.`,
    )
  }
  const first = rowMatches[0]!
  // `formSchema` is the entire page tree for v1 — `coerceFormValues`
  // needs the field schema rooted at the form, not just the one row's
  // children. Passing the page tree is over-broad but safe (the function
  // walks until it finds the field). A future polish can narrow to the
  // owning Form once we walk back from the matched field.
  return { action: first.action, rowField: first.field, formSchema: elements }
}

/**
 * Plan #5 — handle a partial-resolve POST. The body shape is
 * `{ changed, values }`; `formId` comes from the URL path. Response
 * is `{ ok, form, dirty }` on success or `{ ok: false, error }` for
 * missing form / unknown field.
 */
export interface FormStateBody {
  changed?: unknown
  values?:  unknown
}

export async function handleFormState(
  req:     AppRequest,
  res:     AppResponse,
  pilotiq: Pilotiq,
  scope:   FormStateScope,
  formId:  string,
): Promise<unknown> {
  const body = (await readFormBody(req)) as FormStateBody
  const changed = typeof body.changed === 'string' ? body.changed : ''
  const values  = (body.values && typeof body.values === 'object' && !Array.isArray(body.values))
    ? body.values as Record<string, unknown>
    : {}
  if (!formId || !changed) {
    res.status(400)
    return res.json({ ok: false, error: 'Missing formId or changed field' })
  }

  try {
    const result = await formStateData(pilotiq, scope, { formId, changed, values }, req)
    if (result === null) {
      res.status(404)
      return res.json({ ok: false, error: 'Page not found' })
    }
    if (!result.ok) {
      res.status(result.status)
      return res.json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, form: result.form, dirty: result.dirty })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Form update failed'
    res.status(500)
    return res.json({ ok: false, error: message })
  }
}

export interface FormWizardBody {
  step?:   unknown
  values?: unknown
}

export async function handleFormWizard(
  req:     AppRequest,
  res:     AppResponse,
  pilotiq: Pilotiq,
  scope:   FormStateScope,
  formId:  string,
): Promise<unknown> {
  const body   = (await readFormBody(req)) as FormWizardBody
  const stepN  = typeof body.step === 'number' ? body.step
              : typeof body.step === 'string' ? Number(body.step)
              : NaN
  const values = (body.values && typeof body.values === 'object' && !Array.isArray(body.values))
    ? body.values as Record<string, unknown>
    : {}
  if (!formId || !Number.isFinite(stepN) || stepN < 0) {
    res.status(400)
    return res.json({ ok: false, error: 'Missing formId or invalid step' })
  }

  try {
    const result = await formWizardData(pilotiq, scope, { formId, step: stepN, values }, req)
    if (result === null) {
      res.status(404)
      return res.json({ ok: false, error: 'Page not found' })
    }
    if (!result.ok) {
      res.status(result.status)
      const payload: Record<string, unknown> = { ok: false }
      if (result.error)  payload['error']  = result.error
      if (result.errors) payload['errors'] = result.errors
      return res.json(payload)
    }
    return res.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Wizard step validation failed'
    res.status(500)
    return res.json({ ok: false, error: message })
  }
}

/**
 * Audit row 2026-05-07 cont'd⁸ — `SelectField.createOptionForm()` modal
 * submit. Body carries `{ values }`; `formId` + `fieldName` come from
 * the URL path. Returns `{ ok, option: { value, label } }` on success
 * or `{ ok: false, error }` for missing scope / form / field, 403 for
 * authorize failure, or 422 with `errors` for validation.
 *
 * One handler shared across all four scopes (resource-create /
 * resource-edit / global-edit / custom-page) — caller passes the
 * matching `FormStateScope` so the same `canAccess + canCreate / canEdit`
 * predicates apply to the parent form's policy gate.
 */
export interface FormCreateOptionBody {
  values?: unknown
}

export async function handleFormCreateOption(
  req:       AppRequest,
  res:       AppResponse,
  pilotiq:   Pilotiq,
  scope:     FormStateScope,
  formId:    string,
  fieldName: string,
): Promise<unknown> {
  const body   = (await readFormBody(req)) as FormCreateOptionBody
  const values = (body.values && typeof body.values === 'object' && !Array.isArray(body.values))
    ? body.values as Record<string, unknown>
    : {}
  if (!formId || !fieldName) {
    res.status(400)
    return res.json({ ok: false, error: 'Missing formId or fieldName' })
  }

  try {
    const result = await formCreateOptionData(pilotiq, scope, { formId, fieldName, values }, req)
    if (result === null) {
      res.status(404)
      return res.json({ ok: false, error: 'Page not found' })
    }
    if (!result.ok) {
      res.status(result.status)
      const payload: Record<string, unknown> = { ok: false }
      if (result.error)  payload['error']  = result.error
      if (result.errors) payload['errors'] = result.errors
      return res.json(payload)
    }
    return res.json({ ok: true, option: result.option })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'createOption failed'
    res.status(500)
    return res.json({ ok: false, error: message })
  }
}

/**
 * Async-mention round-trip handler. Body is `{ field, trigger, query }`;
 * `formId` comes from the URL path. Returns `{ ok, items }` on success
 * or `{ ok: false, error }` for missing form / field / trigger.
 *
 * Each scope (resource-create, resource-edit, global-edit, custom-page)
 * registers its own route — the auth gate matches the matching `_form/
 * :formId/state` endpoint so the same `canAccess + canCreate / canEdit`
 * predicates apply.
 */
export interface FormMentionsBody {
  field?:   unknown
  trigger?: unknown
  query?:   unknown
}

export async function handleFormMentions(
  req:     AppRequest,
  res:     AppResponse,
  pilotiq: Pilotiq,
  scope:   FormStateScope,
  formId:  string,
): Promise<unknown> {
  const body = (await readFormBody(req)) as FormMentionsBody
  const field   = typeof body.field   === 'string' ? body.field   : ''
  const trigger = typeof body.trigger === 'string' ? body.trigger : ''
  const query   = typeof body.query   === 'string' ? body.query   : ''
  if (!formId || !field || trigger.length !== 1) {
    res.status(400)
    return res.json({ ok: false, error: 'Missing formId / field / trigger' })
  }

  // Cap query length — the resolver runs the user's code; the trigger
  // never sends more than a word's worth of characters in practice.
  const cappedQuery = query.length > 200 ? query.slice(0, 200) : query

  try {
    const result = await mentionResolveData(
      pilotiq,
      scope,
      { formId, field, trigger, query: cappedQuery },
      req,
    )
    if (result === null) {
      res.status(404)
      return res.json({ ok: false, error: 'Page not found' })
    }
    if (!result.ok) {
      res.status(result.status)
      return res.json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, items: result.items })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mention resolve failed'
    res.status(500)
    return res.json({ ok: false, error: message })
  }
}

/**
 * Plan #15 — handle a widget polling POST. Body is `{ filter? }`;
 * `:id` comes from the URL. Returns `{ ok, data, timestamp }` on
 * success or `{ ok: false, error }` on failure. Used by lazy-loading
 * widgets (first fetch on mount) and `poll(seconds)` widgets (interval
 * re-fetch).
 */
export interface WidgetBody {
  filter?: unknown
}

export async function handleWidgetData(
  req:     AppRequest,
  res:     AppResponse,
  pilotiq: Pilotiq,
  scope:   WidgetScope,
  id:      string,
): Promise<unknown> {
  if (!id) {
    res.status(400)
    return res.json({ ok: false, error: 'Missing widget id' })
  }
  const body = (await readFormBody(req)) as WidgetBody
  const filter = typeof body.filter === 'string' ? body.filter : undefined

  try {
    const result = await widgetData(
      pilotiq,
      scope,
      filter !== undefined ? { id, filter } : { id },
      req,
    )
    if (!result.ok) {
      res.status(result.status)
      return res.json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, data: result.data, timestamp: result.timestamp })
  } catch (err) {
    res.status(500)
    return res.json({ ok: false, error: err instanceof Error ? err.message : 'Widget request failed' })
  }
}

/**
 * Handle a single file upload from a `FileUpload` field. Validates
 * accept / maxSize against the (optional) per-request hints, hands
 * the file off to the configured adapter, returns `{ ok, url }`.
 *
 * Body shape (multipart/form-data):
 *   - `file`: the file blob
 *   - `directory`: optional sub-directory hint
 *   - `accept`: optional comma-separated MIME list to enforce
 *   - `maxSize`: optional byte cap
 *   - `fieldName`: optional tag forwarded to the adapter for routing
 */
export async function handleUploadRequest(
  req:     AppRequest,
  res:     AppResponse,
  pilotiq: Pilotiq,
): Promise<unknown> {
  const cfg = pilotiq.getConfig()
  if (!cfg.uploads) {
    res.status(500)
    return res.json({ ok: false, error: 'No upload adapter configured' })
  }

  // Auth: `Pilotiq.guard()` runs as a `router.group(...)` middleware in
  // `routes.ts`, so by the time we land here the panel-wide gate has
  // already passed. We don't enforce per-resource canEdit because the
  // field doesn't know which resource it belongs to — apps that need
  // it should hook into their adapter's `put()` and consult their own
  // auth there.

  // Parse multipart body. Hono's parseBody returns `Record<string, File | string>`.
  const raw = req.raw as { req?: { parseBody?: (opts?: { all?: boolean }) => Promise<Record<string, unknown>> } } | undefined
  if (!raw?.req?.parseBody) {
    res.status(500)
    return res.json({ ok: false, error: 'Multipart parsing unavailable' })
  }
  let body: Record<string, unknown>
  try {
    body = await raw.req.parseBody()
  } catch (err) {
    res.status(400)
    return res.json({ ok: false, error: err instanceof Error ? err.message : 'Bad request' })
  }

  const file = body['file']
  if (!file || !(file instanceof File)) {
    res.status(422)
    return res.json({ ok: false, error: 'No file provided' })
  }

  const directory = typeof body['directory'] === 'string' ? body['directory'] : undefined
  const fieldName = typeof body['fieldName'] === 'string' ? body['fieldName'] : ''
  const preserveFilenames = body['preserveFilenames'] === 'true' || body['preserveFilenames'] === '1'

  // Server-side validation. Both accept and maxSize are advisory hints
  // shipped by the field meta, so we re-check here so a tampered client
  // can't bypass the limits.
  const acceptStr = typeof body['accept'] === 'string' ? body['accept'] : ''
  if (acceptStr) {
    const accept = acceptStr.split(',').map(s => s.trim()).filter(Boolean)
    if (accept.length > 0 && !accept.includes(file.type)) {
      res.status(422)
      return res.json({ ok: false, error: `File type "${file.type}" not allowed` })
    }
  }
  const maxSizeStr = typeof body['maxSize'] === 'string' ? body['maxSize'] : ''
  if (maxSizeStr) {
    const maxSize = Number(maxSizeStr)
    if (Number.isFinite(maxSize) && file.size > maxSize) {
      res.status(422)
      return res.json({ ok: false, error: `File exceeds ${maxSize} bytes` })
    }
  }

  // Server-side resize via @rudderjs/image (optional peer dep). Variable-
  // string `import(name)` keeps Vite's static import-analysis from trying
  // to pre-resolve the module on host apps that don't have @rudderjs/image
  // installed — same pattern as `notifications/database.ts` for `@rudderjs/orm`.
  const resizeWidthStr  = typeof body['resize_width']  === 'string' ? body['resize_width']  : ''
  const resizeHeightStr = typeof body['resize_height'] === 'string' ? body['resize_height'] : ''
  let uploadFile: File = file
  if (resizeWidthStr && resizeHeightStr) {
    const w = Number(resizeWidthStr)
    const h = Number(resizeHeightStr)
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
      try {
        const imageModuleName = '@rudderjs/image'
         
        const pkg = await import(/* @vite-ignore */ imageModuleName) as { image: (input: unknown) => { resize(w: number, h: number): { format(f: string): { toBuffer(): Promise<Buffer> } } } }
        const buf = await pkg.image(file).resize(w, h).format('webp').toBuffer()
        const baseName = file.name.replace(/\.[^.]+$/, '')
        uploadFile = new File([buf.buffer as ArrayBuffer], `${baseName}.webp`, { type: 'image/webp' })
      } catch (err) {
        // @rudderjs/image not installed or resize failed — fall through with the
        // original file. We log so a misconfigured resize (peer dep present but
        // crashing on a specific file) doesn't silently degrade to unresized
        // uploads in production.
        console.warn('[pilotiq] image resize fell through; uploading original file:', err instanceof Error ? err.message : err)
      }
    }
  }

  try {
    const result = await cfg.uploads.adapter.put({
      file: uploadFile,
      ...(directory ? { directory } : {}),
      fieldName,
      ...(preserveFilenames ? { preserveFilenames: true } : {}),
    })
    return res.json({ ok: true, url: result.url, ...(result.meta ? { meta: result.meta } : {}) })
  } catch (err) {
    res.status(500)
    return res.json({ ok: false, error: err instanceof Error ? err.message : 'Upload failed' })
  }
}
