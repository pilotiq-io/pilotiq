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
