import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerIcons, getIcon, _resetIconRegistryForTests } from './registry.js'
import { serializeIcon } from './types.js'

const FakeIconA = (() => null) as unknown as Parameters<typeof registerIcons>[0]['x'] // typed loosely; tests only check identity
const FakeIconB = (() => null) as unknown as typeof FakeIconA

describe('icons/registry', () => {
  beforeEach(() => {
    _resetIconRegistryForTests()
  })

  it('returns undefined for an unregistered name', () => {
    assert.equal(getIcon('newspaper'), undefined)
  })

  it('returns the registered component', () => {
    registerIcons({ newspaper: FakeIconA })
    assert.equal(getIcon('newspaper'), FakeIconA)
  })

  it('merges across calls; later values win for the same key', () => {
    registerIcons({ newspaper: FakeIconA, send: FakeIconA })
    registerIcons({ newspaper: FakeIconB })
    assert.equal(getIcon('newspaper'), FakeIconB)
    assert.equal(getIcon('send'), FakeIconA)
  })

  it('ignores undefined entries (defensive against IconMap with optional values)', () => {
    registerIcons({ ghost: undefined as unknown as typeof FakeIconA })
    assert.equal(getIcon('ghost'), undefined)
  })
})

describe('icons/types — serializeIcon', () => {
  it('passes string icons through as-is', () => {
    assert.equal(serializeIcon('newspaper'), 'newspaper')
    assert.equal(serializeIcon('newspaper', 'ArticleResource'), 'newspaper')
  })

  it('serializes function icons as { class: ownerClassName }', () => {
    const cmp = (() => null) as unknown as Parameters<typeof serializeIcon>[0]
    assert.deepEqual(serializeIcon(cmp, 'ArticleResource'), { class: 'ArticleResource' })
  })

  it('returns undefined for component icons without an owner-class hint', () => {
    const cmp = (() => null) as unknown as Parameters<typeof serializeIcon>[0]
    assert.equal(serializeIcon(cmp), undefined)
  })

  it('returns undefined for undefined input', () => {
    assert.equal(serializeIcon(undefined), undefined)
    assert.equal(serializeIcon(undefined, 'ArticleResource'), undefined)
  })
})
