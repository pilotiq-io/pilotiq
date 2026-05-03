import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  registerWidgetRenderer,
  getWidgetRenderer,
  _resetWidgetRendererRegistryForTests,
} from './widgetRegistry.js'

const Stub: () => null = () => null

describe('widget renderer registry', () => {
  it('returns undefined for unregistered types', () => {
    _resetWidgetRendererRegistryForTests()
    assert.equal(getWidgetRenderer('chart'), undefined)
    assert.equal(getWidgetRenderer('made-up-type'), undefined)
  })

  it('registers and retrieves a renderer', () => {
    _resetWidgetRendererRegistryForTests()
    registerWidgetRenderer('chart', Stub)
    assert.equal(getWidgetRenderer('chart'), Stub)
  })

  it('overwrites on re-register (HMR-friendly)', () => {
    _resetWidgetRendererRegistryForTests()
    const a: () => null = () => null
    const b: () => null = () => null
    registerWidgetRenderer('chart', a)
    registerWidgetRenderer('chart', b)
    assert.equal(getWidgetRenderer('chart'), b)
  })

  it('keys per type — multiple renderers coexist', () => {
    _resetWidgetRendererRegistryForTests()
    const c: () => null = () => null
    const t: () => null = () => null
    registerWidgetRenderer('chart', c)
    registerWidgetRenderer('table-widget', t)
    assert.equal(getWidgetRenderer('chart'),        c)
    assert.equal(getWidgetRenderer('table-widget'), t)
  })
})
