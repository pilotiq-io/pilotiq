import type { Router } from '@rudderjs/router'
import type { AppRequest } from '@rudderjs/contracts'
import { view } from '@rudderjs/view'
import type { Pilotiq } from '../Pilotiq.js'
import { dashboardData, searchData } from '../pageData.js'
import {
  listForUser    as listDatabaseNotifications,
  markAsRead     as markDatabaseNotificationAsRead,
  markAsUnread   as markDatabaseNotificationAsUnread,
  markAllAsRead  as markAllDatabaseNotificationsAsRead,
} from '../notifications/database.js'
import { dispatchNotificationAction } from '../notifications/dispatchNotificationAction.js'
import { registerBroadcastAuth } from '../notifications/registerBroadcastAuth.js'
import {
  wantsJson,
  forbidden,
  policyAccess,
  handleWidgetData,
  handleUploadRequest,
} from './helpers.js'

/**
 * Register the panel-level sibling routes — the ones that don't belong
 * to any individual Resource / Global / custom Page:
 *
 * - `GET ${base}`                 — dashboard
 * - `POST ${base}/_uploads`       — `FileUpload` field POST target
 * - `POST ${base}/_widget/:id`    — Plan #15 dashboard widget polling
 * - `GET ${base}/_search`         — Plan #12 global search
 * - `${base}/_notifications/...`  — bell-icon dropdown endpoints (only
 *   mounted when `Pilotiq.databaseNotifications()` was called)
 *
 * Plus the broadcast-auth registration that the notifications path
 * needs in the same `if` branch. Reads `cfg = pilotiq.getConfig()`
 * internally so the call site only has to thread the basePath.
 */
export function registerPanelRoutes(
  router:  Router,
  pilotiq: Pilotiq,
  base:    string,
): void {
  const cfg = pilotiq.getConfig()

  // ── Dashboard (1-segment) ─────────────────────────────
  router.get(base, async (req, res) => {
    // Plan #15 — when `panel.dashboard(P)` is set, gate the dashboard
    // route through the page's `canAccess` predicate. Same posture as
    // custom pages — fail-closed on throw.
    if (cfg.dashboardPage) {
      const user = await pilotiq.resolveUser(req)
      if (!await policyAccess(cfg.dashboardPage!, user)) {
        return forbidden(req, res, wantsJson(req))
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
      if (!await policyAccess(cfg.dashboardPage!, user)) return forbidden(req, res, true)
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

  // ── Database notifications (bell-icon dropdown) ───────
  // Only mounted when `Pilotiq.databaseNotifications()` was called.
  // Every route 401s when no user resolves so a non-authenticated
  // request never sees another user's inbox. The `notifiable_type`
  // value is configurable but defaults to `'users'` to match
  // `@rudderjs/notification`'s `DatabaseChannel` writes.
  if (cfg.databaseNotifications?.enabled) {
    const dn = cfg.databaseNotifications
    const notifiableType = dn.notifiableType ?? 'users'
    const pageSize = dn.pageSize ?? 25

    /** Resolve `{ id }` from the panel's user resolver. Returns null
     *  when no user / unknown id — every route then 401s. The user
     *  object is opaque to pilotiq; we duck-type `.id`. */
    const resolveUserId = async (req: AppRequest): Promise<string | null> => {
      const user = await pilotiq.resolveUser(req)
      if (!user || typeof user !== 'object') return null
      const id = (user as { id?: unknown }).id
      if (id === undefined || id === null) return null
      return String(id)
    }

    // GET ${base}/_notifications → { notifications, unreadCount }
    router.get(`${base}/_notifications`, async (req, res) => {
      const id = await resolveUserId(req)
      if (id === null) { res.status(401); return res.json({ ok: false, error: 'Not authenticated' }) }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const unreadOnly = url.searchParams.get('unread') === 'true'
      const limitRaw = Number(url.searchParams.get('limit') ?? pageSize)
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : pageSize
      const data = await listDatabaseNotifications({
        notifiableType,
        notifiableId: id,
        limit,
        unreadOnly,
      })
      return res.json({ ok: true, ...data })
    })

    // POST ${base}/_notifications/:id/read
    router.post(`${base}/_notifications/:id/read`, async (req, res) => {
      const userId = await resolveUserId(req)
      if (userId === null) { res.status(401); return res.json({ ok: false, error: 'Not authenticated' }) }
      const rowId = (req.params as Record<string, string | undefined>)['id'] ?? ''
      const updated = await markDatabaseNotificationAsRead(rowId, {
        notifiableType,
        notifiableId: userId,
      })
      return res.json({ ok: updated })
    })

    // POST ${base}/_notifications/:id/unread
    router.post(`${base}/_notifications/:id/unread`, async (req, res) => {
      const userId = await resolveUserId(req)
      if (userId === null) { res.status(401); return res.json({ ok: false, error: 'Not authenticated' }) }
      const rowId = (req.params as Record<string, string | undefined>)['id'] ?? ''
      const updated = await markDatabaseNotificationAsUnread(rowId, {
        notifiableType,
        notifiableId: userId,
      })
      return res.json({ ok: updated })
    })

    // POST ${base}/_notifications/read-all
    router.post(`${base}/_notifications/read-all`, async (req, res) => {
      const userId = await resolveUserId(req)
      if (userId === null) { res.status(401); return res.json({ ok: false, error: 'Not authenticated' }) }
      const count = await markAllDatabaseNotificationsAsRead({
        notifiableType,
        notifiableId: userId,
      })
      return res.json({ ok: true, count })
    })

    // POST ${base}/_notifications/:id/_action/:actionName
    //
    // Notification action dispatch — looks up the stored action on the
    // row, resolves the named handler against the panel's
    // `notificationHandlers` registry, and runs it with the row's
    // stored payload. Optionally flips `read_at` server-side when the
    // action carried `markAsRead: true`.
    //
    // Defends in depth: 404s on missing row / wrong owner / action
    // missing / non-string handler / unknown registry name. Body is
    // ignored — payload reads exclusively from the stored row, so a
    // tampered client can't inject extra payload keys.
    router.post(`${base}/_notifications/:id/_action/:actionName`, async (req, res) => {
      const user = await pilotiq.resolveUser(req)
      const userId = user && typeof user === 'object'
        ? ((user as { id?: unknown }).id !== undefined && (user as { id?: unknown }).id !== null
            ? String((user as { id: unknown }).id) : null)
        : null
      if (userId === null) { res.status(401); return res.json({ ok: false, error: 'Not authenticated' }) }

      const params = (req.params as Record<string, string | undefined>)
      const result = await dispatchNotificationAction(pilotiq, {
        notificationId: params['id']         ?? '',
        actionName:     params['actionName'] ?? '',
        notifiableType,
        notifiableId:   userId,
        user,
        request:        req,
      })
      if (!result.ok) {
        res.status(result.status)
        return res.json({ ok: false, error: result.error })
      }
      return res.json(result)
    })

    // Phase 2 — register the broadcast auth callback for private
    // `pilotiq-notifications.<userId>` channels. Soft-fails when
    // `@rudderjs/broadcast` isn't installed; apps that haven't enabled
    // broadcast on the toggle stay quiet either way.
    void registerBroadcastAuth(pilotiq)
  }
}
