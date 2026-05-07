import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getFieldRenderer } from '@pilotiq/pilotiq/react'
import { Pilotiq } from '@pilotiq/pilotiq'
import { codeEditor } from './plugin.js'
import { getCodeLanguage, listCodeLanguages } from './languageRegistry.js'

describe('codeEditor() plugin', () => {
  it('exposes a Pilotiq plugin shape', () => {
    const plugin = codeEditor()
    assert.equal(plugin.name, '@pilotiq/codemirror')
    assert.equal(typeof plugin.register, 'function')
  })

  it('plugins([codeEditor()]) wires the code field renderer', () => {
    Pilotiq.make('test').plugins([codeEditor()])
    const renderer = getFieldRenderer('code')
    assert.equal(typeof renderer, 'function')
  })

  it('plugins([codeEditor({ languages })]) registers each language', () => {
    const before = new Set(listCodeLanguages())
    const fakeJson = (() => [] as never) as never
    const fakeYaml = (() => [] as never) as never
    Pilotiq.make('test').plugins([
      codeEditor({ languages: { 'plugin-test-json': fakeJson, 'plugin-test-yaml': fakeYaml } }),
    ])
    assert.equal(before.has('plugin-test-json'), false)
    assert.equal(before.has('plugin-test-yaml'), false)
    assert.equal(typeof getCodeLanguage('plugin-test-json'), 'function')
    assert.equal(typeof getCodeLanguage('plugin-test-yaml'), 'function')
  })

  it('codeEditor() with no opts registers no languages', () => {
    const before = listCodeLanguages().length
    Pilotiq.make('test').plugins([codeEditor()])
    const after = listCodeLanguages().length
    assert.equal(after, before)
  })
})
