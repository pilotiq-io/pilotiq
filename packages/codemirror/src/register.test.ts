import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getFieldRenderer } from '@pilotiq/pilotiq/react'

import { registerCodeEditor } from './register.js'

describe('registerCodeEditor', () => {
  it('installs a renderer for fieldType="code"', () => {
    assert.equal(getFieldRenderer('code'), undefined)
    registerCodeEditor()
    const renderer = getFieldRenderer('code')
    assert.equal(typeof renderer, 'function')
  })
})
