import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getWidgetRenderer } from '@pilotiq/pilotiq/react'
import { Pilotiq } from '@pilotiq/pilotiq'
import { recharts } from './plugin.js'

describe('recharts() plugin', () => {
  it('exposes a Pilotiq plugin shape', () => {
    const plugin = recharts()
    assert.equal(plugin.name, '@pilotiq/recharts')
    assert.equal(typeof plugin.register, 'function')
  })

  it('plugins([recharts()]) wires the chart widget renderer', () => {
    Pilotiq.make('test').plugins([recharts()])
    const renderer = getWidgetRenderer('chart')
    assert.equal(typeof renderer, 'function')
  })
})
