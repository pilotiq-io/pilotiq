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

  describe('image editor (Phase A)', () => {
    it('imageEditor() stamps imageEditor:true', () => {
      const meta = FileUploadField.make('photo').imageEditor().toMeta()
      assert.equal(meta['imageEditor'], true)
    })

    it('imageEditor() absent by default', () => {
      const meta = FileUploadField.make('photo').toMeta()
      assert.equal('imageEditor' in meta, false)
    })

    it('imageEditorAspectRatioOptions() stamps options array', () => {
      const opts = [{ ratio: 16 / 9, label: 'Widescreen' }, { ratio: 1, label: 'Square' }]
      const meta = FileUploadField.make('photo').imageEditor().imageEditorAspectRatioOptions(opts).toMeta()
      assert.deepEqual(meta['imageEditorAspectRatioOptions'], opts)
    })

    it('circleCropper() stamps circleCropper:true', () => {
      const meta = FileUploadField.make('photo').imageEditor().circleCropper().toMeta()
      assert.equal(meta['circleCropper'], true)
    })

    it('automaticallyCropImagesToAspectRatio() stamps flag', () => {
      const meta = FileUploadField.make('photo').imageEditor().automaticallyCropImagesToAspectRatio().toMeta()
      assert.equal(meta['automaticallyCropImagesToAspectRatio'], true)
    })

    it('automaticallyResize() stamps width+height', () => {
      const meta = FileUploadField.make('photo').automaticallyResize(800, 600).toMeta()
      assert.deepEqual(meta['automaticallyResize'], { width: 800, height: 600 })
    })

    it('avatar() sets imageEditor + circleCropper + multiple:false', () => {
      const meta = FileUploadField.make('avatar').avatar().toMeta()
      assert.equal(meta['imageEditor'],    true)
      assert.equal(meta['circleCropper'],  true)
      assert.equal(meta['multiple'],       false)
    })

    it('avatar() does not override an explicit multiple(true)', () => {
      // avatar() forces multiple false — explicit multiple() after avatar() wins
      const meta = FileUploadField.make('avatar').avatar().multiple(true).toMeta()
      assert.equal(meta['multiple'], true)
    })
  })

  describe('preserveFilenames', () => {
    it('absent from meta by default', () => {
      const meta = FileUploadField.make('x').toMeta()
      assert.equal('preserveFilenames' in meta, false)
      assert.equal(FileUploadField.make('x').isPreservingFilenames(), false)
    })

    it('preserveFilenames() stamps the flag', () => {
      const field = FileUploadField.make('x').preserveFilenames()
      assert.equal(field.isPreservingFilenames(), true)
      assert.equal(field.toMeta()['preserveFilenames'], true)
    })

    it('preserveFilenames(false) clears it', () => {
      const meta = FileUploadField.make('x').preserveFilenames().preserveFilenames(false).toMeta()
      assert.equal('preserveFilenames' in meta, false)
    })
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
