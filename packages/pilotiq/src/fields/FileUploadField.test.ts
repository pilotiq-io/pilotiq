import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { FileUploadField, FileUpload } from './FileUploadField.js'
import { coerceFormValues } from '../elements/dispatchForm.js'

describe('FileUploadField', () => {
  it('emits fieldType "fileUpload"', () => {
    const meta = FileUploadField.make('cover').toMeta()
    assert.equal(meta.fieldType, 'fileUpload')
  })

  it('exports an alias `FileUpload`', () => {
    assert.equal(FileUpload, FileUploadField)
  })

  it('default flags: multiple=false, preview=true', () => {
    const meta = FileUploadField.make('x').toMeta()
    assert.equal(meta['multiple'], false)
    assert.equal(meta['preview'],  true)
  })

  it('emits accept / maxSize / directory only when set', () => {
    const a = FileUploadField.make('x').toMeta()
    assert.equal('accept'    in a, false)
    assert.equal('maxSize'   in a, false)
    assert.equal('directory' in a, false)

    const b = FileUploadField.make('x')
      .accept(['image/png', 'image/jpeg'])
      .maxSize(5_000_000)
      .directory('articles/covers')
      .toMeta()
    assert.deepEqual(b['accept'], ['image/png', 'image/jpeg'])
    assert.equal(b['maxSize'], 5_000_000)
    assert.equal(b['directory'], 'articles/covers')
  })

  it('multiple() flips to multi-file mode', () => {
    const meta = FileUploadField.make('x').multiple().toMeta()
    assert.equal(meta['multiple'], true)
  })

  it('preview(false) suppresses thumbnail', () => {
    const meta = FileUploadField.make('x').preview(false).toMeta()
    assert.equal(meta['preview'], false)
  })

  it('emits uploadUrl from RenderContext', () => {
    const meta = FileUploadField.make('x').toMeta({ uploadUrl: '/admin/_uploads' })
    assert.equal(meta['uploadUrl'], '/admin/_uploads')
  })

  it('omits uploadUrl when ctx does not supply one', () => {
    const meta = FileUploadField.make('x').toMeta()
    assert.equal('uploadUrl' in meta, false)
  })

  describe('coerceFormValues', () => {
    it('passes URL string through (single mode)', () => {
      const out = coerceFormValues(
        [FileUploadField.make('cover')],
        { cover: '/uploads/abc.png' },
      )
      assert.equal(out['cover'], '/uploads/abc.png')
    })

    it('passes string[] through (multi mode)', () => {
      const out = coerceFormValues(
        [FileUploadField.make('files').multiple()],
        { files: ['/uploads/a.png', '/uploads/b.png'] },
      )
      assert.deepEqual(out['files'], ['/uploads/a.png', '/uploads/b.png'])
    })

    it('decodes JSON-array string into string[]', () => {
      const out = coerceFormValues(
        [FileUploadField.make('files').multiple()],
        { files: '["/uploads/a.png","/uploads/b.png"]' },
      )
      assert.deepEqual(out['files'], ['/uploads/a.png', '/uploads/b.png'])
    })

    it('empty string → null', () => {
      const out = coerceFormValues(
        [FileUploadField.make('cover')],
        { cover: '' },
      )
      assert.equal(out['cover'], null)
    })

    it('missing key → null', () => {
      const out = coerceFormValues([FileUploadField.make('cover')], {})
      assert.equal(out['cover'], null)
    })
  })
})
