/**
 * Surgical block-op planners for AI-driven precise edits.
 *
 * Each planner takes the editor + a logical block index + a payload and
 * returns a `TransactionModifier` — a function the caller (typically
 * `useInlineDiff`) feeds into
 * `editor.commands.applySurgicalInlineDiff(id, modifier)`. The diff
 * extension wraps the modifier in a snapshot-then-apply step so the
 * inline-diff overlay renders against the precise changed range.
 *
 * "Block index" refers to a 0-based position across the doc's top-level
 * children — what the AI agent sees as a numbered structural summary.
 * Planners translate that to absolute ProseMirror positions internally.
 *
 * Planners return `null` when the request can't be satisfied (out-of-
 * range index, unparseable HTML, unknown mark). Callers should treat
 * `null` as "abort the surgical op" and surface a clear error to the
 * agent so it can retry with a different plan.
 */

import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import type { Mark, MarkType, NodeType, Node as ProseMirrorNode } from '@tiptap/pm/model'
import { DOMParser as PMDOMParser, Slice } from '@tiptap/pm/model'
import { parseMarkdownToHtml } from './markdownStorage.js'

export type TransactionModifier = (tr: Transaction) => void

/** Resolve the start position of the top-level child at `blockIndex`. */
function blockStartPos(doc: ProseMirrorNode, blockIndex: number): number | null {
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= doc.childCount) return null
  let pos = 0
  for (let i = 0; i < blockIndex; i++) pos += doc.child(i).nodeSize
  return pos
}

/**
 * Parse content into a doc-replaceable Slice against the editor's
 * schema. Auto-detects markdown editors by sniffing for the
 * `tiptap-markdown` extension's `storage.markdown.parser`: if present,
 * the editor is a `MarkdownEditor` and AI-supplied `content` is
 * markdown source — run it through the markdown parser to produce
 * HTML first. Otherwise content is HTML (the `RichTextField` /
 * `TiptapEditor` path).
 *
 * Mirrors the same auto-detect strategy `MarkdownEditor.tsx` uses for
 * its `parseSuggestion` whole-field callback (see `useInlineDiff`),
 * so surgical ops on markdown fields stay consistent with the
 * existing whole-field replacement path.
 *
 * Returns `null` when DOM isn't available (SSR — shouldn't happen
 * here, but keeps the planner safe) or when the markdown parser
 * throws / returns a non-string (malformed content).
 */
function parseContentToSlice(editor: Editor, content: string): Slice | null {
  if (typeof document === 'undefined') return null
  let html = content
  try {
    const parsed = parseMarkdownToHtml(editor, content)
    if (parsed !== undefined) html = parsed
  } catch { return null }
  const container = document.createElement('div')
  container.innerHTML = html
  // FULL parse + CLOSED slice — NOT `parseSlice`. `parseSlice` "opens" the
  // slice's edges, which strips a top-level WRAPPER node whose own body is
  // itself valid at the top level: a `keyTakeaways` / `summary` / `intro` block
  // (body = a list or paragraphs) silently collapses to its bare inner content,
  // and a `prosCons` block (strict `prosColumn consColumn` content) collapses to
  // bare lists — an invalid node that throws `contentMatchAt on a node with
  // invalid content` and detaches the editor. Surgical block ops ALWAYS carry
  // complete top-level blocks, so we parse the whole fragment as a document and
  // wrap it in a closed slice (openStart/openEnd = 0), preserving every wrapper
  // exactly as authored. (Inline/partial content still round-trips: the doc
  // schema wraps it in a paragraph, the correct shape for a block op.)
  const docNode = PMDOMParser.fromSchema(editor.schema).parse(container)
  return new Slice(docNode.content, 0, 0)
}

/**
 * Replace the top-level block at `blockIndex` with the parsed content.
 * `content` is HTML for `RichTextField` (Tiptap) editors and markdown
 * source for `MarkdownField` (markdown-extension) editors —
 * auto-detected by `parseContentToSlice`. Multiple top-level nodes are
 * allowed and will all land where the original block was.
 */
export function planReplaceBlock(
  editor:     Editor,
  blockIndex: number,
  content:    string,
): TransactionModifier | null {
  const doc = editor.state.doc
  const start = blockStartPos(doc, blockIndex)
  if (start === null) return null
  const slice = parseContentToSlice(editor, content)
  if (!slice) return null
  const end = start + doc.child(blockIndex).nodeSize
  return (tr) => { tr.replace(start, end, slice) }
}

/**
 * Insert one or more top-level nodes before the block at `blockIndex`.
 * `content` is HTML on `RichTextField` editors and markdown source on
 * `MarkdownField` editors — auto-detected by `parseContentToSlice`.
 * `blockIndex === doc.childCount` appends at the end.
 */
export function planInsertBlockBefore(
  editor:     Editor,
  blockIndex: number,
  content:    string,
): TransactionModifier | null {
  const doc = editor.state.doc
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex > doc.childCount) return null
  const slice = parseContentToSlice(editor, content)
  if (!slice) return null
  let pos = 0
  for (let i = 0; i < blockIndex; i++) pos += doc.child(i).nodeSize
  return (tr) => { tr.replace(pos, pos, slice) }
}

/**
 * Delete the top-level block at `blockIndex`. Doc must retain at least
 * one child after the delete (most schemas require this) — refuses to
 * delete the last remaining block.
 */
export function planDeleteBlock(
  editor:     Editor,
  blockIndex: number,
): TransactionModifier | null {
  const doc = editor.state.doc
  const start = blockStartPos(doc, blockIndex)
  if (start === null) return null
  if (doc.childCount <= 1) return null
  const end = start + doc.child(blockIndex).nodeSize
  return (tr) => { tr.delete(start, end) }
}

/**
 * Wrap the contiguous top-level blocks `[fromIndex .. toIndex]` (inclusive)
 * into a single `wrapperType` container node — content-preserving, no HTML
 * round-trip. Used by the Normalizer agent to turn a run of prose into a
 * landmark block (`intro` / `summary` / `keyTakeaways`) WITHOUT rewriting the
 * text (the existing replace/insert ops would need the slice re-serialized to
 * HTML, which has no clean utility here and risks dropping marks/attrs).
 *
 * Returns `null` for an out-of-range or inverted range, an unknown wrapper
 * type, or when the wrapper's content schema can't hold the wrapped blocks
 * (`createAndFill` yields null). Batches sort DESC by `fromIndex` (carried as
 * `blockIndex` by the caller) so disjoint wraps planned against the original
 * doc stay position-valid.
 */
export function planWrapBlocks(
  editor:      Editor,
  fromIndex:   number,
  toIndex:     number,
  wrapperType: string,
  attrs?:      Record<string, unknown>,
): TransactionModifier | null {
  const doc = editor.state.doc
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return null
  if (fromIndex < 0 || toIndex < fromIndex || toIndex >= doc.childCount) return null
  const nodeType: NodeType | undefined = editor.schema.nodes[wrapperType]
  if (!nodeType) return null

  const start = blockStartPos(doc, fromIndex)
  if (start === null) return null

  const children: ProseMirrorNode[] = []
  let end = start
  for (let i = fromIndex; i <= toIndex; i++) {
    const child = doc.child(i)
    children.push(child)
    end += child.nodeSize
  }

  // Build the wrapper with the existing blocks as its content; bail if the
  // schema rejects them (so a bad request never produces an invalid doc).
  // Pass the raw node array (NOT a separately-imported `Fragment`) — `createAndFill`
  // builds the fragment with the EDITOR's prosemirror-model, so the wrapped nodes
  // and the wrapper share one model instance. Mixing a `Fragment` from this
  // module's own `@tiptap/pm/model` import throws "Can not convert … to a Fragment"
  // whenever two prosemirror-model copies are loaded (e.g. a yalc-linked build).
  const wrapped = nodeType.createAndFill(attrs ?? null, children)
  if (!wrapped) return null

  return (tr) => { tr.replaceWith(start, end, wrapped) }
}

/**
 * Reorder the doc's top-level blocks into `order` — a full permutation of the
 * current block indices `[0 .. childCount-1]`. Content-preserving, no HTML
 * round-trip: it gathers the EXISTING nodes and re-lays them in the new order,
 * so every block keeps its exact marks, attrs, and nested content (the same
 * reason `planWrapBlocks` works on real nodes instead of re-serialized HTML).
 *
 * Used by the Content Flow agent to re-sequence an article's sections
 * (inverted-pyramid) without rewriting a single word. The caller (pilotiq-pro's
 * `computeReorderOps`) decides the section order and emits the full block
 * permutation; this op just applies it.
 *
 * Returns `null` when `order` isn't a permutation of exactly the current block
 * indices (wrong length, out-of-range, or a duplicate / missing index) — so a
 * malformed request can never drop or duplicate a block — and for an identity
 * order (nothing to move), so the caller surfaces a clean "already in order"
 * instead of staging an empty diff. Emit it as a SOLO surgical op: it rewrites
 * the whole top-level sequence, so it must not be batched with index-based ops.
 */
export function planReorderBlocks(
  editor: Editor,
  order:  number[],
): TransactionModifier | null {
  const doc = editor.state.doc
  const n = doc.childCount
  if (!Array.isArray(order) || order.length !== n) return null
  const seen = new Set<number>()
  let moved = false
  for (let k = 0; k < order.length; k++) {
    const i = order[k]!
    if (!Number.isInteger(i) || i < 0 || i >= n || seen.has(i)) return null
    seen.add(i)
    if (i !== k) moved = true
  }
  if (!moved) return null // identity — nothing to reorder
  const nodes: ProseMirrorNode[] = order.map((i) => doc.child(i))
  return (tr) => { tr.replaceWith(0, doc.content.size, nodes) }
}

export interface BlockMarkRange {
  /** 0-based text offset from the start of the block's content. */
  from: number
  /** Exclusive end offset. */
  to:   number
}

/**
 * Apply or remove an inline mark on a range *within* the block at
 * `blockIndex`. `range.from` / `range.to` are text offsets relative to
 * the start of the block's content (so `0` is the first character of
 * the block, not the start of the doc).
 *
 * `apply = true` sets the mark (with optional `attrs`); `apply = false`
 * removes it. Unknown marks (not in the editor's schema) return `null`
 * so the caller can surface a clean error to the agent.
 */
export function planUpdateBlockMark(
  editor:     Editor,
  blockIndex: number,
  mark:       string,
  range:      BlockMarkRange,
  apply:      boolean,
  attrs?:     Record<string, unknown>,
): TransactionModifier | null {
  const doc = editor.state.doc
  const start = blockStartPos(doc, blockIndex)
  if (start === null) return null
  const markType: MarkType | undefined = editor.schema.marks[mark]
  if (!markType) return null

  const block      = doc.child(blockIndex)
  const blockInner = start + 1 // step inside the block's opening token
  const contentMax = block.content.size

  if (!Number.isInteger(range.from) || !Number.isInteger(range.to)) return null
  const clampedFrom = Math.max(0, Math.min(range.from, contentMax))
  const clampedTo   = Math.max(clampedFrom, Math.min(range.to, contentMax))
  if (clampedTo === clampedFrom) return null

  const from = blockInner + clampedFrom
  const to   = blockInner + clampedTo

  if (apply) {
    const m: Mark = markType.create(attrs ?? null)
    return (tr) => { tr.addMark(from, to, m) }
  }
  return (tr) => { tr.removeMark(from, to, markType) }
}

/**
 * Summarize a doc's top-level structure as a numbered list the AI can
 * cite by index when proposing surgical ops. Each entry includes the
 * block index, node type, and a truncated text preview — enough for the
 * model to identify which block it wants to modify without sending the
 * whole HTML/markdown back through token-priced channels.
 *
 * Returns one line per top-level child:
 *   `[0] heading: Welcome to the docs`
 *   `[1] paragraph: Lorem ipsum dolor sit amet…`
 *   `[2] bulletList: 3 items`
 */
export function summarizeBlockStructure(doc: ProseMirrorNode, maxChars = 80): string {
  const lines: string[] = []
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i)
    const text = node.textContent.trim().replace(/\s+/g, ' ')
    const preview = text.length === 0
      ? describeStructuralNode(node)
      : text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
    lines.push(`[${i}] ${node.type.name}: ${preview}`)
  }
  return lines.join('\n')
}

/**
 * In-block text find→replace. Swaps the FIRST occurrence of `search` with
 * `replace`, preserving the surrounding node structure — so it can fix a word,
 * number, or typo INSIDE a custom block (alert / prosCons / faq / keyTakeaways)
 * or a table cell without rebuilding (and flattening) the block, which is what
 * `replace_block` would force. Index-free: the match position is resolved at
 * apply time against the live transaction doc, so it composes safely after the
 * index-based block ops in a batch.
 *
 * Returns `null` when `search` isn't present (the caller surfaces "no change")
 * so a stale/guessed search string can never silently corrupt the doc.
 */
export function planReplaceText(editor: Editor, search: string, replace: string): TransactionModifier | null {
  if (typeof search !== 'string' || search.length === 0) return null
  if (typeof replace !== 'string') return null
  let present = false
  editor.state.doc.descendants((node) => {
    if (present) return false
    if (node.isText && node.text && node.text.includes(search)) { present = true; return false }
    return true
  })
  if (!present) return null
  return (tr) => {
    let foundFrom = -1
    tr.doc.descendants((node, pos) => {
      if (foundFrom >= 0) return false
      if (node.isText && node.text) {
        const i = node.text.indexOf(search)
        if (i !== -1) { foundFrom = pos + i; return false }
      }
      return true
    })
    if (foundFrom >= 0) tr.insertText(replace, foundFrom, foundFrom + search.length)
  }
}

function describeStructuralNode(node: ProseMirrorNode): string {
  const kids = node.childCount
  if (kids === 0) return '(empty)'
  if (kids === 1) return `1 ${node.firstChild?.type.name ?? 'child'}`
  return `${kids} children`
}
