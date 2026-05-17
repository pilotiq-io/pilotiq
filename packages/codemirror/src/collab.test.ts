import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { CodeEditorField } from './CodeEditorField.js'

describe('CodeEditorField — collab opt-in', () => {
  it('omits the collab key from meta by default (inherits panel default)', () => {
    const meta = CodeEditorField.make('config').toMeta()
    assert.equal((meta as { collab?: boolean }).collab, undefined)
  })

  it('emits collab:false when opted out via .collab(false)', () => {
    const meta = CodeEditorField.make('config').collab(false).toMeta()
    assert.equal((meta as { collab?: boolean }).collab, false)
  })

  it('emits collab:true when explicitly opted in', () => {
    const meta = CodeEditorField.make('config').collab(true).toMeta()
    assert.equal((meta as { collab?: boolean }).collab, true)
  })

  it('emits collab:true on a bare .collab() call', () => {
    const meta = CodeEditorField.make('config').collab().toMeta()
    assert.equal((meta as { collab?: boolean }).collab, true)
  })
})
