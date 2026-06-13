import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

import { contentBlockNodes, planWrapBlocks } from './index.js'

/**
 * Wrap-blocks contract — the editor-side behaviour that `@pilotiq-pro/ai`'s
 * `computeNormalizeOps` (the engine behind the Normalizer agent's
 * `normalize_content` tool) depends on for its WRAP path. That code lives in
 * another repo and cannot import this one, so this test pins the guarantees it
 * relies on, against the REAL `@pilotiq/tiptap` schema + `planWrapBlocks`:
 *
 *  1. wrapping a contiguous `[from..to]` run into an `intro` / `summary` /
 *     `keyTakeaways` landmark is CONTENT-PRESERVING — the wrapped blocks keep
 *     their text and order, nothing outside the range moves;
 *  2. it produces exactly ONE wrapper node — no duplicate, no stray empty
 *     paragraphs introduced inside or around it;
 *  3. when the wrap turns the LAST real block into a (terminal, non-paragraph)
 *     landmark, the editor adds EXACTLY ONE trailing empty paragraph after it —
 *     the same one-trailing-paragraph rule the FAQ contract pins. The Normalizer
 *     inserts terminal landmarks too, so a regression here (tiptap stops adding
 *     the paragraph, or adds two) would silently break its placement.
 *
 * Mirrors `WRAP_TYPES` in `@pilotiq-pro/ai`'s `normalizeBlockOps.ts` — the
 * `summary` variant rides an `attrs.variant`, exactly as `computeNormalizeOps`
 * emits it.
 */
function mount(content: string): Editor {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return new Editor({ element: el, extensions: [StarterKit, ...contentBlockNodes], content })
}

/** Apply a planner's transaction modifier through the editor, like the AI inline-diff bridge does. */
function apply(editor: Editor, mod: ((tr: unknown) => void) | null): void {
  assert.ok(mod, 'planner returned null — out of range, unknown wrapper, or schema rejected the wrap')
  editor.commands.command(({ tr, dispatch }) => {
    ;(mod as (t: unknown) => void)(tr)
    dispatch?.(tr)
    return true
  })
}

/** Loose ProseMirror-JSON node shape — `editor.getJSON()`'s static type doesn't expose `.text`. */
interface JNode { type?: string; text?: string; attrs?: Record<string, unknown>; content?: JNode[] }
const contentOf = (editor: Editor): JNode[] => ((editor.getJSON().content ?? []) as JNode[])
const types = (editor: Editor): string[] => contentOf(editor).map((n) => n.type ?? '')
const isEmptyParagraph = (n: JNode): boolean =>
  n.type === 'paragraph' && (!Array.isArray(n.content) || n.content.length === 0)
/** Flatten a node's descendant text — the wrapped paragraphs sit one level inside the landmark. */
const textOf = (n: JNode): string =>
  (n.text ?? '') + (n.content ?? []).map(textOf).join('')

describe('wrap-blocks contract (real @pilotiq/tiptap planners + schema)', () => {
  it('wraps a mid-doc run into a keyTakeaways landmark, content-preserving, nothing else moves', () => {
    // A plain-paragraph tail keeps this case focused on "nothing else moves":
    // a terminal heading/landmark would draw the editor's trailing empty ¶ in,
    // which the dedicated terminal-landmark case below pins instead.
    const editor = mount('<p>intro</p><p>one</p><p>two</p><p>tail</p>')
    // Wrap blocks [1..2] (the "one"/"two" run) into a keyTakeaways block.
    apply(editor, planWrapBlocks(editor, 1, 2, 'keyTakeaways') as never)
    const content = contentOf(editor)
    assert.deepEqual(types(editor), ['paragraph', 'keyTakeaways', 'paragraph'])
    const kt = content[1]!
    assert.equal(kt.content?.length, 2, 'the landmark holds both wrapped paragraphs')
    assert.deepEqual(kt.content?.map(textOf), ['one', 'two'], 'wrapped text + order preserved')
    // Surrounding blocks untouched.
    assert.equal(content[0]?.content?.[0]?.text, 'intro')
    assert.equal(content[2]?.content?.[0]?.text, 'tail')
    assert.equal(content.filter(isEmptyParagraph).length, 0, 'no stray empty paragraphs introduced')
    editor.destroy()
  })

  it('wraps the leading block into an intro landmark at index 0', () => {
    const editor = mount('<p>opening line</p><p>body</p>')
    apply(editor, planWrapBlocks(editor, 0, 0, 'intro') as never)
    const content = contentOf(editor)
    assert.equal(content[0]?.type, 'intro', 'intro leads the document')
    assert.equal(content.filter((n) => n.type === 'intro').length, 1, 'exactly one intro')
    assert.equal(textOf(content[0]!), 'opening line', 'wrapped text preserved')
    assert.equal(content[1]?.content?.[0]?.text, 'body', 'the rest is untouched')
    editor.destroy()
  })

  it('wraps with a summary variant attr — the attr round-trips onto the landmark node', () => {
    const editor = mount('<p>a</p><p>recap text</p>')
    // computeNormalizeOps emits { wrapperType: 'summary', attrs: { variant: 'article' } }.
    apply(editor, planWrapBlocks(editor, 1, 1, 'summary', { variant: 'article' }) as never)
    const summary = contentOf(editor).find((n) => n.type === 'summary')
    assert.ok(summary, 'a summary node exists')
    assert.equal(summary?.attrs?.variant, 'article', 'the variant attr survives the wrap')
    assert.equal(textOf(summary!), 'recap text', 'wrapped text preserved')
    editor.destroy()
  })

  it('wrapping the LAST real block into a terminal landmark adds exactly one trailing empty paragraph', () => {
    const editor = mount('<p>a</p><p>final recap</p>')
    // Wrap the last block [1..1] into a summary — the summary becomes the last
    // real (non-paragraph) block, so the editor maintains one trailing empty ¶.
    apply(editor, planWrapBlocks(editor, 1, 1, 'summary', { variant: 'article' }) as never)
    const content = contentOf(editor)
    assert.equal(content[content.length - 2]?.type, 'summary', 'summary is the last real block')
    assert.ok(isEmptyParagraph(content[content.length - 1]!), 'one trailing empty paragraph')
    assert.equal(content.filter(isEmptyParagraph).length, 1, 'exactly one empty paragraph, never two')
    editor.destroy()
  })

  it('rejects an out-of-range or inverted wrap (planner returns null, no doc mutation)', () => {
    const editor = mount('<p>a</p><p>b</p>')
    assert.equal(planWrapBlocks(editor, 0, 5, 'summary'), null, 'toIndex past the end → null')
    assert.equal(planWrapBlocks(editor, 1, 0, 'summary'), null, 'inverted range → null')
    assert.equal(planWrapBlocks(editor, 0, 0, 'notARealNode'), null, 'unknown wrapper type → null')
    assert.deepEqual(types(editor), ['paragraph', 'paragraph'], 'doc untouched after rejected wraps')
    editor.destroy()
  })
})
