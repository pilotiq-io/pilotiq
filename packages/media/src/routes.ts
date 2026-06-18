/**
 * `_media` HTTP surface — the CRUD + upload routes mounted under the panel base
 * by the `media()` plugin's `registerRoutes` hook.
 *
 * This module is loadable on the client (it's pulled into the panel-module
 * graph via `plugin.ts`), so it must stay free of Node-only static imports:
 * the top level only imports the pure `pipeline.ts` helpers and the client-safe
 * library registry. The Node-only `store.ts` (Storage / image / model) is
 * loaded lazily inside each handler — which only ever runs server-side — via a
 * Vite-ignored dynamic import, mirroring pilotiq core's `_uploads` ←
 * `@rudderjs/image` deferral.
 *
 * Routes (all under `${base}/_media`, the underscore-prefixed sibling-route
 * convention `_search` / `_uploads` / `_widget` / `_notifications` follow):
 *
 * - `GET    _media`            — list a folder (paginated; parentId/scope/search/sort)
 * - `GET    _media/:id`        — fetch one record
 * - `POST   _media/folder`     — create a folder            (JSON)
 * - `POST   _media/upload`     — upload a file              (multipart)
 * - `POST   _media/:id/rename` — rename a file/folder       (JSON)
 * - `POST   _media/:id/move`   — reparent a file/folder     (JSON)
 * - `POST   _media/:id/delete` — delete (recursive folders)
 *
 * Plugin routes mount OUTSIDE pilotiq's `Pilotiq.guard()` group, so each
 * handler consults `cfg.guard` itself (401 on failure) and resolves the user
 * for `scope: 'private'` filtering — exactly what #214 asks for.
 */
import type { PilotiqPlugin } from '@pilotiq/pilotiq'
import { getLibrary, getDefaultLibrary, type MediaLibrary } from './registry.js'
import { parseListQuery, validateUpload, type MediaAuth } from './pipeline.js'

type Router  = Parameters<NonNullable<PilotiqPlugin['registerRoutes']>>[0]
type Pilotiq = Parameters<NonNullable<PilotiqPlugin['registerRoutes']>>[1]

/** Lazily import the Node-only store. Memoized; `/* @vite-ignore *\/` + the
 *  variable specifier keep the client bundler from pulling Storage / image /
 *  the model into the browser graph. */
type StoreModule = typeof import('./store.js')
let storePromise: Promise<StoreModule> | null = null
function loadStore(): Promise<StoreModule> {
  if (!storePromise) {
    const mod = './store.js'
    storePromise = import(/* @vite-ignore */ mod) as Promise<StoreModule>
  }
  return storePromise
}

/**
 * Register the `_media` routes on `router` for the panel `pilotiq`. Called from
 * the `media()` plugin's `registerRoutes` hook; safe to call directly from a
 * provider too.
 */
export function registerMediaRoutes(router: Router, pilotiq: Pilotiq): void {
  const base = pilotiq.getConfig().path

  // ── Request helpers ───────────────────────────────────
  const passesGuard = async (req: unknown): Promise<boolean> => {
    const guard = pilotiq.getConfig().guard
    if (!guard) return true
    try {
      return await guard(req)
    } catch {
      return false
    }
  }

  const userIdOf = (user: unknown): string | null => {
    if (!user || typeof user !== 'object') return null
    const id = (user as { id?: unknown }).id
    return id === undefined || id === null ? null : String(id)
  }

  const resolveAuth = async (req: unknown, scope: 'shared' | 'private'): Promise<MediaAuth> => {
    const user = await pilotiq.resolveUser(req)
    return { scope, userId: userIdOf(user) }
  }

  // ── Route registration ────────────────────────────────
  // GET ${base}/_media — list a folder.
  router.get(`${base}/_media`, async (req, res) => {
    if (!await passesGuard(req)) return unauthorized(res)
    const opts = parseListQuery(req.query as Record<string, unknown> | undefined)
    const auth = await resolveAuth(req, opts.scope)
    return run(res, async () => {
      const store = await loadStore()
      return res.json({ ok: true, ...await store.listMedia(opts, auth) })
    })
  })

  // POST ${base}/_media/folder — create a folder. Registered before the
  // `:id` routes; distinct verb/path so there's no capture ambiguity.
  router.post(`${base}/_media/folder`, async (req, res) => {
    if (!await passesGuard(req)) return unauthorized(res)
    const body = jsonBody(req)
    const name = trimmedString(body['name'])
    if (!name) return unprocessable(res, 'Folder name is required')
    const scope = readScope(body['scope'])
    const auth = await resolveAuth(req, scope)
    if (scope === 'private' && auth.userId === null) {
      return unauthorized(res, 'Authentication required for a private folder')
    }
    return run(res, async () => {
      const store = await loadStore()
      const media = await store.createFolder({ name, parentId: stringOrNull(body['parentId']) }, auth)
      return res.json({ ok: true, media })
    })
  })

  // POST ${base}/_media/upload — multipart file upload.
  router.post(`${base}/_media/upload`, async (req, res) => {
    if (!await passesGuard(req)) return unauthorized(res)

    const raw = (req as { raw?: { req?: { parseBody?: () => Promise<Record<string, unknown>> } } }).raw
    if (!raw?.req?.parseBody) return fail(res, 500, 'Multipart parsing unavailable')
    let body: Record<string, unknown>
    try {
      body = await raw.req.parseBody()
    } catch (err) {
      return fail(res, 400, message(err, 'Bad request'))
    }

    const file = body['file']
    if (!(file instanceof File)) return unprocessable(res, 'No file provided')

    const library = resolveLibrary(body['library'], base)
    const validation = validateUpload(file, library)
    if (!validation.ok) return fail(res, validation.status, validation.error)

    const scope = readScope(body['scope'])
    const auth = await resolveAuth(req, scope)
    if (scope === 'private' && auth.userId === null) {
      return unauthorized(res, 'Authentication required for a private upload')
    }

    return run(res, async () => {
      const store = await loadStore()
      const media = await store.uploadFile(
        { file, parentId: stringOrNull(body['parentId']), alt: trimmedString(body['alt']) || null },
        library,
        auth,
      )
      return res.json({ ok: true, media })
    })
  })

  // GET ${base}/_media/:id — fetch one record.
  router.get(`${base}/_media/:id`, async (req, res) => {
    if (!await passesGuard(req)) return unauthorized(res)
    const id = paramId(req)
    const auth = await resolveAuth(req, 'shared')
    return run(res, async () => {
      const store = await loadStore()
      const media = await store.getMedia(id, auth)
      return media ? res.json({ ok: true, media }) : notFound(res)
    })
  })

  // POST ${base}/_media/:id/rename — rename.
  router.post(`${base}/_media/:id/rename`, async (req, res) => {
    if (!await passesGuard(req)) return unauthorized(res)
    const id = paramId(req)
    const body = jsonBody(req)
    const name = trimmedString(body['name'])
    if (!name) return unprocessable(res, 'New name is required')
    const auth = await resolveAuth(req, 'shared')
    return run(res, async () => {
      const store = await loadStore()
      const media = await store.renameMedia(id, name, auth)
      return media ? res.json({ ok: true, media }) : notFound(res)
    })
  })

  // POST ${base}/_media/:id/move — reparent (parentId null = root).
  router.post(`${base}/_media/:id/move`, async (req, res) => {
    if (!await passesGuard(req)) return unauthorized(res)
    const id = paramId(req)
    const body = jsonBody(req)
    const auth = await resolveAuth(req, 'shared')
    return run(res, async () => {
      const store = await loadStore()
      try {
        const media = await store.moveMedia(id, stringOrNull(body['parentId']), auth)
        return media ? res.json({ ok: true, media }) : notFound(res)
      } catch (err) {
        if (err instanceof Error && err.name === 'MediaRequestError') {
          return unprocessable(res, err.message)
        }
        throw err
      }
    })
  })

  // POST ${base}/_media/:id/metadata — update alt text and/or custom meta.
  router.post(`${base}/_media/:id/metadata`, async (req, res) => {
    if (!await passesGuard(req)) return unauthorized(res)
    const id = paramId(req)
    const body = jsonBody(req)
    const input: { alt?: string | null; meta?: Record<string, unknown> } = {}
    if ('alt' in body)  input.alt = stringOrNull(body['alt'])
    if ('meta' in body) {
      const meta = body['meta']
      if (meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
        input.meta = meta as Record<string, unknown>
      } else {
        return unprocessable(res, '`meta` must be an object')
      }
    }
    if (Object.keys(input).length === 0) return unprocessable(res, 'Nothing to update')
    const auth = await resolveAuth(req, 'shared')
    return run(res, async () => {
      const store = await loadStore()
      const media = await store.updateMetadata(id, input, auth)
      return media ? res.json({ ok: true, media }) : notFound(res)
    })
  })

  // POST ${base}/_media/:id/delete — delete (recursive for folders).
  router.post(`${base}/_media/:id/delete`, async (req, res) => {
    if (!await passesGuard(req)) return unauthorized(res)
    const id = paramId(req)
    const auth = await resolveAuth(req, 'shared')
    return run(res, async () => {
      const store = await loadStore()
      const deleted = await store.deleteMedia(id, auth)
      return deleted ? res.json({ ok: true }) : notFound(res)
    })
  })
}

// ─── Pure request/response helpers (client-safe) ─────────

/** Resolve a library by name scoped to a panel base, falling back to the default. */
function resolveLibrary(raw: unknown, panelBase: string): MediaLibrary {
  const name = typeof raw === 'string' && raw.length > 0 ? raw : 'default'
  return getLibrary(panelBase, name) ?? getDefaultLibrary(panelBase)
}

/** Read the auto-parsed JSON body as a record (empty object otherwise). */
function jsonBody(req: unknown): Record<string, unknown> {
  const body = (req as { body?: unknown }).body
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {}
}

function paramId(req: unknown): string {
  const params = (req as { params?: Record<string, string | undefined> }).params ?? {}
  return params['id'] ?? ''
}

function trimmedString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** A non-empty string, or `null` (the wire shape for "root" / "unset"). */
function stringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' || t === 'root' || t === 'null' ? null : t
}

function readScope(v: unknown): 'shared' | 'private' {
  return v === 'private' ? 'private' : 'shared'
}

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/** Run a store-touching block, mapping any unexpected throw to a 500. */
async function run(res: ResponseLike, fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn()
  } catch (err) {
    return fail(res, 500, message(err, 'Media request failed'))
  }
}

interface ResponseLike {
  status(code: number): unknown
  json(body: unknown): unknown
}

function fail(res: ResponseLike, code: number, error: string): unknown {
  res.status(code)
  return res.json({ ok: false, error })
}

function unauthorized(res: ResponseLike, error = 'Unauthorized'): unknown {
  return fail(res, 401, error)
}

function notFound(res: ResponseLike, error = 'Not found'): unknown {
  return fail(res, 404, error)
}

function unprocessable(res: ResponseLike, error: string): unknown {
  return fail(res, 422, error)
}
