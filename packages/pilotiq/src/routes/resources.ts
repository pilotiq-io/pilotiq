import type { Router } from '@rudderjs/router'
import type { AppRequest, AppResponse } from '@rudderjs/contracts'
import { view } from '@rudderjs/view'
import type { Pilotiq } from '../Pilotiq.js'
import type { ResourceClass } from '../Resource.js'
import { resolveSchema, type SchemaContext } from '../schema/resolveSchema.js'
import { dispatchFormSubmit, findForms, selectForm } from '../elements/dispatchForm.js'
import { dispatchAction, parseActionBody, type ResolveRecord } from '../elements/dispatchAction.js'
import {
  listFiltersKey,
  readPersistedListQuery,
  writePersistedListQuery,
  readPersistedLastTab,
  writePersistedLastTab,
  encodePersistedQuery,
} from '../sessionFilters.js'
import {
  callPageSchema, tagFormActions, tagActionDispatch,
  resourceIndexData, resourceTableData,
  resourceCreateData, resourceEditData,
  resourceViewData, resourceRecordPageData,
} from '../pageData.js'
import { findRecord } from '../orm/modelDefaults.js'
import { Table } from '../elements/Table.js'
import { Column } from '../Column.js'
import { coerceCellValue, CellCoerceError } from '../cells/coerce.js'
import { resourceBasePath } from '../clusterPaths.js'
import { registerRelationRoutes } from './relations.js'
import {
  wantsJson,
  readFormBody,
  normalizeRedirect,
  splitMeta,
  forbidden,
  cellHookErrorMessage,
  checkPolicy,
  policyAccess,
  policyGate,
  resolveDispatchTarget,
  handleFormState,
  handleFormWizard,
  handleFormCreateOption,
  handleFormMentions,
  handleWidgetData,
  sendActionResult,
  sendMutationSuccess,
  sendRedirectResponse,
  findInQueryWithTrashed,
  loadAccessGated,
} from './helpers.js'

/**
 * Register every depth-0 route for one Resource — list / view / create /
 * edit / delete / restore / force-delete (when soft-deletes are enabled),
 * resource-action dispatch, `_widget` polling, the deferred-table JSON
 * endpoint, the per-row `_reorder` and `_cell` endpoints (gated by the
 * boot-time probes the caller hands in via `options`), the four
 * form-state companion endpoints for both create and edit, plus the
 * resource-record sub-pages (Filament-style `pages().record`).
 *
 * Also drives `registerRelationRoutes` per registered relation manager
 * — the depth-1 + depth-2 relation strips compose under this Resource.
 *
 * Pulled out of `registerPilotiqRoutes` in 2026-05-12 (Phase 5 of the
 * routes.ts split). Called once per `cfg.resources` entry.
 *
 * `options` carries the boot-time probe results — the host barrel knows
 * whether `Table.reorderable()` was set and whether any editable column
 * is present (both need a model-side method to exist; the barrel throws
 * a config error there).
 */
export function registerResourceRoutes(
  router:  Router,
  pilotiq: Pilotiq,
  R:       ResourceClass,
  base:    string,
  options: { reorderable: boolean; editable: boolean },
): void {
  const cfg = pilotiq.getConfig()

    const slug  = R.getSlug()
    const resourceBase = resourceBasePath(base, R)
    const pages = R.resolvePages()

    // Index — GET ${resourceBase}
    if (pages.index) {
      const PageClass = pages.index
      const indexUrl  = resourceBase
      router.get(indexUrl, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await policyGate(R, user, () => R.canViewAny(user))) return forbidden(res, wantsJson(req))

        if (R.persistFiltersInSession) {
          const query = (req.query as Record<string, unknown> | undefined) ?? {}
          const sessionSlug = resourceBase.slice(base.length + 1)
          if (Object.keys(query).length === 0) {
            const restoreTab = readPersistedLastTab(req, base, sessionSlug) ?? ''
            const stored = readPersistedListQuery(req, listFiltersKey(base, sessionSlug, restoreTab))
            if (stored) {
              const qs = encodePersistedQuery(stored, restoreTab)
              if (qs !== '') return res.redirect(`${indexUrl}?${qs}`, 302)
            }
          } else {
            const tab = typeof query['tab'] === 'string' ? query['tab'] : ''
            writePersistedListQuery(req, listFiltersKey(base, sessionSlug, tab), query)
            writePersistedLastTab(req, base, sessionSlug, tab)
          }
        }

        const data = await resourceIndexData(pilotiq, slug, req.query, req)
        return view('pilotiq.slug', data ?? {})
      })

      router.post(`${indexUrl}/_widget/:id`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await policyGate(R, user, () => R.canViewAny(user))) return forbidden(res, true)
        return handleWidgetData(req, res, pilotiq, { kind: 'resource', slug }, req.params['id']!)
      })

      if (R.deferLoading) {
        router.get(`${indexUrl}/_table`, async (req, res) => {
          const user = await pilotiq.resolveUser(req)
          if (!await policyGate(R, user, () => R.canViewAny(user))) return forbidden(res, true)
          const data = await resourceTableData(pilotiq, slug, req.query as Record<string, string>, req)
          if (!data) { res.status(404); return res.json({ ok: false, error: 'Resource not found' }) }
          return res.json({ ok: true, ...data })
        })
      }

      // Action dispatch — POST ${resourceBase}/_action/:actionName
      router.post(`${indexUrl}/_action/:actionName`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await policyAccess(R, user)) return forbidden(res, wantsJson(req))

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
          user,
          ...(target.rowField   ? { rowField:   target.rowField   } : {}),
          ...(target.formSchema ? { formSchema: target.formSchema } : {}),
        }, resolveRecord)
        return sendActionResult(req, res, json, result, base, indexUrl)
      })

      // Reorderable rows — POST ${resourceBase}/_reorder { ids: [] }
      // Only mounted when `Resource.table()` opts in (boot-time probe
      // populates `reorderEnabled`).
      if (options.reorderable) {
        router.post(`${indexUrl}/_reorder`, async (req, res) => {
          const user = await pilotiq.resolveUser(req)
          // List-level edit gate. The drop affects many rows at once;
          // there's no single record to authorize against, so we pass
          // `undefined` and let user-supplied `canEdit` overrides branch
          // on `record === undefined` if they want row-level granularity.
          if (!await policyGate(R, user, () => R.canEdit(user, undefined))) return forbidden(res, true)

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

      // Editable cell columns — POST ${resourceBase}/:id/_cell/:column
      // { value: <coerced> }. Only mounted when the resource declares at
      // least one editable column (boot-time probe populates
      // `editableEnabled`).
      if (options.editable) {
        router.post(`${indexUrl}/:id/_cell/:column`, async (req, res) => {
          const user = await pilotiq.resolveUser(req)
          if (!await policyAccess(R, user)) return forbidden(res, true)

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

          // beforeStateUpdated — runs after validators pass, before the
          // DB write. Throwing halts with 422 under `_cell`.
          const beforeHook = col.getBeforeStateUpdated()
          if (beforeHook) {
            try { await beforeHook(value, { record: record as Record<string, unknown>, user }) }
            catch (err) {
              res.status(422)
              return res.json({ ok: false, errors: { _cell: [cellHookErrorMessage(err)] } })
            }
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

          // afterStateUpdated — runs only on a confirmed write. Throwing
          // surfaces the error to the user; the DB row is already
          // updated (the hook is for follow-up effects, not rollback).
          const afterHook = col.getAfterStateUpdated()
          if (afterHook) {
            try { await afterHook(value, { record: record as Record<string, unknown>, user }) }
            catch (err) {
              res.status(422)
              return res.json({ ok: false, errors: { _cell: [cellHookErrorMessage(err)] } })
            }
          }

          return res.json({ ok: true, value, notifications: [] })
        })
      }
    }

    // Plan #5 — partial-resolve endpoint for create-mode forms.
    // POST ${resourceBase}/_form/:formId/state
    if (pages.create) {
      router.post(`${resourceBase}/_form/:formId/state`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await policyGate(R, user, () => R.canCreate(user))) return forbidden(res, true)
        const formId = req.params['formId']!
        return handleFormState(req, res, pilotiq, { kind: 'resource-create', slug }, formId)
      })

      // Plan #8 — wizard step-validate endpoint for create-mode forms.
      router.post(`${resourceBase}/_form/:formId/wizard`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await policyGate(R, user, () => R.canCreate(user))) return forbidden(res, true)
        const formId = req.params['formId']!
        return handleFormWizard(req, res, pilotiq, { kind: 'resource-create', slug }, formId)
      })

      // Async-mention endpoint for create-mode forms.
      router.post(`${resourceBase}/_form/:formId/mentions`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await policyGate(R, user, () => R.canCreate(user))) return forbidden(res, true)
        const formId = req.params['formId']!
        return handleFormMentions(req, res, pilotiq, { kind: 'resource-create', slug }, formId)
      })

      // SelectField inline-create modal endpoint for create-mode forms.
      router.post(`${resourceBase}/_form/:formId/create-option/:fieldName`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await policyGate(R, user, () => R.canCreate(user))) return forbidden(res, true)
        const formId    = req.params['formId']!
        const fieldName = req.params['fieldName']!
        return handleFormCreateOption(req, res, pilotiq, { kind: 'resource-create', slug }, formId, fieldName)
      })
    }

    // Plan #5 — partial-resolve endpoint for edit-mode forms.
    // POST ${resourceBase}/:id/_form/:formId/state
    if (pages.edit) {
      router.post(`${resourceBase}/:id/_form/:formId/state`, async (req, res) => {
        const recordId = req.params['id']!
        const formId   = req.params['formId']!
        const user = await pilotiq.resolveUser(req)
        const { access, record: policyRecord } = await loadAccessGated(R, recordId, user)
        if (!access) return forbidden(res, true)
        if (!await checkPolicy(() => R.canEdit(user, policyRecord))) return forbidden(res, true)
        return handleFormState(req, res, pilotiq, { kind: 'resource-edit', slug, recordId }, formId)
      })

      // Plan #8 — wizard step-validate endpoint for edit-mode forms.
      router.post(`${resourceBase}/:id/_form/:formId/wizard`, async (req, res) => {
        const recordId = req.params['id']!
        const formId   = req.params['formId']!
        const user = await pilotiq.resolveUser(req)
        const { access, record: policyRecord } = await loadAccessGated(R, recordId, user)
        if (!access) return forbidden(res, true)
        if (!await checkPolicy(() => R.canEdit(user, policyRecord))) return forbidden(res, true)
        return handleFormWizard(req, res, pilotiq, { kind: 'resource-edit', slug, recordId }, formId)
      })

      // Async-mention endpoint for edit-mode forms.
      router.post(`${resourceBase}/:id/_form/:formId/mentions`, async (req, res) => {
        const recordId = req.params['id']!
        const formId   = req.params['formId']!
        const user = await pilotiq.resolveUser(req)
        const { access, record: policyRecord } = await loadAccessGated(R, recordId, user)
        if (!access) return forbidden(res, true)
        if (!await checkPolicy(() => R.canEdit(user, policyRecord))) return forbidden(res, true)
        return handleFormMentions(req, res, pilotiq, { kind: 'resource-edit', slug, recordId }, formId)
      })

      // SelectField inline-create modal endpoint for edit-mode forms.
      router.post(`${resourceBase}/:id/_form/:formId/create-option/:fieldName`, async (req, res) => {
        const recordId  = req.params['id']!
        const formId    = req.params['formId']!
        const fieldName = req.params['fieldName']!
        const user = await pilotiq.resolveUser(req)
        const { access, record: policyRecord } = await loadAccessGated(R, recordId, user)
        if (!access) return forbidden(res, true)
        if (!await checkPolicy(() => R.canEdit(user, policyRecord))) return forbidden(res, true)
        return handleFormCreateOption(req, res, pilotiq, { kind: 'resource-edit', slug, recordId }, formId, fieldName)
      })
    }

    // Create — GET ${resourceBase}/create
    if (pages.create) {
      const PageClass = pages.create
      const createUrl = `${resourceBase}/create`

      router.get(createUrl, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await policyGate(R, user, () => R.canCreate(user))) return forbidden(res, wantsJson(req))
        const data = await resourceCreateData(pilotiq, slug, undefined, req)
        return view('pilotiq.resource-create', data ?? {})
      })

      // Create — POST ${resourceBase}/create
      router.post(createUrl, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await policyGate(R, user, () => R.canCreate(user))) return forbidden(res, wantsJson(req))

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
          : recordId !== undefined ? `${resourceBase}/${String(recordId)}/edit` : `${resourceBase}`
        const redirect = continueCreate
          ? createUrl
          : normalizeRedirect(result.redirect, base) ?? fallback
        return sendRedirectResponse(req, res, json, redirect, result.notifications, {
          ...(continueCreate ? { force: true as const } : {}),
          ...(result.relationshipRenames.length > 0 ? { relationshipRenames: result.relationshipRenames } : {}),
        })
      })

      // Action dispatch — POST ${createUrl}/_action/:actionName
      // Handles both page-level handler-style actions AND Repeater /
      // Builder `extraItemActions` rows. The latter pass `_rowPath` in
      // the body so the dispatcher hydrates `ctx.row` from the form's
      // coerced values.
      router.post(`${createUrl}/_action/:actionName`, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await policyGate(R, user, () => R.canCreate(user))) return forbidden(res, wantsJson(req))

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
          user,
          ...(target.rowField   ? { rowField:   target.rowField   } : {}),
          ...(target.formSchema ? { formSchema: target.formSchema } : {}),
        })
        return sendActionResult(req, res, json, result, base, createUrl)
      })
    }

    // View — GET ${resourceBase}/:id (literal `create` matches first via
    // Hono's literal-over-param routing, so `:id` only catches everything else.)
    if (pages.view) {
      router.get(`${resourceBase}/:id`, async (req, res) => {
        const recordId = req.params['id']!
        // Hono routes both `/create` and `/:id` against this slot; only the
        // literal `create` segment hits the create route. Defensive guard:
        if (recordId === 'create') return // handled by create route

        const user = await pilotiq.resolveUser(req)
        // Load the record in parallel with the access probe so canView
        // can inspect it. Stub `{ id }` when the resource has no model
        // wired — the user-authored predicate gets to decide what to
        // do with it.
        const { access, record } = await loadAccessGated(R, recordId, user)
        if (!access) return forbidden(res, wantsJson(req))
        if (!await checkPolicy(() => R.canView(user, record))) return forbidden(res, wantsJson(req))

        const data = await resourceViewData(pilotiq, slug, recordId, req)
        return view('pilotiq.resource-view', data ?? {})
      })

      // Delete — POST ${resourceBase}/:id/delete
      router.post(`${resourceBase}/:id/delete`, async (req, res) => {
        const recordId = req.params['id']!
        const json = wantsJson(req)
        const indexUrl = `${resourceBase}`

        const user = await pilotiq.resolveUser(req)
        const { access, record } = await loadAccessGated(R, recordId, user)
        if (!access) return forbidden(res, json)
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
        // Plan #13: use "moved to trash" framing on soft-delete resources
        // so users know the row is recoverable.
        const title = R.softDeletes
          ? `${R.labelSingular} moved to trash`
          : `${R.labelSingular} deleted`
        return sendMutationSuccess(req, res, json, { id: recordId, kind: 'delete', title, redirect: indexUrl })
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

      // Load a row through `withTrashed` so currently-trashed records
      // resolve. Falls back to `M.find` when the query doesn't expose
      // `withTrashed()` (older ORM versions). Returns undefined when
      // the lookup misses (route converts to 404).
      const loadTrashable = async (id: string): Promise<unknown> => {
        const found = await findInQueryWithTrashed(M.query(), pk, id)
        if (found !== undefined) return found
        return M.find(id).catch(() => undefined)
      }

      // Restore — POST ${resourceBase}/:id/restore
      router.post(`${resourceBase}/:id/restore`, async (req, res) => {
        const recordId = req.params['id']!
        const json = wantsJson(req)
        const indexUrl = `${resourceBase}`

        const user = await pilotiq.resolveUser(req)
        if (!await policyAccess(R, user)) return forbidden(res, json)
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

        return sendMutationSuccess(req, res, json, {
          id: recordId, kind: 'restore', title: `${R.labelSingular} restored`, redirect: indexUrl,
        })
      })

      // Force-delete — POST ${resourceBase}/:id/force-delete
      router.post(`${resourceBase}/:id/force-delete`, async (req, res) => {
        const recordId = req.params['id']!
        const json = wantsJson(req)
        const indexUrl = `${resourceBase}`

        const user = await pilotiq.resolveUser(req)
        if (!await policyAccess(R, user)) return forbidden(res, json)
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

        return sendMutationSuccess(req, res, json, {
          id: recordId, kind: 'fdelete', title: `${R.labelSingular} permanently deleted`, redirect: indexUrl,
        })
      })
    }

    // Edit — GET ${resourceBase}/:id/edit
    if (pages.edit) {
      const PageClass = pages.edit

      router.get(`${resourceBase}/:id/edit`, async (req, res) => {
        const recordId = req.params['id']!
        const user = await pilotiq.resolveUser(req)
        const { access, record } = await loadAccessGated(R, recordId, user)
        if (!access) return forbidden(res, wantsJson(req))
        if (!await checkPolicy(() => R.canEdit(user, record))) return forbidden(res, wantsJson(req))

        const data = await resourceEditData(pilotiq, slug, recordId, undefined, req)
        return view('pilotiq.resource-edit', data ?? {})
      })

      // Edit — POST ${resourceBase}/:id/edit
      router.post(`${resourceBase}/:id/edit`, async (req, res) => {
        const recordId = req.params['id']!
        const editUrl  = `${resourceBase}/${recordId}/edit`
        const body = await readFormBody(req)
        const { values, formId } = splitMeta(body)
        const json = wantsJson(req)

        const user = await pilotiq.resolveUser(req)
        const { access, record: policyRecord } = await loadAccessGated(R, recordId, user)
        if (!access) return forbidden(res, json)
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
        return sendRedirectResponse(req, res, json, redirect, result.notifications,
          result.relationshipRenames.length > 0 ? { relationshipRenames: result.relationshipRenames } : undefined,
        )
      })

      // Action dispatch — POST ${editUrl}/_action/:actionName
      // Same shape as the create-page _action route. The `:id` segment
      // gates record-aware policy (canEdit per record); row-scoped
      // dispatch reuses the form schema we resolve here for `coerceFormValues`.
      router.post(`${resourceBase}/:id/_action/:actionName`, async (req, res) => {
        const recordId = req.params['id']!
        // Hono routes `/edit` and `/delete` against this slot too — bail
        // out so the dedicated handlers downstream pick them up. The
        // `:actionName` capture catches anything; the explicit guard
        // mirrors the view-route `recordId === 'create'` defensive branch.
        const actionName = req.params['actionName']!

        const user = await pilotiq.resolveUser(req)
        const { access, record: policyRecord } = await loadAccessGated(R, recordId, user)
        if (!access) return forbidden(res, wantsJson(req))
        if (!await checkPolicy(() => R.canEdit(user, policyRecord))) return forbidden(res, wantsJson(req))

        const json = wantsJson(req)
        const body  = await readFormBody(req)
        const input = parseActionBody(body)

        const editUrl = `${resourceBase}/${recordId}/edit`
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
          user,
          ...(target.rowField   ? { rowField:   target.rowField   } : {}),
          ...(target.formSchema ? { formSchema: target.formSchema } : {}),
        }, resolveRecord)
        return sendActionResult(req, res, json, result, base, editUrl)
      })
    }

    // ── Plan #11 relation manager routes ───────────────
    // Per-manager: list, create (GET/POST), edit (GET/POST), delete (POST),
    // restore / force-delete (soft-deletes), `_action`, `_detach` (M2M).
    // Mounted under ${resourceBase}/:id/${rel} — the `:id` segment is the
    // PARENT record id; the `:childId` segment (where present) is the
    // related record's id. Authorization runs in two layers: parent
    // canAccess + canEdit(parent), then manager-scoped can*. Depth-2
    // nested relations register the same shape under a deeper prefix.
    //
    // Pulled out 2026-05-12 (Phase 4 of the routes.ts split).
    registerRelationRoutes(router, pilotiq, R, base)

    // ── Record sub-pages ───────────────────────────────
    // `${resourceBase}/:id/${subSlug}` — same URL slot as a relation
    // manager's `relationship`, distinguished by registry: the data
    // builder tries the relation lookup first, then falls through to
    // the record sub-page map. Boot-time validation ensures the slugs
    // don't collide.
    for (const [subPageSlug, SubPage] of Object.entries(R.getRecordPages())) {
      void SubPage  // referenced inside `resourceRecordPageData` via the registry; the local binding is captured for closure-stable types only.
      const recordPageUrl = `${resourceBase}/:id/${subPageSlug}`
      router.get(recordPageUrl, async (req, res) => {
        const user = await pilotiq.resolveUser(req)
        if (!await policyAccess(R, user)) return forbidden(res, wantsJson(req))
        const recordId = (req.params as Record<string, string | undefined>)['id']!
        const data = await resourceRecordPageData(pilotiq, slug, recordId, subPageSlug, req)
        if (data === null) { res.status(404); return res.send('Not found') }
        if ('ok' in data && data.ok === false) return forbidden(res, wantsJson(req))
        return view('pilotiq.slug', data)
      })
    }
}
