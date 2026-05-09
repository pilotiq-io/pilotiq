import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { SlotComponent } from './SlotComponent.js'

describe('SlotComponent schema primitive', () => {
  it('emits component name and no props by default', () => {
    const meta = SlotComponent.make('BookmarkButton').toMeta()
    assert.equal(meta['type'],      'slotComponent')
    assert.equal(meta['component'], 'BookmarkButton')
    assert.equal('props' in meta,   false)
  })

  it('ships .props({...}) verbatim under meta.props', () => {
    const meta = SlotComponent.make('BookmarkButton')
      .props({ basePath: '/admin', recordId: '42' })
      .toMeta()
    assert.deepEqual(meta['props'], { basePath: '/admin', recordId: '42' })
  })

  it('successive .props() calls merge shallowly', () => {
    const meta = SlotComponent.make('X')
      .props({ a: 1, b: 2 })
      .props({ b: 3, c: 4 })
      .toMeta()
    assert.deepEqual(meta['props'], { a: 1, b: 3, c: 4 })
  })

  it('exposes the component name via getComponentName()', () => {
    const el = SlotComponent.make('BookmarkButton')
    assert.equal(el.getComponentName(), 'BookmarkButton')
  })

  it('inherits Element.visible() / hidden() / columnSpan', () => {
    const el = SlotComponent.make('X').visible(false).columnSpan(2)
    assert.equal(el.hasVisibilityRule(), true)
    assert.deepEqual(el.getLayoutPositioning(), { columnSpan: 2 })
  })

  it('getType returns slotComponent (matches wire shape discriminator)', () => {
    assert.equal(SlotComponent.make('X').getType(), 'slotComponent')
  })
})

describe('Slot component runtime registry', () => {
  it('registers, retrieves, and resets', async () => {
    const { registerSlotComponents, getSlotComponent, _resetSlotComponentRegistryForTests } =
      await import('../slot-components/registry.js')
    _resetSlotComponentRegistryForTests()
    const Stub = (() => null) as unknown as Parameters<typeof registerSlotComponents>[0][string]
    registerSlotComponents({ Stub })
    assert.equal(getSlotComponent('Stub'), Stub)
    assert.equal(getSlotComponent('Missing'), undefined)
    _resetSlotComponentRegistryForTests()
    assert.equal(getSlotComponent('Stub'), undefined)
  })

  it('skips falsy values during register', async () => {
    const { registerSlotComponents, getSlotComponent, _resetSlotComponentRegistryForTests } =
      await import('../slot-components/registry.js')
    _resetSlotComponentRegistryForTests()
    registerSlotComponents({ Bad: undefined as never })
    assert.equal(getSlotComponent('Bad'), undefined)
  })

  it('multiple registrations merge into the same registry', async () => {
    const { registerSlotComponents, getSlotComponent, _resetSlotComponentRegistryForTests } =
      await import('../slot-components/registry.js')
    _resetSlotComponentRegistryForTests()
    const A = (() => null) as never
    const B = (() => null) as never
    registerSlotComponents({ A })
    registerSlotComponents({ B })
    assert.equal(getSlotComponent('A'), A)
    assert.equal(getSlotComponent('B'), B)
  })
})
