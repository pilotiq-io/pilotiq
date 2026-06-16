import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'

import {
  InlineDiffExtension,
  contentBlockNodes,
  getInlineDiffState,
  planReplaceBlock,
  planDeleteBlock,
  planInsertBlockBefore,
  type TransactionModifier,
} from './index.js'

/**
 * Issue #92 — per-suggestion Approve/Reject. When the AI proposes several
 * surgical edits, each lands as its OWN {@link DiffRegion} with its own
 * Accept / Reject, instead of folding into one bulk control. These tests
 * drive the extension directly (no producer / bridge) and assert:
 *   - N ops → N independently-tracked regions + N inline controls;
 *   - accepting one keeps that change and leaves the rest pending, valid;
 *   - rejecting one reverts ONLY that change;
 *   - accept-all / reject-all still resolve the whole set;
 *   - a whole-field replacement degrades to a single region.
 */

function mount(content: string): Editor {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return new Editor({ element: el, extensions: [StarterKit, ...contentBlockNodes, InlineDiffExtension], content })
}

interface JNode { type?: string; text?: string; content?: JNode[] }
const text = (n: JNode): string => (n.text ?? (n.content ?? []).map(text).join(''))
const texts = (editor: Editor): string[] => ((editor.getJSON().content ?? []) as JNode[]).map(text)

const regionCount = (editor: Editor): number => getInlineDiffState(editor.state)?.regions.length ?? 0
const regionIds   = (editor: Editor): string[] => (getInlineDiffState(editor.state)?.regions ?? []).map(r => r.id)
// Distinct region anchors the floating <DiffRegionControls> overlay attaches a
// ✓/✕ to — one per pending region (a region may tag several elements, e.g. an
// inserted span + a deleted widget, so count distinct ids). The overlay itself
// isn't mounted in these pure-extension tests.
const controls    = (editor: Editor): number => new Set(
  Array.from((editor.view.dom as HTMLElement).querySelectorAll('[data-pilotiq-diff-region]'))
    .map(el => el.getAttribute('data-pilotiq-diff-region')),
).size

/** Apply one surgical op as its own region (id `s${i}`), planning against the
 *  current doc so each op sees the prior op's result. */
function applyOp(editor: Editor, id: string, plan: TransactionModifier | null): void {
  assert.ok(plan, `planner returned null for ${id}`)
  editor.commands.applySurgicalInlineDiff(id, plan!)
}

describe('InlineDiff per-region (#92)', () => {
  it('three surgical ops produce three regions + three controls', () => {
    const editor = mount('<p>one</p><p>two</p><p>three</p>')
    applyOp(editor, 's0', planReplaceBlock(editor, 0, '<p>FIRST</p>'))
    applyOp(editor, 's1', planReplaceBlock(editor, 1, '<p>SECOND</p>'))
    applyOp(editor, 's2', planReplaceBlock(editor, 2, '<p>THIRD</p>'))

    assert.equal(regionCount(editor), 3, 'three independent regions')
    assert.deepEqual(regionIds(editor), ['s0', 's1', 's2'])
    assert.deepEqual(texts(editor), ['FIRST', 'SECOND', 'THIRD'])
    assert.equal(controls(editor), 3, 'one ✓/✕ control per region')

    editor.destroy()
  })

  it('accepting one region keeps that change and leaves the rest pending', () => {
    const editor = mount('<p>one</p><p>two</p><p>three</p>')
    applyOp(editor, 's0', planReplaceBlock(editor, 0, '<p>FIRST</p>'))
    applyOp(editor, 's1', planReplaceBlock(editor, 1, '<p>SECOND</p>'))
    applyOp(editor, 's2', planReplaceBlock(editor, 2, '<p>THIRD</p>'))

    editor.commands.acceptInlineDiffRegion('s1')

    assert.equal(regionCount(editor), 2, 's1 retired, two remain')
    assert.deepEqual(regionIds(editor), ['s0', 's2'])
    assert.deepEqual(texts(editor), ['FIRST', 'SECOND', 'THIRD'], 'accepted text stays')
    assert.equal(controls(editor), 2)

    editor.destroy()
  })

  it('rejecting one region reverts ONLY that change; others stay', () => {
    const editor = mount('<p>one</p><p>two</p><p>three</p>')
    applyOp(editor, 's0', planReplaceBlock(editor, 0, '<p>FIRST</p>'))
    applyOp(editor, 's1', planReplaceBlock(editor, 1, '<p>SECOND</p>'))
    applyOp(editor, 's2', planReplaceBlock(editor, 2, '<p>THIRD</p>'))

    editor.commands.rejectInlineDiffRegion('s0')

    assert.deepEqual(texts(editor), ['one', 'SECOND', 'THIRD'], 'only s0 reverted')
    assert.deepEqual(regionIds(editor), ['s1', 's2'])

    // The surviving regions are still position-valid: rejecting s2 reverts
    // exactly block three.
    editor.commands.rejectInlineDiffRegion('s2')
    assert.deepEqual(texts(editor), ['one', 'SECOND', 'three'])
    assert.deepEqual(regionIds(editor), ['s1'])

    editor.destroy()
  })

  it('remapping holds across length-changing ops (insert + delete)', () => {
    const editor = mount('<p>alpha</p><p>beta</p><p>gamma</p>')
    // Insert a new block before index 1, and replace the last block.
    applyOp(editor, 'ins', planInsertBlockBefore(editor, 1, '<p>INSERTED</p>'))
    applyOp(editor, 'rep', planReplaceBlock(editor, 3, '<p>GAMMA!</p>'))
    assert.deepEqual(texts(editor), ['alpha', 'INSERTED', 'beta', 'GAMMA!'])
    assert.equal(regionCount(editor), 2)

    // Reject the insert — it must remove ONLY the inserted block, and the
    // replace region must remain valid (reject it next to confirm).
    editor.commands.rejectInlineDiffRegion('ins')
    assert.deepEqual(texts(editor), ['alpha', 'beta', 'GAMMA!'])
    editor.commands.rejectInlineDiffRegion('rep')
    assert.deepEqual(texts(editor), ['alpha', 'beta', 'gamma'])
    assert.equal(regionCount(editor), 0, 'state clears when the last region resolves')

    editor.destroy()
  })

  it('reject-all reverts every still-pending region; accepted ones are kept', () => {
    const editor = mount('<p>one</p><p>two</p><p>three</p>')
    applyOp(editor, 's0', planReplaceBlock(editor, 0, '<p>FIRST</p>'))
    applyOp(editor, 's1', planReplaceBlock(editor, 1, '<p>SECOND</p>'))
    applyOp(editor, 's2', planReplaceBlock(editor, 2, '<p>THIRD</p>'))

    editor.commands.acceptInlineDiffRegion('s1')  // commit the middle change
    editor.commands.rejectInlineDiff()            // reject-all the rest

    assert.deepEqual(texts(editor), ['one', 'SECOND', 'three'], 'accepted s1 survives reject-all')
    assert.equal(getInlineDiffState(editor.state), null, 'diff session cleared')

    editor.destroy()
  })

  it('accept-all clears the session and keeps every proposed change', () => {
    const editor = mount('<p>one</p><p>two</p>')
    applyOp(editor, 's0', planReplaceBlock(editor, 0, '<p>FIRST</p>'))
    applyOp(editor, 's1', planReplaceBlock(editor, 1, '<p>SECOND</p>'))

    editor.commands.acceptInlineDiff()

    assert.deepEqual(texts(editor), ['FIRST', 'SECOND'])
    assert.equal(getInlineDiffState(editor.state), null)

    editor.destroy()
  })

  it('a delete op tracks as its own region and reverts cleanly', () => {
    const editor = mount('<p>keep</p><p>remove me</p><p>tail</p>')
    applyOp(editor, 'del', planDeleteBlock(editor, 1))
    assert.deepEqual(texts(editor), ['keep', 'tail'])
    assert.equal(regionCount(editor), 1)

    editor.commands.rejectInlineDiffRegion('del')
    assert.deepEqual(texts(editor), ['keep', 'remove me', 'tail'], 'deleted block restored')

    editor.destroy()
  })

  it('a whole-field replacement degrades to a single region', () => {
    const editor = mount('<p>old body</p>')
    const container = document.createElement('div')
    container.innerHTML = '<p>brand new body</p>'
    const slice = ProseMirrorDOMParser.fromSchema(editor.schema).parseSlice(container)
    editor.commands.startInlineDiff('whole', slice)

    assert.equal(regionCount(editor), 1, 'whole-field stays one region')
    assert.deepEqual(regionIds(editor), ['whole'])
    assert.deepEqual(texts(editor), ['brand new body'])

    editor.commands.rejectInlineDiffRegion('whole')
    assert.deepEqual(texts(editor), ['old body'])

    editor.destroy()
  })
})
