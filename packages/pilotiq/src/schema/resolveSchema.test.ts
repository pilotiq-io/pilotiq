import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Element, type ElementMeta } from './Element.js'
import {
  resolveSchema,
  registerResolver,
  _resetResolverRegistry,
} from './resolveSchema.js'
import { Text } from './Text.js'
import { Heading } from './Heading.js'
import { Card } from './Card.js'

beforeEach(() => _resetResolverRegistry())

// ─── Test fixtures ──────────────────────────────────────────

class TestLeaf extends Element {
  constructor(private label: string) { super() }
  getType() { return 'test-leaf' }
  toMeta() { return { type: 'test-leaf' as const, label: this.label } }
}

class TestContainer extends Element {
  constructor(children: Element[] = []) {
    super()
    this._children = children
  }
  getType() { return 'test-container' }
  toMeta() { return { type: 'test-container' as const } }
}

// ─── Tests ──────────────────────────────────────────────────

describe('resolveSchema', () => {
  describe('input shapes', () => {
    it('returns [] for undefined definition', async () => {
      assert.deepEqual(await resolveSchema(undefined), [])
    })

    it('returns [] for empty array', async () => {
      assert.deepEqual(await resolveSchema([]), [])
    })

    it('resolves a static array', async () => {
      const result = await resolveSchema([new TestLeaf('one')])
      assert.deepEqual(result, [{ type: 'test-leaf', label: 'one' }])
    })

    it('resolves an async factory function', async () => {
      const factory = async () => [new TestLeaf('async')]
      const result = await resolveSchema(factory)
      assert.deepEqual(result, [{ type: 'test-leaf', label: 'async' }])
    })

    it('passes context to the factory function', async () => {
      let received: unknown = null
      const factory = async (ctx: unknown) => { received = ctx; return [] }
      await resolveSchema(factory, { user: { name: 'test' } })
      assert.deepEqual(received, { user: { name: 'test' } })
    })
  })

  // ─── Container recursion ─────────────────────────────────

  describe('container recursion', () => {
    it('attaches resolved children to container meta as `children`', async () => {
      const tree = [new TestContainer([new TestLeaf('a'), new TestLeaf('b')])]
      const result = await resolveSchema(tree)
      assert.equal(result.length, 1)
      assert.equal(result[0]!.type, 'test-container')
      assert.equal(result[0]!.children?.length, 2)
      assert.equal(result[0]!.children![0]!.label, 'a')
      assert.equal(result[0]!.children![1]!.label, 'b')
    })

    it('recurses through multiple levels', async () => {
      const tree = [
        new TestContainer([
          new TestContainer([new TestLeaf('deep')]),
        ]),
      ]
      const result = await resolveSchema(tree)
      const depth1 = result[0]!.children![0] as ElementMeta
      assert.equal(depth1.type, 'test-container')
      assert.equal(depth1.children?.[0]?.label, 'deep')
    })

    it('omits `children` field when container has no children', async () => {
      const tree = [new TestContainer([])]
      const result = await resolveSchema(tree)
      assert.equal(result[0]!.children, undefined)
    })

    it('omits `children` field for leaves (getChildren returns undefined)', async () => {
      const result = await resolveSchema([new TestLeaf('leaf')])
      assert.equal(result[0]!.children, undefined)
    })
  })

  // ─── Plugin registry ────────────────────────────────────

  describe('plugin resolver registry', () => {
    it('registered resolver replaces default toMeta+recurse behavior', async () => {
      registerResolver('test-leaf', () => ({ type: 'test-leaf', custom: 'override' }))
      const result = await resolveSchema([new TestLeaf('original')])
      assert.deepEqual(result[0], { type: 'test-leaf', custom: 'override' })
    })

    it('registered resolver receives the original element', async () => {
      let captured: Element | null = null
      registerResolver('test-leaf', el => { captured = el; return el.toMeta() as ElementMeta })
      await resolveSchema([new TestLeaf('hello')])
      assert.ok(captured)
      assert.equal((captured as Element).getType(), 'test-leaf')
    })

    it('registered resolver receives the recurse helper for custom child resolution', async () => {
      registerResolver('test-container', async (el, _ctx, recurse) => {
        const meta = el.toMeta() as ElementMeta
        const children = el.getChildren()
        if (children) {
          // Custom: prepend a synthetic injected child to the resolved tree.
          const resolved = await recurse(children)
          meta.children = [{ type: 'injected' }, ...resolved]
        }
        return meta
      })
      const tree = [new TestContainer([new TestLeaf('a')])]
      const result = await resolveSchema(tree)
      assert.equal(result[0]!.children?.length, 2)
      assert.equal(result[0]!.children![0]!.type, 'injected')
      assert.equal(result[0]!.children![1]!.type, 'test-leaf')
    })

    it('async resolvers are awaited', async () => {
      registerResolver('test-leaf', async () => {
        await new Promise(r => setTimeout(r, 5))
        return { type: 'test-leaf', async: true }
      })
      const result = await resolveSchema([new TestLeaf('x')])
      assert.deepEqual(result[0], { type: 'test-leaf', async: true })
    })

    it('non-registered types fall through to default behavior', async () => {
      registerResolver('test-leaf', () => ({ type: 'test-leaf', overridden: true }))
      const result = await resolveSchema([new TestContainer([new TestLeaf('x')])])
      // Container falls through to default; leaf inside uses the registered resolver.
      assert.equal(result[0]!.type, 'test-container')
      assert.equal(result[0]!.children![0]!.overridden, true)
    })
  })

  // ─── Built-in elements ──────────────────────────────────

  describe('built-in elements', () => {
    it('resolves Text leaf', async () => {
      const result = await resolveSchema([Text.make('hello')])
      assert.deepEqual(result, [{ type: 'text', content: 'hello' }])
    })

    it('resolves Heading leaf with options', async () => {
      const result = await resolveSchema([
        Heading.make('Title').level(2).description('subtitle'),
      ])
      assert.deepEqual(result, [{
        type: 'heading',
        content: 'Title',
        level: 2,
        description: 'subtitle',
      }])
    })

    it('resolves Card with children via the schema() builder', async () => {
      const tree = [
        Card.make('Stats').schema([
          Text.make('inside the card'),
        ]),
      ]
      const result = await resolveSchema(tree)
      assert.equal(result[0]!.type, 'card')
      assert.equal(result[0]!.title, 'Stats')
      assert.equal(result[0]!.children?.length, 1)
      assert.deepEqual(result[0]!.children![0], { type: 'text', content: 'inside the card' })
    })

    it('mixes built-in container with custom leaf via children', async () => {
      const tree = [
        Card.make('Mixed').schema([
          Heading.make('h'),
          new TestLeaf('test-leaf-inside'),
        ]),
      ]
      const result = await resolveSchema(tree)
      assert.equal(result[0]!.children?.length, 2)
      assert.equal(result[0]!.children![0]!.type, 'heading')
      assert.equal(result[0]!.children![1]!.type, 'test-leaf')
    })
  })

  // ─── Type discriminator guarantee ───────────────────────

  describe('type field guarantee', () => {
    it('forces meta.type to match getType() even if toMeta forgets to set it', async () => {
      class ForgetfulLeaf extends Element {
        getType() { return 'forgetful' }
        toMeta() { return { someField: 'value' } as Record<string, unknown> }
      }
      const result = await resolveSchema([new ForgetfulLeaf()])
      assert.equal(result[0]!.type, 'forgetful')
    })
  })
})
