import type { Router } from '@rudderjs/router'
import { view } from '@rudderjs/view'
import type { Pilotiq } from '../Pilotiq.js'
import type { SchemaContext } from '../schema/resolveSchema.js'
import { buildSettingsMeta, settingsData, resolveSettingsPanePage, callPageSchema, tagFormActions } from '../pageData.js'
import { dispatchFormSubmit, findForms, selectForm } from '../elements/dispatchForm.js'
import {
  wantsJson, readFormBody, splitMeta, normalizeRedirect,
  forbidden, policyAccess, sendRedirectResponse,
} from './helpers.js'

/**
 * Resolve framework + panel-builder versions once (server-side). Both are
 * read from the resolved package.json: pilotiq's own (relative to this
 * compiled module — `dist/routes/settings.js` → `../../package.json`) and
 * `@rudderjs/core` via the package resolver. Missing → `undefined`.
 *
 * `node:module` is imported dynamically (not at module top-level): this
 * file is reachable from the client barrel, and a static `node:module`
 * import would break the browser bundle. The dynamic import only executes
 * inside this handler, which never runs client-side.
 */
let _versions: { rudder?: string; pilotiq?: string } | undefined
async function resolveVersions(): Promise<{ rudder?: string; pilotiq?: string }> {
  if (_versions) return _versions
  const { createRequire } = await import('node:module')
  const req = createRequire(import.meta.url)
  const read = (id: string): string | undefined => {
    try { return (req(id) as { version?: string }).version } catch { return undefined }
  }
  const out: { rudder?: string; pilotiq?: string } = {}
  const pilotiq = read('../../package.json')
  const rudder  = read('@rudderjs/core/package.json')
  if (pilotiq !== undefined) out.pilotiq = pilotiq
  if (rudder  !== undefined) out.rudder  = rudder
  _versions = out
  return out
}

/**
 * Register the System Settings routes — the `${base}/settings` shell.
 * `settings` is a reserved slug (boot validation rejects a Resource /
 * Global / Page / Cluster using it), so this never collides with user
 * content. Only mounted when the panel exposes at least one settings pane
 * (or a profile page); the caller checks first.
 *
 *   GET ${base}/settings            → 302 to the first accessible pane
 *   GET ${base}/settings/:paneId    → render the pane (or 302 for an
 *                                      href pane), 404 when missing /
 *                                      inaccessible
 *
 * Per-pane access is enforced here against `buildSettingsMeta(cfg, user)`
 * (which drops panes failing `canAccess`) — defense in depth, since the
 * client settings-pane registry resolves render components without an
 * auth gate of its own.
 */
export function registerSettingsRoutes(
  router:  Router,
  pilotiq: Pilotiq,
  base:    string,
): void {
  const cfg = pilotiq.getConfig()

  // Bare `${base}/settings` renders the shell with the default pane
  // active (no redirect — a server redirect breaks Vike's SPA-nav
  // pageContext.json fetch, and the bare URL keeps the sidebar
  // active-highlight prefix match working across all panes).
  router.get(`${base}/settings`, async (req, res) => {
    const data = await settingsData(pilotiq, undefined, req)
    if (!data) return res.status(404).send('Not found')
    return view('pilotiq.settings', data)
  })

  // Framework + panel versions for the built-in General pane (and any
  // pane that wants them). Fetched client-side, mirroring `/api/_theme`.
  router.get(`${base}/api/_settings-meta`, async (_req, res) => {
    return res.json({ versions: await resolveVersions() })
  })

  router.get(`${base}/settings/:paneId`, async (req, res) => {
    const paneId = req.params['paneId']!
    const user = await pilotiq.resolveUser(req)
    const meta = await buildSettingsMeta(cfg, user)
    const pane = meta?.panes.find(p => p.id === paneId)
    if (!meta || !pane) {
      return res.status(404).send('Not found')
    }
    // href panes (e.g. the synthesized Profile entry) link to an existing
    // page — bounce there rather than rendering an empty shell body.
    if (pane.href) {
      return res.redirect(pane.href, 302)
    }
    const data = await settingsData(pilotiq, paneId, req)
    if (!data) return res.status(404).send('Not found')
    return view('pilotiq.settings', data)
  })

  // Form submit for a page-backed pane (e.g. Profile). The pane's form is
  // tagged to this URL by `resolveSettingsPaneSchema`, so the backing Page
  // needs no standalone route. Mirrors the custom-page POST dispatch.
  router.post(`${base}/settings/:paneId`, async (req, res) => {
    const paneId = req.params['paneId']!
    const json = wantsJson(req)
    const PageClass = resolveSettingsPanePage(cfg, paneId)
    if (!PageClass) { res.status(404); return res.send('Not found') }

    const user = await pilotiq.resolveUser(req)
    if (!await policyAccess(PageClass, user)) return forbidden(req, res, json)

    const body = await readFormBody(req)
    const { values, formId } = splitMeta(body)
    const paneUrl = `${base}/settings/${paneId}`
    const ctx: SchemaContext = user !== null ? { user: user as NonNullable<SchemaContext['user']> } : {}
    const elements = await callPageSchema(PageClass, ctx)
    tagFormActions(elements, paneUrl)
    const form = selectForm(findForms(elements), formId)
    if (!form) {
      if (json) { res.status(404); return res.json({ ok: false, error: 'No form found on pane' }) }
      res.status(404); return res.send('No form found on pane')
    }

    let record: unknown = undefined
    if (form.getLoadRecord()) {
      try { record = await form.getLoadRecord()!('', { values, ...(user != null ? { user } : {}) }) } catch { /* ignore */ }
    }

    const result = await dispatchFormSubmit(form, values, {
      values,
      basePath: base,
      ...(record !== undefined ? { record } : {}),
      ...(user != null ? { user } : {}),
    })

    if (!result.ok) {
      res.status(422)
      return res.json({ ok: false, errors: result.errors })
    }
    const redirect = normalizeRedirect(result.redirect, base) ?? paneUrl
    return sendRedirectResponse(req, res, json, redirect, result.notifications)
  })
}
