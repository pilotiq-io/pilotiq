import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getFieldRenderer } from '@pilotiq/pilotiq/react'
import { Pilotiq } from '@pilotiq/pilotiq'
import { tiptap } from './plugin.js'

describe('tiptap() plugin', () => {
  it('exposes a Pilotiq plugin shape', () => {
    const plugin = tiptap()
    assert.equal(plugin.name, '@pilotiq/tiptap')
    assert.equal(typeof plugin.register, 'function')
  })

  it('plugins([tiptap()]) wires the richtext field renderer', () => {
    Pilotiq.make('test').plugins([tiptap()])
    const renderer = getFieldRenderer('richtext')
    assert.equal(typeof renderer, 'function')
  })
})
