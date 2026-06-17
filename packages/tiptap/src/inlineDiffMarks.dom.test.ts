import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'

import { InlineDiffExtension, contentBlockNodes } from './index.js'

/**
 * Issue #219 — the DELETED (red) side of an inline diff must keep its inline
 * formatting (bold / italic / link / code), matching the inserted (green) side.
 * Before the fix, the plain-paragraph branch of `buildDeletedWidget()` flattened
 * the old text with `node.textContent`, so a removed `<strong>`/`<em>`/`<a>` run
 * rendered as plain struck text while the new run stayed bold/italic — the diff
 * looked inconsistent.
 *
 * Also guards that, in `lines` mode, a mark boundary INSIDE a changed span does
 * not drift the intra-line highlight onto the wrong characters.
 */

function mount(content: string): Editor {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return new Editor({ element: el, extensions: [StarterKit, ...contentBlockNodes, InlineDiffExtension], content })
}

function sliceFromHtml(editor: Editor, html: string) {
  const container = document.createElement('div')
  container.innerHTML = html
  return ProseMirrorDOMParser.fromSchema(editor.schema).parseSlice(container)
}

function startDiff(editor: Editor, newHtml: string, mode: 'inline' | 'lines' = 'inline'): void {
  editor.commands.startInlineDiff('t', sliceFromHtml(editor, newHtml), mode)
}

const root = (editor: Editor): HTMLElement => editor.view.dom as HTMLElement

describe('AI inline diff — deleted side preserves inline marks (#219)', () => {
  it('keeps a removed <strong> run bold on the deleted side', () => {
    const editor = mount('<p>The <strong>quick brown</strong> fox</p>')
    startDiff(editor, '<p>The <strong>slow brown</strong> fox</p>')

    const del = root(editor).querySelector('.pilotiq-diff-deleted-text')
    assert.ok(del, 'an inline deleted-text span should render for a paragraph edit')
    const strong = del!.querySelector('strong')
    assert.ok(strong, 'the removed bold run must stay <strong>, not flatten to plain text')
    assert.match(strong!.textContent ?? '', /quick/, 'the old bold word is preserved')

    editor.destroy()
  })

  it('keeps a removed <em> run italic on the deleted side', () => {
    const editor = mount('<p>an <em>important note</em> here</p>')
    startDiff(editor, '<p>an <em>important update</em> here</p>')

    const del = root(editor).querySelector('.pilotiq-diff-deleted-text')
    assert.ok(del!.querySelector('em'), 'the removed italic run must stay <em>')

    editor.destroy()
  })

  it('keeps a removed link on the deleted side', () => {
    const editor = mount('<p>see <a href="https://a.test">the old docs</a> now</p>')
    startDiff(editor, '<p>see <a href="https://a.test">the new docs</a> now</p>')

    const del = root(editor).querySelector('.pilotiq-diff-deleted-text')
    assert.ok(del!.querySelector('a'), 'the removed link must stay an <a>, not flatten to text')

    editor.destroy()
  })

  it('does not stack a marked paragraph edit into a deleted block', () => {
    // The inline (non-stacked) look must survive: marks are serialized as
    // inline fragment content, never promoted to the block branch.
    const editor = mount('<p>The <strong>quick</strong> fox</p>')
    startDiff(editor, '<p>The <strong>slow</strong> fox</p>')

    assert.equal(
      root(editor).querySelector('.pilotiq-diff-deleted-block p'),
      null,
      'a marked one-word paragraph edit must stay inline, not become a stacked block',
    )

    editor.destroy()
  })

  it('lines mode: a mark boundary inside the change does not misalign the highlight', () => {
    // "brown" is bold, splitting the paragraph into 3 text nodes. The edit is
    // aet -> eat, well clear of the bold run. The highlight must still land on
    // exactly the changed word on both sides (no offset drift across the mark).
    const editor = mount('<p>What you aet around <strong>brown</strong> rice</p>')
    startDiff(editor, '<p>What you eat around <strong>brown</strong> rice</p>', 'lines')
    const dom = root(editor)

    const del = Array.from(dom.querySelectorAll('.pilotiq-diff-deleted-line-changed')).map(e => e.textContent)
    const ins = Array.from(dom.querySelectorAll('.pilotiq-diff-inserted-line-changed')).map(e => e.textContent)
    assert.deepEqual(del, ['aet'], 'removed side highlights exactly the old word, despite the bold run')
    assert.deepEqual(ins, ['eat'], 'added side highlights exactly the new word, despite the bold run')

    editor.destroy()
  })

  it('lines mode: editing a word INSIDE the bold run highlights the right characters', () => {
    const editor = mount('<p>keep <strong>quikc</strong> end</p>')
    startDiff(editor, '<p>keep <strong>quick</strong> end</p>', 'lines')
    const dom = root(editor)

    const del = Array.from(dom.querySelectorAll('.pilotiq-diff-deleted-line-changed')).map(e => e.textContent)
    const ins = Array.from(dom.querySelectorAll('.pilotiq-diff-inserted-line-changed')).map(e => e.textContent)
    assert.deepEqual(del, ['quikc'], 'old bold typo highlighted, mapped through the mark boundary')
    assert.deepEqual(ins, ['quick'], 'new bold word highlighted, mapped through the mark boundary')

    editor.destroy()
  })
})
