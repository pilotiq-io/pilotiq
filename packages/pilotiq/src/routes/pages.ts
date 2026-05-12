import type { Router } from '@rudderjs/router'
import { view } from '@rudderjs/view'
import type { Pilotiq } from '../Pilotiq.js'
import type { Page } from '../Page.js'
import { resolveSchema, type SchemaContext } from '../schema/resolveSchema.js'
import { dispatchFormSubmit, findForms, selectForm } from '../elements/dispatchForm.js'
import { dispatchAction, parseActionBody } from '../elements/dispatchAction.js'
import { flashNotifications } from '../notifications/flash.js'
import { pageBasePath } from '../clusterPaths.js'
import {
  panelInfo, callPageSchema, tagFormActions, tagActionDispatch,
  customPageData,
} from '../pageData.js'
import {
  wantsJson,
  readFormBody,
  normalizeRedirect,
  splitMeta,
  sendDownload,
  forbidden,
  policyAccess,
  resolveDispatchTarget,
  handleFormState,
  handleFormWizard,
  handleFormCreateOption,
  handleFormMentions,
  handleWidgetData,
} from './helpers.js'

/**
 * Register the routes for a single custom Page — the optional widget /
 * form-state companions, the GET render, action dispatch, and the
 * page-level POST (when the page's schema includes a `Form`).
 *
 * Pulled out of `registerPilotiqRoutes` in 2026-05-12 (Phase 3 of the
 * routes.ts split). Called once per `cfg.pages` entry. The caller is
 * responsible for skipping the dashboard page (it's served by the
 * panel-base GET).
 */
export function registerCustomPageRoutes(
  router:    Router,
  pilotiq:   Pilotiq,
  PageClass: typeof Page,
  base:      string,
): void {
  const cfg = pilotiq.getConfig()
  const pageSlug = PageClass.getSlug()
  const pageUrl  = pageBasePath(base, PageClass)

  // Plan #15 — per-page widget polling endpoint. Mirrors the
  // panel-scope `${base}/_widget/:id` but resolves the custom page's
  // schema instead of the dashboard's.
  router.post(`${pageUrl}/_widget/:id`, async (req, res) => {
    const user = await pilotiq.resolveUser(req)
    if (!await policyAccess(PageClass, user)) return forbidden(res, true)
    return handleWidgetData(req, res, pilotiq, { kind: 'page', pageSlug }, req.params['id']!)
  })

  // Plan #5 partial-resolve endpoint for custom pages with reactive forms.
  // POST ${base}/${pageSlug}/_form/:formId/state
  router.post(`${pageUrl}/_form/:formId/state`, async (req, res) => {
    const user = await pilotiq.resolveUser(req)
    if (!await policyAccess(PageClass, user)) return forbidden(res, true)
    const formId = req.params['formId']!
    return handleFormState(req, res, pilotiq, { kind: 'page', pageSlug }, formId)
  })

  // Plan #8 wizard step-validate endpoint for custom pages.
  router.post(`${pageUrl}/_form/:formId/wizard`, async (req, res) => {
    const user = await pilotiq.resolveUser(req)
    if (!await policyAccess(PageClass, user)) return forbidden(res, true)
    const formId = req.params['formId']!
    return handleFormWizard(req, res, pilotiq, { kind: 'page', pageSlug }, formId)
  })

  // Async-mention endpoint for custom pages.
  router.post(`${pageUrl}/_form/:formId/mentions`, async (req, res) => {
    const user = await pilotiq.resolveUser(req)
    if (!await policyAccess(PageClass, user)) return forbidden(res, true)
    const formId = req.params['formId']!
    return handleFormMentions(req, res, pilotiq, { kind: 'page', pageSlug }, formId)
  })

  // SelectField inline-create modal endpoint for custom pages.
  router.post(`${pageUrl}/_form/:formId/create-option/:fieldName`, async (req, res) => {
    const user = await pilotiq.resolveUser(req)
    if (!await policyAccess(PageClass, user)) return forbidden(res, true)
    const formId    = req.params['formId']!
    const fieldName = req.params['fieldName']!
    return handleFormCreateOption(req, res, pilotiq, { kind: 'page', pageSlug }, formId, fieldName)
  })

  router.get(pageUrl, async (req, res) => {
    const user = await pilotiq.resolveUser(req)
    if (!await policyAccess(PageClass, user)) return forbidden(res, wantsJson(req))
    const data = await customPageData(pilotiq, pageSlug, req)
    return view('pilotiq.slug', data ?? {})
  })

  // Action dispatch — POST ${base}/${pageSlug}/_action/:actionName
  router.post(`${pageUrl}/_action/:actionName`, async (req, res) => {
    const user = await pilotiq.resolveUser(req)
    if (!await policyAccess(PageClass, user)) return forbidden(res, wantsJson(req))

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
      user,
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
    if (!await policyAccess(PageClass, user)) return forbidden(res, json)

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
