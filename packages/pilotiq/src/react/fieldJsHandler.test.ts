import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'

import { runJsHandler, __clearJsHandlerCacheForTests } from './fieldJsHandler.js'

describe('runJsHandler — afterStateUpdatedJs runtime', () => {
  beforeEach(() => {
    __clearJsHandlerCacheForTests()
  })

  it('runs the body with $state bound to the changed value', () => {
    const calls: unknown[] = []
    const $set = (n: string, v: unknown) => calls.push([n, v])
    runJsHandler({
      body:      `$set('out', $state)`,
      fieldName: 'title',
      state:     'Hello',
      $get:      () => undefined,
      $set,
    })
    assert.deepEqual(calls, [['out', 'Hello']])
  })

  it('exposes $get for sibling reads', () => {
    const values: Record<string, unknown> = { price: 10, qty: 3 }
    const $get = (n: string) => values[n]
    const writes: unknown[] = []
    const $set = (n: string, v: unknown) => writes.push([n, v])
    runJsHandler({
      body:      `$set('total', Number($get('price')) * Number($state))`,
      fieldName: 'qty',
      state:     3,
      $get,
      $set,
    })
    assert.deepEqual(writes, [['total', 30]])
  })

  it('caches compiled handlers by string identity', () => {
    const body = `$set('out', $state)`
    const writes: unknown[] = []
    const $set = (n: string, v: unknown) => writes.push([n, v])

    // Run twice with the same body — should compile once.
    runJsHandler({ body, fieldName: 'a', state: 1, $get: () => undefined, $set })
    runJsHandler({ body, fieldName: 'a', state: 2, $get: () => undefined, $set })
    assert.equal(writes.length, 2)
  })

  it('catches throws inside the body without re-raising', () => {
    const errSpy = mock.method(console, 'error', () => {})
    try {
      runJsHandler({
        body:      `throw new Error('nope')`,
        fieldName: 'title',
        state:     'x',
        $get:      () => undefined,
        $set:      () => {},
      })
      assert.equal(errSpy.mock.callCount(), 1)
    } finally {
      errSpy.mock.restore()
    }
  })

  it('catches compile errors and skips eval on subsequent runs', () => {
    const errSpy = mock.method(console, 'error', () => {})
    try {
      const $set = mock.fn()
      // Same bad body run twice — should compile-error once, skip silently after.
      runJsHandler({ body: `not valid {`, fieldName: 'x', state: 1, $get: () => undefined, $set })
      runJsHandler({ body: `not valid {`, fieldName: 'x', state: 2, $get: () => undefined, $set })
      assert.equal(errSpy.mock.callCount(), 1, 'compile-error logged once')
      assert.equal($set.mock.callCount(), 0, 'never invoked $set')
    } finally {
      errSpy.mock.restore()
    }
  })

  it('runs in strict mode (no implicit global writes)', () => {
    const errSpy = mock.method(console, 'error', () => {})
    try {
      // In strict mode, assigning to an undeclared identifier throws.
      runJsHandler({
        body:      `accidentalGlobal = 1`,
        fieldName: 'x',
        state:     undefined,
        $get:      () => undefined,
        $set:      () => {},
      })
      assert.equal(errSpy.mock.callCount(), 1)
    } finally {
      errSpy.mock.restore()
    }
  })

  it('does not expose `this` to the body', () => {
    const writes: unknown[] = []
    const $set = (n: string, v: unknown) => writes.push([n, v])
    runJsHandler({
      body:      `$set('thisType', typeof this)`,
      fieldName: 'x',
      state:     undefined,
      $get:      () => undefined,
      $set,
    })
    // Function-constructor + strict mode → `this` is undefined.
    assert.deepEqual(writes, [['thisType', 'undefined']])
  })

  it('lets bodies use multi-line statements + helpers', () => {
    const writes: unknown[] = []
    const $set = (n: string, v: unknown) => writes.push([n, v])
    runJsHandler({
      body: `
        const slug = String($state).toLowerCase().replace(/\\s+/g, '-')
        $set('slug', slug)
      `,
      fieldName: 'title',
      state:     'Hello World',
      $get:      () => undefined,
      $set,
    })
    assert.deepEqual(writes, [['slug', 'hello-world']])
  })

  it('empty / whitespace body compiles to a no-op', () => {
    const writes: unknown[] = []
    const $set = (n: string, v: unknown) => writes.push([n, v])
    runJsHandler({
      body:      `   `,
      fieldName: 'x',
      state:     undefined,
      $get:      () => undefined,
      $set,
    })
    assert.equal(writes.length, 0)
  })
})

describe('runJsHandler — readNestedValue / writeNestedValue integration via $get/$set', () => {
  beforeEach(() => {
    __clearJsHandlerCacheForTests()
  })

  it('callers can route dotted-path access through $get/$set themselves', () => {
    // The handler doesn't itself know about dotted paths — the caller
    // (FormStateProvider.runFieldJs) wires that. This test just confirms
    // the contract: $get/$set are pure user-supplied functions.
    const values: Record<string, unknown> = { items: [{ qty: 2 }, { qty: 5 }] }
    const $get = (n: string): unknown => {
      if (n === 'items.0.qty') return (values.items as Array<{ qty: number }>)[0]!.qty
      return undefined
    }
    const writes: unknown[] = []
    const $set = (n: string, v: unknown): void => { writes.push([n, v]) }
    runJsHandler({
      body:      `$set('items.0.qty', Number($get('items.0.qty')) + Number($state))`,
      fieldName: 'increment',
      state:     1,
      $get,
      $set,
    })
    assert.deepEqual(writes, [['items.0.qty', 3]])
  })
})
