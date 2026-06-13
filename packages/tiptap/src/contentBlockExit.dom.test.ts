import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

import { contentBlockNodes, planExitLabeledBlock } from './index.js'

/**
 * #150 — landmark-block Enter exit. Double-Enter from an empty trailing node
 * inside a `block+` landmark block (`keyTakeaways` / `summary` / `intro`) must
 * EXIT the block (cursor lands in a paragraph after it, no empty node left
 * trapped inside), not lift an empty paragraph that stays nested in the block.
 *
 * Pins `planExitLabeledBlock` (the engine behind `LabeledBlockExitKeymap`'s
 * Enter handler) against the REAL `@pilotiq/tiptap` schema, mirroring the
 * surgical-op planner tests — no React mount, no synthetic key events.
 */
function mount(content: string): Editor {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return new Editor({ element: el, extensions: [StarterKit, ...contentBlockNodes], content })
}

/** Wrap `bodyHtml` in a landmark block's wire HTML (parsed via `.pilotiq-block-body`). */
function landmark(type: string, label: string, bodyHtml: string): string {
  return (
    `<div data-type="${type}">` +
    `<div class="pilotiq-block-content">` +
    `<div class="pilotiq-block-label">${label}</div>` +
    `<div class="pilotiq-block-body">${bodyHtml}</div>` +
    `</div></div>`
  )
}

interface JNode { type?: string; content?: JNode[] }
const contentOf = (editor: Editor): JNode[] => ((editor.getJSON().content ?? []) as JNode[])
const isEmptyParagraph = (n: JNode | undefined): boolean =>
  !!n && n.type === 'paragraph' && (!Array.isArray(n.content) || n.content.length === 0)

/** Put the cursor inside the empty trailing textblock nested in `blockType`. */
function selectEmptyTrailingInside(editor: Editor, blockType: string): boolean {
  let pos = -1
  editor.state.doc.descendants((node, p) => {
    if (node.type.name !== 'paragraph' || node.content.size !== 0) return true
    const $p = editor.state.doc.resolve(p)
    for (let d = $p.depth; d > 0; d--) {
      if ($p.node(d).type.name === blockType) { pos = p; return false }
    }
    return true
  })
  if (pos === -1) return false
  editor.commands.setTextSelection(pos + 1)
  return true
}

/** Run the planner against the live selection, like the keymap handler does. */
function runExit(editor: Editor): boolean {
  const plan = planExitLabeledBlock(editor.state)
  if (!plan) return false
  return editor.commands.command(({ tr }) => { plan(tr); return true })
}

describe('#150 landmark-block Enter exit (real @pilotiq/tiptap schema)', () => {
  it('empty last list item → drops the item, exits the block, keeps real items', () => {
    const editor = mount(landmark('keyTakeaways', 'Key takeaways', '<ul><li><p>foo</p></li><li><p></p></li></ul>'))
    assert.ok(selectEmptyTrailingInside(editor, 'keyTakeaways'), 'found empty trailing item')
    assert.ok(runExit(editor), 'planner fired')

    const top = contentOf(editor)
    const ktIdx = top.findIndex((n) => n.type === 'keyTakeaways')
    const kt = top[ktIdx]
    const list = kt?.content?.[0]
    assert.equal(list?.type, 'bulletList', 'block still holds the list')
    assert.equal(list?.content?.length, 1, 'only the real list item remains (empty one dropped)')
    assert.ok(isEmptyParagraph(top[ktIdx + 1]), 'cursor lands in a new empty paragraph after the block')
    editor.destroy()
  })

  it('empty trailing paragraph → drops it, exits the block, keeps real content', () => {
    const editor = mount(landmark('summary', 'Summary', '<p>hello</p><p></p>'))
    assert.ok(selectEmptyTrailingInside(editor, 'summary'), 'found empty trailing paragraph')
    assert.ok(runExit(editor), 'planner fired')

    const top = contentOf(editor)
    const idx = top.findIndex((n) => n.type === 'summary')
    const summary = top[idx]
    assert.equal(summary?.content?.length, 1, 'only the real paragraph remains')
    assert.ok(isEmptyParagraph(top[idx + 1]), 'cursor lands in a paragraph after the block')
    editor.destroy()
  })

  it('does NOT fire for an empty paragraph in the MIDDLE of the block', () => {
    const editor = mount(landmark('intro', 'Introduction', '<p>a</p><p></p><p>b</p>'))
    // Select the middle empty paragraph specifically.
    let pos = -1
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === 'paragraph' && node.content.size === 0 && pos === -1) pos = p
      return true
    })
    editor.commands.setTextSelection(pos + 1)
    assert.equal(planExitLabeledBlock(editor.state), null, 'planner declines — not trailing')
    editor.destroy()
  })

  it('does NOT fire outside a landmark block (plain list keeps default behaviour)', () => {
    const editor = mount('<ul><li><p>foo</p></li><li><p></p></li></ul>')
    let pos = -1
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === 'paragraph' && node.content.size === 0) { pos = p; return false }
      return true
    })
    editor.commands.setTextSelection(pos + 1)
    assert.equal(planExitLabeledBlock(editor.state), null, 'planner declines outside any landmark block')
    editor.destroy()
  })
})
