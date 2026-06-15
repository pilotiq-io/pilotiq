import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'

import { InlineDiffExtension, contentBlockNodes } from './index.js'

/**
 * Issue #186 — `lines` mode must highlight the CHANGED CHARACTERS of a
 * replaced line (GitHub-style intra-line diff), not just paint the whole
 * red/green rows. The highlight is a background tint via the
 * `*-line-changed` classes — NOT bold.
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

function startLinesDiff(editor: Editor, newHtml: string): void {
  editor.commands.startInlineDiff('t', sliceFromHtml(editor, newHtml), 'lines')
}

const root = (editor: Editor): HTMLElement => editor.view.dom as HTMLElement

describe('AI inline diff — lines-mode intra-line highlight (#186)', () => {
  it('highlights only the changed word on both the removed and added rows', () => {
    const editor = mount('<p>What you aet around your training</p>')
    startLinesDiff(editor, '<p>What you eat around your training</p>')
    const dom = root(editor)

    const del = dom.querySelectorAll('.pilotiq-diff-deleted-line-changed')
    const ins = dom.querySelectorAll('.pilotiq-diff-inserted-line-changed')
    assert.equal(del.length, 1, 'one changed span on the removed row')
    assert.equal(ins.length, 1, 'one changed span on the added row')
    assert.equal(del[0]!.textContent, 'aet', 'removed row highlights the old word')
    assert.equal(ins[0]!.textContent, 'eat', 'added row highlights the new word')

    // Not bold: the highlight carries no font-weight, only a background class.
    assert.equal((del[0] as HTMLElement).style.fontWeight, '', 'highlight is a tint, not bold')

    editor.destroy()
  })

  it('does NOT highlight when the replacement is unrelated (low similarity)', () => {
    const editor = mount('<p>the quick brown fox jumps</p>')
    startLinesDiff(editor, '<p>completely unrelated replacement line</p>')
    const dom = root(editor)

    assert.equal(dom.querySelectorAll('.pilotiq-diff-deleted-line-changed').length, 0)
    assert.equal(dom.querySelectorAll('.pilotiq-diff-inserted-line-changed').length, 0)
    // The full red/green rows still render.
    assert.ok(dom.querySelector('.pilotiq-diff-deleted-line'), 'removed row still present')
    assert.ok(dom.querySelector('.pilotiq-diff-inserted-line'), 'added row still present')

    editor.destroy()
  })

  it('merging two paragraphs into one (2→1) does NOT bogus-highlight the merged tail', () => {
    // Text is identical bar the paragraph break — neither side should light up.
    const editor = mount('<p>First sentence here.</p><p>Second sentence here.</p>')
    startLinesDiff(editor, '<p>First sentence here. Second sentence here.</p>')
    const dom = root(editor)

    assert.equal(dom.querySelectorAll('.pilotiq-diff-inserted-line-changed').length, 0,
      'a pure merge must not paint the second half as inserted')
    assert.equal(dom.querySelectorAll('.pilotiq-diff-deleted-line-changed').length, 0)

    editor.destroy()
  })

  it('a real edit during a 2→1 merge highlights symmetrically on both sides', () => {
    const editor = mount('<p>First sentence here.</p><p>Second setnence here.</p>')
    startLinesDiff(editor, '<p>First sentence here. Second sentence here.</p>')
    const dom = root(editor)

    const del = Array.from(dom.querySelectorAll('.pilotiq-diff-deleted-line-changed')).map(e => e.textContent)
    const ins = Array.from(dom.querySelectorAll('.pilotiq-diff-inserted-line-changed')).map(e => e.textContent)
    assert.deepEqual(del, ['setnence'], 'removed side highlights the old typo')
    assert.deepEqual(ins, ['sentence'], 'added side highlights the fix — symmetric')

    editor.destroy()
  })

  it('a pure addition (no paired removal) carries no changed highlight', () => {
    const editor = mount('<p>keep me</p>')
    startLinesDiff(editor, '<p>keep me</p><p>brand new line</p>')
    const dom = root(editor)

    assert.equal(dom.querySelectorAll('.pilotiq-diff-inserted-line-changed').length, 0)
    assert.equal(dom.querySelectorAll('.pilotiq-diff-deleted-line-changed').length, 0)
    assert.ok(dom.querySelector('.pilotiq-diff-inserted-line'), 'the new line still renders as an added row')

    editor.destroy()
  })
})
