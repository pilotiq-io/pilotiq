import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'

import { createPlainTextEditor, plainTextOf } from './PlainTextEditor.js'

/**
 * Phase 6e proof-of-concept — mount a real Tiptap `Editor` against the
 * jsdom DOM that `src/test/setup.ts` boots, exercise typing through the
 * ProseMirror transaction API, and assert via the public surface.
 *
 * The pure-config tests in `PlainTextEditor.test.ts` cover schema-shape
 * fixtures (`plainTextToDoc`); this file proves the config actually
 * behaves correctly when mounted into the editor's lifecycle —
 * `setContent` → `getJSON` → `plainTextOf` round-trip, multi-line
 * separator handling, document constraint enforcement. Component-level
 * coverage that previously lived only in the playground now has a
 * fast in-process test.
 */
describe('createPlainTextEditor (DOM)', () => {
  function mountInDom(multiline: boolean): { editor: Editor; el: HTMLDivElement } {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const editor = new Editor({
      ...createPlainTextEditor({ multiline, content: '' }),
      element: el,
    })
    return { editor, el }
  }

  it('single-line: setContent + plainTextOf round-trips one paragraph', () => {
    const { editor } = mountInDom(false)
    try {
      editor.commands.setContent('hello world')
      assert.equal(plainTextOf(editor), 'hello world')
    } finally {
      editor.destroy()
    }
  })

  it('single-line: schema rejects multi-paragraph content (collapses to one)', () => {
    const { editor } = mountInDom(false)
    try {
      // ProseMirror enforces the doc schema; PlainTextDocument's content
      // expression is `paragraph` (a SINGLE paragraph) in single-line
      // mode. Passing a multi-paragraph JSON tree should be coerced to
      // one paragraph by Tiptap's repair pass rather than throwing.
      editor.commands.setContent({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'line one' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'line two' }] },
        ],
      })
      // The exact repair behavior is "keep what fits, drop the rest" —
      // we don't assert the specific outcome (`line one` only vs the
      // two joined), only that the result is single-paragraph and
      // non-empty. Future Tiptap version bumps that change the repair
      // strategy won't break this test.
      const json = editor.getJSON()
      assert.equal(json.content?.length, 1, 'single paragraph after repair')
      assert.ok(plainTextOf(editor).length > 0, 'non-empty after repair')
      assert.ok(!plainTextOf(editor).includes('\n'), 'no newline in single-line mode')
    } finally {
      editor.destroy()
    }
  })

  it('multi-line: setContent across paragraphs serializes with \\n separators', () => {
    const { editor } = mountInDom(true)
    try {
      editor.commands.setContent({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'third' }] },
        ],
      })
      assert.equal(plainTextOf(editor), 'first\nsecond\nthird')
    } finally {
      editor.destroy()
    }
  })

  it('multi-line: empty document returns empty string', () => {
    const { editor } = mountInDom(true)
    try {
      assert.equal(plainTextOf(editor), '')
    } finally {
      editor.destroy()
    }
  })

  it('typing via commands.insertContent updates the visible DOM', () => {
    const { editor, el } = mountInDom(false)
    try {
      editor.commands.focus()
      editor.commands.insertContent('typed via command')
      assert.equal(plainTextOf(editor), 'typed via command')
      // The ProseMirror view renders `.ProseMirror` inside the mount
      // element; verify the text is in the visible DOM too (this is
      // the assertion that pure-data fixtures can't make).
      const pm = el.querySelector('.ProseMirror')
      assert.ok(pm, 'ProseMirror view mounted')
      assert.ok(pm!.textContent?.includes('typed via command'), 'text rendered in DOM')
    } finally {
      editor.destroy()
    }
  })
})
