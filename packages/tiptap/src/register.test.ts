import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getFieldRenderer } from '@pilotiq/pilotiq/react'

import { registerTiptap } from './register.js'

describe('registerTiptap', () => {
  it('installs a renderer for fieldType="richtext"', () => {
    assert.equal(getFieldRenderer('richtext'), undefined)
    registerTiptap()
    const renderer = getFieldRenderer('richtext')
    assert.equal(typeof renderer, 'function')
  })
})
