import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Router } from '@rudderjs/router'
import { Pilotiq, type PilotiqPlugin } from './Pilotiq.js'
import { registerPilotiqRoutes } from './routes.js'

describe('Pilotiq plugins', () => {
  it('.use() invokes register() with the panel and records the plugin', () => {
    const seen: Array<{ name: string; same: boolean }> = []
    const p1: PilotiqPlugin = {
      name: 'p1',
      register(panel) { seen.push({ name: 'p1', same: panel instanceof Pilotiq }) },
    }
    const panel = Pilotiq.make('Admin').use(p1)
    assert.deepEqual(seen, [{ name: 'p1', same: true }])
    const installed = panel.getPlugins()
    assert.equal(installed.length, 1)
    assert.equal(installed[0]?.name, 'p1')
  })

  it('.plugins([…]) runs each plugin in array order', () => {
    const order: string[] = []
    const make = (name: string): PilotiqPlugin => ({
      name,
      register() { order.push(name) },
    })
    const panel = Pilotiq.make('Admin').plugins([make('a'), make('b'), make('c')])
    assert.deepEqual(order, ['a', 'b', 'c'])
    assert.deepEqual(panel.getPlugins().map((p) => p.name), ['a', 'b', 'c'])
  })

  it('.plugins([]) is a no-op', () => {
    const panel = Pilotiq.make('Admin').plugins([])
    assert.equal(panel.getPlugins().length, 0)
  })

  it('.plugins([…]) composes with .use()', () => {
    const log: string[] = []
    const mk = (n: string): PilotiqPlugin => ({ name: n, register() { log.push(n) } })
    const panel = Pilotiq.make('Admin')
      .use(mk('first'))
      .plugins([mk('second'), mk('third')])
      .use(mk('fourth'))
    assert.deepEqual(log, ['first', 'second', 'third', 'fourth'])
    assert.deepEqual(panel.getPlugins().map((p) => p.name), [
      'first', 'second', 'third', 'fourth',
    ])
  })
})

// Minimal stub Router — `registerPilotiqRoutes` only calls `get` / `post`
// / `put` / `delete` on the router; route bodies don't fire here. The
// hook tests don't care about the route surface, only that the plugin's
// `registerRoutes` callback fires with the right arguments.
function makeStubRouter(): Router & { _calls: Array<{ method: string; path: string }> } {
  const calls: Array<{ method: string; path: string }> = []
  const noop = (path: string): void => { calls.push({ method: 'unknown', path }) }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stub: any = {
    get:    (path: string) => noop(path),
    post:   (path: string) => noop(path),
    put:    (path: string) => noop(path),
    delete: (path: string) => noop(path),
    patch:  (path: string) => noop(path),
    // `router.group(opts, fn)` runs `fn()` synchronously inside its
    // scope. Stub mirrors that — `Pilotiq.guard()` middleware doesn't
    // touch the stub, only `fn()` matters.
    group:  (_opts: unknown, fn: () => void) => { fn() },
    _calls: calls,
  }
  return stub
}

describe('PilotiqPlugin.registerRoutes hook', () => {
  it('fires once per plugin during registerPilotiqRoutes, in registration order', () => {
    const order: string[] = []
    const router = makeStubRouter()
    const mk = (n: string): PilotiqPlugin => ({
      name: n,
      register() { /* no-op */ },
      registerRoutes(r, p) {
        assert.equal(r, router)
        assert.ok(p instanceof Pilotiq)
        order.push(n)
      },
    })
    const panel = Pilotiq.make('Admin').plugins([mk('a'), mk('b'), mk('c')])
    registerPilotiqRoutes(router, panel)
    assert.deepEqual(order, ['a', 'b', 'c'])
  })

  it('skips plugins that do not implement the hook', () => {
    const order: string[] = []
    const router = makeStubRouter()
    const withHook: PilotiqPlugin = {
      name: 'with-hook',
      register() { /* no-op */ },
      registerRoutes() { order.push('with-hook') },
    }
    const withoutHook: PilotiqPlugin = {
      name: 'without-hook',
      register() { /* no-op */ },
    }
    const panel = Pilotiq.make('Admin').plugins([withoutHook, withHook])
    // No throw expected — the optional hook is skipped on plugins that
    // omit it, so a "config-only" plugin remains a one-method object.
    registerPilotiqRoutes(router, panel)
    assert.deepEqual(order, ['with-hook'])
  })

  it('runs after core routes — at least one core call has fired before the first hook', () => {
    const router = makeStubRouter()
    let coreCallsAtHookTime = -1
    const probe: PilotiqPlugin = {
      name: 'probe',
      register() { /* no-op */ },
      registerRoutes() {
        coreCallsAtHookTime = router._calls.length
      },
    }
    // The dashboard route alone (`GET ${base}`) registers unconditionally
    // — so any panel produces at least one core router call before the
    // plugin hooks fire. Empty-resources panel is enough to cover this.
    const panel = Pilotiq.make('Admin').plugins([probe])
    registerPilotiqRoutes(router, panel)
    assert.ok(coreCallsAtHookTime > 0,
      `expected core routes to register before the hook, got ${coreCallsAtHookTime} calls`)
  })
})
