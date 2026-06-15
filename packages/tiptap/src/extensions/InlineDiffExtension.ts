/**
 * Inline-diff visualization for whole-field AI suggestions.
 *
 * Sibling to `SuggestionChipExtension`, which handles producer-supplied
 * range suggestions (surgical edits with `meta.editorRange`) via the
 * inline chip widget. This extension handles the *whole-field* case:
 * the AI proposes a new document and the user reviews the structural
 * delta (added paragraphs, deleted text, mark changes, etc.) before
 * accepting or rejecting via the host-mounted `<SuggestionBanner>`.
 *
 * Architecture:
 *   1. `startInlineDiff(id, newDoc)` captures the current doc as the
 *      baseline, replaces the doc body with `newDoc`'s content (so the
 *      editor surface IS the proposed state), and initializes a
 *      `prosemirror-changeset` tracking the original-to-current
 *      transition.
 *   2. The plugin appendTransaction hook keeps the changeset in sync
 *      with any further transactions while the diff is pending — e.g.
 *      y-prosemirror remote edits arriving during review. (Rare on
 *      whole-field flows but free.)
 *   3. A decorations spec walks `ChangeSet.changes` and emits:
 *        - inline green-background decorations on inserted ranges
 *        - widget decorations rendering the *deleted* text struck
 *          through next to the insert point (the deleted content
 *          isn't in the current doc, so a widget is the only way to
 *          surface it)
 *   4. `acceptInlineDiff()` clears the plugin state — the current
 *      doc is the accepted state.
 *   5. `rejectInlineDiff()` replaces the doc back to the baseline
 *      via a single transaction and clears state.
 *
 * For Tiptap Pro parity. See `[[project_pilotiq_text_field_tiptap_rules]]`.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode, Slice, Schema } from '@tiptap/pm/model'
import { DOMSerializer, Fragment } from '@tiptap/pm/model'
import { ChangeSet } from 'prosemirror-changeset'
import { wordLevelDiff } from './wordDiff.js'
import type { CharRange } from './wordDiff.js'

/**
 * Below this token-overlap ratio a removed/added line pair is treated as an
 * unrelated replacement (not an edit), so the intra-line highlight is skipped
 * and the rows render as plain red/green — avoids lighting up the whole line
 * when two genuinely different blocks happen to be paired. See #186.
 */
const WORD_DIFF_MIN_SIMILARITY = 0.4

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineDiff: {
      /**
       * Start the inline-diff review session. Snapshots the current
       * doc as the baseline, replaces the doc with `newDocSlice`'s
       * content, and shows the diff overlay.
       *
       * `id` is the host-side `PendingSuggestion.id` — used so the
       * banner / approve handlers can correlate the editor state with
       * the queue entry.
       */
      startInlineDiff:  (id: string, newDocSlice: Slice, displayMode?: DiffDisplayMode) => ReturnType
      /**
       * Start the inline-diff review session for a surgical edit.
       * Snapshots the current doc as the baseline, then runs
       * `applyFn(tr)` to mutate the transaction with a precise change
       * (e.g. replace one block, insert before a position, set a mark
       * on a range). The plugin folds the resulting steps into the
       * changeset, so decorations land exactly on the modified ranges
       * — no whole-doc replacement.
       *
       * Use this for `replace_block` / `insert_block_before` /
       * `delete_block` / `update_block_mark` AI ops. Returns false (no
       * dispatch) when `applyFn` produced no doc change.
       */
      applySurgicalInlineDiff: (id: string, applyFn: (tr: Transaction) => void, displayMode?: DiffDisplayMode) => ReturnType
      /** Clear diff state. Current doc IS the accepted state. */
      acceptInlineDiff: () => ReturnType
      /** Revert doc to the captured baseline and clear diff state. */
      rejectInlineDiff: () => ReturnType
    }
  }
}

/**
 * How the pending diff renders:
 *   - `'inline'` (default) — word-flow: green inline decorations on
 *     inserted ranges, deleted text struck through in place.
 *   - `'lines'` — GitHub-style: every block touched by an insert gets a
 *     full-width green row (`+` gutter), deleted content renders as a
 *     full-width red row (`−` gutter) above the change. Suits markdown
 *     sources / structured text where lines are the meaningful unit.
 */
export type DiffDisplayMode = 'inline' | 'lines'

interface DiffState {
  id:        string
  /** Original doc captured at `startInlineDiff` time — used for revert. */
  baseline:  ProseMirrorNode
  /** ChangeSet accumulating diffs since baseline. */
  changeset: ChangeSet
  /** Rendering mode for the decorations — see `DiffDisplayMode`. */
  displayMode: DiffDisplayMode
}

export const inlineDiffPluginKey = new PluginKey<DiffState | null>('pilotiqInlineDiff')

/** Read the active diff state, if any. Public for hosts that want to
 *  branch their banner UI on "diff active" vs "diff inactive". */
export function getInlineDiffState(state: EditorState): DiffState | null {
  return inlineDiffPluginKey.getState(state) ?? null
}

interface StartMeta { type: 'start';  id: string; baseline: ProseMirrorNode; displayMode?: DiffDisplayMode }
interface ClearMeta { type: 'clear' }
type DiffMeta = StartMeta | ClearMeta

export interface InlineDiffExtensionOptions {
  /**
   * Class prefix for inline-diff decorations. Defaults to
   * `'pilotiq-diff'`, producing:
   *   - `pilotiq-diff-inserted`  (green-background span on new ranges)
   *   - `pilotiq-diff-deleted`   (widget DOM root for deleted text)
   *   - `pilotiq-diff-deleted-text`  (the strikethrough span inside)
   */
  classPrefix?: string
}

export const InlineDiffExtension = Extension.create<InlineDiffExtensionOptions>({
  name: 'pilotiqInlineDiff',

  addOptions() {
    return { classPrefix: 'pilotiq-diff' }
  },

  onCreate() {
    // Mirror the chip CSS injection pattern. Idempotent via sentinel.
    if (typeof document === 'undefined') return
    const SENTINEL = 'data-pilotiq-diff-styles'
    if (document.head.querySelector(`style[${SENTINEL}]`)) return
    const prefix = this.options.classPrefix
    const style  = document.createElement('style')
    style.setAttribute(SENTINEL, '')
    // Palette (issue #186): pilotiq-themed emerald (added) / rose (removed)
    // rather than GitHub's exact greens/reds — soft full-row tints with a
    // deeper "changed" tint layered on the actually-edited substrings.
    //   added  row    rgba(5, 150, 105, .13)   changed  rgba(5, 150, 105, .30)
    //   removed row    rgba(225, 29, 72, .11)   changed  rgba(225, 29, 72, .26)
    style.textContent = `
      .${prefix}-inserted {
        background-color: rgba(5, 150, 105, 0.15);
        color: rgb(6, 78, 59);
        text-decoration: none;
      }
      .${prefix}-deleted {
        display: inline;
        margin-right: 0.125em;
      }
      .${prefix}-deleted-text {
        text-decoration: line-through;
        text-decoration-color: rgba(225, 29, 72, 0.7);
        background-color: rgba(225, 29, 72, 0.13);
        color: rgb(159, 18, 57);
        padding: 0 0.125em;
      }
      /* Structure-preserving deleted block (heading / list / faq / …):
         keep the removed node's own formatting, tinted red + struck so it
         still reads as "deleted". Block display so an <h2>/<ul>/faq lays
         out as itself rather than collapsing inline. */
      .${prefix}-deleted-block {
        display: block;
        background-color: rgba(225, 29, 72, 0.11);
        color: rgb(159, 18, 57);
        text-decoration: line-through;
        text-decoration-color: rgba(225, 29, 72, 0.7);
        border-radius: 2px;
        padding: 0 0.25em;
        opacity: 0.9;
      }
      .${prefix}-deleted-block > * { margin-top: 0; margin-bottom: 0; }
      .${prefix}-inserted-line {
        display: block;
        background-color: rgba(5, 150, 105, 0.13);
        border-radius: 2px;
        padding-left: 1.25em;
        position: relative;
        /* Some text surfaces style the editor root as a flex row (input
           mimic); full-basis keeps each diff row on its own line there. */
        flex: 0 0 100%;
        width: 100%;
      }
      .${prefix}-inserted-line::before {
        content: '+';
        position: absolute;
        left: 0.25em;
        color: rgb(4, 120, 87);
        opacity: 0.75;
      }
      /* Intra-line highlight (#186): deeper tint on the changed characters of
         a replaced line — GitHub-style. NOT bold; weight stays normal. */
      .${prefix}-inserted-line-changed {
        background-color: rgba(5, 150, 105, 0.30);
        border-radius: 2px;
      }
      .${prefix}-deleted-line-changed {
        background-color: rgba(225, 29, 72, 0.26);
        border-radius: 2px;
      }
      .${prefix}-deleted-lines { display: block; flex: 0 0 100%; width: 100%; }
      .${prefix}-lines-active { display: block !important; }
      .${prefix}-deleted-line {
        background-color: rgba(225, 29, 72, 0.11);
        color: rgb(159, 18, 57);
        border-radius: 2px;
        padding-left: 1.25em;
        position: relative;
        white-space: pre-wrap;
      }
      .${prefix}-deleted-line::before {
        content: '−';
        position: absolute;
        left: 0.25em;
        opacity: 0.75;
      }
      .${prefix}-deleted-line > * { margin-top: 0; margin-bottom: 0; }
    `
    document.head.appendChild(style)
  },

  addCommands() {
    return {
      startInlineDiff: (id, newDocSlice, displayMode) => ({ tr, state, dispatch }) => {
        const baseline = state.doc
        const docEnd   = state.doc.content.size
        // Replace the whole doc body with the proposed content. The
        // schema enforces validity — if the slice doesn't fit, ProseMirror
        // throws (callers should pre-validate via `editor.schema`).
        tr.replaceRange(0, docEnd, newDocSlice)
        const meta: StartMeta = { type: 'start', id, baseline, ...(displayMode ? { displayMode } : {}) }
        tr.setMeta(inlineDiffPluginKey, meta)
        if (dispatch) dispatch(tr)
        return true
      },
      applySurgicalInlineDiff: (id, applyFn, displayMode) => ({ tr, state, dispatch }) => {
        const baseline = state.doc
        applyFn(tr)
        if (!tr.docChanged) return false
        const meta: StartMeta = { type: 'start', id, baseline, ...(displayMode ? { displayMode } : {}) }
        tr.setMeta(inlineDiffPluginKey, meta)
        if (dispatch) dispatch(tr)
        return true
      },
      acceptInlineDiff: () => ({ tr, dispatch }) => {
        const meta: ClearMeta = { type: 'clear' }
        tr.setMeta(inlineDiffPluginKey, meta)
        if (dispatch) dispatch(tr)
        return true
      },
      rejectInlineDiff: () => ({ tr, state, dispatch }) => {
        const ds = inlineDiffPluginKey.getState(state)
        if (!ds) return false
        const docEnd = state.doc.content.size
        // Replace whole body with the baseline's content via a slice that
        // spans the baseline's open boundaries (always 0 for a top-level
        // doc replace).
        tr.replaceWith(0, docEnd, ds.baseline.content)
        const meta: ClearMeta = { type: 'clear' }
        tr.setMeta(inlineDiffPluginKey, meta)
        if (dispatch) dispatch(tr)
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    const ext = this
    return [
      new Plugin<DiffState | null>({
        key:   inlineDiffPluginKey,
        state: {
          init() { return null },
          apply(tr, value) {
            const meta = tr.getMeta(inlineDiffPluginKey) as DiffMeta | undefined
            if (meta?.type === 'start') {
              // Baseline captured BEFORE the replaceRange step in this
              // same transaction. The changeset's `addSteps` consumes
              // the transaction's step list to compute the diff between
              // the baseline doc and the post-transaction doc.
              const cs = ChangeSet.create(meta.baseline).addSteps(tr.doc, tr.mapping.maps, null)
              return { id: meta.id, baseline: meta.baseline, changeset: cs, displayMode: meta.displayMode ?? 'inline' }
            }
            if (meta?.type === 'clear') return null
            if (!value) return value
            // No explicit meta — a regular transaction landed while the
            // diff was active. Fold its steps into the changeset so any
            // further edits (e.g. y-prosemirror remote ops) are reflected.
            if (tr.docChanged) {
              const cs = value.changeset.addSteps(tr.doc, tr.mapping.maps, null)
              return { ...value, changeset: cs }
            }
            return value
          },
        },
        props: {
          decorations(state) {
            const ds = inlineDiffPluginKey.getState(state)
            if (!ds) return DecorationSet.empty
            return buildDiffDecorations(state, ds, ext.options.classPrefix ?? 'pilotiq-diff')
          },
          // While a LINES-mode diff is active, force the editor root to
          // block layout. Some text surfaces style the root as a flex row
          // (single-line input mimic) — without this the stacked diff
          // rows lay out as overflowing columns. Drops automatically on
          // accept / reject.
          attributes(state) {
            const ds = inlineDiffPluginKey.getState(state)
            return ds?.displayMode === 'lines'
              ? { class: `${ext.options.classPrefix ?? 'pilotiq-diff'}-lines-active` }
              : {}
          },
        },
      }),
    ]
  },
})

function buildDiffDecorations(
  state:     EditorState,
  ds:        DiffState,
  prefix:    string,
): DecorationSet {
  if (ds.displayMode === 'lines') return buildLineDiffDecorations(state, ds, prefix)

  const decos: Decoration[] = []
  const docSize = state.doc.content.size

  for (const change of ds.changeset.changes) {
    // `fromB..toB` is the range in the CURRENT doc that holds the
    // inserted content. `fromA..toA` is the range in the BASELINE doc
    // that was removed. `inserted` / `deleted` are Span[] arrays whose
    // `length` sums to (toB - fromB) / (toA - fromA) respectively.
    const fromB = Math.max(0, Math.min(change.fromB, docSize))
    const toB   = Math.max(fromB, Math.min(change.toB,   docSize))

    if (toB > fromB) {
      decos.push(
        Decoration.inline(fromB, toB, {
          class: `${prefix}-inserted`,
          'data-pilotiq-diff-id': ds.id,
        }),
      )
    }

    // Deleted content — pull from the baseline using the `fromA..toA`
    // range. Render via a widget at the change's insert-point so the
    // deleted content appears immediately before the new run. Empty
    // deletions (pure inserts) skip the widget.
    if (change.toA > change.fromA) {
      decos.push(
        Decoration.widget(fromB, () => buildDeletedWidget(ds.baseline, change.fromA, change.toA, prefix, ds.id), {
          side: -1,
          ignoreSelection: true,
          key: `pilotiq-diff:deleted:${change.fromA}:${change.toA}`,
        }),
      )
    }
  }

  return DecorationSet.create(state.doc, decos)
}

/**
 * Render the deleted side of a change preserving its ORIGINAL block
 * formatting (heading / list / faq / alert / blockquote …) — bug #91.
 *
 * Strategy: collect the BASELINE top-level blocks the deleted range
 * `fromA..toA` overlaps, each CUT to the overlapping span, and serialize
 * those real nodes via the schema's `DOMSerializer`. A removed heading
 * stays an `<h2>`, a removed list keeps its `<ul><li>`, a faq keeps its
 * wrappers — because we serialize the node itself, not flattened text.
 *
 * The one exception is a single plain top-level paragraph: there the inline
 * word-diff look (red strike-through text) reads better, and wrapping a
 * one-word change in its `<p>` would stack it as a block and break the
 * inline diff — so paragraphs stay text.
 */
function buildDeletedWidget(
  baseline: ProseMirrorNode,
  fromA:    number,
  toA:      number,
  prefix:   string,
  id:       string,
): HTMLElement {
  const root = document.createElement('span')
  root.className = `${prefix}-deleted`
  root.setAttribute('data-pilotiq-diff-id', id)
  root.contentEditable = 'false'

  // Walk the baseline's top-level blocks; for each one the deleted range
  // touches, keep the whole node when fully covered, else cut it to the
  // overlapping slice (preserving the node's own wrapper either way).
  const pieces: ProseMirrorNode[] = []
  baseline.forEach((child, offset) => {
    if (Math.min(toA, offset + child.nodeSize) <= Math.max(fromA, offset)) return
    if (child.isAtom) { pieces.push(child); return }
    const localFrom = Math.max(0, fromA - (offset + 1))
    const localTo   = Math.min(child.content.size, toA - (offset + 1))
    if (localFrom <= 0 && localTo >= child.content.size) { pieces.push(child); return }
    if (localTo <= localFrom) return
    pieces.push(child.cut(localFrom, localTo))
  })

  if (pieces.length === 1 && pieces[0]!.type.name === 'paragraph') {
    const inner = document.createElement('span')
    inner.className   = `${prefix}-deleted-text`
    inner.textContent = baseline.textBetween(fromA, toA, '\n', ' ')
    root.appendChild(inner)
    return root
  }

  const block = document.createElement('span')
  block.className = `${prefix}-deleted-block`
  block.appendChild(DOMSerializer.fromSchema(baseline.type.schema).serializeFragment(Fragment.fromArray(pieces)))
  root.appendChild(block)
  return root
}

/**
 * GitHub-style line rendering. Unlike the inline mode (which walks the
 * changeset's MINIMAL change ranges), lines mode treats whole top-level
 * blocks as the diff unit — an LCS over the baseline's block texts vs
 * the current doc's block texts. A partially-edited line therefore
 * renders as one full red row (the old line) above one full green row
 * (the new line), instead of fragmented word-level shards. Mark-only
 * changes (same text, different formatting) read as "kept" here — the
 * block unit is text; use inline mode when formatting deltas matter.
 *
 * The changeset state still drives baseline capture / accept / reject;
 * lines mode just re-derives its presentation from baseline-vs-current
 * on every decoration pass, so remote collab edits during review stay
 * correct for free.
 */
function buildLineDiffDecorations(
  state:  EditorState,
  ds:     DiffState,
  prefix: string,
): DecorationSet {
  const decos: Decoration[] = []

  const baseBlocks = topLevelBlocks(ds.baseline)
  const current: Array<{ text: string; pos: number; nodeSize: number; node: ProseMirrorNode }> = []
  state.doc.forEach((node, pos) => {
    current.push({ text: node.textContent, pos, nodeSize: node.nodeSize, node })
  })
  const schema = ds.baseline.type.schema

  // `lcsBlockDiffTokens` emits removed-before-added within a replacement
  // region, so a run of `removed` tokens immediately followed by a run of
  // `added` tokens IS a "replace hunk". We walk the token list grouping each
  // such hunk, then word-diff the hunk's CONCATENATED removed text against its
  // CONCATENATED added text and distribute the changed ranges back onto each
  // row (issue #186). Concatenating (rather than pairing rows 1:1) keeps the
  // two sides symmetric and handles block merges / splits — e.g. 2 paragraphs
  // joined into 1: the text is identical bar the break, so neither side lights
  // up, instead of the whole merged tail showing as a bogus green insert.
  // `j` points into the CURRENT doc's blocks, `bi` into the BASELINE blocks.
  const tokens = lcsBlockDiffTokens(baseBlocks.map(b => b.text), current.map(c => c.text))
  let j  = 0
  let bi = 0
  let t  = 0
  while (t < tokens.length) {
    if (tokens[t]!.kind === 'kept') { j++; bi++; t++; continue }

    // Gather the removed run, then the added run, of this hunk.
    const removedNodes: ProseMirrorNode[] = []
    while (t < tokens.length && tokens[t]!.kind === 'removed') { removedNodes.push(baseBlocks[bi]!.node); bi++; t++ }
    const addedIdx: number[] = []
    while (t < tokens.length && tokens[t]!.kind === 'added')   { addedIdx.push(j); j++; t++ }

    // Removed (real baseline nodes — bug #91) flush as ONE red widget anchored
    // before the first added block, or the next kept block / doc end when the
    // hunk is a pure deletion.
    const anchor = addedIdx.length > 0 ? current[addedIdx[0]!]!.pos
                 : j < current.length  ? current[j]!.pos
                 :                        state.doc.content.size

    // Intra-line highlight: word-diff the concatenated removed vs added text,
    // then clamp the changed ranges back onto each row (block-local coords).
    // Highlighting only applies to plain textblocks (so DOM text aligns with
    // node text — content blocks with non-editable label chrome are skipped).
    const removedRanges: Array<CharRange[] | undefined> = new Array(removedNodes.length).fill(undefined)
    if (removedNodes.length > 0 && addedIdx.length > 0) {
      const rc = concatBlockText(removedNodes.map(n => n.textContent))
      const ac = concatBlockText(addedIdx.map(idx => current[idx]!.text))
      const wd = wordLevelDiff(rc.text, ac.text)
      if (wd.similarity >= WORD_DIFF_MIN_SIMILARITY) {
        // Removed side: block-local ranges handed to the deleted widget.
        removedNodes.forEach((rNode, i) => {
          if (!rNode.isTextblock) return
          const [bs, be] = rc.spans[i]!
          const local = clampRangesToSpan(wd.aRanges, bs, be)
          if (local.length > 0) removedRanges[i] = local
        })
        // Added side is the live doc — highlight via inline decorations.
        addedIdx.forEach((idx, i) => {
          const aEntry = current[idx]!
          if (!aEntry.node.isTextblock) return
          const [bs, be] = ac.spans[i]!
          const local = clampRangesToSpan(wd.bRanges, bs, be)
          if (local.length === 0) return
          for (const seg of textblockTextSegments(aEntry.node, aEntry.pos)) {
            for (const [rs, re] of local) {
              const s = Math.max(rs, seg.start)
              const e = Math.min(re, seg.end)
              if (e <= s) continue
              decos.push(
                Decoration.inline(seg.pos + (s - seg.start), seg.pos + (e - seg.start), {
                  class: `${prefix}-inserted-line-changed`,
                  'data-pilotiq-diff-id': ds.id,
                }),
              )
            }
          }
        })
      }
    }

    if (removedNodes.length > 0) {
      decos.push(
        Decoration.widget(anchor, () => buildDeletedLinesWidget(removedNodes, schema, prefix, ds.id, removedRanges), {
          side: -1,
          ignoreSelection: true,
          key: `pilotiq-diff:deleted-lines:${anchor}:${removedNodes.length}`,
        }),
      )
    }
    for (const idx of addedIdx) {
      decos.push(
        Decoration.node(current[idx]!.pos, current[idx]!.pos + current[idx]!.nodeSize, {
          class: `${prefix}-inserted-line`,
          'data-pilotiq-diff-id': ds.id,
        }),
      )
    }
  }

  return DecorationSet.create(state.doc, decos)
}

/**
 * Concatenate block texts with a single-space separator, recording each
 * block's `[start, end)` span (excluding separators) in the joined string.
 * Word-diffing the joined removed vs added text and clamping ranges back onto
 * these spans keeps the two sides symmetric across block merges / splits. #186
 */
function concatBlockText(texts: string[]): { text: string; spans: CharRange[] } {
  let text = ''
  const spans: CharRange[] = []
  texts.forEach((t, i) => {
    if (i > 0) text += ' '
    const start = text.length
    text += t
    spans.push([start, text.length])
  })
  return { text, spans }
}

/** Intersect changed ranges with a block's span and re-base to block-local
 *  char offsets (so they line up with the row's own `textContent`). */
function clampRangesToSpan(ranges: readonly CharRange[], spanStart: number, spanEnd: number): CharRange[] {
  const out: CharRange[] = []
  for (const [rs, re] of ranges) {
    const s = Math.max(rs, spanStart)
    const e = Math.min(re, spanEnd)
    if (e > s) out.push([s - spanStart, e - spanStart])
  }
  return out
}

/**
 * Map a textblock's `textContent` char offsets back to document positions by
 * walking its text-node descendants. One segment per text node — usually a
 * single segment, but marks (bold/links) split a block into several. Used to
 * turn word-diff char ranges into inline decorations on the live doc.
 */
function textblockTextSegments(
  node:         ProseMirrorNode,
  nodeStartPos: number,
): Array<{ start: number; end: number; pos: number }> {
  const segs: Array<{ start: number; end: number; pos: number }> = []
  let acc = 0
  node.descendants((child, posInContent) => {
    if (child.isText) {
      const len = child.text!.length
      segs.push({ start: acc, end: acc + len, pos: nodeStartPos + 1 + posInContent })
      acc += len
    }
    return true
  })
  return segs
}

/**
 * Wrap the given char ranges of an already-rendered row in highlight spans.
 * Walks the row's text nodes (the row's text equals the source block's
 * `textContent` for a plain textblock), splitting each that overlaps a range
 * into plain-text / `<span class=…>` pieces. Used for the DELETED side, which
 * is static serialized DOM (the inserted side uses live inline decorations).
 */
function highlightRangesInElement(rowEl: HTMLElement, ranges: readonly CharRange[], className: string): void {
  if (ranges.length === 0) return
  // Manual DFS rather than createTreeWalker/NodeFilter — those aren't globals
  // in every DOM the editor runs under (e.g. the test harness).
  const textNodes: Array<{ node: Text; start: number; end: number }> = []
  let acc = 0
  const collect = (n: Node): void => {
    for (let child = n.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3 /* TEXT_NODE */) {
        const text = child as Text
        textNodes.push({ node: text, start: acc, end: acc + text.data.length })
        acc += text.data.length
      } else {
        collect(child)
      }
    }
  }
  collect(rowEl)
  for (const info of textNodes) {
    const locals: CharRange[] = []
    for (const [rs, re] of ranges) {
      const s = Math.max(rs, info.start)
      const e = Math.min(re, info.end)
      if (e > s) locals.push([s - info.start, e - info.start])
    }
    if (locals.length === 0) continue
    locals.sort((p, q) => p[0] - q[0])
    const data = info.node.data
    const frag = info.node.ownerDocument.createDocumentFragment()
    let cursor = 0
    for (const [ls, le] of locals) {
      if (ls > cursor) frag.appendChild(info.node.ownerDocument.createTextNode(data.slice(cursor, ls)))
      const span = info.node.ownerDocument.createElement('span')
      span.className   = className
      span.textContent = data.slice(ls, le)
      frag.appendChild(span)
      cursor = le
    }
    if (cursor < data.length) frag.appendChild(info.node.ownerDocument.createTextNode(data.slice(cursor)))
    info.node.parentNode?.replaceChild(frag, info.node)
  }
}

function topLevelBlocks(doc: ProseMirrorNode): Array<{ text: string; node: ProseMirrorNode }> {
  const out: Array<{ text: string; node: ProseMirrorNode }> = []
  doc.forEach((node) => { out.push({ text: node.textContent, node }) })
  return out
}

interface BlockDiffToken { kind: 'kept' | 'added' | 'removed'; text: string }

/** Standard LCS walk over two block-text arrays, emitting tokens in
 *  presentation order with removed-before-added on replacements. */
function lcsBlockDiffTokens(a: string[], b: string[]): BlockDiffToken[] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i]![j] = dp[i - 1]![j - 1]! + 1
      else                       dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
    }
  }
  const out: BlockDiffToken[] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { out.push({ kind: 'kept', text: a[i - 1]! }); i--; j-- }
    // Strict `>` ties toward pushing `added` first in this backward walk,
    // which renders removed-before-added after the final reverse.
    else if (dp[i - 1]![j]! > dp[i]![j - 1]!) { out.push({ kind: 'removed', text: a[i - 1]! }); i-- }
    else { out.push({ kind: 'added', text: b[j - 1]! }); j-- }
  }
  while (i > 0) { out.push({ kind: 'removed', text: a[i - 1]! }); i-- }
  while (j > 0) { out.push({ kind: 'added',   text: b[j - 1]! }); j-- }
  out.reverse()
  return out
}

function buildDeletedLinesWidget(
  nodes:  readonly ProseMirrorNode[],
  schema: Schema,
  prefix: string,
  id:     string,
  /** Per-node changed char ranges (aligned with `nodes`); `undefined` = no
   *  intra-line highlight for that row (pure delete / dissimilar pair). #186 */
  changedRanges?: ReadonlyArray<CharRange[] | undefined>,
): HTMLElement {
  const root = document.createElement('div')
  root.className = `${prefix}-deleted-lines`
  root.setAttribute('data-pilotiq-diff-id', id)
  root.contentEditable = 'false'
  const serializer = DOMSerializer.fromSchema(schema)
  nodes.forEach((node, idx) => {
    const row = document.createElement('div')
    row.className = `${prefix}-deleted-line`
    // Serialize the real node so a removed heading / list / faq keeps its
    // structure (bug #91), instead of collapsing to one plain text row.
    row.appendChild(serializer.serializeFragment(Fragment.from(node)))
    const ranges = changedRanges?.[idx]
    if (ranges) highlightRangesInElement(row, ranges, `${prefix}-deleted-line-changed`)
    root.appendChild(row)
  })
  return root
}
