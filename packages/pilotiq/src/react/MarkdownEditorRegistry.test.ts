import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  registerMarkdownEditor,
  getMarkdownEditor,
} from './MarkdownEditorRegistry.js'

describe('MarkdownEditorRegistry', () => {
  beforeEach(() => {
    registerMarkdownEditor(null)
  })

  it('returns null when no editor is registered', () => {
    assert.equal(getMarkdownEditor(), null)
  })

  it('stores the registered editor component', () => {
    const Component = () => null
    registerMarkdownEditor(Component)
    assert.equal(getMarkdownEditor(), Component)
  })

  it('clears when called with null', () => {
    const Component = () => null
    registerMarkdownEditor(Component)
    registerMarkdownEditor(null)
    assert.equal(getMarkdownEditor(), null)
  })

  it('last registration wins', () => {
    const A = () => null
    const B = () => null
    registerMarkdownEditor(A)
    registerMarkdownEditor(B)
    assert.equal(getMarkdownEditor(), B)
  })
})
