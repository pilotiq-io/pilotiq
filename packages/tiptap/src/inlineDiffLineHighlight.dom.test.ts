import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'

import { InlineDiffExtension, contentBlockNodes, planReplaceText, getInlineDiffState } from './index.js'

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

/** Distinct region ids anchored in the DOM — one per change the overlay floats a ✓/✕ on. */
const distinctRegions = (dom: HTMLElement): number => new Set(
  Array.from(dom.querySelectorAll('[data-pilotiq-diff-region]')).map(el => el.getAttribute('data-pilotiq-diff-region')),
).size

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

  it('accepting one of two same-line word changes settles only that word (#92)', () => {
    const editor = mount('<p>teh quick fox jumpd</p>')
    // Two word-level edits in the SAME paragraph.
    editor.commands.applySurgicalInlineDiff('r1', planReplaceText(editor, 'teh', 'the')!, 'lines')
    editor.commands.applySurgicalInlineDiff('r2', planReplaceText(editor, 'jumpd', 'jumped')!, 'lines')
    const dom = root(editor)

    assert.equal(distinctRegions(dom), 2, 'one anchored region per word change')
    assert.equal(getInlineDiffState(editor.state)?.regions.length, 2)

    // Accept the first word — its change bakes into the baseline; the line
    // still shows the second word as pending. The red (old) row now reflects
    // the PENDING-ONLY baseline: 'teh' settled to 'the', 'jumpd' still pending.
    editor.commands.acceptInlineDiffRegion('r1')
    const redRow = dom.querySelector('.pilotiq-diff-deleted-line')?.textContent ?? ''
    assert.match(redRow, /the quick fox jumpd/, 'baseline baked the accepted word, kept the pending one')
    assert.ok(!redRow.includes('teh'), 'accepted typo is gone from the baseline (settled)')
    assert.equal(distinctRegions(dom), 1, 'one anchored region left')

    // Accept the last — the whole line settles, diff clears.
    editor.commands.acceptInlineDiffRegion('r2')
    assert.equal(dom.querySelectorAll('.pilotiq-diff-deleted-line').length, 0, 'line settled — no diff rows')
    assert.equal(getInlineDiffState(editor.state), null, 'session cleared')

    editor.destroy()
  })

  it('two in-place block edits interleave red/green per change (not grouped)', () => {
    const editor = mount('<p>the quick brown fox</p><p>lorem ipsum dolor</p>')
    startLinesDiff(editor, '<p>the slow brown fox</p><p>lorem ipsum sit</p>')
    const dom = root(editor)

    // Each changed block should render its old (red) row immediately before its
    // new (green) row — red, green, red, green — rather than all reds then all
    // greens (#92 follow-up).
    const sequence = Array.from(dom.querySelectorAll('.pilotiq-diff-deleted-line, .pilotiq-diff-inserted-line'))
      .map(el => el.classList.contains('pilotiq-diff-deleted-line') ? 'red' : 'green')
    assert.deepEqual(sequence, ['red', 'green', 'red', 'green'])

    editor.destroy()
  })

  it('a second word change on the same block highlights on the RED side too (#92)', () => {
    // Two replace ops landing in the SAME paragraph, applied sequentially.
    // Regression: the deleted-widget key was keyed on the removed TEXT only, so
    // after the first op rendered (ranges = [word1]) the second op grew the
    // ranges to [word1, word2] but PM reused the stale widget — the second
    // word never got its red highlight. The key now folds in the ranges.
    const editor = mount('<p>An emergency fond covers caar repairs.</p>')
    editor.commands.applySurgicalInlineDiff('A', planReplaceText(editor, 'fond', 'fund')!, 'lines')
    editor.commands.applySurgicalInlineDiff('B', planReplaceText(editor, 'caar', 'car')!, 'lines')
    const dom = root(editor)

    const del = Array.from(dom.querySelectorAll('.pilotiq-diff-deleted-line-changed')).map(e => e.textContent)
    const ins = Array.from(dom.querySelectorAll('.pilotiq-diff-inserted-line-changed')).map(e => e.textContent)
    assert.deepEqual(del, ['fond', 'caar'], 'BOTH old words highlight on the removed row')
    assert.deepEqual(ins, ['fund', 'car'], 'BOTH new words highlight on the added row')

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
