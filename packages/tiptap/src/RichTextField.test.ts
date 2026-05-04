import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TextField, TextareaField } from '@pilotiq/pilotiq'

import {
  RichTextField,
  DEFAULT_TOOLBAR_GROUPS,
  DEFAULT_TEXT_COLORS,
  DEFAULT_HIGHLIGHT_COLORS,
} from './RichTextField.js'
import { Block } from './Block.js'
import { MentionProvider } from './MentionProvider.js'

describe('RichTextField.toMeta', () => {
  it('emits fieldType=richtext with empty defaults', () => {
    const meta = RichTextField.make('body').toMeta()
    assert.equal(meta.fieldType, 'richtext')
    assert.equal(meta.name, 'body')
    assert.deepEqual(meta.blocks, [])
    assert.equal(meta.slashCommand, true)
    assert.equal(meta.floatingToolbar, true)
    assert.equal(meta.storage, 'json')
    assert.deepEqual(meta.toolbarGroups, DEFAULT_TOOLBAR_GROUPS)
  })

  it('serializes blocks via Block.toMeta()', () => {
    const meta = RichTextField.make('body').blocks([
      Block.make('callout').label('Callout').icon('💡').schema([
        TextField.make('title'),
        TextareaField.make('content').required(),
      ]),
    ]).toMeta()

    assert.equal(meta.blocks.length, 1)
    const block = meta.blocks[0]!
    assert.equal(block.name, 'callout')
    assert.equal(block.label, 'Callout')
    assert.equal(block.icon, '💡')
    assert.equal(block.schema.length, 2)
    assert.equal(block.schema[0]!.name, 'title')
    assert.equal(block.schema[0]!.fieldType, 'text')
    assert.equal(block.schema[1]!.name, 'content')
    assert.equal(block.schema[1]!.fieldType, 'textarea')
    assert.equal(block.schema[1]!.required, true)
  })

  it('honors slashCommand(false)', () => {
    const meta = RichTextField.make('body').slashCommand(false).toMeta()
    assert.equal(meta.slashCommand, false)
  })

  it('inherits required + placeholder from base Field', () => {
    const meta = RichTextField.make('body')
      .label('Article body')
      .placeholder('Start writing…')
      .required()
      .toMeta()

    assert.equal(meta.label, 'Article body')
    assert.equal(meta.placeholder, 'Start writing…')
    assert.equal(meta.required, true)
  })
})

describe('RichTextField toolbar API', () => {
  it('toolbar(false) hides the top-level toolbar', () => {
    const meta = RichTextField.make('body').toolbar(false).toMeta()
    assert.equal(meta.toolbarGroups, null)
  })

  it('toolbar(true) restores the default after toolbar(false)', () => {
    const meta = RichTextField.make('body').toolbar(false).toolbar(true).toMeta()
    assert.deepEqual(meta.toolbarGroups, DEFAULT_TOOLBAR_GROUPS)
  })

  it('floatingToolbar(false) toggles the selection toolbar', () => {
    const meta = RichTextField.make('body').floatingToolbar(false).toMeta()
    assert.equal(meta.floatingToolbar, false)
  })

  it('toolbarButtons([groups]) replaces the default layout', () => {
    const meta = RichTextField.make('body')
      .toolbarButtons([
        ['bold', 'italic'],
        ['undo', 'redo'],
      ])
      .toMeta()
    assert.deepEqual(meta.toolbarGroups, [
      ['bold', 'italic'],
      ['undo', 'redo'],
    ])
  })

  it('toolbarButtons(null) hides the toolbar', () => {
    const meta = RichTextField.make('body').toolbarButtons(null).toMeta()
    assert.equal(meta.toolbarGroups, null)
  })

  it('disableToolbarButtons removes ids from every group', () => {
    const meta = RichTextField.make('body')
      .disableToolbarButtons(['italic', 'undo', 'redo'])
      .toMeta()
    const flat = (meta.toolbarGroups ?? []).flat()
    assert.equal(flat.includes('italic'), false)
    assert.equal(flat.includes('undo'), false)
    assert.equal(flat.includes('redo'), false)
    assert.equal(flat.includes('bold'), true)
  })

  it('disableToolbarButtons drops a group when it empties out', () => {
    const meta = RichTextField.make('body')
      .toolbarButtons([
        ['bold'],
        ['italic'],
      ])
      .disableToolbarButtons(['italic'])
      .toMeta()
    assert.deepEqual(meta.toolbarGroups, [['bold']])
  })

  it('enableToolbarButtons appends to the last group', () => {
    const meta = RichTextField.make('body')
      .toolbarButtons([
        ['bold', 'italic'],
        ['undo', 'redo'],
      ])
      .enableToolbarButtons(['horizontalRule'])
      .toMeta()
    assert.deepEqual(meta.toolbarGroups, [
      ['bold', 'italic'],
      ['undo', 'redo', 'horizontalRule'],
    ])
  })

  it('enableToolbarButtons obeys disable list', () => {
    const meta = RichTextField.make('body')
      .toolbarButtons([['bold']])
      .enableToolbarButtons(['italic', 'underline'])
      .disableToolbarButtons(['underline'])
      .toMeta()
    assert.deepEqual(meta.toolbarGroups, [['bold', 'italic']])
  })
})

describe('RichTextField color palettes', () => {
  it('defaults to the bundled text-color palette', () => {
    const meta = RichTextField.make('body').toMeta()
    assert.deepEqual(meta.textColors, DEFAULT_TEXT_COLORS)
    assert.deepEqual(meta.highlightColors, DEFAULT_HIGHLIGHT_COLORS)
    assert.equal(meta.customTextColors, false)
  })

  it('textColors([...]) replaces the palette', () => {
    const palette = [
      { value: '#1e293b', label: 'Slate' },
      { value: '#dc2626', label: 'Red',   dark: '#fca5a5' },
    ]
    const meta = RichTextField.make('body').textColors(palette).toMeta()
    assert.deepEqual(meta.textColors, palette)
  })

  it('customTextColors() opts in to the free-form picker', () => {
    const meta = RichTextField.make('body').customTextColors().toMeta()
    assert.equal(meta.customTextColors, true)
  })

  it('highlightColors([...]) replaces the highlight palette', () => {
    const palette = [{ value: '#fef08a', label: 'Yellow' }]
    const meta = RichTextField.make('body').highlightColors(palette).toMeta()
    assert.deepEqual(meta.highlightColors, palette)
  })

  it('passing null restores the defaults', () => {
    const meta = RichTextField.make('body')
      .textColors([{ value: '#000', label: 'Black' }])
      .textColors(null)
      .toMeta()
    assert.deepEqual(meta.textColors, DEFAULT_TEXT_COLORS)
  })
})

describe('RichTextField file attachments', () => {
  it('defaults: resizableImages=false; no attachment options; toolbar strips attachFiles when no adapter', () => {
    const meta = RichTextField.make('body')
      .toolbarButtons([['bold', 'attachFiles']])
      .toMeta()
    assert.equal(meta.resizableImages, false)
    assert.equal('fileAttachmentsAcceptedFileTypes' in meta, false)
    assert.equal('fileAttachmentsMaxSize'            in meta, false)
    assert.equal('fileAttachmentsDirectory'          in meta, false)
    assert.equal('fileAttachmentsVisibility'         in meta, false)
    assert.equal('uploadUrl'                         in meta, false)
    // attachFiles stripped from the resolved groups when no adapter is wired.
    assert.deepEqual(meta.toolbarGroups, [['bold']])
  })

  it('preserves attachFiles + stamps uploadUrl when adapter is wired', () => {
    const meta = RichTextField.make('body')
      .toolbarButtons([['bold', 'attachFiles']])
      .toMeta({ uploadUrl: '/admin/_uploads', hasUploadAdapter: true })
    assert.deepEqual(meta.toolbarGroups, [['bold', 'attachFiles']])
    assert.equal(meta.uploadUrl, '/admin/_uploads')
  })

  it('drops a toolbar group entirely when attachFiles was its only button', () => {
    const meta = RichTextField.make('body')
      .toolbarButtons([['bold'], ['attachFiles']])
      .toMeta()
    assert.deepEqual(meta.toolbarGroups, [['bold']])
  })

  it('exposes resize + size + accept + directory + visibility', () => {
    const meta = RichTextField.make('body')
      .resizableImages()
      .fileAttachmentsAcceptedFileTypes(['image/*'])
      .fileAttachmentsMaxSize(2_000_000)
      .fileAttachmentsDirectory('articles')
      .fileAttachmentsVisibility('private')
      .toMeta()
    assert.equal(meta.resizableImages, true)
    assert.deepEqual(meta.fileAttachmentsAcceptedFileTypes, ['image/*'])
    assert.equal(meta.fileAttachmentsMaxSize, 2_000_000)
    assert.equal(meta.fileAttachmentsDirectory, 'articles')
    assert.equal(meta.fileAttachmentsVisibility, 'private')
  })
})

describe('RichTextField merge tags + mentions', () => {
  it('mergeTags + mentions default to empty arrays', () => {
    const meta = RichTextField.make('body').toMeta()
    assert.deepEqual(meta.mergeTags, [])
    assert.deepEqual(meta.mentions,  [])
  })

  it('mergeTags([...]) round-trips through meta', () => {
    const meta = RichTextField.make('body')
      .mergeTags(['firstName', 'company'])
      .toMeta()
    assert.deepEqual(meta.mergeTags, ['firstName', 'company'])
  })

  it('mentions([...]) serializes each provider via toMeta()', () => {
    const meta = RichTextField.make('body')
      .mentions([
        MentionProvider.make('@').items([
          { id: 'sleman', label: 'Sleman' },
          { id: 'alex',   label: 'Alex', group: 'Team' },
        ]),
        MentionProvider.make('#').items([
          { id: 'general', label: 'general' },
        ]),
      ])
      .toMeta()
    assert.equal(meta.mentions.length, 2)
    assert.equal(meta.mentions[0]!.trigger, '@')
    assert.equal(meta.mentions[0]!.items.length, 2)
    assert.equal(meta.mentions[0]!.items[0]!.id, 'sleman')
    assert.equal(meta.mentions[0]!.items[1]!.group, 'Team')
    assert.equal(meta.mentions[1]!.trigger, '#')
  })
})

describe('MentionProvider', () => {
  it('rejects non-single-character triggers', () => {
    assert.throws(() => MentionProvider.make(''),  /single character/)
    assert.throws(() => MentionProvider.make('@@'), /single character/)
  })

  it('items() replaces the static list', () => {
    const p = MentionProvider.make('@').items([{ id: 'a', label: 'A' }])
    assert.equal(p.getTrigger(), '@')
    assert.equal(p.getItems().length, 1)
    assert.equal(p.getItems()[0]!.id, 'a')
  })

  it('toMeta() copies the items array (snapshot, not reference)', () => {
    const items = [{ id: 'a', label: 'A' }]
    const meta = MentionProvider.make('@').items(items).toMeta()
    items.push({ id: 'b', label: 'B' })
    assert.equal(meta.items.length, 1)
  })

  it('static providers report isAsync=false and emit no async flag', () => {
    const p = MentionProvider.make('@').items([{ id: 'a', label: 'A' }])
    assert.equal(p.isAsync(), false)
    const meta = p.toMeta()
    assert.equal('async' in meta, false)
  })

  it('itemsUsing(fn) flips isAsync=true and empties the inlined items', () => {
    const p = MentionProvider.make('@').itemsUsing(async () => [{ id: 'a', label: 'A' }])
    assert.equal(p.isAsync(), true)
    const meta = p.toMeta()
    assert.equal(meta.async, true)
    assert.deepEqual(meta.items, [])
  })

  it('runResolver runs the static list when no async fn is set', async () => {
    const p = MentionProvider.make('@').items([
      { id: 'sleman', label: 'Sleman' },
      { id: 'alex',   label: 'Alex'   },
    ])
    const items = await p.runResolver('al', { user: null })
    // Returns the full list — filtering is the menu's job.
    assert.equal(items.length, 2)
  })

  it('runResolver awaits an async resolver and forwards query + ctx', async () => {
    let seenQuery: string | undefined
    let seenUser:  unknown
    const p = MentionProvider.make('@').itemsUsing(async (query, ctx) => {
      seenQuery = query
      seenUser  = ctx.user
      return [{ id: query, label: `Hit: ${query}` }]
    })
    const items = await p.runResolver('alex', { user: { id: 1 } })
    assert.equal(seenQuery, 'alex')
    assert.deepEqual(seenUser, { id: 1 })
    assert.equal(items.length, 1)
    assert.equal(items[0]!.id,    'alex')
    assert.equal(items[0]!.label, 'Hit: alex')
  })

  it('runResolver coerces non-array returns to []', async () => {
    const p = MentionProvider.make('@').itemsUsing((async () => null) as never)
    const items = await p.runResolver('q', {})
    assert.deepEqual(items, [])
  })

  it('items() after itemsUsing() warns and switches to static (last call wins)', () => {
    const orig = console.warn
    const warnings: string[] = []
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]))
    try {
      const p = MentionProvider.make('@')
        .itemsUsing(async () => [{ id: 'x', label: 'X' }])
        .items([{ id: 'a', label: 'A' }])
      assert.equal(p.isAsync(), false)
      assert.equal(warnings.length, 1)
      assert.match(warnings[0]!, /MentionProvider.*items\(\) called after.*itemsUsing/)
    } finally {
      console.warn = orig
    }
  })

  it('itemsUsing() after items() warns and clears the static list', () => {
    const orig = console.warn
    const warnings: string[] = []
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]))
    try {
      const p = MentionProvider.make('@')
        .items([{ id: 'a', label: 'A' }])
        .itemsUsing(async () => [{ id: 'x', label: 'X' }])
      assert.equal(p.isAsync(), true)
      assert.equal(warnings.length, 1)
      assert.match(warnings[0]!, /MentionProvider.*itemsUsing\(\) called after.*items\(\)/)
    } finally {
      console.warn = orig
    }
  })
})

describe('RichTextField mention resolution', () => {
  it('hasAsyncMentions() is false when every provider is static', () => {
    const f = RichTextField.make('body').mentions([
      MentionProvider.make('@').items([{ id: 'a', label: 'A' }]),
    ])
    assert.equal(f.hasAsyncMentions(), false)
  })

  it('hasAsyncMentions() is true when at least one provider is async', () => {
    const f = RichTextField.make('body').mentions([
      MentionProvider.make('@').items([{ id: 'a', label: 'A' }]),
      MentionProvider.make('#').itemsUsing(async () => []),
    ])
    assert.equal(f.hasAsyncMentions(), true)
  })

  it('resolveMention dispatches by trigger char', async () => {
    const f = RichTextField.make('body').mentions([
      MentionProvider.make('@').itemsUsing(async (q) => [{ id: q, label: `User:${q}` }]),
      MentionProvider.make('#').itemsUsing(async (q) => [{ id: q, label: `Channel:${q}` }]),
    ])
    const userHits = await f.resolveMention('@', 'sleman', {})
    const chanHits = await f.resolveMention('#', 'general', {})
    assert.equal(userHits?.[0]?.label, 'User:sleman')
    assert.equal(chanHits?.[0]?.label, 'Channel:general')
  })

  it('resolveMention returns null for unknown triggers', async () => {
    const f = RichTextField.make('body').mentions([
      MentionProvider.make('@').itemsUsing(async () => []),
    ])
    const items = await f.resolveMention('!', 'q', {})
    assert.equal(items, null)
  })

  it('mentionsUrl is omitted from meta until withMentionsUrl stamps it', () => {
    const f = RichTextField.make('body').mentions([
      MentionProvider.make('@').itemsUsing(async () => []),
    ])
    assert.equal('mentionsUrl' in f.toMeta(), false)
    f.withMentionsUrl('/admin/articles/_form/article-form/mentions')
    assert.equal(f.toMeta().mentionsUrl, '/admin/articles/_form/article-form/mentions')
  })
})

describe('RichTextField storage', () => {
  it('defaults to json', () => {
    const meta = RichTextField.make('body').toMeta()
    assert.equal(meta.storage, 'json')
  })

  it('storage("html") opts into HTML serialization', () => {
    const meta = RichTextField.make('body').storage('html').toMeta()
    assert.equal(meta.storage, 'html')
  })
})

describe('Block.toMeta', () => {
  it('uses block name as label fallback', () => {
    const meta = Block.make('hero').toMeta()
    assert.equal(meta.name, 'hero')
    assert.equal(meta.label, 'hero')
    assert.equal(meta.icon, undefined)
    assert.deepEqual(meta.schema, [])
  })

  it('preserves icon and label when set', () => {
    const meta = Block.make('callout').label('Callout block').icon('💡').toMeta()
    assert.equal(meta.label, 'Callout block')
    assert.equal(meta.icon, '💡')
  })
})
