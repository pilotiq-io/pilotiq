import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  MarkdownField,
  Markdown,
  DEFAULT_MARKDOWN_TOOLBAR,
} from './MarkdownField.js'

describe('MarkdownField', () => {
  it('emits fieldType "markdown"', () => {
    const meta = MarkdownField.make('body').toMeta()
    assert.equal(meta.fieldType, 'markdown')
  })

  it('exports an alias `Markdown`', () => {
    assert.equal(Markdown, MarkdownField)
  })

  it('defaults to the full toolbar', () => {
    const meta = MarkdownField.make('body').toMeta({ hasUploadAdapter: true })
    assert.deepEqual(
      meta['toolbarButtons'],
      [...DEFAULT_MARKDOWN_TOOLBAR],
    )
  })

  it('omits minHeight/maxHeight/fileAttachments* by default', () => {
    const meta = MarkdownField.make('body').toMeta()
    assert.equal('minHeight' in meta, false)
    assert.equal('maxHeight' in meta, false)
    assert.equal('fileAttachmentsDirectory'  in meta, false)
    assert.equal('fileAttachmentsVisibility' in meta, false)
  })

  describe('toolbarButtons()', () => {
    it('replaces the toolbar entirely with the given list', () => {
      const meta = MarkdownField.make('body')
        .toolbarButtons(['bold', 'italic', 'link'])
        .toMeta({ hasUploadAdapter: true })
      assert.deepEqual(meta['toolbarButtons'], ['bold', 'italic', 'link'])
    })

    it('preserves order from the user-supplied list', () => {
      const meta = MarkdownField.make('body')
        .toolbarButtons(['link', 'codeBlock', 'bold'])
        .toMeta({ hasUploadAdapter: true })
      assert.deepEqual(meta['toolbarButtons'], ['link', 'codeBlock', 'bold'])
    })

    it('empty array ships a chrome-less editor', () => {
      const meta = MarkdownField.make('body').toolbarButtons([]).toMeta()
      assert.deepEqual(meta['toolbarButtons'], [])
    })
  })

  describe('disableToolbarButtons()', () => {
    it('drops listed buttons from the default toolbar', () => {
      const meta = MarkdownField.make('body')
        .disableToolbarButtons(['attachFiles', 'codeBlock'])
        .toMeta({ hasUploadAdapter: true })
      assert.equal((meta['toolbarButtons'] as string[]).includes('attachFiles'), false)
      assert.equal((meta['toolbarButtons'] as string[]).includes('codeBlock'),   false)
      assert.equal((meta['toolbarButtons'] as string[]).includes('bold'),        true)
    })

    it('chains with toolbarButtons() — drops from the most-recently-set list', () => {
      const meta = MarkdownField.make('body')
        .toolbarButtons(['bold', 'italic', 'link'])
        .disableToolbarButtons(['italic'])
        .toMeta({ hasUploadAdapter: true })
      assert.deepEqual(meta['toolbarButtons'], ['bold', 'link'])
    })

    it('no-ops on buttons that are not in the current list', () => {
      const meta = MarkdownField.make('body')
        .toolbarButtons(['bold'])
        .disableToolbarButtons(['attachFiles'])
        .toMeta({ hasUploadAdapter: true })
      assert.deepEqual(meta['toolbarButtons'], ['bold'])
    })
  })

  describe('attachFiles strip', () => {
    it('strips attachFiles from toolbar when no upload adapter is configured', () => {
      const meta = MarkdownField.make('body').toMeta()
      const toolbar = meta['toolbarButtons'] as string[]
      assert.equal(toolbar.includes('attachFiles'), false)
      // every other default button survives
      assert.equal(toolbar.length, DEFAULT_MARKDOWN_TOOLBAR.length - 1)
    })

    it('keeps attachFiles when ctx.hasUploadAdapter is true', () => {
      const meta = MarkdownField.make('body').toMeta({ hasUploadAdapter: true })
      const toolbar = meta['toolbarButtons'] as string[]
      assert.equal(toolbar.includes('attachFiles'), true)
    })

    it('strips attachFiles when uploadUrl is set but adapter flag is not', () => {
      // Mirrors the "URL stamped but no adapter" failure mode that
      // should hide the optional affordance.
      const meta = MarkdownField.make('body').toMeta({ uploadUrl: '/admin/_uploads' })
      const toolbar = meta['toolbarButtons'] as string[]
      assert.equal(toolbar.includes('attachFiles'), false)
      // uploadUrl is also withheld so the renderer can't accidentally
      // try to POST to a route that has no adapter wired up.
      assert.equal('uploadUrl' in meta, false)
    })

    it('emits uploadUrl on meta only when both ctx fields are present', () => {
      const meta = MarkdownField.make('body').toMeta({
        uploadUrl:        '/admin/_uploads',
        hasUploadAdapter: true,
      })
      assert.equal(meta['uploadUrl'], '/admin/_uploads')
    })
  })

  describe('minHeight / maxHeight', () => {
    it('emits minHeight when set', () => {
      const meta = MarkdownField.make('body').minHeight('200px').toMeta()
      assert.equal(meta['minHeight'], '200px')
    })

    it('emits maxHeight when set', () => {
      const meta = MarkdownField.make('body').maxHeight('600px').toMeta()
      assert.equal(meta['maxHeight'], '600px')
    })
  })

  describe('fileAttachmentsDirectory / fileAttachmentsVisibility', () => {
    it('forwards directory + visibility to meta', () => {
      const meta = MarkdownField.make('body')
        .fileAttachmentsDirectory('articles')
        .fileAttachmentsVisibility('public')
        .toMeta()
      assert.equal(meta['fileAttachmentsDirectory'], 'articles')
      assert.equal(meta['fileAttachmentsVisibility'], 'public')
    })
  })

  describe('cross-field plumbing (Plan #6 inheritance)', () => {
    it('placeholder / required / helperText / default flow through buildMeta', () => {
      const meta = MarkdownField.make('body')
        .placeholder('Write in markdown…')
        .required()
        .helperText('Markdown formatting supported')
        .default('# Hello')
        .toMeta()
      assert.equal(meta.placeholder, 'Write in markdown…')
      assert.equal(meta.required, true)
      assert.equal(meta['helperText'], 'Markdown formatting supported')
      assert.equal(meta['defaultValue'], '# Hello')
    })
  })

  describe('getters', () => {
    it('expose internal config for tests / introspection', () => {
      const f = MarkdownField.make('body')
        .toolbarButtons(['bold', 'italic'])
        .minHeight('100px')
        .maxHeight('500px')
        .fileAttachmentsDirectory('articles')
        .fileAttachmentsVisibility('private')
      assert.deepEqual([...f.getToolbarButtons()], ['bold', 'italic'])
      assert.equal(f.getMinHeight(), '100px')
      assert.equal(f.getMaxHeight(), '500px')
      assert.equal(f.getFileAttachmentsDirectory(),  'articles')
      assert.equal(f.getFileAttachmentsVisibility(), 'private')
    })
  })
})
