import type { Router } from '@rudderjs/router'
import { view } from '@rudderjs/view'
import type { Pilotiq } from '../Pilotiq.js'
import type { GlobalClass } from '../Global.js'
import { type SchemaContext } from '../schema/resolveSchema.js'
import { dispatchFormSubmit, findForms, selectForm } from '../elements/dispatchForm.js'
import { flashNotifications } from '../notifications/flash.js'
import { globalBasePath } from '../clusterPaths.js'
import {
  callPageSchema, tagFormActions,
  globalEditData, globalViewData,
} from '../pageData.js'
import {
  wantsJson,
  readFormBody,
  normalizeRedirect,
  splitMeta,
  forbidden,
  checkPolicy,
  policyAccess,
  handleFormState,
  handleFormWizard,
  handleFormCreateOption,
  handleFormMentions,
} from './helpers.js'

/**
 * Register the per-Global routes — edit GET / POST, the four form-state
 * companion endpoints (`_form/:formId/state` / `wizard` / `mentions` /
 * `create-option`), and the optional view route.
 *
 * Pulled out of `registerPilotiqRoutes` in 2026-05-12 (Phase 3 of the
 * routes.ts split). Called once per `cfg.globals` entry.
 */
export function registerGlobalRoutes(
  router:  Router,
  pilotiq: Pilotiq,
  G:       GlobalClass,
  base:    string,
): void {
  const slug    = G.getSlug()
  const editUrl = globalBasePath(base, G)
  const pages   = G.resolvePages()

  if (pages.edit) {
    const PageClass = pages.edit

    // Plan #5 partial-resolve endpoint for the global's edit form.
    // POST ${editUrl}/_form/:formId/state
    router.post(`${editUrl}/_form/:formId/state`, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      if (!await policyAccess(G, user)) return forbidden(res, true)
      if (!await checkPolicy(() => G.canEdit(user, undefined))) return forbidden(res, true)
      const formId = req.params['formId']!
      return handleFormState(req, res, pilotiq, { kind: 'global-edit', slug }, formId)
    })

    // Plan #8 wizard step-validate endpoint for the global's edit form.
    router.post(`${editUrl}/_form/:formId/wizard`, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      if (!await policyAccess(G, user)) return forbidden(res, true)
      if (!await checkPolicy(() => G.canEdit(user, undefined))) return forbidden(res, true)
      const formId = req.params['formId']!
      return handleFormWizard(req, res, pilotiq, { kind: 'global-edit', slug }, formId)
    })

    // Async-mention endpoint for the global's edit form.
    router.post(`${editUrl}/_form/:formId/mentions`, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      if (!await policyAccess(G, user)) return forbidden(res, true)
      if (!await checkPolicy(() => G.canEdit(user, undefined))) return forbidden(res, true)
      const formId = req.params['formId']!
      return handleFormMentions(req, res, pilotiq, { kind: 'global-edit', slug }, formId)
    })

    // SelectField inline-create modal endpoint for the global's edit form.
    router.post(`${editUrl}/_form/:formId/create-option/:fieldName`, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      if (!await policyAccess(G, user)) return forbidden(res, true)
      if (!await checkPolicy(() => G.canEdit(user, undefined))) return forbidden(res, true)
      const formId    = req.params['formId']!
      const fieldName = req.params['fieldName']!
      return handleFormCreateOption(req, res, pilotiq, { kind: 'global-edit', slug }, formId, fieldName)
    })

    router.get(editUrl, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      if (!await policyAccess(G, user)) return forbidden(res, wantsJson(req))
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
      if (!await policyAccess(G, user)) return forbidden(res, json)
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
    router.get(`${editUrl}/view`, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      if (!await policyAccess(G, user)) return forbidden(res, wantsJson(req))
      if (!await checkPolicy(() => G.canView(user, undefined))) return forbidden(res, wantsJson(req))
      const data = await globalViewData(pilotiq, slug, req)
      return view('pilotiq.resource-view', data ?? {})
    })
  }
}
