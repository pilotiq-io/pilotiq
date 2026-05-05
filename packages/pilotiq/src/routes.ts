import type { Router } from '@rudderjs/router'
import type { AppRequest, AppResponse } from '@rudderjs/contracts'
import { view } from '@rudderjs/view'
import type { Pilotiq } from './Pilotiq.js'
import { Form } from './elements/Form.js'
import { resolveSchema, type SchemaContext } from './schema/resolveSchema.js'
import { dispatchFormSubmit, findForms, selectForm } from './elements/dispatchForm.js'
import { dispatchAction, findActions, findRowExtraActions, parseActionBody, type ResolveRecord } from './elements/dispatchAction.js'
import { flashNotifications } from './notifications/flash.js'
import {
  listFiltersKey,
  readPersistedListQuery,
  writePersistedListQuery,
  encodePersistedQuery,
} from './sessionFilters.js'
import {
  panelInfo, callPageSchema, tagFormActions, tagActionDispatch,
  dashboardData, resourceIndexData, resourceTableData,
  resourceCreateData, resourceEditData,
  resourceViewData, globalEditData, globalViewData, customPageData,
  formStateData, type FormStateScope,
  formWizardData,
  mentionResolveData,
  searchData,
  relationManagerData, findRelatedResource, safeManagerPolicy,
  widgetData, type WidgetScope,
} from './pageData.js'
import {
  RelationManager, RESERVED_RELATIONSHIP_TOKENS,
  normalizeRelationMode,
  type RelationMode,
} from './RelationManager.js'
import {
  modelSave, modelLoadRecord, findRecord, getPrimaryKey, getRelationType,
  getMorphRelationDescriptor, computeMorphPayload,
} from './orm/modelDefaults.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { coerceCellValue, CellCoerceError } from './cells/coerce.js'
import type { ThemeConfig } from './theme/types.js'
import { presets } from './theme/presets.js'
import { baseColors } from './theme/base-colors.js'
import { HUE_NAMES } from './theme/colors.js'
import { migrateThemeOverrides } from './theme/migrate.js'
import { radiusMap } from './theme/radius.js'

/** True when the client wants a JSON response (modal-form action submitting
 * via fetch), false for a browser-style form post that wants a 303 redirect.
 * Both action endpoints honor this so confirm/handler buttons (form-post)
 * keep working unchanged while modal dialogs use fetch. */
function wantsJson(req: AppRequest): boolean {
  const headers = req.headers ?? {}
  const accept = headers['accept'] ?? headers['Accept'] ?? ''
  return accept.includes('application/json')
}

/**
 * Read the request body as a `Record<string, unknown>`. The hono adapter
 * auto-parses JSON, but `application/x-www-form-urlencoded` and
 * `multipart/form-data` need a manual fall-through to Hono's own parser.
 */
async function readFormBody(req: AppRequest): Promise<Record<string, unknown>> {
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
function normalizeRedirect(url: string | undefined, basePath: string): string | undefined {
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
function splitMeta(body: Record<string, unknown>): {
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
function sanitizeFilename(name: string): string {
  const cleaned = (name ?? '').replace(/[\r\n"\\]/g, '').trim()
  return cleaned.length > 0 ? cleaned : 'export'
}

/** Write an `Action`-handler download envelope as the response. Sets
 *  `Content-Type` + `Content-Disposition: attachment` and ends with
 *  the body. Mutually exclusive with redirect — call sites consult
 *  `result.download` first. */
function sendDownload(
  res: AppResponse,
  env: { filename: string; contentType: string; body: string },
): void {
  res.header('Content-Type', env.contentType)
  res.header('Content-Disposition', `attachment; filename="${sanitizeFilename(env.filename)}"`)
  res.send(env.body)
}

/** Plan #10 — send a 403 response. Branches on `Accept: application/json`
 * the same way the action / form dispatch paths do. Used by every route
 * after a `Resource.canX(...)` check fails. We deliberately do NOT
 * redirect to login: 403 means "authenticated but not allowed"; the
 * 401-unauthenticated case is `Pilotiq.guard()`'s job. */
function forbidden(res: AppResponse, json: boolean): unknown {
  res.status(403)
  if (json) return res.json({ ok: false, error: 'Forbidden' })
  return res.send('Forbidden')
}

/** Run a `canX(...)` predicate, treating throws as `false`. The predicate
 * is user-authored and we want a flaky check to fail closed (deny) rather
 * than 500 the page. */
async function checkPolicy(fn: () => boolean | Promise<boolean>): Promise<boolean> {
  try { return Boolean(await fn()) } catch { return false }
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
function resolveDispatchTarget(
  elements:   import('./schema/Element.js').Element[],
  actionName: string,
): {
  action:      import('./actions/Action.js').Action
  rowField?:   import('./fields/RepeaterField.js').RepeaterField | import('./fields/BuilderField.js').BuilderField
  formSchema?: import('./schema/Element.js').Element[]
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
interface FormStateBody {
  changed?: unknown
  values?:  unknown
}

async function handleFormState(
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

interface FormWizardBody {
  step?:   unknown
  values?: unknown
}

async function handleFormWizard(
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
 * Async-mention round-trip handler. Body is `{ field, trigger, query }`;
 * `formId` comes from the URL path. Returns `{ ok, items }` on success
 * or `{ ok: false, error }` for missing form / field / trigger.
 *
 * Each scope (resource-create, resource-edit, global-edit, custom-page)
 * registers its own route — the auth gate matches the matching `_form/
 * :formId/state` endpoint so the same `canAccess + canCreate / canEdit`
 * predicates apply.
 */
interface FormMentionsBody {
  field?:   unknown
  trigger?: unknown
  query?:   unknown
}

async function handleFormMentions(
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
interface WidgetBody {
  filter?: unknown
}

async function handleWidgetData(
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
async function handleUploadRequest(
  req:     AppRequest,
  res:     AppResponse,
  pilotiq: Pilotiq,
): Promise<unknown> {
  const cfg = pilotiq.getConfig()
  if (!cfg.uploads) {
    res.status(500)
    return res.json({ ok: false, error: 'No upload adapter configured' })
  }

  // Auth: panel-wide `guard` and per-request `user`. We don't enforce
  // per-resource canEdit here because the field doesn't know which
  // resource it belongs to — apps that need it should hook into
  // their adapter's `put()` and consult their own auth there.
  if (cfg.guard && !await cfg.guard(req)) {
    res.status(401)
    return res.json({ ok: false, error: 'Unauthorized' })
  }

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

  try {
    const result = await cfg.uploads.adapter.put({
      file,
      ...(directory ? { directory } : {}),
      fieldName,
    })
    return res.json({ ok: true, url: result.url, ...(result.meta ? { meta: result.meta } : {}) })
  } catch (err) {
    res.status(500)
    return res.json({ ok: false, error: err instanceof Error ? err.message : 'Upload failed' })
  }
}

export function registerPilotiqRoutes(
  router: Router,
  pilotiq: Pilotiq,
): void {
  const cfg = pilotiq.getConfig()
  const base = cfg.path

  // Plan #11 — fail fast at boot when any relation manager's
  // `relationship` collides with a reserved URL token. A silent 404 at
  // request time is much harder to debug.
  for (const R of cfg.resources) {
    for (const M of R.relations()) {
      const rel = M.getRelationship()
      if (RESERVED_RELATIONSHIP_TOKENS.has(rel)) {
        throw new Error(
          `[Pilotiq] RelationManager ${M.name} on ${R.name} uses reserved relationship "${rel}". ` +
          `Reserved tokens: ${[...RESERVED_RELATIONSHIP_TOKENS].join(', ')}. Rename it.`,
        )
      }
    }
  }

  // Reorderable rows — fail fast at boot when a Resource declares
  // `Table.reorderable()` but the bound model can't actually persist a
  // new order. We invoke `R.table(Table.make())` once per resource (the
  // same call shape `defaultPages` uses at request time) and inspect
  // `_reorderableColumn`. The model.reorder check is symmetric with
  // Plan #13's restore/forceDelete guards. Result is cached per-resource
  // so the route loop below can decide whether to mount `_reorder`.
  const reorderEnabled = new Map<string, string>() // slug → column
  for (const R of cfg.resources) {
    let probeColumn: string | undefined
    try { probeColumn = R.table(Table.make()).getReorderableColumn() }
    catch { continue }   // user-side throw — not a reorder concern
    if (probeColumn === undefined) continue
    if (!R.model || typeof R.model.reorder !== 'function') {
      throw new Error(
        `[Pilotiq] ${R.name}.table() calls reorderable("${probeColumn}") but the bound model has no reorder(ids) method. ` +
        `Implement \`async reorder(ids)\` on the rudder Model (or remove the .reorderable() call).`,
      )
    }
    reorderEnabled.set(R.getSlug(), probeColumn)
  }

  // Editable cell columns — fail fast at boot when a Resource declares
  // at least one TextInput/Toggle/SelectColumn but the bound model
  // can't persist a single-column update. Mirrors the reorder guard
  // above. Result is cached per-resource so the route loop below can
  // decide whether to mount `_cell`.
  const editableEnabled = new Set<string>()
  for (const R of cfg.resources) {
    let hasEditable = false
    try {
      hasEditable = (R.table(Table.make()).getChildren() ?? [])
        .some(c => c instanceof Column && c.isEditable())
    } catch { continue }
    if (!hasEditable) continue
    if (!R.model || typeof R.model.update !== 'function') {
      throw new Error(
        `[Pilotiq] ${R.name}.table() declares an editable cell column ` +
        `(TextInputColumn / ToggleColumn / SelectColumn) but the bound ` +
        `model has no update(id, data) method. Set Resource.model = M ` +
        `(rudder ORM convention) or drop the editable column.`,
      )
    }
    editableEnabled.add(R.getSlug())
  }

  // ── Dashboard (1-segment) ─────────────────────────────
  router.get(base, async (req, res) => {
    // Plan #15 — when `panel.dashboard(P)` is set, gate the dashboard
    // route through the page's `canAccess` predicate. Same posture as
    // custom pages — fail-closed on throw.
    if (cfg.dashboardPage) {
      const user = await pilotiq.resolveUser(req)
      if (!await checkPolicy(() => cfg.dashboardPage!.canAccess(user))) {
        return forbidden(res, wantsJson(req))
      }
    }
    return view('pilotiq.dashboard', await dashboardData(pilotiq, req))
  })

  // ── File uploads (FileUpload field POST target) ───────
  router.post(`${base}/_uploads`, async (req, res) => {
    return handleUploadRequest(req, res, pilotiq)
  })

  // ── Plan #15 dashboard widget polling ─────────────────
  // POST ${base}/_widget/:id — re-resolves the dashboard page schema,
  // finds widget by id, runs `getServerData(ctx)`. Body: `{ filter? }`.
  // Mounted unconditionally — widgetData() returns 404 when no
  // dashboard page is registered, so this stays cheap when unused.
  router.post(`${base}/_widget/:id`, async (req, res) => {
    if (cfg.dashboardPage) {
      const user = await pilotiq.resolveUser(req)
      if (!await checkPolicy(() => cfg.dashboardPage!.canAccess(user))) return forbidden(res, true)
    }
    return handleWidgetData(req, res, pilotiq, { kind: 'panel' }, req.params['id']!)
  })

  // ── Plan #12 global search ────────────────────────────
  // GET ${base}/_search?q=…&limit=… → { ok, results }
  // No 403 on unrecognised users — `searchAllResources` filters per
  // resource. The Pilotiq.guard() layer above is the panel-level gate.
  router.get(`${base}/_search`, async (req, res) => {
    const query = req.query as Record<string, unknown> | undefined
    const rawQ  = query?.['q']
    const q     = typeof rawQ === 'string' ? rawQ.slice(0, 200) : ''
    const data  = await searchData(pilotiq, q, req)
    return res.json(data)
  })

  // ── Resource routes ───────────────────────────────────
  for (const R of cfg.resources) {
    const slug  = R.getSlug()
    const pages = R.resolvePages()

    // Index — GET ${base}/${slug}
    if (pages.index) {
      const PageClass = pages.index
      const indexUrl  = `${base}/${slug}`
      router.get(indexUrl, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user)))  return forbidden(res, wantsJson(req))
        if (!await checkPolicy(() => R.canViewAny(user))) return forbidden(res, wantsJson(req))

        // Tier-3 filter persistence — when the resource opts in,
        // bare visits (no query params at all) restore the last-known
        // filter slice; non-bare visits write the current slice back
        // to the session for the next time. No-ops silently when
        // `@rudderjs/session` isn't installed on the host.
        if (R.persistFiltersInSession) {
          const query = (req.query as Record<string, unknown> | undefined) ?? {}
          const key   = listFiltersKey(base, slug)
          if (Object.keys(query).length === 0) {
            const stored = readPersistedListQuery(req, key)
            if (stored) {
              const qs = encodePersistedQuery(stored)
              if (qs !== '') return res.redirect(`${indexUrl}?${qs}`, 302)
            }
          } else {
            writePersistedListQuery(req, key, query)
          }
        }

        const data = await resourceIndexData(pilotiq, slug, req.query, req)
        return view('pilotiq.slug', data ?? {})
      })

      // Plan #15 — resource-scope widget polling. Re-resolves the list
      // page schema (so widgets from `Resource.headerSchema()` /
      // `footerSchema()` are reachable), runs `R.canAccess + R.canViewAny`
      // in front of the per-widget `evaluateVisibility` check, then
      // returns the resolved payload. Body: `{ filter? }`.
      router.post(`${indexUrl}/_widget/:id`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user)))  return forbidden(res, true)
        if (!await checkPolicy(() => R.canViewAny(user))) return forbidden(res, true)
        return handleWidgetData(req, res, pilotiq, { kind: 'resource', slug }, req.params['id']!)
      })

      // Tier-3 — `Resource.deferLoading` JSON endpoint. Re-runs the
      // list-page data builder with the deferred flag clear so the
      // records handler actually loads, then returns every resolved
      // `TableMeta` flat. The renderer fetches this on mount when
      // `meta.deferred + meta.tableUrl` are stamped on the SSR Table.
      // Same auth gates as the GET list page; query string mirrors the
      // page's URL so filter / sort / page / search / group state all
      // round-trip into the response.
      if (R.deferLoading) {
        router.get(`${indexUrl}/_table`, async (req, res) => {
          const user = await pilotiq.resolveUser(req)
          if (!await checkPolicy(() => R.canAccess(user)))  return forbidden(res, true)
          if (!await checkPolicy(() => R.canViewAny(user))) return forbidden(res, true)
          const data = await resourceTableData(pilotiq, slug, req.query as Record<string, string>, req)
          if (!data) { res.status(404); return res.json({ ok: false, error: 'Resource not found' }) }
          return res.json({ ok: true, ...data })
        })
      }

      // Action dispatch — POST ${base}/${slug}/_action/:actionName
      router.post(`${indexUrl}/_action/:actionName`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, wantsJson(req))

        const actionName = req.params['actionName']!
        const json = wantsJson(req)
        const body  = await readFormBody(req)
        const input = parseActionBody(body)

        const ctx: SchemaContext = { mode: 'table', basePath: base, ...(user !== null ? { user: user as NonNullable<SchemaContext['user']> } : {}) }
        const elements = await callPageSchema(PageClass, ctx)
        tagActionDispatch(elements, indexUrl)
        const target = resolveDispatchTarget(elements, actionName)
        if (!target) {
          if (json) { res.status(404); return res.json({ ok: false, error: `Action "${actionName}" not found` }) }
          res.status(404)
          return res.send(`Action "${actionName}" not found on ${R.label}`)
        }

        const resolveRecord: ResolveRecord | undefined = R.model
          ? (id: string) => findRecord(R, id, { user })
          : undefined

        const result = await dispatchAction(target.action, {
          ...input,
          request: req,
          ...(target.rowField   ? { rowField:   target.rowField   } : {}),
          ...(target.formSchema ? { formSchema: target.formSchema } : {}),
        }, resolveRecord)
        if (!result.ok) {
          if (json) {
            res.status(result.errors ? 422 : 500)
            return res.json({ ok: false, error: result.error, ...(result.errors ? { errors: result.errors } : {}) })
          }
          res.status(500)
          return res.send(result.error)
        }
        // Download envelope wins over redirect — `Action.export` and friends
        // return the file body inline. Notifications dropped on this branch
        // because the binary response has no JSON envelope to carry them;
        // the file itself is the success signal.
        if (result.download) return sendDownload(res, result.download)
        const redirect = normalizeRedirect(result.redirect, base) ?? indexUrl
        if (json) {
          return res.json({
            ok: true,
            redirect,
            ...(result.notifications ? { notifications: result.notifications } : {}),
          })
        }
        flashNotifications(req, result.notifications)
        return res.redirect(redirect, 303)
      })

      // Reorderable rows — POST ${base}/${slug}/_reorder { ids: [] }
      // Only mounted when `Resource.table()` opts in (boot-time probe
      // populates `reorderEnabled`).
      if (reorderEnabled.has(slug)) {
        router.post(`${indexUrl}/_reorder`, async (req, res) => {
          const user = await pilotiq.resolveUser(req)
          if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, true)
          // List-level edit gate. The drop affects many rows at once;
          // there's no single record to authorize against, so we pass
          // `undefined` and let user-supplied `canEdit` overrides branch
          // on `record === undefined` if they want row-level granularity.
          if (!await checkPolicy(() => R.canEdit(user, undefined))) return forbidden(res, true)

          const body = await readFormBody(req)
          const raw  = (body as { ids?: unknown }).ids
          if (!Array.isArray(raw) || raw.length === 0) {
            res.status(400)
            return res.json({ ok: false, error: 'Missing or empty ids array' })
          }
          const ids = raw.filter((id): id is string | number =>
            typeof id === 'string' || typeof id === 'number',
          )
          if (ids.length !== raw.length) {
            res.status(400)
            return res.json({ ok: false, error: 'ids must contain only strings or numbers' })
          }

          try {
            // Boot already verified `R.model?.reorder` exists; the `!`
            // assertions are safe.
            await R.model!.reorder!(ids)
            return res.json({ ok: true })
          } catch (err) {
            res.status(422)
            return res.json({
              ok:    false,
              error: err instanceof Error ? err.message : 'Reorder failed',
            })
          }
        })
      }

      // Editable cell columns — POST ${base}/${slug}/:id/_cell/:column
      // { value: <coerced> }. Only mounted when the resource declares at
      // least one editable column (boot-time probe populates
      // `editableEnabled`).
      if (editableEnabled.has(slug)) {
        router.post(`${indexUrl}/:id/_cell/:column`, async (req, res) => {
          const user = await pilotiq.resolveUser(req)
          if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, true)

          const id      = req.params['id']!
          const colName = req.params['column']!

          // Locate the column on the table. We re-derive `Table.make()`
          // here (same probe shape used by the boot guard + reorder route)
          // so the column instance carries its validators / discriminator.
          const probe = R.table(Table.make())
          const col = (probe.getChildren() ?? [])
            .find((c): c is Column => c instanceof Column && c.name === colName)
          if (!col) {
            res.status(400)
            return res.json({ ok: false, error: `Unknown column "${colName}"` })
          }
          if (!col.isEditable()) {
            res.status(400)
            return res.json({ ok: false, error: `Column "${colName}" is not editable` })
          }

          // Boot already verified `R.model?.update`; the `!` is safe.
          const record = await findRecord(R, id, { user })
          if (record === null || record === undefined) {
            res.status(404)
            return res.json({ ok: false, error: 'Record not found' })
          }
          if (!await checkPolicy(() => R.canEdit(user, record))) return forbidden(res, true)

          const body = await readFormBody(req)
          const raw  = (body as { value?: unknown }).value

          let value: unknown
          try { value = coerceCellValue(col, raw) }
          catch (err) {
            const message = err instanceof CellCoerceError ? err.message
              : err instanceof Error ? err.message
              : 'Invalid value'
            res.status(422)
            return res.json({ ok: false, errors: { value: [message] } })
          }

          const errors = await col.runValidators(value, { record })
          if (errors.length > 0) {
            res.status(422)
            return res.json({ ok: false, errors: { value: errors } })
          }

          try {
            await R.model!.update(id, { [col.name]: value })
          } catch (err) {
            res.status(422)
            return res.json({
              ok:    false,
              error: err instanceof Error ? err.message : 'Update failed',
            })
          }

          return res.json({ ok: true, value, notifications: [] })
        })
      }
    }

    // Plan #5 — partial-resolve endpoint for create-mode forms.
    // POST ${base}/${slug}/_form/:formId/state
    if (pages.create) {
      router.post(`${base}/${slug}/_form/:formId/state`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, true)
        if (!await checkPolicy(() => R.canCreate(user))) return forbidden(res, true)
        const formId = req.params['formId']!
        return handleFormState(req, res, pilotiq, { kind: 'resource-create', slug }, formId)
      })

      // Plan #8 — wizard step-validate endpoint for create-mode forms.
      router.post(`${base}/${slug}/_form/:formId/wizard`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, true)
        if (!await checkPolicy(() => R.canCreate(user))) return forbidden(res, true)
        const formId = req.params['formId']!
        return handleFormWizard(req, res, pilotiq, { kind: 'resource-create', slug }, formId)
      })

      // Async-mention endpoint for create-mode forms.
      router.post(`${base}/${slug}/_form/:formId/mentions`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, true)
        if (!await checkPolicy(() => R.canCreate(user))) return forbidden(res, true)
        const formId = req.params['formId']!
        return handleFormMentions(req, res, pilotiq, { kind: 'resource-create', slug }, formId)
      })
    }

    // Plan #5 — partial-resolve endpoint for edit-mode forms.
    // POST ${base}/${slug}/:id/_form/:formId/state
    if (pages.edit) {
      router.post(`${base}/${slug}/:id/_form/:formId/state`, async (req, res) => {
        const recordId = req.params['id']!
        const formId   = req.params['formId']!
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, true)
        const policyRecord = R.model ? await findRecord(R, recordId, { user }).catch(() => undefined) : { id: recordId }
        if (!await checkPolicy(() => R.canEdit(user, policyRecord))) return forbidden(res, true)
        return handleFormState(req, res, pilotiq, { kind: 'resource-edit', slug, recordId }, formId)
      })

      // Plan #8 — wizard step-validate endpoint for edit-mode forms.
      router.post(`${base}/${slug}/:id/_form/:formId/wizard`, async (req, res) => {
        const recordId = req.params['id']!
        const formId   = req.params['formId']!
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, true)
        const policyRecord = R.model ? await findRecord(R, recordId, { user }).catch(() => undefined) : { id: recordId }
        if (!await checkPolicy(() => R.canEdit(user, policyRecord))) return forbidden(res, true)
        return handleFormWizard(req, res, pilotiq, { kind: 'resource-edit', slug, recordId }, formId)
      })

      // Async-mention endpoint for edit-mode forms.
      router.post(`${base}/${slug}/:id/_form/:formId/mentions`, async (req, res) => {
        const recordId = req.params['id']!
        const formId   = req.params['formId']!
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, true)
        const policyRecord = R.model ? await findRecord(R, recordId, { user }).catch(() => undefined) : { id: recordId }
        if (!await checkPolicy(() => R.canEdit(user, policyRecord))) return forbidden(res, true)
        return handleFormMentions(req, res, pilotiq, { kind: 'resource-edit', slug, recordId }, formId)
      })
    }

    // Create — GET ${base}/${slug}/create
    if (pages.create) {
      const PageClass = pages.create
      const createUrl = `${base}/${slug}/create`

      router.get(createUrl, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, wantsJson(req))
        if (!await checkPolicy(() => R.canCreate(user))) return forbidden(res, wantsJson(req))
        const data = await resourceCreateData(pilotiq, slug, undefined, req)
        return view('pilotiq.resource-create', data ?? {})
      })

      // Create — POST ${base}/${slug}/create
      router.post(createUrl, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, wantsJson(req))
        if (!await checkPolicy(() => R.canCreate(user))) return forbidden(res, wantsJson(req))

        const body = await readFormBody(req)
        const { values, formId, continueCreate } = splitMeta(body)
        const json = wantsJson(req)

        const ctx: SchemaContext = { mode: 'create', basePath: base, ...(user !== null ? { user: user as NonNullable<SchemaContext['user']> } : {}) }
        const elements = await callPageSchema(PageClass, ctx)
        tagFormActions(elements, createUrl)
        const form = selectForm(findForms(elements), formId)
        if (!form) {
          if (json) { res.status(404); return res.json({ ok: false, error: 'No form found on page' }) }
          res.status(404)
          return res.send('No form found on page')
        }

        const result = await dispatchFormSubmit(form, values, {
          values,
          basePath: base,
          ...(R.model ? { parentModel: R.model } : {}),
        })

        if (!result.ok) {
          if (json) {
            res.status(422)
            return res.json({ ok: false, errors: result.errors })
          }
          // Re-render through the same builder so the page is identical to GET,
          // just with values + errors prefilled.
          const data = await resourceCreateData(pilotiq, slug, { values, errors: result.errors })
          res.status(422)
          return view('pilotiq.resource-create', data ?? {})
        }

        const recordId = (result.record as { id?: unknown })?.id
        // "Create & create another" — when the secondary submit fired,
        // route back to the create page with a fresh form. Skips any
        // user-supplied `redirectAfterSave`: the user clicked the
        // button asking explicitly to create another, so the
        // continue-intent wins. `force: true` tells the SPA-mode
        // FormRenderer to navigate even though the redirect URL
        // matches the current page (otherwise the same-URL skip
        // would preserve the just-submitted values on screen).
        const fallback = continueCreate
          ? createUrl
          : recordId !== undefined ? `${base}/${slug}/${String(recordId)}/edit` : `${base}/${slug}`
        const redirect = continueCreate
          ? createUrl
          : normalizeRedirect(result.redirect, base) ?? fallback
        if (json) {
          return res.json({
            ok: true,
            redirect,
            ...(continueCreate ? { force: true } : {}),
            ...(result.notifications && result.notifications.length > 0 ? { notifications: result.notifications } : {}),
          })
        }
        flashNotifications(req, result.notifications)
        return res.redirect(redirect, 303)
      })

      // Action dispatch — POST ${createUrl}/_action/:actionName
      // Handles both page-level handler-style actions AND Repeater /
      // Builder `extraItemActions` rows. The latter pass `_rowPath` in
      // the body so the dispatcher hydrates `ctx.row` from the form's
      // coerced values.
      router.post(`${createUrl}/_action/:actionName`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, wantsJson(req))
        if (!await checkPolicy(() => R.canCreate(user))) return forbidden(res, wantsJson(req))

        const actionName = req.params['actionName']!
        const json = wantsJson(req)
        const body  = await readFormBody(req)
        const input = parseActionBody(body)

        const ctx: SchemaContext = { mode: 'create', basePath: base, ...(user !== null ? { user: user as NonNullable<SchemaContext['user']> } : {}) }
        const elements = await callPageSchema(PageClass, ctx)
        tagActionDispatch(elements, createUrl)
        const target = resolveDispatchTarget(elements, actionName)
        if (!target) {
          if (json) { res.status(404); return res.json({ ok: false, error: `Action "${actionName}" not found` }) }
          res.status(404)
          return res.send(`Action "${actionName}" not found on ${R.label}`)
        }

        const result = await dispatchAction(target.action, {
          ...input,
          request: req,
          ...(target.rowField   ? { rowField:   target.rowField   } : {}),
          ...(target.formSchema ? { formSchema: target.formSchema } : {}),
        })
        if (!result.ok) {
          if (json) {
            res.status(result.errors ? 422 : 500)
            return res.json({ ok: false, error: result.error, ...(result.errors ? { errors: result.errors } : {}) })
          }
          res.status(500)
          return res.send(result.error)
        }
        if (result.download) return sendDownload(res, result.download)
        const redirect = normalizeRedirect(result.redirect, base) ?? createUrl
        if (json) {
          return res.json({
            ok: true,
            redirect,
            ...(result.notifications ? { notifications: result.notifications } : {}),
          })
        }
        flashNotifications(req, result.notifications)
        return res.redirect(redirect, 303)
      })
    }

    // View — GET ${base}/${slug}/:id (literal `create` matches first via
    // Hono's literal-over-param routing, so `:id` only catches everything else.)
    if (pages.view) {
      router.get(`${base}/${slug}/:id`, async (req, res) => {
        const recordId = req.params['id']!
        // Hono routes both `/create` and `/:id` against this slot; only the
        // literal `create` segment hits the create route. Defensive guard:
        if (recordId === 'create') return // handled by create route

        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, wantsJson(req))
        // Load the record once so canView can inspect it. Stub `{ id }`
        // when the resource has no model wired — the user-authored
        // predicate gets to decide what to do with it.
        const record = R.model ? await findRecord(R, recordId, { user }).catch(() => undefined) : { id: recordId }
        if (!await checkPolicy(() => R.canView(user, record))) return forbidden(res, wantsJson(req))

        const data = await resourceViewData(pilotiq, slug, recordId, req)
        return view('pilotiq.resource-view', data ?? {})
      })

      // Delete — POST ${base}/${slug}/:id/delete
      router.post(`${base}/${slug}/:id/delete`, async (req, res) => {
        const recordId = req.params['id']!
        const json = wantsJson(req)
        const indexUrl = `${base}/${slug}`

        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, json)
        const record = R.model ? await findRecord(R, recordId, { user }).catch(() => undefined) : { id: recordId }
        if (!await checkPolicy(() => R.canDelete(user, record))) return forbidden(res, json)

        try {
          await R.deleteRecord(recordId)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Delete failed'
          if (json) {
            res.status(500)
            return res.json({ ok: false, error: message })
          }
          res.status(500)
          return res.send(message)
        }
        if (json) {
          // Build a synthetic deletion notification so the SPA path gets
          // the same toast UX as a JSON-dispatched action handler. The
          // form-method 303 path doesn't have the form-lifecycle toast
          // pipeline, so we surface confirmation here. Plan #13: use
          // "moved to trash" framing on soft-delete resources so users
          // know the row is recoverable.
          const title = R.softDeletes
            ? `${R.labelSingular} moved to trash`
            : `${R.labelSingular} deleted`
          const notifications = [
            { id: `n-delete-${recordId}-${Date.now()}`, type: 'success', title },
          ]
          return res.json({ ok: true, redirect: indexUrl, notifications })
        }
        return res.redirect(indexUrl, 303)
      })
    }

    // ─── Plan #13 soft-delete routes (restore / force-delete) ─────
    // Both routes opt-in only when `Resource.softDeletes = true`. They
    // load the target row through `withTrashed()` so the lookup finds
    // currently-trashed records (which the default scope hides). The
    // `restore` route undoes a prior soft-delete; `force-delete`
    // bypasses soft-delete entirely.
    if (R.softDeletes) {
      // Boot-time guard — yell loudly if the rudder ORM model isn't
      // wired up. Keeps "why didn't restore work?" debug sessions
      // short. Pilotiq's flag and rudder's flag are deliberately
      // independent (see plan doc).
      if (!R.model) {
        throw new Error(
          `[Pilotiq] ${R.name}: softDeletes = true requires a Resource.model. Wire one up or unset softDeletes.`,
        )
      }
      if (typeof R.model.restore !== 'function' || typeof R.model.forceDelete !== 'function') {
        throw new Error(
          `[Pilotiq] ${R.name}: softDeletes = true but model.restore / model.forceDelete are missing. ` +
          `Set Model.softDeletes = true on the rudder side, or upgrade @rudderjs/orm.`,
        )
      }

      const M = R.model
      const pk = (M.primaryKey ?? 'id') as string

      // Helper — load a row through `withTrashed` so currently-trashed
      // records resolve. Returns undefined when the lookup misses (route
      // converts to 404).
      const loadTrashable = async (id: string): Promise<unknown> => {
        const q = M.query()
        if (typeof q.withTrashed !== 'function') return M.find(id).catch(() => undefined)
        const result = await q.withTrashed()
          .where(pk, '=', id)
          .paginate(1, 1)
          .catch(() => ({ data: [] as unknown[] }))
        return Array.isArray(result.data) ? result.data[0] : undefined
      }

      // Restore — POST ${base}/${slug}/:id/restore
      router.post(`${base}/${slug}/:id/restore`, async (req, res) => {
        const recordId = req.params['id']!
        const json = wantsJson(req)
        const indexUrl = `${base}/${slug}`

        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, json)
        const record = await loadTrashable(recordId)
        if (!record) {
          res.status(404)
          return json ? res.json({ ok: false, error: 'Not found' }) : res.send('Not found')
        }
        if (!await checkPolicy(() => R.canRestore(user, record))) return forbidden(res, json)

        try {
          await M.restore!(recordId)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Restore failed'
          res.status(500)
          return json ? res.json({ ok: false, error: message }) : res.send(message)
        }

        if (json) {
          const notifications = [
            { id: `n-restore-${recordId}-${Date.now()}`, type: 'success', title: `${R.labelSingular} restored` },
          ]
          return res.json({ ok: true, redirect: indexUrl, notifications })
        }
        return res.redirect(indexUrl, 303)
      })

      // Force-delete — POST ${base}/${slug}/:id/force-delete
      router.post(`${base}/${slug}/:id/force-delete`, async (req, res) => {
        const recordId = req.params['id']!
        const json = wantsJson(req)
        const indexUrl = `${base}/${slug}`

        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, json)
        const record = await loadTrashable(recordId)
        if (!record) {
          res.status(404)
          return json ? res.json({ ok: false, error: 'Not found' }) : res.send('Not found')
        }
        if (!await checkPolicy(() => R.canForceDelete(user, record))) return forbidden(res, json)

        try {
          await M.forceDelete!(recordId)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Force-delete failed'
          res.status(500)
          return json ? res.json({ ok: false, error: message }) : res.send(message)
        }

        if (json) {
          const notifications = [
            { id: `n-fdelete-${recordId}-${Date.now()}`, type: 'success', title: `${R.labelSingular} permanently deleted` },
          ]
          return res.json({ ok: true, redirect: indexUrl, notifications })
        }
        return res.redirect(indexUrl, 303)
      })
    }

    // Edit — GET ${base}/${slug}/:id/edit
    if (pages.edit) {
      const PageClass = pages.edit

      router.get(`${base}/${slug}/:id/edit`, async (req, res) => {
        const recordId = req.params['id']!
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, wantsJson(req))
        const record = R.model ? await findRecord(R, recordId, { user }).catch(() => undefined) : { id: recordId }
        if (!await checkPolicy(() => R.canEdit(user, record))) return forbidden(res, wantsJson(req))

        const data = await resourceEditData(pilotiq, slug, recordId, undefined, req)
        return view('pilotiq.resource-edit', data ?? {})
      })

      // Edit — POST ${base}/${slug}/:id/edit
      router.post(`${base}/${slug}/:id/edit`, async (req, res) => {
        const recordId = req.params['id']!
        const editUrl  = `${base}/${slug}/${recordId}/edit`
        const body = await readFormBody(req)
        const { values, formId } = splitMeta(body)
        const json = wantsJson(req)

        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, json)
        const policyRecord = R.model ? await findRecord(R, recordId, { user }).catch(() => undefined) : { id: recordId }
        if (!await checkPolicy(() => R.canEdit(user, policyRecord))) return forbidden(res, json)

        const ctx: SchemaContext = { mode: 'edit', recordId, basePath: base, ...(user !== null ? { user: user as NonNullable<SchemaContext['user']> } : {}) }
        const elements = await callPageSchema(PageClass, ctx)
        tagFormActions(elements, editUrl)
        const form = selectForm(findForms(elements), formId)
        if (!form) {
          if (json) { res.status(404); return res.json({ ok: false, error: 'No form found on page' }) }
          res.status(404)
          return res.send('No form found on page')
        }

        // Try to load the record so validators with cross-field rules see it.
        let record: unknown = undefined
        if (form.getLoadRecord()) {
          try { record = await form.getLoadRecord()!(recordId, { values }) } catch { /* ignore */ }
        }

        const result = await dispatchFormSubmit(
          form,
          values,
          {
            values,
            basePath: base,
            ...(record !== undefined ? { record } : {}),
            ...(R.model ? { parentModel: R.model } : {}),
          },
        )

        if (!result.ok) {
          if (json) {
            res.status(422)
            return res.json({ ok: false, errors: result.errors })
          }
          const data = await resourceEditData(pilotiq, slug, recordId, { values, errors: result.errors })
          res.status(422)
          return view('pilotiq.resource-edit', data ?? {})
        }

        const redirect = normalizeRedirect(result.redirect, base) ?? editUrl
        if (json) {
          return res.json({
            ok: true,
            redirect,
            ...(result.notifications && result.notifications.length > 0 ? { notifications: result.notifications } : {}),
          })
        }
        flashNotifications(req, result.notifications)
        return res.redirect(redirect, 303)
      })

      // Action dispatch — POST ${editUrl}/_action/:actionName
      // Same shape as the create-page _action route. The `:id` segment
      // gates record-aware policy (canEdit per record); row-scoped
      // dispatch reuses the form schema we resolve here for `coerceFormValues`.
      router.post(`${base}/${slug}/:id/_action/:actionName`, async (req, res) => {
        const recordId = req.params['id']!
        // Hono routes `/edit` and `/delete` against this slot too — bail
        // out so the dedicated handlers downstream pick them up. The
        // `:actionName` capture catches anything; the explicit guard
        // mirrors the view-route `recordId === 'create'` defensive branch.
        const actionName = req.params['actionName']!

        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) return forbidden(res, wantsJson(req))
        const policyRecord = R.model ? await findRecord(R, recordId, { user }).catch(() => undefined) : { id: recordId }
        if (!await checkPolicy(() => R.canEdit(user, policyRecord))) return forbidden(res, wantsJson(req))

        const json = wantsJson(req)
        const body  = await readFormBody(req)
        const input = parseActionBody(body)

        const editUrl = `${base}/${slug}/${recordId}/edit`
        const ctx: SchemaContext = { mode: 'edit', recordId, basePath: base, ...(user !== null ? { user: user as NonNullable<SchemaContext['user']> } : {}) }
        const elements = await callPageSchema(PageClass, ctx)
        tagActionDispatch(elements, editUrl)
        const target = resolveDispatchTarget(elements, actionName)
        if (!target) {
          if (json) { res.status(404); return res.json({ ok: false, error: `Action "${actionName}" not found` }) }
          res.status(404)
          return res.send(`Action "${actionName}" not found on ${R.label}`)
        }

        const resolveRecord: ResolveRecord | undefined = R.model
          ? (id: string) => findRecord(R, id, { user })
          : undefined

        const result = await dispatchAction(target.action, {
          ...input,
          request: req,
          ...(target.rowField   ? { rowField:   target.rowField   } : {}),
          ...(target.formSchema ? { formSchema: target.formSchema } : {}),
        }, resolveRecord)
        if (!result.ok) {
          if (json) {
            res.status(result.errors ? 422 : 500)
            return res.json({ ok: false, error: result.error, ...(result.errors ? { errors: result.errors } : {}) })
          }
          res.status(500)
          return res.send(result.error)
        }
        if (result.download) return sendDownload(res, result.download)
        const redirect = normalizeRedirect(result.redirect, base) ?? editUrl
        if (json) {
          return res.json({
            ok: true,
            redirect,
            ...(result.notifications ? { notifications: result.notifications } : {}),
          })
        }
        flashNotifications(req, result.notifications)
        return res.redirect(redirect, 303)
      })
    }

    // ── Plan #11 relation manager routes ───────────────
    // Per-manager: list, create (GET/POST), edit (GET/POST), delete (POST).
    // Mounted under ${base}/${slug}/:id/${rel} — the `:id` segment is the
    // PARENT record id; the `:childId` segment (where present) is the
    // related record's id. Authorization runs in two layers: parent
    // canAccess + canEdit(parent), then manager-scoped can*.
    for (const M of R.relations()) {
      const rel = M.getRelationship()
      const parentBase = `${base}/${slug}/:id/${rel}`

      // Read the relation type once at registration so the (R, M)-
      // scoped closures all see the same mode without re-reading the
      // relations map per request. `R.model` is asserted by
      // `requireParent` at request time; here it may legitimately be
      // missing during late binding, in which case we fall back to
      // 'hasMany' (the safe default — no special action injection / no
      // factory short-circuiting). See `normalizeRelationMode` for the
      // M2M / polymorphic mappings.
      const relationType = R.model ? getRelationType(R.model, rel) : 'hasMany'
      const mode: RelationMode = normalizeRelationMode(relationType)

      // Common policy prelude: load parent, gate access. Returns the
      // parent record on success or a thrown 403/404 response. Returns
      // `undefined` when the route should bail out (response already sent).
      const requireParent = async (req: AppRequest, res: AppResponse, json: boolean): Promise<{ user: unknown; parent: unknown; recordId: string } | undefined> => {
        const recordId = req.params['id']!
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => R.canAccess(user))) { forbidden(res, json); return undefined }
        if (!R.model) {
          res.status(500)
          if (json) res.json({ ok: false, error: `Resource "${R.name}" has relations but no static model` })
          else      res.send(`Resource "${R.name}" has relations but no static model`)
          return undefined
        }
        const parent = await findRecord(R, recordId, { user }).catch(() => undefined)
        if (!parent) { res.status(404); if (json) res.json({ ok: false, error: 'Parent not found' }); else res.send('Parent not found'); return undefined }
        if (!await checkPolicy(() => R.canEdit(user, parent))) { forbidden(res, json); return undefined }
        return { user, parent, recordId }
      }

      // List — GET ${base}/${slug}/:id/${rel}
      // Manager-level canViewAny is enforced inside relationManagerData via
      // safeManagerPolicy (with related-resource fall-through). We just
      // surface the {ok:false,status:403} from the data builder as 403.
      router.get(parentBase, async (req, res) => {
        const json = wantsJson(req)
        const ctx = await requireParent(req, res, json)
        if (!ctx) return
        const data = await relationManagerData(pilotiq, {
          kind: 'relation-list', slug, recordId: ctx.recordId, relationship: rel, query: req.query as Record<string, string>,
        }, req)
        if (data === null)                            { res.status(404); return res.send('Not found') }
        if ('ok' in data && data.ok === false)        return forbidden(res, json)
        return view('pilotiq.relation-list', data)
      })

      // Create — GET ${base}/${slug}/:id/${rel}/create
      router.get(`${parentBase}/create`, async (req, res) => {
        const json = wantsJson(req)
        const ctx = await requireParent(req, res, json)
        if (!ctx) return
        const data = await relationManagerData(pilotiq, {
          kind: 'relation-create', slug, recordId: ctx.recordId, relationship: rel,
        }, req)
        if (data === null)                            { res.status(404); return res.send('Not found') }
        if ('ok' in data && data.ok === false)        return forbidden(res, json)
        return view('pilotiq.relation-create', data)
      })

      // Create submit — POST ${base}/${slug}/:id/${rel}/create
      router.post(`${parentBase}/create`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return

        const Related = findRelatedResource(M, R, cfg)
        if (!Related) {
          res.status(500)
          const msg = `RelationManager ${M.name}: cannot resolve related Resource for create`
          return json ? res.json({ ok: false, error: msg }) : res.send(msg)
        }
        if (!await safeManagerPolicy(M, 'canCreate', Related, pre.user, pre.parent)) return forbidden(res, json)

        const body = await readFormBody(req)
        const { values } = splitMeta(body)

        const createUrl = `${parentBase}/create`.replace(':id', pre.recordId)
        const listUrl   = parentBase.replace(':id', pre.recordId)
        const form = M.form(Form.make(), {
          basePath:     base,
          parentSlug:   slug,
          parentId:     pre.recordId,
          relationship: rel,
          parentRecord: pre.parent,
          related:      Related,
          mode,
        })
        if (Related.model) {
          if (!form.getSave())       form.save(modelSave(Related.model))
          if (!form.getLoadRecord()) form.loadRecord(modelLoadRecord(Related))
        }

        // Polymorphic auto-injection — when the parent's relation entry
        // is `morphMany` / `morphOne`, fill the `{morphName}Id` and
        // `{morphName}Type` columns on the child before persistence.
        // Compose with any user-supplied `mutateDataBeforeCreate` and
        // run AFTER it so morph values overwrite anything the form
        // body or user hook might have set — the parent record is the
        // single source of truth for who owns the new child, and a
        // submitted form field cannot be allowed to tamper with that.
        if (mode === 'morphMany' && R.model) {
          const morphDesc = getMorphRelationDescriptor(R.model, rel)
          if (!morphDesc) {
            res.status(500)
            const msg = `RelationManager ${M.name}: relations[${JSON.stringify(rel)}] reports a polymorphic type but is missing morphName.`
            return json ? res.json({ ok: false, error: msg }) : res.send(msg)
          }
          const morphPayload = computeMorphPayload(pre.parent, morphDesc)
          const existing = form.getMutateDataBeforeCreate()
          form.mutateDataBeforeCreate(async (data, ctx) => {
            const next = existing ? await existing(data, ctx) : data
            return { ...next, ...morphPayload }
          })
        }

        // Stamp parent context onto FormContext so user hooks
        // (mutateDataBeforeCreate, redirectAfterSave, etc.) can default
        // foreign-key columns or build URLs from the parent.
        const formCtx = {
          values,
          basePath: base,
          parent: pre.parent,
          parentId: pre.recordId,
          relationship: rel,
        }

        const result = await dispatchFormSubmit(form, values, formCtx)
        if (!result.ok) {
          if (json) { res.status(422); return res.json({ ok: false, errors: result.errors }) }
          const data = await relationManagerData(pilotiq, {
            kind: 'relation-create', slug, recordId: pre.recordId, relationship: rel,
            prefill: { values, errors: result.errors ?? {} },
          }, req)
          res.status(422)
          return view('pilotiq.relation-create', data ?? {})
        }

        const redirect = normalizeRedirect(result.redirect, base) ?? listUrl
        if (json) {
          return res.json({
            ok: true, redirect,
            ...(result.notifications && result.notifications.length > 0 ? { notifications: result.notifications } : {}),
          })
        }
        flashNotifications(req, result.notifications)
        return res.redirect(redirect, 303)
      })

      // Edit — GET ${base}/${slug}/:id/${rel}/:childId/edit
      router.get(`${parentBase}/:childId/edit`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return
        const childId = req.params['childId']!
        const data = await relationManagerData(pilotiq, {
          kind: 'relation-edit', slug, recordId: pre.recordId, relationship: rel, childId,
        }, req)
        if (data === null)                            { res.status(404); return res.send('Not found') }
        if ('ok' in data && data.ok === false)        return forbidden(res, json)
        return view('pilotiq.relation-edit', data)
      })

      // Edit submit — POST ${base}/${slug}/:id/${rel}/:childId/edit
      router.post(`${parentBase}/:childId/edit`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return
        const childId = req.params['childId']!

        const Related = findRelatedResource(M, R, cfg)
        if (!Related?.model) {
          res.status(500)
          const msg = `RelationManager ${M.name}: cannot resolve related Resource for edit`
          return json ? res.json({ ok: false, error: msg }) : res.send(msg)
        }

        // IDOR + load via the data builder's gating: re-use it to verify
        // the child belongs to this parent, then do the form submit.
        const childCheck = await relationManagerData(pilotiq, {
          kind: 'relation-edit', slug, recordId: pre.recordId, relationship: rel, childId,
        }, req)
        if (childCheck === null)                       { res.status(404); return res.send('Not found') }
        if ('ok' in childCheck && childCheck.ok === false) return forbidden(res, json)

        const body = await readFormBody(req)
        const { values } = splitMeta(body)

        const editUrl = `${parentBase}/${childId}/edit`.replace(':id', pre.recordId)
        const form = M.form(Form.make(), {
          basePath:     base,
          parentSlug:   slug,
          parentId:     pre.recordId,
          relationship: rel,
          parentRecord: pre.parent,
          related:      Related,
          mode,
        })
        if (!form.getSave())       form.save(modelSave(Related.model))
        if (!form.getLoadRecord()) form.loadRecord(modelLoadRecord(Related))

        // Re-load child for FormContext so cross-field validators see it.
        let child: unknown = undefined
        try { child = await findRecord(Related, childId, { user: pre.user }) } catch { /* ignore */ }
        if (!child) { res.status(404); return res.send('Not found') }

        // Polymorphic re-stamp on update — same posture as the create
        // path. Re-injecting the morph columns from the live parent
        // record ensures a tampered body (`commentableId=…` /
        // `commentableType=…` posted by an attacker) can't reassign
        // the child to another polymorphic parent. Composed AFTER any
        // user `mutateDataBeforeUpdate` so the framework wins.
        if (mode === 'morphMany' && R.model) {
          const morphDesc = getMorphRelationDescriptor(R.model, rel)
          if (morphDesc) {
            const morphPayload = computeMorphPayload(pre.parent, morphDesc)
            const existing = form.getMutateDataBeforeUpdate()
            form.mutateDataBeforeUpdate(async (data, ctx) => {
              const next = existing ? await existing(data, ctx) : data
              return { ...next, ...morphPayload }
            })
          }
        }

        const formCtx = {
          values,
          basePath: base,
          record: child,
          parent: pre.parent,
          parentId: pre.recordId,
          relationship: rel,
        }

        const result = await dispatchFormSubmit(form, values, formCtx)
        if (!result.ok) {
          if (json) { res.status(422); return res.json({ ok: false, errors: result.errors }) }
          const data = await relationManagerData(pilotiq, {
            kind: 'relation-edit', slug, recordId: pre.recordId, relationship: rel, childId,
            prefill: { values, errors: result.errors ?? {} },
          }, req)
          res.status(422)
          return view('pilotiq.relation-edit', data ?? {})
        }

        const redirect = normalizeRedirect(result.redirect, base) ?? editUrl
        if (json) {
          return res.json({
            ok: true, redirect,
            ...(result.notifications && result.notifications.length > 0 ? { notifications: result.notifications } : {}),
          })
        }
        flashNotifications(req, result.notifications)
        return res.redirect(redirect, 303)
      })

      // Delete — POST ${base}/${slug}/:id/${rel}/:childId/delete
      router.post(`${parentBase}/:childId/delete`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return
        const childId = req.params['childId']!

        const Related = findRelatedResource(M, R, cfg)
        if (!Related?.model) {
          res.status(500)
          const msg = `RelationManager ${M.name}: cannot resolve related Resource for delete`
          return json ? res.json({ ok: false, error: msg }) : res.send(msg)
        }

        // Anti-IDOR: re-use the data builder's child-belongs check.
        const childCheck = await relationManagerData(pilotiq, {
          kind: 'relation-edit', slug, recordId: pre.recordId, relationship: rel, childId,
        }, req)
        if (childCheck === null)                       { res.status(404); return res.send('Not found') }
        if ('ok' in childCheck && childCheck.ok === false) return forbidden(res, json)

        const child = await findRecord(Related, childId, { user: pre.user }).catch(() => undefined)
        if (!child) { res.status(404); return res.send('Not found') }

        if (!await safeManagerPolicy(M, 'canDelete', Related, pre.user, pre.parent, child)) return forbidden(res, json)

        const listUrl = parentBase.replace(':id', pre.recordId)
        try {
          await Related.model.delete(childId)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Delete failed'
          res.status(500)
          return json ? res.json({ ok: false, error: message }) : res.send(message)
        }

        if (json) {
          const notifications = [
            { id: `n-rdelete-${childId}-${Date.now()}`, type: 'success', title: `${M.getLabelSingular()} deleted` },
          ]
          return res.json({ ok: true, redirect: listUrl, notifications })
        }
        return res.redirect(listUrl, 303)
      })

      // ── Plan #13 polish — relation restore / force-delete ─────
      // Mirror the resource-side soft-delete routes, scoped under the
      // parent record. Both routes opt in only when the related Resource
      // has `softDeletes = true` AND its model carries `restore` /
      // `forceDelete`. Two-layer auth: parent canAccess + canEdit, then
      // manager `canRestore / canForceDelete` (with related-Resource
      // fall-through). IDOR check re-runs the parent's relation query
      // through `withTrashed()` so trashed children still resolve.
      const RelatedForSoft = findRelatedResource(M, R, cfg)
      if (RelatedForSoft?.softDeletes) {
        const RM = RelatedForSoft.model
        if (!RM) {
          throw new Error(
            `[Pilotiq] RelationManager ${M.name} on ${R.name}: related Resource ${RelatedForSoft.name} has softDeletes = true but no model. ` +
            `Wire one up or unset softDeletes.`,
          )
        }
        if (typeof RM.restore !== 'function' || typeof RM.forceDelete !== 'function') {
          throw new Error(
            `[Pilotiq] RelationManager ${M.name} on ${R.name}: related Resource ${RelatedForSoft.name} has softDeletes = true but model.restore / model.forceDelete are missing. ` +
            `Set Model.softDeletes = true on the rudder side, or upgrade @rudderjs/orm.`,
          )
        }

        // IDOR-safe load through the parent's relation query, broadened
        // with `withTrashed()` so currently-trashed children resolve.
        // Returns undefined when the child doesn't belong to this parent
        // (under the broadened scope) or the lookup misses.
        const loadTrashableChild = async (parent: unknown, childId: string): Promise<unknown> => {
          if (!R.model) return undefined
          const pk = (RM.primaryKey ?? 'id') as string
          try {
            const q: import('./orm/modelDefaults.js').ModelQuery = R.model.relatedQuery
              ? R.model.relatedQuery(parent, rel)
              : (parent as { related: (n: string) => import('./orm/modelDefaults.js').ModelQuery }).related(rel)
            const broadened = typeof q.withTrashed === 'function' ? q.withTrashed() : q
            const result = await broadened.where(pk, '=', childId).paginate(1, 1)
            return Array.isArray(result.data) ? result.data[0] : undefined
          } catch {
            return undefined
          }
        }

        // Restore — POST ${base}/${slug}/:id/${rel}/:childId/restore
        router.post(`${parentBase}/:childId/restore`, async (req, res) => {
          const json = wantsJson(req)
          const pre = await requireParent(req, res, json)
          if (!pre) return
          const childId = req.params['childId']!

          const child = await loadTrashableChild(pre.parent, childId)
          if (!child) { res.status(404); return res.send('Not found') }

          if (!await safeManagerPolicy(M, 'canRestore', RelatedForSoft, pre.user, pre.parent, child)) return forbidden(res, json)

          const listUrl = parentBase.replace(':id', pre.recordId)
          try {
            await RM.restore!(childId)
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Restore failed'
            res.status(500)
            return json ? res.json({ ok: false, error: message }) : res.send(message)
          }

          if (json) {
            const notifications = [
              { id: `n-rrestore-${childId}-${Date.now()}`, type: 'success', title: `${M.getLabelSingular()} restored` },
            ]
            return res.json({ ok: true, redirect: listUrl, notifications })
          }
          return res.redirect(listUrl, 303)
        })

        // Force-delete — POST ${base}/${slug}/:id/${rel}/:childId/force-delete
        router.post(`${parentBase}/:childId/force-delete`, async (req, res) => {
          const json = wantsJson(req)
          const pre = await requireParent(req, res, json)
          if (!pre) return
          const childId = req.params['childId']!

          const child = await loadTrashableChild(pre.parent, childId)
          if (!child) { res.status(404); return res.send('Not found') }

          if (!await safeManagerPolicy(M, 'canForceDelete', RelatedForSoft, pre.user, pre.parent, child)) return forbidden(res, json)

          const listUrl = parentBase.replace(':id', pre.recordId)
          try {
            await RM.forceDelete!(childId)
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Force-delete failed'
            res.status(500)
            return json ? res.json({ ok: false, error: message }) : res.send(message)
          }

          if (json) {
            const notifications = [
              { id: `n-rforce-${childId}-${Date.now()}`, type: 'success', title: `${M.getLabelSingular()} permanently deleted` },
            ]
            return res.json({ ok: true, redirect: listUrl, notifications })
          }
          return res.redirect(listUrl, 303)
        })
      }

      // ── M2M follow-up — manager-scoped action dispatch + detach ─────
      // Two new routes per relation manager. Mounted unconditionally
      // (even on hasMany managers) because handler-style actions are
      // useful beyond M2M — any user-defined `Action.handler(...)` on a
      // manager table needs a place to dispatch. The detach route is
      // M2M-specific but cheap enough to register either way; non-M2M
      // managers' `Action.relationDetach` factories return `visible=false`
      // anyway, so the URL is unreachable in practice.

      // Action dispatch — POST ${parentBase}/_action/:actionName
      // Resolves the manager's table elements, finds the named action,
      // and dispatches it with `ctx.relation = { parent, parentId, rel }`
      // so M2M handlers can call `parent.related(rel).attach / detach`.
      // Records hydrate against the related model (the rows visible in
      // the manager's table are related-model records).
      router.post(`${parentBase}/_action/:actionName`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return

        const Related = findRelatedResource(M, R, cfg)
        const actionName = req.params['actionName']!
        const body  = await readFormBody(req)
        const input = parseActionBody(body)

        // Rebuild the manager's table so the dispatcher can find the
        // action by name. Pure recreation — same context the page-data
        // builder uses — so factories that close over `ctx` (URL,
        // mode, parent record) see the same shape as at page render.
        const managerCtx = {
          basePath:     base,
          parentSlug:   slug,
          parentId:     pre.recordId,
          relationship: rel,
          parentRecord: pre.parent,
          related:      Related,
          mode,
        }
        const table = M.table(Table.make(), managerCtx)
        const elements: import('./schema/Element.js').Element[] = [table]
        // Stamp dispatch URLs so any nested action factories that read
        // `dispatchUrl` (rare — most read it from the meta at render
        // time) still see something sensible.
        const listUrl = parentBase.replace(':id', pre.recordId)
        tagActionDispatch(elements, listUrl)

        const target = resolveDispatchTarget(elements, actionName)
        if (!target) {
          if (json) { res.status(404); return res.json({ ok: false, error: `Action "${actionName}" not found` }) }
          res.status(404)
          return res.send(`Action "${actionName}" not found on ${M.name}`)
        }

        const resolveRecord: ResolveRecord | undefined = Related?.model
          ? (id: string) => Related.model!.find(id)
          : undefined

        const result = await dispatchAction(target.action, {
          ...input,
          request: req,
          user:    pre.user,
          relation: { parent: pre.parent, parentId: pre.recordId, relationship: rel },
          ...(target.rowField   ? { rowField:   target.rowField   } : {}),
          ...(target.formSchema ? { formSchema: target.formSchema } : {}),
        }, resolveRecord)

        if (!result.ok) {
          if (json) {
            res.status(result.errors ? 422 : 500)
            return res.json({ ok: false, error: result.error, ...(result.errors ? { errors: result.errors } : {}) })
          }
          res.status(500)
          return res.send(result.error)
        }
        const redirect = normalizeRedirect(result.redirect, base) ?? listUrl
        if (json) {
          return res.json({
            ok: true,
            redirect,
            ...(result.notifications ? { notifications: result.notifications } : {}),
          })
        }
        flashNotifications(req, result.notifications)
        return res.redirect(redirect, 303)
      })

      // Detach — POST ${parentBase}/:childId/_detach
      // Direct row-action target for `Action.relationDetach`. Removes the
      // pivot row only; the related record stays in place. IDOR check:
      // verify the child is currently attached before calling detach so
      // a tampered URL can't probe random ids.
      router.post(`${parentBase}/:childId/_detach`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return
        const childId = req.params['childId']!

        if (mode !== 'belongsToMany' && mode !== 'morphToMany' && mode !== 'morphedByMany') {
          // Detach is meaningless for hasMany — the user wants `delete`.
          // Surface a clear 404 instead of silently no-op'ing.
          res.status(404)
          const msg = 'Detach is only supported on M2M relations (belongsToMany, morphToMany, morphedByMany)'
          return json ? res.json({ ok: false, error: msg }) : res.send(msg)
        }

        // Manager-only canDetach: pivot ops don't fall through to the
        // related Resource. We don't have the related child loaded yet —
        // pass `undefined` for the per-record arg; canDetach gates on
        // (user, parent) by default and only sees `record` when a
        // manager has explicitly overridden with a per-row predicate.
        // Authors who need per-row gating can detect undefined and either
        // load the child themselves or short-circuit.
        // Two distinct accessors are needed under the real
        // `@rudderjs/orm`:
        //   - `parent.related(rel)` returns a deferred QueryBuilder
        //     with `where / paginate` (IDOR read-side check).
        //   - `parent[rel]()` returns the pivot-mutation accessor with
        //     `attach / detach / sync` (write-side).
        // Test stubs may collapse both onto the same `parent.related(rel)`
        // shape — handle that fallback so existing tests keep passing.
        let child: unknown = undefined
        const readSide = (pre.parent as { related?: (n: string) => { where?: (...a: unknown[]) => unknown; paginate?: (p: number, pp: number) => Promise<{ data: unknown[] }> } })
          ?.related?.(rel)
        if (!readSide) {
          res.status(500)
          const msg = `Parent.related("${rel}") missing — wrong relation type or ORM version?`
          return json ? res.json({ ok: false, error: msg }) : res.send(msg)
        }
        try {
          // IDOR: confirm the child is currently attached.
          if (typeof readSide.paginate === 'function') {
            const Related = findRelatedResource(M, R, cfg)
            const pk = Related?.model ? getPrimaryKey(Related.model) : 'id'
            const out = await (readSide as unknown as { where: (col: string, op: string, val: unknown) => { paginate: (p: number, pp: number) => Promise<{ data: unknown[] }> } }).where(pk, '=', childId).paginate(1, 1)
            child = Array.isArray(out.data) ? out.data[0] : undefined
          }
        } catch {
          // fall through; null child means we couldn't verify — safer to 404
        }
        if (child === undefined) { res.status(404); return res.send('Not found') }

        if (!await safeManagerPolicy(M, 'canDetach', undefined, pre.user, pre.parent, child)) return forbidden(res, json)

        // Real ORM: `parent[rel]()` returns the pivot accessor. Test
        // stubs: `parent.related(rel)` may carry `detach` directly.
        // Try the prototype-installed instance method first, then fall
        // back to the read-side shape.
        let writeAccessor: { detach?: (ids: unknown) => Promise<unknown> } | undefined
        const inst = (pre.parent as Record<string, unknown>)[rel]
        if (typeof inst === 'function') {
          try {
            const out = (inst as () => unknown).call(pre.parent) as { detach?: (ids: unknown) => Promise<unknown> } | undefined
            if (out && typeof out.detach === 'function') writeAccessor = out
          } catch { /* fall through to legacy shape */ }
        }
        if (!writeAccessor && typeof (readSide as { detach?: unknown }).detach === 'function') {
          writeAccessor = readSide as { detach: (ids: unknown) => Promise<unknown> }
        }
        if (!writeAccessor) {
          res.status(500)
          const msg = `Pivot accessor missing on ${rel} — wrong relation type or ORM version?`
          return json ? res.json({ ok: false, error: msg }) : res.send(msg)
        }

        try {
          await writeAccessor.detach!([childId])
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Detach failed'
          res.status(500)
          return json ? res.json({ ok: false, error: message }) : res.send(message)
        }

        const listUrl = parentBase.replace(':id', pre.recordId)
        if (json) {
          const notifications = [
            { id: `n-rdetach-${childId}-${Date.now()}`, type: 'success', title: `${M.getLabelSingular()} detached` },
          ]
          return res.json({ ok: true, redirect: listUrl, notifications })
        }
        return res.redirect(listUrl, 303)
      })
    }
  }

  // ── Globals (singletons — 2-segment, no /:id) ────────
  for (const G of cfg.globals) {
    const slug    = G.getSlug()
    const editUrl = `${base}/${slug}`
    const pages   = G.resolvePages()

    if (pages.edit) {
      const PageClass = pages.edit

      // Plan #5 partial-resolve endpoint for the global's edit form.
      // POST ${base}/${slug}/_form/:formId/state
      router.post(`${base}/${slug}/_form/:formId/state`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => G.canAccess(user))) return forbidden(res, true)
        if (!await checkPolicy(() => G.canEdit(user, undefined))) return forbidden(res, true)
        const formId = req.params['formId']!
        return handleFormState(req, res, pilotiq, { kind: 'global-edit', slug }, formId)
      })

      // Plan #8 wizard step-validate endpoint for the global's edit form.
      router.post(`${base}/${slug}/_form/:formId/wizard`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => G.canAccess(user))) return forbidden(res, true)
        if (!await checkPolicy(() => G.canEdit(user, undefined))) return forbidden(res, true)
        const formId = req.params['formId']!
        return handleFormWizard(req, res, pilotiq, { kind: 'global-edit', slug }, formId)
      })

      // Async-mention endpoint for the global's edit form.
      router.post(`${base}/${slug}/_form/:formId/mentions`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => G.canAccess(user))) return forbidden(res, true)
        if (!await checkPolicy(() => G.canEdit(user, undefined))) return forbidden(res, true)
        const formId = req.params['formId']!
        return handleFormMentions(req, res, pilotiq, { kind: 'global-edit', slug }, formId)
      })

      router.get(editUrl, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => G.canAccess(user))) return forbidden(res, wantsJson(req))
        // Globals carry their record on the singleton form's `loadRecord`;
        // we don't pre-load here — pass a stub so canEdit's signature is
        // honored, and let user code decide whether to consult it.
        if (!await checkPolicy(() => G.canEdit(user, undefined))) return forbidden(res, wantsJson(req))
        const data = await globalEditData(pilotiq, slug, undefined, req)
        return view('pilotiq.slug', data ?? {})
      })

      router.post(editUrl, async (req, res) => {
        const body = await readFormBody(req)
        const { values, formId } = splitMeta(body)
        const json = wantsJson(req)

        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => G.canAccess(user))) return forbidden(res, json)
        if (!await checkPolicy(() => G.canEdit(user, undefined))) return forbidden(res, json)

        const ctx: SchemaContext = { mode: 'edit', basePath: base, ...(user !== null ? { user: user as NonNullable<SchemaContext['user']> } : {}) }
        const elements = await callPageSchema(PageClass, ctx)
        tagFormActions(elements, editUrl)
        const form = selectForm(findForms(elements), formId)
        if (!form) {
          if (json) { res.status(404); return res.json({ ok: false, error: 'No form found on page' }) }
          res.status(404)
          return res.send('No form found on page')
        }

        // Provide the existing singleton record to the lifecycle context
        // so cross-field validators / mutateData see prior state.
        let record: unknown = undefined
        if (form.getLoadRecord()) {
          try { record = await form.getLoadRecord()!('', { values }) } catch { /* ignore */ }
        }

        const result = await dispatchFormSubmit(
          form,
          values,
          record !== undefined ? { values, record, basePath: base } : { values, basePath: base },
        )

        if (!result.ok) {
          if (json) {
            res.status(422)
            return res.json({ ok: false, errors: result.errors })
          }
          const data = await globalEditData(pilotiq, slug, { values, errors: result.errors })
          res.status(422)
          return view('pilotiq.slug', data ?? {})
        }

        const redirect = normalizeRedirect(result.redirect, base) ?? editUrl
        if (json) {
          return res.json({
            ok: true,
            redirect,
            ...(result.notifications && result.notifications.length > 0 ? { notifications: result.notifications } : {}),
          })
        }
        flashNotifications(req, result.notifications)
        return res.redirect(redirect, 303)
      })
    }

    // Optional view page when the user opts in via pages().view
    if (pages.view) {
      router.get(`${base}/${slug}/view`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await checkPolicy(() => G.canAccess(user))) return forbidden(res, wantsJson(req))
        if (!await checkPolicy(() => G.canView(user, undefined))) return forbidden(res, wantsJson(req))
        const data = await globalViewData(pilotiq, slug, req)
        return view('pilotiq.resource-view', data ?? {})
      })
    }
  }

  // ── Custom pages (2-segment, slug route) ──────────────
  for (const PageClass of cfg.pages) {
    // Plan #15 — the dashboard page lives at `${base}` (handled by the
    // dashboard route above), so skip it here to avoid registering a
    // duplicate `${base}/${slug}` route or a broken `${base}/` (when
    // `slug = ''`).
    if (cfg.dashboardPage === PageClass) continue

    const pageSlug = PageClass.getSlug()
    const pageUrl  = `${base}/${pageSlug}`

    // Plan #15 — per-page widget polling endpoint. Mirrors the
    // panel-scope `${base}/_widget/:id` but resolves the custom page's
    // schema instead of the dashboard's.
    router.post(`${pageUrl}/_widget/:id`, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      if (!await checkPolicy(() => PageClass.canAccess(user))) return forbidden(res, true)
      return handleWidgetData(req, res, pilotiq, { kind: 'page', pageSlug }, req.params['id']!)
    })

    // Plan #5 partial-resolve endpoint for custom pages with reactive forms.
    // POST ${base}/${pageSlug}/_form/:formId/state
    router.post(`${pageUrl}/_form/:formId/state`, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      if (!await checkPolicy(() => PageClass.canAccess(user))) return forbidden(res, true)
      const formId = req.params['formId']!
      return handleFormState(req, res, pilotiq, { kind: 'page', pageSlug }, formId)
    })

    // Plan #8 wizard step-validate endpoint for custom pages.
    router.post(`${pageUrl}/_form/:formId/wizard`, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      if (!await checkPolicy(() => PageClass.canAccess(user))) return forbidden(res, true)
      const formId = req.params['formId']!
      return handleFormWizard(req, res, pilotiq, { kind: 'page', pageSlug }, formId)
    })

    // Async-mention endpoint for custom pages.
    router.post(`${pageUrl}/_form/:formId/mentions`, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      if (!await checkPolicy(() => PageClass.canAccess(user))) return forbidden(res, true)
      const formId = req.params['formId']!
      return handleFormMentions(req, res, pilotiq, { kind: 'page', pageSlug }, formId)
    })

    router.get(pageUrl, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      if (!await checkPolicy(() => PageClass.canAccess(user))) return forbidden(res, wantsJson(req))
      const data = await customPageData(pilotiq, pageSlug, req)
      return view('pilotiq.slug', data ?? {})
    })

    // Action dispatch — POST ${base}/${pageSlug}/_action/:actionName
    router.post(`${pageUrl}/_action/:actionName`, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      if (!await checkPolicy(() => PageClass.canAccess(user))) return forbidden(res, wantsJson(req))

      const actionName = req.params['actionName']!
      const json = wantsJson(req)
      const body  = await readFormBody(req)
      const input = parseActionBody(body)

      const ctx: SchemaContext = user !== null ? { user: user as NonNullable<SchemaContext['user']> } : {}
      const elements = await callPageSchema(PageClass, ctx)
      tagActionDispatch(elements, pageUrl)
      const target = resolveDispatchTarget(elements, actionName)
      if (!target) {
        if (json) { res.status(404); return res.json({ ok: false, error: `Action "${actionName}" not found` }) }
        res.status(404)
        return res.send(`Action "${actionName}" not found on page`)
      }

      const result = await dispatchAction(target.action, {
        ...input,
        request: req,
        ...(target.rowField   ? { rowField:   target.rowField   } : {}),
        ...(target.formSchema ? { formSchema: target.formSchema } : {}),
      })
      if (!result.ok) {
        if (json) {
          res.status(result.errors ? 422 : 500)
          return res.json({ ok: false, error: result.error, ...(result.errors ? { errors: result.errors } : {}) })
        }
        res.status(500)
        return res.send(result.error)
      }
      if (result.download) return sendDownload(res, result.download)
      const redirect = normalizeRedirect(result.redirect, base) ?? pageUrl
      if (json) {
        return res.json({
          ok: true,
          redirect,
          ...(result.notifications ? { notifications: result.notifications } : {}),
        })
      }
      flashNotifications(req, result.notifications)
      return res.redirect(redirect, 303)
    })

    // Custom pages can also accept submits when their schema includes a Form.
    router.post(pageUrl, async (req, res) => {
      const body = await readFormBody(req)
      const { values, formId } = splitMeta(body)
      const json = wantsJson(req)

      const user = await pilotiq.resolveUser(req)
      if (!await checkPolicy(() => PageClass.canAccess(user))) return forbidden(res, json)

      const ctx: SchemaContext = user !== null ? { user: user as NonNullable<SchemaContext['user']> } : {}
      const elements = await callPageSchema(PageClass, ctx)
      tagFormActions(elements, pageUrl)
      const form = selectForm(findForms(elements), formId)
      if (!form) {
        if (json) { res.status(404); return res.json({ ok: false, error: 'No form found on page' }) }
        res.status(404)
        return res.send('No form found on page')
      }

      const result = await dispatchFormSubmit(form, values, { values, basePath: base })

      if (!result.ok) {
        if (json) {
          res.status(422)
          return res.json({ ok: false, errors: result.errors })
        }
        form.withValues(values).withErrors(result.errors)
        const schemaData = await resolveSchema(elements, ctx)
        res.status(422)
        return view('pilotiq.slug', {
          pageType:  'page',
          panel:     await panelInfo(pilotiq, req),
          page:      PageClass.toMeta(),
          schemaData,
          basePath:  base,
          layout:    cfg.layout,
          hasErrors: true,
        })
      }

      const redirect = normalizeRedirect(result.redirect, base) ?? pageUrl
      if (json) {
        return res.json({
          ok: true,
          redirect,
          ...(result.notifications && result.notifications.length > 0 ? { notifications: result.notifications } : {}),
        })
      }
      flashNotifications(req, result.notifications)
      return res.redirect(redirect, 303)
    })
  }

  // ── Theme editor ──────────────────────────────────────
  if (cfg.themeEditor) {
    router.get(`${base}/theme`, async (req) => {
      return view('pilotiq.theme', {
        panel:       await panelInfo(pilotiq, req),
        basePath:    base,
        layout:      cfg.layout,
        themeConfig: pilotiq.getMergedTheme() ?? {},
      })
    })

    router.get(`${base}/api/_theme`, async (_req, res) => {
      let overrides: Partial<ThemeConfig> | null = null
      try {
        const { app } = await import(/* @vite-ignore */ '@rudderjs/core') as { app(): { make(key: string): unknown } }
        const prisma = app().make('prisma') as any
        const slug = `${cfg.name}__theme`
        const row = await prisma.panelGlobal.findUnique({ where: { slug } })
        if (row?.data) {
          const raw = typeof row.data === 'string' ? JSON.parse(row.data as string) : row.data
          overrides = migrateThemeOverrides(raw)
        }
      } catch { /* no DB or no table — that's fine */ }

      return res.json({
        config:    cfg.theme ?? {},
        overrides: overrides ?? {},
        options: {
          presets:       Object.keys(presets),
          baseColors:    Object.keys(baseColors),
          themeColors:   ['base', ...HUE_NAMES],
          chartColors:   ['base', ...HUE_NAMES],
          radii:         Object.keys(radiusMap),
          iconLibraries: ['lucide', 'tabler', 'phosphor', 'remix'],
        },
      })
    })

    router.put(`${base}/api/_theme`, async (req, res) => {
      try {
        const overrides = req.body as Partial<ThemeConfig>
        const { app } = await import(/* @vite-ignore */ '@rudderjs/core') as { app(): { make(key: string): unknown } }
        const prisma = app().make('prisma') as any
        const slug = `${cfg.name}__theme`

        await prisma.panelGlobal.upsert({
          where:  { slug },
          update: { data: JSON.stringify(overrides) },
          create: { slug, data: JSON.stringify(overrides) },
        })

        pilotiq.setThemeOverrides(overrides)
        return res.json({ ok: true })
      } catch (e) {
        return res.status(500).json({ message: e instanceof Error ? e.message : 'Failed to save theme' })
      }
    })

    router.delete(`${base}/api/_theme`, async (_req, res) => {
      try {
        const { app } = await import(/* @vite-ignore */ '@rudderjs/core') as { app(): { make(key: string): unknown } }
        const prisma = app().make('prisma') as any
        const slug = `${cfg.name}__theme`
        await prisma.panelGlobal.delete({ where: { slug } }).catch(() => {})
        pilotiq.setThemeOverrides(undefined)
      } catch { /* ignore */ }
      return res.json({ ok: true })
    })
  }
}

// ─── Lifecycle helpers exported for tests ────────────────
export { dispatchFormSubmit, findForms, selectForm }
export { loadTableRecords, parseTableQuery, findTables } from './elements/dispatchTable.js'
export type { Form }
