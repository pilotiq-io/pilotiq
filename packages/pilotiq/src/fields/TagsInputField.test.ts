import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { TagsInputField, TagsInput } from './TagsInputField.js'

describe('TagsInputField', () => {
  it('emits fieldType "tagsInput"', async () => {
    const meta = await TagsInputField.make('tags').toMeta()
    assert.equal(meta.fieldType, 'tagsInput')
  })

  it('exports an alias `TagsInput`', () => {
    assert.equal(TagsInput, TagsInputField)
  })

  it('default suggestions is an empty array', async () => {
    const meta = await TagsInputField.make('tags').toMeta()
    assert.deepEqual(meta['suggestions'], [])
  })

  it('omits separator/splitKeys/reorderable/maxTags by default', async () => {
    const meta = await TagsInputField.make('tags').toMeta()
    assert.equal('separator'   in meta, false)
    assert.equal('splitKeys'   in meta, false)
    assert.equal('reorderable' in meta, false)
    assert.equal('maxTags'     in meta, false)
  })

  describe('suggestions(static array)', () => {
    it('emits suggestions verbatim', async () => {
      const meta = await TagsInputField.make('tags')
        .suggestions(['react', 'vue', 'svelte'])
        .toMeta()
      assert.deepEqual(meta['suggestions'], ['react', 'vue', 'svelte'])
    })

    it('hasDynamicSuggestions is false for static arrays', () => {
      const f = TagsInputField.make('tags').suggestions(['a'])
      assert.equal(f.hasDynamicSuggestions(), false)
      assert.deepEqual(f.getSuggestions(), ['a'])
    })
  })

  describe('suggestions(resolver function)', () => {
    it('runs the resolver against ctx', async () => {
      const f = TagsInputField.make('tags').suggestions(({ $get }) => {
        const stack = $get?.('stack') as string | undefined
        if (stack === 'fe') return ['react', 'vue']
        return ['node', 'rails']
      })
      assert.equal(f.hasDynamicSuggestions(), true)
      const meta = await f.toMeta({
        values: { stack: 'fe' },
        $get:   (n) => ({ stack: 'fe' } as Record<string, unknown>)[n],
      })
      assert.deepEqual(meta['suggestions'], ['react', 'vue'])
    })

    it('async resolver is awaited', async () => {
      const f = TagsInputField.make('tags').suggestions(async () => {
        await new Promise(r => setTimeout(r, 1))
        return ['async']
      })
      const meta = await f.toMeta()
      assert.deepEqual(meta['suggestions'], ['async'])
    })

    it('thrown resolver returns empty suggestions + console.warn', async () => {
      const original = console.warn
      const calls: unknown[] = []
      console.warn = (...args: unknown[]) => { calls.push(args) }
      try {
        const f = TagsInputField.make('broken').suggestions(() => { throw new Error('boom') })
        const meta = await f.toMeta()
        assert.deepEqual(meta['suggestions'], [])
        assert.equal(calls.length, 1)
      } finally {
        console.warn = original
      }
    })
  })

  describe('separator', () => {
    it('emits when set to a non-default char', async () => {
      const meta = await TagsInputField.make('tags').separator(';').toMeta()
      assert.equal(meta['separator'], ';')
    })

    it('emits null when explicitly disabled', async () => {
      const meta = await TagsInputField.make('tags').separator(null).toMeta()
      assert.equal(meta['separator'], null)
    })

    it('omits when left at the default ","', async () => {
      const meta = await TagsInputField.make('tags').separator(',').toMeta()
      assert.equal('separator' in meta, false)
    })
  })

  describe('splitKeys', () => {
    it('emits when overridden', async () => {
      const meta = await TagsInputField.make('tags').splitKeys(['Enter', 'Tab']).toMeta()
      assert.deepEqual(meta['splitKeys'], ['Enter', 'Tab'])
    })

    it('omits when left at the default ["Enter"]', async () => {
      const meta = await TagsInputField.make('tags').splitKeys(['Enter']).toMeta()
      assert.equal('splitKeys' in meta, false)
    })
  })

  describe('reorderable', () => {
    it('emits true when enabled', async () => {
      const meta = await TagsInputField.make('tags').reorderable().toMeta()
      assert.equal(meta['reorderable'], true)
    })

    it('omits when explicitly disabled', async () => {
      const meta = await TagsInputField.make('tags').reorderable(false).toMeta()
      assert.equal('reorderable' in meta, false)
    })
  })

  describe('maxTags', () => {
    it('emits when set', async () => {
      const meta = await TagsInputField.make('tags').maxTags(5).toMeta()
      assert.equal(meta['maxTags'], 5)
    })

    it('clamps to >= 1 and floors fractional values', () => {
      const a = TagsInputField.make('a').maxTags(0)
      const b = TagsInputField.make('b').maxTags(3.7)
      assert.equal(a.getMaxTags(), 1)
      assert.equal(b.getMaxTags(), 3)
    })
  })

  it('participates in cross-field plumbing (default / required / live / helperText)', async () => {
    const f = TagsInputField.make('tags')
      .label('Tags')
      .required()
      .default(['draft'])
      .helperText('Press Enter to add')
      .live()
      .suggestions(['draft', 'published'])
    const meta = await f.toMeta()
    assert.equal(meta.fieldType,        'tagsInput')
    assert.equal(meta.required,         true)
    assert.equal(meta.label,            'Tags')
    assert.equal(meta['helperText'],    'Press Enter to add')
    assert.equal(meta['live'],          true)
    assert.deepEqual(meta['defaultValue'], ['draft'])
  })
})
