import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

import { contentBlockNodes, planReorderBlocks, type TransactionModifier } from './index.js'

/**
 * `planReorderBlocks` contract — the content-preserving block permutation that
 * `@pilotiq-pro/ai`'s Content Flow agent (its `reorder_sections` tool) depends
 * on to re-sequence article sections without rewriting text. That code lives in
 * another repo and can't import this one, so this pins the guarantees it relies
 * on against the REAL `@pilotiq/tiptap` schema + planner:
 *
 *  1. reorders top-level blocks into the given permutation, content intact;
 *  2. moving a content block (keyTakeaways/alert/…) keeps its STRUCTURE — it is
 *     not flattened into a paragraph;
 *  3. returns null for a non-permutation (wrong length / out-of-range / dup) so
 *     a malformed request can never drop or duplicate a block;
 *  4. returns null for an identity order (nothing to move).
 */
function mount(content: string): Editor {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return new Editor({ element: el, extensions: [StarterKit, ...contentBlockNodes], content })
}

function apply(editor: Editor, mod: TransactionModifier | null): void {
  assert.ok(mod, 'planner returned null — invalid order or identity')
  const m = mod
  editor.commands.command(({ tr, dispatch }) => {
    m(tr)
    dispatch?.(tr)
    return true
  })
}

interface JNode { type?: string; text?: string; attrs?: Record<string, unknown>; content?: JNode[] }
const contentOf = (editor: Editor): JNode[] => ((editor.getJSON().content ?? []) as JNode[])
const types = (editor: Editor): string[] => contentOf(editor).map((n) => n.type ?? '')
const text = (n: JNode): string => (n.text ?? (n.content ?? []).map(text).join(''))
const texts = (editor: Editor): string[] => contentOf(editor).map(text)

describe('planReorderBlocks', () => {
  it('reorders top-level blocks into the requested permutation, text intact', () => {
    const editor = mount('<h2>A</h2><p>a</p><h2>B</h2><p>b</p>')
    // Move section B (indices 2,3) before section A (indices 0,1).
    apply(editor, planReorderBlocks(editor, [2, 3, 0, 1]))
    assert.deepEqual(texts(editor), ['B', 'b', 'A', 'a'])
    assert.deepEqual(types(editor), ['heading', 'paragraph', 'heading', 'paragraph'])
  })

  it('moving a content block keeps its structure (no flatten)', () => {
    const editor = mount('<p>lead</p><div data-type="keyTakeaways"><div class="pilotiq-block-body"><ul><li><p>one</p></li></ul></div></div>')
    assert.ok(types(editor).includes('keyTakeaways'), 'keyTakeaways mounted')
    apply(editor, planReorderBlocks(editor, [1, 0]))
    assert.equal(types(editor)[0], 'keyTakeaways', 'keyTakeaways moved to the front, still a keyTakeaways')
    assert.equal(types(editor)[1], 'paragraph')
  })

  it('returns null for a non-permutation', () => {
    const editor = mount('<p>a</p><p>b</p><p>c</p>')
    assert.equal(planReorderBlocks(editor, [0, 1]), null, 'wrong length')
    assert.equal(planReorderBlocks(editor, [0, 1, 3]), null, 'out of range')
    assert.equal(planReorderBlocks(editor, [0, 1, 1]), null, 'duplicate index')
    assert.equal(planReorderBlocks(editor, [0, 1, 2, 2]), null, 'wrong length (too long)')
  })

  it('returns null for an identity order (nothing to move)', () => {
    const editor = mount('<p>a</p><p>b</p>')
    assert.equal(planReorderBlocks(editor, [0, 1]), null)
  })
})
