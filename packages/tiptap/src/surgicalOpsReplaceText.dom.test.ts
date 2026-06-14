import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

import { contentBlockNodes, planWrapBlocks, planReplaceText } from './index.js'

/**
 * `planReplaceText` contract — the in-block text find→replace that
 * `@pilotiq-pro/ai`'s `replace` op (the agents' way to fix a word/number/typo
 * INSIDE a custom block or table cell) depends on. That code lives in another
 * repo and can't import this one, so this pins the guarantees it relies on
 * against the REAL `@pilotiq/tiptap` schema + planner:
 *
 *  1. swaps the FIRST occurrence of `search` with `replace`, text + order intact;
 *  2. editing text INSIDE a content block (keyTakeaways/alert/…) leaves the block
 *     STRUCTURE intact — it does NOT flatten the landmark into a paragraph, which
 *     is the whole reason the op exists (replace_block would rebuild + flatten);
 *  3. returns null when `search` isn't present verbatim — so a stale/guessed
 *     search string changes nothing rather than silently corrupting the doc.
 */
function mount(content: string): Editor {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return new Editor({ element: el, extensions: [StarterKit, ...contentBlockNodes], content })
}

/** Apply a planner's transaction modifier through the editor, like the AI inline-diff bridge does. */
function apply(editor: Editor, mod: ((tr: unknown) => void) | null): void {
  assert.ok(mod, 'planner returned null — search not present or invalid args')
  editor.commands.command(({ tr, dispatch }) => {
    ;(mod as (t: unknown) => void)(tr)
    dispatch?.(tr)
    return true
  })
}

interface JNode { type?: string; text?: string; attrs?: Record<string, unknown>; content?: JNode[] }
const contentOf = (editor: Editor): JNode[] => ((editor.getJSON().content ?? []) as JNode[])
const types = (editor: Editor): string[] => contentOf(editor).map((n) => n.type ?? '')
const textOf = (n: JNode): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('')

describe('replace-text contract (real @pilotiq/tiptap planner + schema)', () => {
  it('swaps the first occurrence in a plain paragraph, structure intact', () => {
    const editor = mount('<p>the quick brown fox</p>')
    apply(editor, planReplaceText(editor, 'quick', 'slow') as never)
    assert.deepEqual(types(editor), ['paragraph'])
    assert.equal(textOf(contentOf(editor)[0]!), 'the slow brown fox')
    editor.destroy()
  })

  it('replaces only the FIRST occurrence', () => {
    const editor = mount('<p>aa bb aa cc aa</p>')
    apply(editor, planReplaceText(editor, 'aa', 'XX') as never)
    assert.equal(textOf(contentOf(editor)[0]!), 'XX bb aa cc aa', 'later occurrences untouched')
    editor.destroy()
  })

  it('edits text INSIDE a content block without flattening the block', () => {
    // Build a keyTakeaways landmark, then fix a word inside it. The block must
    // stay a keyTakeaways — this is exactly what replace_block would destroy.
    const editor = mount('<p>alpha beta gamma</p><p>tail</p>')
    apply(editor, planWrapBlocks(editor, 0, 0, 'keyTakeaways') as never)
    assert.equal(contentOf(editor)[0]?.type, 'keyTakeaways', 'precondition: block created')

    apply(editor, planReplaceText(editor, 'beta', 'BETA') as never)
    const first = contentOf(editor)[0]!
    assert.equal(first.type, 'keyTakeaways', 'block NOT flattened — still a keyTakeaways')
    assert.ok(textOf(first).includes('alpha BETA gamma'), 'the inner text was updated')
    assert.equal(contentOf(editor).find((n) => n.type === 'keyTakeaways' ? false : n.type === 'paragraph' && textOf(n) === 'tail') !== undefined, true, 'sibling untouched')
    editor.destroy()
  })

  it('returns null when the search text is not present — no mutation', () => {
    const editor = mount('<p>hello world</p>')
    assert.equal(planReplaceText(editor, 'not-in-doc', 'x'), null, 'absent search → null')
    assert.equal(planReplaceText(editor, '', 'x'), null, 'empty search → null')
    assert.deepEqual(types(editor), ['paragraph'])
    assert.equal(textOf(contentOf(editor)[0]!), 'hello world', 'doc untouched')
    editor.destroy()
  })
})
