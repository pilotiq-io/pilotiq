/**
 * Plan #10 — authorization.
 *
 * Covers:
 *  - `Pilotiq.user(fn)` resolver + `resolveUser(req)` helper.
 *  - `Resource` / `Global` / `Page` `canX` defaults + override behavior.
 *  - Auto-attached visibility on `Action.create / edit / view / delete`
 *    factories (consults `R.canX`, opts out via explicit `.visible(...)`).
 *  - `panelInfo()` nav-tree filter — items dropped when `canAccess`
 *    returns false.
 *  - 403 forbidden response shape (HTML vs JSON).
 *  - Async `Action.evaluate()` — promise rules, throwing rules.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Pilotiq } from './Pilotiq.js'
import { Resource } from './Resource.js'
import { Global } from './Global.js'
import { Page } from './Page.js'
import { Action } from './actions/Action.js'
import { panelInfo } from './pageData.js'
import { _resetResolverRegistry } from './schema/resolveSchema.js'
import { Router } from '@rudderjs/router'
import { registerPilotiqRoutes } from './routes.js'

beforeEach(() => _resetResolverRegistry())

// ─── Pilotiq.user(fn) resolver ────────────────────────────────

describe('Pilotiq.user(fn)', () => {
  it('resolveUser returns null when no resolver is configured', async () => {
    const p = Pilotiq.make('admin')
    assert.equal(await p.resolveUser({}), null)
  })

  it('forwards the request and returns the resolved user', async () => {
    const p = Pilotiq.make('admin').user((req) => ({ id: '1', from: (req as { tag: string }).tag }))
    const out = await p.resolveUser({ tag: 'req-x' })
    assert.deepEqual(out, { id: '1', from: 'req-x' })
  })

  it('awaits async resolvers', async () => {
    const p = Pilotiq.make('admin').user(async () => ({ id: '7' }))
    assert.deepEqual(await p.resolveUser({}), { id: '7' })
  })

  it('swallows resolver throws and returns null (fail closed)', async () => {
    const p = Pilotiq.make('admin').user(() => { throw new Error('auth down') })
    assert.equal(await p.resolveUser({}), null)
  })

  it('coerces returned undefined to null', async () => {
    const p = Pilotiq.make('admin').user(() => undefined)
    assert.equal(await p.resolveUser({}), null)
  })
})

// ─── Resource / Global / Page can* defaults ───────────────────

describe('Resource policy defaults', () => {
  it('all six predicates default to true', async () => {
    class R extends Resource {
      static override label = 'Things'
    }
    assert.equal(await R.canAccess(null),   true)
    assert.equal(await R.canViewAny(null),  true)
    assert.equal(await R.canView(null, {}), true)
    assert.equal(await R.canCreate(null),   true)
    assert.equal(await R.canEdit(null, {}), true)
    assert.equal(await R.canDelete(null, {}), true)
  })

  it('override checks the user', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override async canDelete(user: unknown, _record: unknown) {
        return (user as { role?: string })?.role === 'admin'
      }
    }
    assert.equal(await R.canDelete({ role: 'admin' }, {}), true)
    assert.equal(await R.canDelete({ role: 'editor' }, {}), false)
    assert.equal(await R.canDelete(null, {}), false)
  })
})

describe('Global policy defaults', () => {
  it('exposes only canAccess + canView + canEdit', async () => {
    class G extends Global {
      static override label = 'Site'
    }
    assert.equal(await G.canAccess(null),   true)
    assert.equal(await G.canView(null, {}), true)
    assert.equal(await G.canEdit(null, {}), true)
    // Globals don't expose canViewAny / canCreate / canDelete — these
    // are not on the static interface.
    assert.equal((G as unknown as { canCreate?: unknown }).canCreate, undefined)
    assert.equal((G as unknown as { canDelete?: unknown }).canDelete, undefined)
  })
})

describe('Page policy default', () => {
  it('exposes a canAccess gate that defaults to true', async () => {
    class P extends Page {}
    assert.equal(await P.canAccess(null), true)
  })

  it('override gates by user', async () => {
    class P extends Page {
      static override async canAccess(user: unknown) {
        return (user as { role?: string })?.role === 'admin'
      }
    }
    assert.equal(await P.canAccess({ role: 'admin' }), true)
    assert.equal(await P.canAccess({ role: 'guest' }), false)
  })
})

// ─── Action factory auto-visibility ───────────────────────────

describe('Action factory auto-visibility', () => {
  it('Action.create is hidden when R.canCreate returns false', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
      static override async canCreate() { return false }
    }
    const a = Action.create(R, '/admin')
    const result = await a.evaluate({ user: null })
    assert.equal(result.visible, false)
  })

  it('Action.edit consults R.canEdit with user + record', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override async canEdit(_user: unknown, record: unknown) {
        return (record as { ownerId?: string })?.ownerId === 'me'
      }
    }
    const a = Action.edit(R, '/admin')
    assert.equal((await a.evaluate({ record: { ownerId: 'me'    } })).visible, true)
    assert.equal((await a.evaluate({ record: { ownerId: 'other' } })).visible, false)
  })

  it('Action.delete consults R.canDelete', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
      static override async canDelete(user: unknown) {
        return (user as { admin?: boolean })?.admin === true
      }
    }
    const a = Action.delete(R, '/admin')
    assert.equal((await a.evaluate({ user: { admin: true  } })).visible, true)
    assert.equal((await a.evaluate({ user: { admin: false } })).visible, false)
  })

  it('Action.view consults R.canView', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override async canView(_user: unknown, record: unknown) {
        return (record as { published?: boolean })?.published === true
      }
    }
    const a = Action.view(R, '/admin')
    assert.equal((await a.evaluate({ record: { published: true  } })).visible, true)
    assert.equal((await a.evaluate({ record: { published: false } })).visible, false)
  })

  it('explicit .visible(true) after the factory wins', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
      static override async canDelete() { return false }
    }
    const a = Action.delete(R, '/admin').visible(true)
    assert.equal((await a.evaluate()).visible, true)
  })

  it('factories carry hasVisibilityRules() = true', () => {
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
    }
    assert.equal(Action.create(R, '/x').hasVisibilityRules(), true)
    assert.equal(Action.edit(R,   '/x').hasVisibilityRules(), true)
    assert.equal(Action.view(R,   '/x').hasVisibilityRules(), true)
    assert.equal(Action.delete(R, '/x').hasVisibilityRules(), true)
  })

  it('factory visibility on a Resource without overrides defaults to allowed', async () => {
    // No override → static can* returns true → factory action visible.
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
    }
    assert.equal((await Action.create(R, '/x').evaluate({ user: null })).visible, true)
    assert.equal((await Action.edit(R,   '/x').evaluate({ user: null, record: {} })).visible, true)
  })
})

// ─── Nav-tree filter (panelInfo) ──────────────────────────────

describe('panelInfo navigation filter', () => {
  it('drops resources whose canAccess returns false', async () => {
    class Allowed extends Resource {
      static override label = 'Allowed'
    }
    class Denied extends Resource {
      static override label = 'Denied'
      static override async canAccess() { return false }
    }
    const p = Pilotiq.make('admin').resources([Allowed, Denied])
    const info = await panelInfo(p, {})
    const names = info.navigation.map(n => n.name)
    assert.ok(names.includes('Allowed'),  'Allowed resource should appear in nav')
    assert.ok(!names.includes('Denied'),  'Denied resource should not appear in nav')
  })

  it('threads the user into canAccess via the resolver', async () => {
    const seen: unknown[] = []
    class R extends Resource {
      static override label = 'Articles'
      static override async canAccess(user: unknown) {
        seen.push(user)
        return Boolean((user as { admin?: boolean })?.admin)
      }
    }
    const adminPanel = Pilotiq.make('admin')
      .resources([R])
      .user(req => (req as { user?: unknown })?.user ?? null)

    const adminNav = await panelInfo(adminPanel, { user: { admin: true } })
    assert.equal(adminNav.navigation.length, 1)

    const guestNav = await panelInfo(adminPanel, { user: { admin: false } })
    assert.equal(guestNav.navigation.length, 0)

    assert.deepEqual(seen, [{ admin: true }, { admin: false }])
  })

  it('drops globals + custom pages on canAccess fail', async () => {
    class G extends Global {
      static override label = 'Settings'
      static override async canAccess() { return false }
    }
    class P extends Page {
      static override slug = 'analytics'
      static override async canAccess() { return false }
    }
    const p = Pilotiq.make('admin').globals([G]).pages([P])
    const info = await panelInfo(p)
    assert.equal(info.navigation.length, 0)
  })

  it('a throwing canAccess fails closed (item dropped)', async () => {
    class R extends Resource {
      static override label = 'Boom'
      static override async canAccess(): Promise<boolean> { throw new Error('boom') }
    }
    const p = Pilotiq.make('admin').resources([R])
    const info = await panelInfo(p)
    assert.equal(info.navigation.length, 0)
  })
})

// ─── Async Action.evaluate — already covered in Action.test.ts;
// these focus on the policy-style interaction.

describe('Action.evaluate async with policy', () => {
  it('a Promise<boolean> visibility rule resolves correctly', async () => {
    const a = Action.make('x').visible(async () => true)
    assert.equal((await a.evaluate()).visible, true)
  })

  it('a throwing visibility rule fails closed', async () => {
    const a = Action.make('x').visible(async () => { throw new Error('x') })
    assert.equal((await a.evaluate()).visible, false)
  })
})

// ─── Routes / 403 wiring ──────────────────────────────────────

interface FakeRes {
  statusCode: number
  sentBody?:  unknown
  status(code: number): FakeRes
  send(body: unknown): FakeRes
  json(body: unknown): FakeRes
  redirect(url: string, code?: number): FakeRes
}
// Cast to any when passing into route handlers: AppResponse demands
// `header` + `raw`, neither of which the policy gate touches.
function fakeRes(): any {
  const r: FakeRes = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    send(body)   { this.sentBody = body;   return this },
    json(body)   { this.sentBody = body;   return this },
    redirect()   { return this },
  }
  return r
}
// Cast to any: routes.ts handler signatures want a full AppRequest,
// but for policy-check tests we only need a tiny subset. Same pattern
// as routes.test.ts.
function fakeReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: {},
    body:   null,
    query:  {},
    raw:    {},
    headers: {},
    ...overrides,
  }
}

function getRoute(router: Router, method: string, path: string) {
  const route = router.list().find(r => r.method === method && r.path === path)
  if (!route) throw new Error(`route not found: ${method} ${path}`)
  return route
}

describe('routes 403 forbidden wiring', () => {
  it('GET /:slug returns 403 JSON when canAccess returns false', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
      static override slug = 'articles'
      static override async canAccess() { return false }
    }
    const router = new Router()
    registerPilotiqRoutes(router, Pilotiq.make('admin').path('/admin').resources([R]))
    const route = getRoute(router, 'GET', '/admin/articles')

    const res = fakeRes()
    await route.handler(fakeReq({ headers: { accept: 'application/json' } }), res)
    assert.equal(res.statusCode, 403)
    assert.deepEqual(res.sentBody, { ok: false, error: 'Forbidden' })
  })

  it('GET /:slug returns 403 HTML when no JSON Accept header', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
      static override slug = 'articles'
      static override async canAccess() { return false }
    }
    const router = new Router()
    registerPilotiqRoutes(router, Pilotiq.make('admin').path('/admin').resources([R]))
    const route = getRoute(router, 'GET', '/admin/articles')

    const res = fakeRes()
    await route.handler(fakeReq(), res)
    assert.equal(res.statusCode, 403)
    // Styled minimal page, not a bare 'Forbidden' string.
    assert.match(String(res.sentBody), /403/)
    assert.match(String(res.sentBody), /<!DOCTYPE html>/)
  })

  it('GET /:slug returns the Vike abort envelope for pageContext fetches', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
      static override slug = 'articles'
      static override async canAccess() { return false }
    }
    const router = new Router()
    registerPilotiqRoutes(router, Pilotiq.make('admin').path('/admin').resources([R]))
    const route = getRoute(router, 'GET', '/admin/articles')

    // server-hono rewrites /x/index.pageContext.json → /x and stashes the
    // original URL on this header; pilotiq's policy gate must answer with
    // the abort envelope or Vike's client router crashes on Content-Type.
    const res = fakeRes()
    await route.handler(fakeReq({
      header: (n: string) => n === 'x-rudder-original-url'
        ? 'http://x/admin/articles/index.pageContext.json'
        : undefined,
    }), res)
    assert.equal(res.statusCode, 403)
    assert.deepEqual(res.sentBody, {
      abortStatusCode: 403,
      _abortCall: 'render(403)',
      abortReason: 'Forbidden',
    })
  })

  it('GET /:slug returns 403 when canViewAny returns false', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
      static override slug = 'articles'
      static override async canViewAny() { return false }
    }
    const router = new Router()
    registerPilotiqRoutes(router, Pilotiq.make('admin').path('/admin').resources([R]))
    const route = getRoute(router, 'GET', '/admin/articles')

    const res = fakeRes()
    await route.handler(fakeReq({ headers: { accept: 'application/json' } }), res)
    assert.equal(res.statusCode, 403)
  })

  it('POST :id/delete returns 403 when canDelete returns false', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
      static override slug = 'articles'
      static override async canDelete(_user: unknown, _record: unknown) { return false }
    }
    const router = new Router()
    registerPilotiqRoutes(router, Pilotiq.make('admin').path('/admin').resources([R]))
    const route = getRoute(router, 'POST', '/admin/articles/:id/delete')

    const res = fakeRes()
    await route.handler(fakeReq({
      params:  { id: '42' },
      headers: { accept: 'application/json' },
    }), res)
    assert.equal(res.statusCode, 403)
  })

  it('GET :id/edit returns 403 when canEdit returns false', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
      static override slug = 'articles'
      static override async canEdit(_user: unknown, _record: unknown) { return false }
    }
    const router = new Router()
    registerPilotiqRoutes(router, Pilotiq.make('admin').path('/admin').resources([R]))
    const route = getRoute(router, 'GET', '/admin/articles/:id/edit')

    const res = fakeRes()
    await route.handler(fakeReq({
      params:  { id: '42' },
      headers: { accept: 'application/json' },
    }), res)
    assert.equal(res.statusCode, 403)
  })

  it('GET /:slug/create returns 403 when canCreate returns false', async () => {
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
      static override slug = 'articles'
      static override async canCreate() { return false }
    }
    const router = new Router()
    registerPilotiqRoutes(router, Pilotiq.make('admin').path('/admin').resources([R]))
    const route = getRoute(router, 'GET', '/admin/articles/create')

    const res = fakeRes()
    await route.handler(fakeReq({ headers: { accept: 'application/json' } }), res)
    assert.equal(res.statusCode, 403)
  })

  it('predicates receive the user from Pilotiq.user(req => …)', async () => {
    let seenUser: unknown = undefined
    class R extends Resource {
      static override label = 'Articles'
      static override labelSingular = 'Article'
      static override slug = 'articles'
      static override async canAccess(user: unknown) {
        seenUser = user
        return (user as { ok?: boolean })?.ok === true
      }
    }
    const panel = Pilotiq.make('admin').path('/admin').resources([R])
      .user(() => ({ ok: true, name: 'Sam' }))
    const router = new Router()
    registerPilotiqRoutes(router, panel)
    const route = getRoute(router, 'GET', '/admin/articles')

    const res = fakeRes()
    await route.handler(fakeReq(), res)
    // No 403 — handler proceeded past the gate; that's our success signal.
    assert.notEqual(res.statusCode, 403)
    assert.deepEqual(seenUser, { ok: true, name: 'Sam' })
  })

  it('Global edit returns 403 when canAccess fails', async () => {
    class G extends Global {
      static override label = 'Settings'
      static override slug = 'settings'
      static override async canAccess() { return false }
    }
    const panel = Pilotiq.make('admin').path('/admin').globals([G])
    const router = new Router()
    registerPilotiqRoutes(router, panel)
    const route = getRoute(router, 'GET', '/admin/settings')

    const res = fakeRes()
    await route.handler(fakeReq({ headers: { accept: 'application/json' } }), res)
    assert.equal(res.statusCode, 403)
  })

  it('custom Page returns 403 when canAccess fails', async () => {
    class P extends Page {
      static override slug = 'analytics'
      static override async canAccess() { return false }
    }
    const panel = Pilotiq.make('admin').path('/admin').pages([P])
    const router = new Router()
    registerPilotiqRoutes(router, panel)
    const route = getRoute(router, 'GET', '/admin/analytics')

    const res = fakeRes()
    await route.handler(fakeReq({ headers: { accept: 'application/json' } }), res)
    assert.equal(res.statusCode, 403)
  })
})
