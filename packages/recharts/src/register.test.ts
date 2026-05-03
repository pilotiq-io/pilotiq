import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getWidgetRenderer } from '@pilotiq/pilotiq/react'

import { registerChartRenderer } from './register.js'

describe('registerChartRenderer', () => {
  it('installs a widget renderer for type="chart"', () => {
    assert.equal(getWidgetRenderer('chart'), undefined)
    registerChartRenderer()
    const renderer = getWidgetRenderer('chart')
    assert.equal(typeof renderer, 'function')
  })

  it('is idempotent — re-calling overwrites cleanly', () => {
    registerChartRenderer()
    registerChartRenderer()
    assert.equal(typeof getWidgetRenderer('chart'), 'function')
  })
})
