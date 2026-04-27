import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Action } from '../actions/Action.js'
import { Card } from '../schema/Card.js'
import { Section } from '../schema/Section.js'
import { Table } from './Table.js'
import { Column } from '../Column.js'
import {
  findActions, parseActionBody, dispatchAction,
} from './dispatchAction.js'

describe('findActions', () => {
  it('returns top-level actions', () => {
    const a = Action.make('publish').label('Publish')
    const b = Action.make('archive').label('Archive')
    assert.deepEqual(findActions([a, b]).map(x => x.name), ['publish', 'archive'])
  })

  it('walks containers in document order', () => {
    const tree = [
      Card.make('Header').schema([
        Action.make('one'),
        Section.make('Inner').schema([Action.make('two')]),
      ]),
      Action.make('three'),
    ]
    assert.deepEqual(findActions(tree).map(a => a.name), ['one', 'two', 'three'])
  })

  it('finds actions inside Table children', () => {
    const table = Table.make()
      .columns([Column.make('title')])
      .actions([Action.make('refresh')])
    assert.deepEqual(findActions([table]).map(a => a.name), ['refresh'])
  })
})

describe('parseActionBody', () => {
  it('returns empty ids and the rest as values when ids is absent', () => {
    const r = parseActionBody({ name: 'Hi', count: 3 })
    assert.deepEqual(r.ids, [])
    assert.deepEqual(r.values, { name: 'Hi', count: 3 })
  })

  it('parses an array of ids', () => {
    const r = parseActionBody({ ids: ['1', '2', '3'], extra: 'x' })
    assert.deepEqual(r.ids, ['1', '2', '3'])
    assert.deepEqual(r.values, { extra: 'x' })
  })

  it('coerces non-string id entries via String()', () => {
    const r = parseActionBody({ ids: [1, 2] })
    assert.deepEqual(r.ids, ['1', '2'])
  })

  it('treats a single string id as one entry', () => {
    const r = parseActionBody({ ids: 'abc' })
    assert.deepEqual(r.ids, ['abc'])
  })

  it('splits a CSV string into multiple ids', () => {
    const r = parseActionBody({ ids: 'a, b ,c' })
    assert.deepEqual(r.ids, ['a', 'b', 'c'])
  })

  it('strips _actionName from values', () => {
    const r = parseActionBody({ _actionName: 'foo', note: 'hi' })
    assert.deepEqual(r.values, { note: 'hi' })
  })
})

describe('dispatchAction', () => {
  it('returns ok:false when the action has no handler', async () => {
    const a = Action.make('x')
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /no handler/)
  })

  it('passes record (single id) through to the handler with resolveRecord', async () => {
    let captured: unknown
    const a = Action.make('detail').handler((ctx) => { captured = ctx.record })
    const result = await dispatchAction(
      a,
      { ids: ['7'], values: {} },
      async (id) => ({ id, title: `item-${id}` }),
    )
    assert.equal(result.ok, true)
    assert.deepEqual(captured, { id: '7', title: 'item-7' })
  })

  it('passes records (multi id) through to the handler with resolveRecord', async () => {
    let captured: unknown
    const a = Action.make('bulk').handler((ctx) => { captured = ctx.records })
    const result = await dispatchAction(
      a,
      { ids: ['1', '2'], values: {} },
      (id) => ({ id, n: Number(id) * 10 }),
    )
    assert.equal(result.ok, true)
    assert.deepEqual(captured, [{ id: '1', n: 10 }, { id: '2', n: 20 }])
  })

  it('falls back to bare {id} stubs when no resolveRecord is supplied', async () => {
    let captured: unknown
    const a = Action.make('stub').handler((ctx) => { captured = ctx.record })
    await dispatchAction(a, { ids: ['42'], values: {} })
    assert.deepEqual(captured, { id: '42' })
  })

  it('passes values + request through ctx', async () => {
    let captured: { values?: unknown; request?: unknown } = {}
    const a = Action.make('email').handler((ctx) => { captured = ctx })
    const fakeReq = { headers: {} }
    await dispatchAction(a, { ids: [], values: { subject: 'Hi' }, request: fakeReq })
    assert.deepEqual(captured.values, { subject: 'Hi' })
    assert.equal(captured.request, fakeReq)
  })

  it('honors a redirect returned by the handler', async () => {
    const a = Action.make('go').handler(() => ({ redirect: '/elsewhere' }))
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.deepEqual(result, { ok: true, redirect: '/elsewhere' })
  })

  it('catches handler errors and returns ok:false with the message', async () => {
    const a = Action.make('boom').handler(() => { throw new Error('kaboom') })
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error, 'kaboom')
  })

  it('async handler that returns void is treated as plain success', async () => {
    let ran = false
    const a = Action.make('noop').handler(async () => { ran = true })
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.deepEqual(result, { ok: true })
    assert.equal(ran, true)
  })
})

describe('Action.dispatchUrl + toMeta', () => {
  it('emits dispatchUrl in meta when set', () => {
    const meta = Action.make('publish').handler(() => {}).dispatchUrl('/x/_action/publish').toMeta()
    assert.equal(meta.dispatchUrl, '/x/_action/publish')
  })

  it('omits dispatchUrl when not set', () => {
    const meta = Action.make('plain').toMeta()
    assert.equal(meta.dispatchUrl, undefined)
  })
})
