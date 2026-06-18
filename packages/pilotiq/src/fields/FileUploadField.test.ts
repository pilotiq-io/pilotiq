import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { FileUploadField, FileUpload } from './FileUploadField.js'
import { TextField } from './TextField.js'
import { applyDehydrateTransforms, coerceFormValues } from '../elements/dispatchForm.js'

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

  describe('metaFields', () => {
    const withMeta = (): FileUploadField =>
      FileUploadField.make('cover').metaFields([
        TextField.make('alt').label('Alt text'),
        TextField.make('caption'),
      ])

    it('absent from meta by default; hasMetaFields()=false', () => {
      const f = FileUploadField.make('x')
      assert.equal('metaFields' in f.toMeta(), false)
      assert.equal(f.hasMetaFields(), false)
    })

    it('metaFields() serializes each field meta + flips hasMetaFields()', () => {
      const f = withMeta()
      assert.equal(f.hasMetaFields(), true)
      const metas = f.toMeta()['metaFields'] as Array<Record<string, unknown>>
      assert.equal(metas.length, 2)
      assert.equal(metas[0]!['name'], 'alt')
      assert.equal(metas[0]!['label'], 'Alt text')
      assert.equal(metas[0]!['fieldType'], 'text')
      assert.equal(metas[1]!['name'], 'caption')
    })

    it('coerce (single): JSON object → rich ref preserving meta', () => {
      const out = coerceFormValues([withMeta()], {
        cover: JSON.stringify({ url: '/u/a.png', alt: 'A cat', caption: 'Meow' }),
      })
      assert.deepEqual(out['cover'], { url: '/u/a.png', alt: 'A cat', caption: 'Meow' })
    })

    it('coerce (single): legacy bare URL string → { url }', () => {
      const out = coerceFormValues([withMeta()], { cover: '/u/legacy.png' })
      assert.deepEqual(out['cover'], { url: '/u/legacy.png' })
    })

    it('coerce (single): empty → null', () => {
      assert.equal(coerceFormValues([withMeta()], { cover: '' })['cover'], null)
      assert.equal(coerceFormValues([withMeta()], {})['cover'], null)
    })

    it('coerce (single): object without a usable url → null', () => {
      const out = coerceFormValues([withMeta()], { cover: JSON.stringify({ alt: 'no url' }) })
      assert.equal(out['cover'], null)
    })

    it('coerce (multiple): JSON array of objects → array of rich refs', () => {
      const f = FileUploadField.make('gallery').multiple().metaFields([TextField.make('alt')])
      const out = coerceFormValues([f], {
        gallery: JSON.stringify([
          { url: '/u/a.png', alt: 'one' },
          { url: '/u/b.png', alt: 'two' },
        ]),
      })
      assert.deepEqual(out['gallery'], [
        { url: '/u/a.png', alt: 'one' },
        { url: '/u/b.png', alt: 'two' },
      ])
    })

    it('coerce (multiple): empty → []', () => {
      const f = FileUploadField.make('gallery').multiple().metaFields([TextField.make('alt')])
      assert.deepEqual(coerceFormValues([f], { gallery: '' })['gallery'], [])
    })

    it('coerce (multiple): drops entries without a url', () => {
      const f = FileUploadField.make('gallery').multiple().metaFields([TextField.make('alt')])
      const out = coerceFormValues([f], {
        gallery: JSON.stringify([{ url: '/u/a.png', alt: 'one' }, { alt: 'orphan' }, '']),
      })
      assert.deepEqual(out['gallery'], [{ url: '/u/a.png', alt: 'one' }])
    })
  })

  describe('metaColumn', () => {
    const field = () =>
      FileUploadField.make('avatar')
        .metaFields([TextField.make('alt'), TextField.make('caption')])
        .metaColumn('avatar_meta')

    it('getMetaColumn() / hasMetaColumn()', () => {
      assert.equal(field().getMetaColumn(), 'avatar_meta')
      assert.equal(field().hasMetaColumn(), true)
      assert.equal(FileUploadField.make('x').hasMetaColumn(), false)
    })

    it('toMeta() emits metaColumn when set', () => {
      assert.equal(field().toMeta()['metaColumn'], 'avatar_meta')
      assert.equal('metaColumn' in FileUploadField.make('x').toMeta(), false)
    })

    it('split (single): rich value → url in primary + meta in companion', async () => {
      const f = field()
      const coerced = coerceFormValues([f], {
        avatar: JSON.stringify({ url: '/u/avatar.png', alt: 'Me', caption: 'Portrait' }),
      })
      const out = await applyDehydrateTransforms([f], coerced)
      assert.equal(out['avatar'], '/u/avatar.png')
      assert.deepEqual(out['avatar_meta'], { alt: 'Me', caption: 'Portrait' })
    })

    it('split (single): null → null in both columns', async () => {
      const f = field()
      const out = await applyDehydrateTransforms([f], { avatar: null })
      assert.equal(out['avatar'], null)
      assert.equal(out['avatar_meta'], null)
    })

    it('split (multiple): rich array → url array + meta array', async () => {
      const f = FileUploadField.make('gallery')
        .multiple()
        .metaFields([TextField.make('alt')])
        .metaColumn('gallery_meta')
      const coerced = coerceFormValues([f], {
        gallery: JSON.stringify([
          { url: '/u/a.png', alt: 'A' },
          { url: '/u/b.png', alt: 'B' },
        ]),
      })
      const out = await applyDehydrateTransforms([f], coerced)
      assert.deepEqual(out['gallery'], ['/u/a.png', '/u/b.png'])
      assert.deepEqual(out['gallery_meta'], [{ alt: 'A' }, { alt: 'B' }])
    })
  })
})
