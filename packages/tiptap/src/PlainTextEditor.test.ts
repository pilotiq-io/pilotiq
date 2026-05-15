import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  createPlainTextEditor,
  plainTextToDoc,
  type PlainTextEditorOptions,
} from './PlainTextEditor.js'

describe('plainTextToDoc — single-line', () => {
  it('empty string yields one empty paragraph', () => {
    assert.deepEqual(plainTextToDoc('', false), {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
  })

  it('wraps a single run of text in one paragraph', () => {
    assert.deepEqual(plainTextToDoc('hello', false), {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    })
  })

  it('strips embedded newlines (LF and CRLF) — single-line schema permits one paragraph only', () => {
    assert.deepEqual(plainTextToDoc('a\nb', false), {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ab' }] }],
    })
    assert.deepEqual(plainTextToDoc('a\r\nb', false), {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ab' }] }],
    })
  })
})

describe('plainTextToDoc — multi-line', () => {
  it('empty string yields one empty paragraph', () => {
    assert.deepEqual(plainTextToDoc('', true), {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
  })

  it('splits LF-separated lines into separate paragraphs', () => {
    assert.deepEqual(plainTextToDoc('a\nb', true), {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
      ],
    })
  })

  it('preserves empty lines as empty paragraphs', () => {
    assert.deepEqual(plainTextToDoc('a\n\nb', true), {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
      ],
    })
  })

  it('normalises CRLF to single paragraph splits', () => {
    assert.deepEqual(plainTextToDoc('a\r\nb', true), {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
      ],
    })
  })
})

describe('createPlainTextEditor — config shape', () => {
  function names(extensions: ReadonlyArray<{ name: string }>): string[] {
    return extensions.map((e) => e.name)
  }

  it('default config: single-line, editable, schema + single-line keymap only', () => {
    const cfg = createPlainTextEditor()
    assert.equal(cfg.editable, true)
    assert.equal(cfg.content, '')
    const exts = (cfg.extensions ?? []) as Array<{ name: string }>
    assert.deepEqual(names(exts), ['doc', 'paragraph', 'text', 'plainTextSingleLineKeymap'])
    assert.equal(cfg.editorProps, undefined)
    assert.equal(cfg.onUpdate, undefined)
  })

  it('multiline mode drops the single-line keymap', () => {
    const cfg = createPlainTextEditor({ multiline: true })
    const exts = (cfg.extensions ?? []) as Array<{ name: string }>
    assert.deepEqual(names(exts), ['doc', 'paragraph', 'text'])
  })

  it('placeholder appends the Placeholder extension', () => {
    const cfg = createPlainTextEditor({ placeholder: 'Type here…' })
    const exts = (cfg.extensions ?? []) as Array<{ name: string }>
    assert.ok(exts.some((e) => e.name === 'placeholder'),
      `expected placeholder extension, got ${names(exts).join(',')}`)
  })

  it('caller-supplied extensions land after schema + behavior', () => {
    const fakeExt = { name: 'fake-collab' } as unknown as Parameters<typeof createPlainTextEditor>[0] extends infer T
      ? T extends { extensions?: Array<infer E> } ? E : never : never
    const cfg = createPlainTextEditor({ extensions: [fakeExt] })
    const exts = (cfg.extensions ?? []) as Array<{ name: string }>
    assert.equal(exts[exts.length - 1]?.name, 'fake-collab')
  })

  it('editable can be turned off', () => {
    const cfg = createPlainTextEditor({ editable: false })
    assert.equal(cfg.editable, false)
  })

  it('seeds content as a doc JSON when text provided (single-line)', () => {
    const cfg = createPlainTextEditor({ content: 'hello' })
    assert.deepEqual(cfg.content, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    })
  })

  it('seeds content as multi-paragraph doc JSON when multiline + text provided', () => {
    const cfg = createPlainTextEditor({ multiline: true, content: 'a\nb' })
    assert.deepEqual(cfg.content, {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
      ],
    })
  })

  it('empty content stays an empty string sentinel — Collaboration-friendly', () => {
    // When collab is on, callers pass content omitted/'' so Collaboration's
    // y-prosemirror binding takes ownership of the doc without a seed race.
    const cfg = createPlainTextEditor({ content: '' })
    assert.equal(cfg.content, '')
  })

  it('editorAttributes plumb into editorProps.attributes verbatim', () => {
    const attrs = { class: 'foo bar', 'aria-label': 'Name' }
    const cfg = createPlainTextEditor({ editorAttributes: attrs })
    assert.deepEqual(cfg.editorProps, { attributes: attrs })
  })

  it('onUpdate is wired only when caller provides it', () => {
    const withCb: PlainTextEditorOptions = { onUpdate: () => {} }
    const cfgA = createPlainTextEditor(withCb)
    assert.equal(typeof cfgA.onUpdate, 'function')

    const cfgB = createPlainTextEditor()
    assert.equal(cfgB.onUpdate, undefined)
  })
})
