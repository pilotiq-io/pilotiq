import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

import { contentBlockNodes, planInsertBlockBefore, planDeleteBlock, planReplaceBlock } from './index.js'

/**
 * FAQ-placement contract — the editor-side behaviour that `@pilotiq-pro/ai`'s
 * `computeFaqOps` (the engine behind the `set_faq` tool) depends on. That code
 * lives in another repo and cannot import this one, so this test pins the
 * guarantees it relies on, against the REAL `@pilotiq/tiptap` schema + surgical
 * planners:
 *
 *  1. the FAQ HTML it emits parses into exactly ONE `faq` node (the required
 *     `.pilotiq-faq-text` / `.pilotiq-faq-body` wrappers actually round-trip);
 *  2. an `insert_block_before(childCount)` appends the FAQ as the last REAL
 *     block — and the editor adds EXACTLY ONE trailing empty paragraph after it,
 *     never zero and never two;
 *  3. that one-trailing-paragraph rule is the whole reason `computeFaqOps` must
 *     treat trailing empty paragraphs as "not there" — a regression here (e.g.
 *     tiptap stops adding the paragraph, or adds two) would silently break the
 *     FAQ agent's placement, so it fails loudly here first.
 *
 * Mirrors `buildFaqHtml` in `@pilotiq-pro/ai` — keep the markup in sync.
 */
function buildFaqHtml(items: { question: string; answer: string }[]): string {
  const inner = items
    .map(
      (it) =>
        `<div data-type="faqItem">` +
        `<div data-type="faqQuestion"><div class="pilotiq-faq-text">${it.question}</div></div>` +
        `<div data-type="faqAnswer"><div class="pilotiq-faq-body"><p>${it.answer}</p></div></div>` +
        `</div>`,
    )
    .join('')
  return `<div data-type="faq">${inner}</div>`
}

const ITEMS = [
  { question: 'What is X?', answer: 'It is a thing.' },
  { question: 'How does it work?', answer: 'Like so.' },
]

function mount(content: string): Editor {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return new Editor({ element: el, extensions: [StarterKit, ...contentBlockNodes], content })
}

/** Apply a planner's transaction modifier through the editor, like the AI inline-diff bridge does. */
function apply(editor: Editor, mod: ((tr: unknown) => void) | null): void {
  assert.ok(mod, 'planner returned null — out of range or unparseable content')
  editor.commands.command(({ tr, dispatch }) => {
    ;(mod as (t: unknown) => void)(tr)
    dispatch?.(tr)
    return true
  })
}

/** Loose ProseMirror-JSON node shape — `editor.getJSON()`'s static type doesn't expose `.text`. */
interface JNode { type?: string; text?: string; content?: JNode[] }
const contentOf = (editor: Editor): JNode[] => ((editor.getJSON().content ?? []) as JNode[])
const types = (editor: Editor): string[] => contentOf(editor).map((n) => n.type ?? '')
const isEmptyParagraph = (n: JNode): boolean =>
  n.type === 'paragraph' && (!Array.isArray(n.content) || n.content.length === 0)

describe('FAQ placement contract (real @pilotiq/tiptap planners + schema)', () => {
  it('the emitted FAQ HTML parses into exactly one faq node with the right structure', () => {
    const editor = mount(buildFaqHtml(ITEMS))
    const faqs = contentOf(editor).filter((n) => n.type === 'faq')
    assert.equal(faqs.length, 1, 'exactly one faq node')
    assert.equal(faqs[0]?.content?.length, 2, 'two faqItems')
    assert.equal(faqs[0]?.content?.[0]?.type, 'faqItem')
    assert.equal(faqs[0]?.content?.[0]?.content?.[0]?.type, 'faqQuestion')
    assert.equal(faqs[0]?.content?.[0]?.content?.[1]?.type, 'faqAnswer')
    editor.destroy()
  })

  it('insert at childCount appends the faq as the last REAL block + exactly one trailing empty paragraph', () => {
    const editor = mount('<p>a</p><p>b</p><h2>Conclusion</h2>')
    apply(editor, planInsertBlockBefore(editor, 3, buildFaqHtml(ITEMS)) as never)
    const content = contentOf(editor)
    // The invariant computeFaqOps is built around: faq is the last REAL block,
    // followed by exactly one editor-maintained empty paragraph.
    assert.deepEqual(types(editor), ['paragraph', 'paragraph', 'heading', 'faq', 'paragraph'])
    assert.equal(content[content.length - 2]?.type, 'faq', 'faq is the last real block')
    assert.ok(isEmptyParagraph(content[content.length - 1]!), 'one trailing empty paragraph')
    assert.equal(content.filter(isEmptyParagraph).length, 1, 'exactly one empty paragraph, no more')
    // Original content untouched.
    assert.equal(content[0]?.content?.[0]?.text, 'a')
    assert.equal(content[2]?.content?.[0]?.text, 'Conclusion')
    editor.destroy()
  })

  it('faq-in-middle: insert(childCount) + delete(old), applied DESC, lands one faq last with body intact', () => {
    const editor = mount(`<p>a</p>${buildFaqHtml([{ question: 'old', answer: 'old' }])}<p>b</p><p>c</p>`)
    // computeFaqOps → [delete_block(1), insert_block_before(4)], applied DESC by index.
    apply(editor, planInsertBlockBefore(editor, 4, buildFaqHtml(ITEMS)) as never)
    apply(editor, planDeleteBlock(editor, 1) as never)
    const content = contentOf(editor)
    const faqs = content.filter((n) => n.type === 'faq')
    assert.equal(faqs.length, 1, 'exactly one faq (old one removed)')
    assert.equal(faqs[0]?.content?.length, 2, 'holds the NEW items, not the old single one')
    assert.equal(content[content.length - 2]?.type, 'faq', 'faq is the last real block')
    assert.ok(isEmptyParagraph(content[content.length - 1]!), 'one trailing empty paragraph')
    // Body paragraphs survived.
    const bodyText = content.filter((n) => n.type === 'paragraph').map((n) => n.content?.[0]?.text)
    assert.ok(bodyText.includes('a') && bodyText.includes('b') && bodyText.includes('c'))
    editor.destroy()
  })

  it('replace_block improves the faq in place — a clean 1:1 swap, no extra blocks', () => {
    // Note: the editor adds its trailing empty paragraph on the first
    // transaction, not at parse time — so a freshly-mounted `[p, faq]` becomes
    // `[p, faq, p]` after the replace. computeFaqOps handles both shapes; here
    // we assert the swap touches nothing but the faq's own contents.
    const editor = mount(`<p>a</p>${buildFaqHtml([{ question: 'before', answer: 'before' }])}`)
    apply(editor, planReplaceBlock(editor, 1, buildFaqHtml(ITEMS)) as never)
    const content = contentOf(editor)
    const faqs = content.filter((n) => n.type === 'faq')
    assert.equal(faqs.length, 1, 'still exactly one faq')
    assert.equal(faqs[0]?.content?.length, 2, 'faq now holds the two new items')
    assert.equal(content[0]?.content?.[0]?.text, 'a', 'the other block is untouched')
    assert.equal(content[content.length - 2]?.type, 'faq', 'faq is still the last real block')
    assert.equal(content.filter(isEmptyParagraph).length, 1, 'no stray empty paragraphs introduced')
    editor.destroy()
  })
})
