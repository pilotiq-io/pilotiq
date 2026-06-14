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
    style.textContent = `
      .${prefix}-inserted {
        background-color: rgba(187, 247, 208, 0.55);
        color: rgb(20, 83, 45);
        text-decoration: none;
      }
      .${prefix}-deleted {
        display: inline;
        margin-right: 0.125em;
      }
      .${prefix}-deleted-text {
        text-decoration: line-through;
        text-decoration-color: rgba(220, 38, 38, 0.7);
        background-color: rgba(254, 226, 226, 0.55);
        color: rgb(153, 27, 27);
        padding: 0 0.125em;
      }
      /* Structure-preserving deleted block (heading / list / faq / …):
         keep the removed node's own formatting, tinted red + struck so it
         still reads as "deleted". Block display so an <h2>/<ul>/faq lays
         out as itself rather than collapsing inline. */
      .${prefix}-deleted-block {
        display: block;
        background-color: rgba(254, 226, 226, 0.55);
        color: rgb(153, 27, 27);
        text-decoration: line-through;
        text-decoration-color: rgba(220, 38, 38, 0.7);
        border-radius: 2px;
        padding: 0 0.25em;
        opacity: 0.9;
      }
      .${prefix}-deleted-block > * { margin-top: 0; margin-bottom: 0; }
      .${prefix}-inserted-line {
        display: block;
        background-color: rgba(187, 247, 208, 0.45);
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
        color: rgb(20, 83, 45);
        opacity: 0.7;
      }
      .${prefix}-deleted-lines { display: block; flex: 0 0 100%; width: 100%; }
      .${prefix}-lines-active { display: block !important; }
      .${prefix}-deleted-line {
        background-color: rgba(254, 226, 226, 0.55);
        color: rgb(153, 27, 27);
        border-radius: 2px;
        padding-left: 1.25em;
        position: relative;
        white-space: pre-wrap;
      }
      .${prefix}-deleted-line::before {
        content: '−';
        position: absolute;
        left: 0.25em;
        opacity: 0.7;
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
  const current: Array<{ text: string; pos: number; nodeSize: number }> = []
  state.doc.forEach((node, pos) => {
    current.push({ text: node.textContent, pos, nodeSize: node.nodeSize })
  })
  const schema = ds.baseline.type.schema

  // Walk tokens with a pointer into the CURRENT doc's blocks (`j`) and the
  // BASELINE blocks (`bi`). Removed baseline BLOCKS (the real nodes, not
  // their flattened text — bug #91) accumulate and flush as ONE widget
  // anchored before the next current block (or at doc end), so consecutive
  // deletions render as a contiguous red row group with their formatting.
  let j  = 0
  let bi = 0
  let pendingRemoved: ProseMirrorNode[] = []
  const flushRemoved = (anchor: number): void => {
    if (pendingRemoved.length === 0) return
    const nodes = pendingRemoved
    pendingRemoved = []
    decos.push(
      Decoration.widget(anchor, () => buildDeletedLinesWidget(nodes, schema, prefix, ds.id), {
        side: -1,
        ignoreSelection: true,
        key: `pilotiq-diff:deleted-lines:${anchor}:${nodes.length}`,
      }),
    )
  }

  for (const tok of lcsBlockDiffTokens(baseBlocks.map(b => b.text), current.map(c => c.text))) {
    if (tok.kind === 'kept') {
      flushRemoved(current[j]!.pos)
      j++
      bi++
      continue
    }
    if (tok.kind === 'added') {
      flushRemoved(current[j]!.pos)
      decos.push(
        Decoration.node(current[j]!.pos, current[j]!.pos + current[j]!.nodeSize, {
          class: `${prefix}-inserted-line`,
          'data-pilotiq-diff-id': ds.id,
        }),
      )
      j++
      continue
    }
    // removed — baseline-only block; accumulate the real node for the flush.
    pendingRemoved.push(baseBlocks[bi]!.node)
    bi++
  }
  flushRemoved(state.doc.content.size)

  return DecorationSet.create(state.doc, decos)
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
): HTMLElement {
  const root = document.createElement('div')
  root.className = `${prefix}-deleted-lines`
  root.setAttribute('data-pilotiq-diff-id', id)
  root.contentEditable = 'false'
  const serializer = DOMSerializer.fromSchema(schema)
  for (const node of nodes) {
    const row = document.createElement('div')
    row.className = `${prefix}-deleted-line`
    // Serialize the real node so a removed heading / list / faq keeps its
    // structure (bug #91), instead of collapsing to one plain text row.
    row.appendChild(serializer.serializeFragment(Fragment.from(node)))
    root.appendChild(row)
  }
  return root
}
