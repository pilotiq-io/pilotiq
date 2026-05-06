import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { CodeEntry } from './CodeEntry.js'

describe('CodeEntry', () => {
  it('emits entryType:code and resolves value from record[name]', () => {
    const meta = CodeEntry.make('payload').toMeta({
      record: { payload: '{"a":1}' },
    })
    assert.equal(meta.entryType, 'code')
    assert.equal(meta.value,     '{"a":1}')
    assert.equal('language' in meta, false)
  })

  it('emits language hint when set', () => {
    const meta = CodeEntry.make('payload').language('json').toMeta({
      record: { payload: '{}' },
    })
    assert.equal(meta.language, 'json')
  })

  it('inherits copyable / tooltip from base Entry', () => {
    const meta = CodeEntry.make('snippet')
      .language('ts')
      .copyable()
      .tooltip('Latest payload')
      .toMeta({ record: { snippet: 'const x = 1' } })
    assert.equal(meta.tooltip, 'Latest payload')
    assert.deepEqual(meta.copyable, {})
  })

  it('supports formatStateUsing for object → string conversion', () => {
    const meta = CodeEntry.make('config')
      .language('json')
      .formatStateUsing(v => JSON.stringify(v, null, 2))
      .toMeta({ record: { config: { a: 1 } } })
    assert.equal(meta._formatted, '{\n  "a": 1\n}')
  })
})
