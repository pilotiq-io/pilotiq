import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { CodeEditorField, Code } from './CodeEditorField.js'

describe('CodeEditorField.toMeta', () => {
  it('emits fieldType=code with sensible defaults', () => {
    const meta = CodeEditorField.make('config').toMeta()
    assert.equal(meta.fieldType, 'code')
    assert.equal(meta.name, 'config')
    assert.equal(meta.lineNumbers, true)
    assert.equal(meta.lineWrapping, false)
    assert.equal(meta.indentWithTabs, false)
    assert.equal(meta.indentSize, 2)
    assert.equal(meta.theme, 'auto')
    assert.equal(meta.readOnly, false)
    assert.equal(meta.language, undefined)
    assert.equal(meta.height, undefined)
  })

  it('persists language id (string-only)', () => {
    const meta = CodeEditorField.make('q').language('sql').toMeta()
    assert.equal(meta.language, 'sql')
  })

  it('persists height + line-numbers + line-wrapping toggles', () => {
    const meta = CodeEditorField.make('q')
      .height('500px')
      .lineNumbers(false)
      .lineWrapping(true)
      .toMeta()
    assert.equal(meta.height, '500px')
    assert.equal(meta.lineNumbers, false)
    assert.equal(meta.lineWrapping, true)
  })

  it('persists indent settings', () => {
    const meta = CodeEditorField.make('script')
      .indentWithTabs(true)
      .indentSize(4)
      .toMeta()
    assert.equal(meta.indentWithTabs, true)
    assert.equal(meta.indentSize, 4)
  })

  it('persists theme override', () => {
    const meta = CodeEditorField.make('q').theme('dark').toMeta()
    assert.equal(meta.theme, 'dark')
  })

  it('persists readOnly', () => {
    const meta = CodeEditorField.make('q').readOnly(true).toMeta()
    assert.equal(meta.readOnly, true)
  })

  it('inherits required + label + placeholder from base Field', () => {
    const meta = CodeEditorField.make('snippet')
      .label('Snippet')
      .placeholder('// type code…')
      .required()
      .toMeta()
    assert.equal(meta.label, 'Snippet')
    assert.equal(meta.placeholder, '// type code…')
    assert.equal(meta.required, true)
  })
})

describe('Code alias', () => {
  it('is the same constructor as CodeEditorField', () => {
    assert.equal(Code, CodeEditorField)
    const meta = Code.make('x').language('json').toMeta()
    assert.equal(meta.fieldType, 'code')
    assert.equal(meta.language, 'json')
  })
})

describe('CodeEditorField getters', () => {
  it('exposes builder state via getters', () => {
    const field = CodeEditorField.make('q')
      .language('javascript')
      .height('200px')
      .lineNumbers(false)
      .lineWrapping(true)
      .indentWithTabs(true)
      .indentSize(4)
      .theme('light')
      .readOnly(true)

    assert.equal(field.getLanguage(),    'javascript')
    assert.equal(field.getHeight(),      '200px')
    assert.equal(field.hasLineNumbers(), false)
    assert.equal(field.hasLineWrapping(), true)
    assert.equal(field.isIndentWithTabs(), true)
    assert.equal(field.getIndentSize(),  4)
    assert.equal(field.getTheme(),       'light')
    assert.equal(field.isReadOnly(),     true)
  })
})
