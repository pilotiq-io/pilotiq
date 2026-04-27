import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TextField, TextareaField } from '@pilotiq/pilotiq'

import { RichTextField } from './RichTextField.js'
import { Block } from './Block.js'

describe('RichTextField.toMeta', () => {
  it('emits fieldType=richtext with empty defaults', () => {
    const meta = RichTextField.make('body').toMeta()
    assert.equal(meta.fieldType, 'richtext')
    assert.equal(meta.name, 'body')
    assert.deepEqual(meta.blocks, [])
    assert.equal(meta.slashCommand, true)
    assert.equal(meta.toolbar, 'default')
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

  it('honors toolbar("none")', () => {
    const meta = RichTextField.make('body').toolbar('none').toMeta()
    assert.equal(meta.toolbar, 'none')
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
