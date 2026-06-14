/**
 * `Pilotiq.guard()` panel-wide 401 layer.
 *
 * Documented since Plan #10 as the unauthenticated-request gate; until
 * 2026-05-21 only `_uploads` consulted it. Every other route relied on
 * `cfg.user` returning null + `R.canX(user, …)` defaulting to true, so
 * an app that wired `guard(req => Auth.check())` but shipped any
 * Resource without `canAccess` overrides ended up with an
 * unauthenticated, fully-readable admin panel.
 *
 * Fix: wrap every core panel route in one `router.group(...)` with the
 * guard as group middleware. This file is the regression test —
 * intentionally exhaustive so any future route that escapes the group
 * (e.g. registered outside the wrap callback by accident) fails loudly.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '@rudderjs/router'
import type { RouteDefinition, MiddlewareHandler } from '@rudderjs/contracts'

import { Pilotiq } from '../Pilotiq.js'
import { Resource } from '../Resource.js'
import { Global } from '../Global.js'
import { Page } from '../Page.js'
import { Cluster } from '../Cluster.js'
import { RelationManager } from '../RelationManager.js'
import { registerPilotiqRoutes } from '../routes.js'
import { themeEditor } from '../plugins/themeEditor.js'

// ─── Test fixtures ────────────────────────────────────────────

class Comment extends RelationManager {
  static override relationship = 'comments'
}

class Article extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override slug          = 'articles'
  static override relations() { return [Comment] }
}

class Settings extends Global {
  static override label = 'Settings'
  static override slug  = 'site-settings' // 'settings' is reserved (System Settings route)
}

class Analytics extends Page {
  static override slug  = 'analytics'
  static override label = 'Analytics'
}

class ReportsCluster extends Cluster {
  static override slug = 'reports'
  static override label = 'Reports'
}

class ClusteredPage extends Page {
  static override slug    = 'overview'
  static override label   = 'Overview'
  static override cluster = ReportsCluster
}

// ─── Fake req/res ─────────────────────────────────────────────

interface FakeRes {
  statusCode: number
  sentBody?:  unknown
  redirectedTo?: string
  status(code: number): FakeRes
  send(body: unknown): FakeRes
  json(body: unknown): FakeRes
  redirect(url: string, code?: number): FakeRes
  header(name: string, value: string): FakeRes
}
function fakeRes(): FakeRes {
  const r: FakeRes = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    send(body)   { this.sentBody = body;   return this },
    json(body)   { this.sentBody = body;   return this },
    redirect(url, code) { this.redirectedTo = url; this.statusCode = code ?? 302; return this },
    header()     { return this },
  }
  return r
}
function fakeReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    params: {},
    body:   null,
    query:  {},
    raw:    {},
    headers: {},
    ...overrides,
  }
}

/**
 * Run a route's middleware chain *without* its handler. Returns whether
 * the chain reached the handler slot (`reached: true`) or short-circuited
 * (`reached: false`), plus the response captured during the chain. This
 * is the tightest unit shape for "did the guard fire" — invoking the
 * handler would require fully-mocked record loaders / form pipelines for
 * the 30+ documented routes, which isn't what this test is for.
 */
async function runMiddleware(
  route: RouteDefinition,
  req:   Record<string, unknown>,
): Promise<{ reached: boolean; res: FakeRes }> {
  const res = fakeRes()
  let reached = true
  for (const mw of route.middleware as MiddlewareHandler[]) {
    let didCallNext = false
    const next = async () => { didCallNext = true }
     
    await mw(req as any, res as any, next)
    if (!didCallNext) {
      reached = false
      break
    }
  }
  return { reached, res }
}

// Build a panel that touches every register* branch — resources (with
// relations + soft-deletes), globals, custom pages, clusters, theme
// editor, database notifications. The test then iterates router.list()
// so coverage stays exhaustive even if new routes ship.
function buildFullPanel(guard?: (req: unknown) => boolean | Promise<boolean>): Pilotiq {
  let p = Pilotiq.make('admin')
    .path('/admin')
    .resources([Article])
    .globals([Settings])
    .pages([Analytics, ClusteredPage])
    .clusters([ReportsCluster])
    .databaseNotifications()
    .use(themeEditor())
  if (guard) p = p.guard(guard)
  return p
}

// ─── Tests ────────────────────────────────────────────────────

describe('Pilotiq.guard() — router.group() middleware', () => {
  it('attaches the guard middleware to every core panel route', () => {
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel(() => false))
    const routes = router.list()
    // Sanity: the panel above is rich enough to register many routes.
    // Hard-fail under 20 routes to catch a future split that skips one
    // of the register* branches by accident.
    assert.ok(routes.length > 20, `expected >20 routes, got ${routes.length}`)
    for (const r of routes) {
      assert.ok(
        r.middleware.length >= 1,
        `route ${r.method} ${r.path} has no middleware — guard is missing`,
      )
    }
  })

  it('every core route 401s when guard returns false', async () => {
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel(() => false))
    const routes = router.list()
    for (const r of routes) {
      const { reached, res } = await runMiddleware(r, fakeReq())
      assert.equal(
        reached, false,
        `route ${r.method} ${r.path} reached its handler despite guard=false`,
      )
      assert.equal(
        res.statusCode, 401,
        `route ${r.method} ${r.path} returned ${res.statusCode}, expected 401`,
      )
    }
  })

  it('every core route reaches its handler when guard returns true', async () => {
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel(() => true))
    const routes = router.list()
    for (const r of routes) {
      const { reached, res } = await runMiddleware(r, fakeReq())
      assert.equal(
        reached, true,
        `route ${r.method} ${r.path} did not reach its handler when guard=true ` +
        `(short-circuited with status ${res.statusCode})`,
      )
    }
  })

  it('skips the guard check entirely when no Pilotiq.guard() is configured', async () => {
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel(undefined))
    const routes = router.list()
    // The middleware is still attached (the group runs unconditionally),
    // but the guard branch inside it short-circuits when cfg.guard is
    // undefined — every chain still calls next().
    for (const r of routes) {
      const { reached } = await runMiddleware(r, fakeReq())
      assert.equal(
        reached, true,
        `route ${r.method} ${r.path} short-circuited even though no guard was configured`,
      )
    }
  })

  it('returns JSON 401 envelope when client sends Accept: application/json', async () => {
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel(() => false))
    const route = router.list().find(r => r.path === '/admin')
    assert.ok(route, 'dashboard route missing')
    const { res } = await runMiddleware(route, fakeReq({ headers: { accept: 'application/json' } }))
    assert.equal(res.statusCode, 401)
    assert.deepEqual(res.sentBody, { ok: false, error: 'Unauthorized' })
  })

  it('returns plain 401 body when no JSON Accept header', async () => {
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel(() => false))
    const route = router.list().find(r => r.path === '/admin')
    assert.ok(route, 'dashboard route missing')
    const { res } = await runMiddleware(route, fakeReq())
    assert.equal(res.statusCode, 401)
    assert.equal(res.sentBody, 'Unauthorized')
  })

  it('guard(fn, { redirectTo }) — browser loads 302 to the login page with ?redirect=', async () => {
    const router = new Router()
    const panel = Pilotiq.make('admin')
      .path('/admin')
      .resources([Article])
      .guard(() => false, { redirectTo: '/login' })
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/articles')
    assert.ok(route, 'articles list route missing')
    const { reached, res } = await runMiddleware(route, fakeReq({ url: '/admin/articles' }))
    assert.equal(reached, false)
    assert.equal(res.statusCode, 302)
    assert.equal(res.redirectedTo, '/login?redirect=%2Fadmin%2Farticles')
  })

  it('guard(fn, { redirectTo }) — SPA pageContext fetches get the Vike redirect envelope', async () => {
    const router = new Router()
    const panel = Pilotiq.make('admin')
      .path('/admin')
      .resources([Article])
      .guard(() => false, { redirectTo: '/login' })
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/articles')
    assert.ok(route, 'articles list route missing')
    const { res } = await runMiddleware(route, fakeReq({
      headers: { 'x-rudder-original-url': '/admin/articles/index.pageContext.json' },
    }))
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.sentBody, {
      _abortCall:   'redirect("/login?redirect=%2Fadmin%2Farticles")',
      _urlRedirect: { url: '/login?redirect=%2Fadmin%2Farticles', statusCode: 302 },
    })
  })

  it('guard(fn, { redirectTo }) — JSON fetches still 401 but carry the target', async () => {
    const router = new Router()
    const panel = Pilotiq.make('admin')
      .path('/admin')
      .resources([Article])
      .guard(() => false, { redirectTo: '/login' })
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/articles')
    assert.ok(route, 'articles list route missing')
    const { res } = await runMiddleware(route, fakeReq({
      url: '/admin/articles',
      headers: { accept: 'application/json' },
    }))
    assert.equal(res.statusCode, 401)
    assert.deepEqual(res.sentBody, {
      ok: false, error: 'Unauthorized', redirect: '/login?redirect=%2Fadmin%2Farticles',
    })
  })

  it('guard(fn, { redirectTo }) — skips ?redirect= when the target already has a query', async () => {
    const router = new Router()
    const panel = Pilotiq.make('admin')
      .path('/admin')
      .resources([Article])
      .guard(() => false, { redirectTo: '/login?demo=1' })
    registerPilotiqRoutes(router, panel)
    const route = router.list().find(r => r.path === '/admin/articles')
    assert.ok(route, 'articles list route missing')
    const { res } = await runMiddleware(route, fakeReq({ url: '/admin/articles' }))
    assert.equal(res.statusCode, 302)
    assert.equal(res.redirectedTo, '/login?demo=1')
  })

  it('awaits async guard predicates', async () => {
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel(async (_req) => {
      await new Promise(r => setTimeout(r, 1))
      return false
    }))
    const route = router.list().find(r => r.path === '/admin/articles')
    assert.ok(route, 'articles list route missing')
    const { reached, res } = await runMiddleware(route, fakeReq())
    assert.equal(reached, false)
    assert.equal(res.statusCode, 401)
  })

  it('forwards the request object to the guard predicate', async () => {
    let seen: unknown = undefined
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel((req) => { seen = req; return true }))
    const route = router.list().find(r => r.path === '/admin/articles')
    assert.ok(route, 'articles list route missing')
    const req = fakeReq({ tag: 'abc' })
    await runMiddleware(route, req)
    assert.equal((seen as { tag?: string }).tag, 'abc')
  })

  it('covers _uploads — the original inline-guard site', async () => {
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel(() => false))
    const route = router.list().find(r => r.path === '/admin/_uploads')
    assert.ok(route, '_uploads route missing')
    const { reached, res } = await runMiddleware(route, fakeReq())
    // The inline `if (cfg.guard && !await cfg.guard(req))` block inside
    // handleUploadRequest was removed once the group middleware took
    // over — this guarantees the route is now actually 401'd by the
    // group middleware, not the inline check.
    assert.equal(reached, false)
    assert.equal(res.statusCode, 401)
  })

  it('covers relation manager + nested relation routes', async () => {
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel(() => false))
    const routes = router.list()
    // Relation list: GET /admin/articles/:id/comments
    const relList = routes.find(r => r.path === '/admin/articles/:id/comments' && r.method === 'GET')
    assert.ok(relList, 'relation list route missing')
    const { reached, res } = await runMiddleware(relList, fakeReq())
    assert.equal(reached, false)
    assert.equal(res.statusCode, 401)
  })

  it('covers cluster-prefixed routes', async () => {
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel(() => false))
    const routes = router.list()
    const clustered = routes.find(r => r.path === '/admin/reports/overview' && r.method === 'GET')
    assert.ok(clustered, 'clustered custom page route missing')
    const { reached, res } = await runMiddleware(clustered, fakeReq())
    assert.equal(reached, false)
    assert.equal(res.statusCode, 401)
  })

  it('covers theme editor routes', async () => {
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel(() => false))
    const routes = router.list()
    const themePages = [
      ['GET',    '/admin/theme'],
      ['GET',    '/admin/api/_theme'],
      ['PUT',    '/admin/api/_theme'],
      ['DELETE', '/admin/api/_theme'],
    ] as const
    for (const [method, path] of themePages) {
      const r = routes.find(x => x.method === method && x.path === path)
      assert.ok(r, `theme route ${method} ${path} missing`)
      const { reached, res } = await runMiddleware(r, fakeReq())
      assert.equal(reached, false, `${method} ${path}`)
      assert.equal(res.statusCode, 401, `${method} ${path}`)
    }
  })

  it('covers _notifications endpoints', async () => {
    const router = new Router()
    registerPilotiqRoutes(router, buildFullPanel(() => false))
    const routes = router.list()
    const notif = [
      ['GET',  '/admin/_notifications'],
      ['POST', '/admin/_notifications/:id/read'],
      ['POST', '/admin/_notifications/:id/unread'],
      ['POST', '/admin/_notifications/read-all'],
    ] as const
    for (const [method, path] of notif) {
      const r = routes.find(x => x.method === method && x.path === path)
      assert.ok(r, `notifications route ${method} ${path} missing`)
      const { reached, res } = await runMiddleware(r, fakeReq())
      assert.equal(reached, false, `${method} ${path}`)
      assert.equal(res.statusCode, 401, `${method} ${path}`)
    }
  })
})
