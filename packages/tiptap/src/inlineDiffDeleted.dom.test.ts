import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'

import { InlineDiffExtension, contentBlockNodes } from './index.js'

/**
 * Bug #91 — the DELETED side of an AI inline diff must keep its original
 * block formatting. Before the fix, deleted content was flattened with
 * `textBetween()` / `node.textContent`, so a removed heading / list / faq
 * rendered as plain text next to the (correctly-formatted) inserted side.
 *
 * These tests mount a real editor, start an inline diff replacing formatted
 * content, and assert the deleted widget DOM carries the real structure
 * (`<h2>`, `<ul><li>`, faq wrappers) — mirroring the surgical-ops contract
 * tests. Plain-paragraph word edits must STILL render inline (no regression
 * of the word-level diff).
 */

function mount(content: string): Editor {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return new Editor({ element: el, extensions: [StarterKit, ...contentBlockNodes, InlineDiffExtension], content })
}

/** HTML → ProseMirror Slice, exactly as `TiptapEditor`'s `parseSuggestion` does. */
function sliceFromHtml(editor: Editor, html: string) {
  const container = document.createElement('div')
  container.innerHTML = html
  return ProseMirrorDOMParser.fromSchema(editor.schema).parseSlice(container)
}

/** Start an inline diff replacing the whole doc body with `newHtml`. */
function startDiff(editor: Editor, newHtml: string, mode: 'inline' | 'lines' = 'inline'): void {
  editor.commands.startInlineDiff('t', sliceFromHtml(editor, newHtml), mode)
}

const deletedRoot = (editor: Editor): HTMLElement => editor.view.dom as HTMLElement

describe('AI inline diff — deleted side preserves block formatting (#91)', () => {
  it('a replaced heading shows the deleted side as a real <h2>', () => {
    const editor = mount('<h2>Old heading</h2>')
    startDiff(editor, '<h2>New heading</h2>')

    const block = deletedRoot(editor).querySelector('.pilotiq-diff-deleted-block')
    assert.ok(block, 'a structure-preserving deleted-block widget should render')
    const h2 = block!.querySelector('h2')
    assert.ok(h2, 'the deleted heading must render as an <h2>, not plain text')
    // The changeset deletes only the changed word ("Old"), kept in <h2> form.
    assert.match(h2!.textContent ?? '', /Old/)

    editor.destroy()
  })

  it('a removed bullet list shows the deleted side as a real <ul><li>', () => {
    const editor = mount('<ul><li>Item one</li><li>Item two</li></ul>')
    startDiff(editor, '<p>flattened</p>')

    const root = deletedRoot(editor)
    assert.ok(
      root.querySelectorAll('.pilotiq-diff-deleted-block ul').length >= 1,
      'the deleted list must render as a <ul>, not flattened text',
    )
    assert.ok(
      root.querySelectorAll('.pilotiq-diff-deleted-block li').length >= 2,
      'both <li> items preserved (possibly across struck fragments)',
    )

    editor.destroy()
  })

  it('a removed faq block keeps its faq structure on the deleted side', () => {
    const faqHtml =
      '<div data-type="faq">' +
      '<div data-type="faqItem">' +
      '<div data-type="faqQuestion"><div class="pilotiq-faq-text">Q?</div></div>' +
      '<div data-type="faqAnswer"><div class="pilotiq-faq-body"><p>A.</p></div></div>' +
      '</div></div>'
    const editor = mount(faqHtml)
    startDiff(editor, '<p>plain</p>')

    const faq = deletedRoot(editor).querySelector('.pilotiq-diff-deleted-block [data-type="faq"]')
    assert.ok(faq, 'the deleted faq must keep its faq structure, not collapse to text')

    editor.destroy()
  })

  it('a plain-paragraph word edit STILL renders inline (no word-diff regression)', () => {
    const editor = mount('<p>the quick brown fox</p>')
    startDiff(editor, '<p>the slow brown fox</p>')

    const root = deletedRoot(editor)
    assert.ok(
      root.querySelector('.pilotiq-diff-deleted-text'),
      'a plain-paragraph deletion should stay inline struck-through text',
    )
    assert.equal(
      root.querySelector('.pilotiq-diff-deleted-block p'),
      null,
      'a one-word paragraph edit must NOT be promoted to a stacked deleted block',
    )

    editor.destroy()
  })

  it('lines mode renders a removed heading row as a real <h2>', () => {
    const editor = mount('<h2>Heading</h2><p>keep me</p>')
    startDiff(editor, '<p>keep me</p>', 'lines')

    const h2 = deletedRoot(editor).querySelector('.pilotiq-diff-deleted-line h2')
    assert.ok(h2, 'lines mode must render the removed heading row as an <h2>')
    assert.match(h2!.textContent ?? '', /Heading/)

    editor.destroy()
  })
})
