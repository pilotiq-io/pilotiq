import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  ServerDataElement,
  isServerDataElement,
  stampServerDataMeta,
} from './ServerDataElement.js'
import { Element } from './Element.js'
import { resolveSchema } from './resolveSchema.js'

class FakeWidget extends ServerDataElement {
  private _payload: unknown
  constructor(id: string | undefined, payload: unknown) {
    super()
    if (id) this._id = id
    this._payload = payload
  }
  getType() { return 'fake-widget' }
  toMeta() { return { type: 'fake-widget' as const, label: 'fake' } }
  async resolveServerData() { return this._payload }
}

class PlainElement extends Element {
  getType() { return 'plain' }
  toMeta() { return { type: 'plain' as const } }
}

describe('ServerDataElement', () => {
  describe('identity', () => {
    it('falls back to constructor name when no id was set', () => {
      class Contributions extends ServerDataElement {
        getType() { return 'view' }
        toMeta() { return { type: 'view' as const } }
        async resolveServerData() { return null }
      }
      const w = new Contributions()
      assert.equal(w.getId(), 'Contributions')
    })

    it('uses the explicit id when set via constructor', () => {
      const w = new FakeWidget('posts-chart', null)
      assert.equal(w.getId(), 'posts-chart')
    })

    it('id() setter overrides any inferred id', () => {
      class Foo extends ServerDataElement {
        getType() { return 'view' }
        toMeta() { return { type: 'view' as const } }
        async resolveServerData() { return null }
      }
      const w = new Foo().id('custom-id')
      assert.equal(w.getId(), 'custom-id')
    })
  })

  describe('flags', () => {
    it('default isLazy() is true', () => {
      const w = new FakeWidget('a', null)
      assert.equal(w.isLazy(), true)
    })

    it('lazy(false) opts out', () => {
      const w = new FakeWidget('a', null).lazy(false)
      assert.equal(w.isLazy(), false)
    })

    it('lazy() with no arg defaults to true', () => {
      const w = new FakeWidget('a', null).lazy(false).lazy()
      assert.equal(w.isLazy(), true)
    })

    it('poll(seconds) stores positive numbers', () => {
      const w = new FakeWidget('a', null).poll(30)
      assert.equal(w.getPoll(), 30)
    })

    it('poll() ignores zero / negative / non-finite', () => {
      const w = new FakeWidget('a', null).poll(0).poll(-5).poll(NaN)
      assert.equal(w.getPoll(), undefined)
    })
  })

  describe('isServerDataElement', () => {
    it('returns true for ServerDataElement subclasses', () => {
      assert.equal(isServerDataElement(new FakeWidget('a', null)), true)
    })

    it('returns false for plain Element subclasses', () => {
      assert.equal(isServerDataElement(new PlainElement()), false)
    })
  })

  describe('stampServerDataMeta + resolveSchema integration', () => {
    it('stamps serverData / id / lazy on the meta during schema resolve', async () => {
      const w = new FakeWidget('my-id', null)
      const [meta] = await resolveSchema([w])
      assert.equal(meta!['serverData'], true)
      assert.equal(meta!['id'], 'my-id')
      assert.equal(meta!['lazy'], true) // default
    })

    it('emits poll on the meta when set', async () => {
      const w = new FakeWidget('my-id', null).poll(60)
      const [meta] = await resolveSchema([w])
      assert.equal(meta!['poll'], 60)
    })

    it('emits lazy: false explicitly when lazy(false)', async () => {
      const w = new FakeWidget('my-id', null).lazy(false)
      const [meta] = await resolveSchema([w])
      assert.equal(meta!['lazy'], false)
    })

    it('preserves the subclass toMeta() surface', async () => {
      const w = new FakeWidget('my-id', null)
      const [meta] = await resolveSchema([w])
      assert.equal(meta!['label'], 'fake')
      assert.equal(meta!.type, 'fake-widget')
    })

    it('does NOT stamp on non-ServerDataElement elements', async () => {
      const [meta] = await resolveSchema([new PlainElement()])
      assert.equal(meta!['serverData'], undefined)
      assert.equal(meta!['id'], undefined)
    })
  })

  describe('stampServerDataMeta direct call', () => {
    it('mutates the meta in place', () => {
      const w = new FakeWidget('foo', null).poll(15)
      const meta: Record<string, unknown> & { type: string } = { type: 'fake-widget' }
      stampServerDataMeta(w, meta)
      assert.equal(meta['serverData'], true)
      assert.equal(meta['id'], 'foo')
      assert.equal(meta['poll'], 15)
      assert.equal(meta['lazy'], true)
    })
  })
})
