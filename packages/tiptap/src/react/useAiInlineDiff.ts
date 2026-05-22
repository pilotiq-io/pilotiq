/**
 * Bridge between the host's `<PendingSuggestionsContext>` queue and the
 * editor's `AiInlineDiffExtension`. When a whole-field suggestion arrives
 * for the field, the hook:
 *
 *   1. Parses the suggested value into a ProseMirror `Slice` via the
 *      renderer-supplied parser. Each Tiptap surface owns its own
 *      content shape — markdown source for `MarkdownEditor`, HTML / JSON
 *      for `TiptapEditor`, plain text for `CollabTextRenderer`.
 *   2. Calls `editor.commands.startAiInlineDiff(id, slice)` — the
 *      extension snapshots the current doc as the baseline, replaces
 *      the doc content with the proposed slice, and starts a
 *      `prosemirror-changeset` tracking the diff.
 *   3. Registers an applier on the cross-tree pending-suggestion
 *      registry so the host's `<AiSuggestionBanner>` Accept button (and
 *      any other surface calling `pendingSuggestions.approve(id)`) runs
 *      `acceptAiInlineDiff()` instead of the legacy `onApplyWholeField`
 *      callback. The current doc IS the accepted state — no extra
 *      content swap needed.
 *
 * Reject handling: not registered on the applier (the registry only
 * tracks Approve). Renderers wire Reject through the banner's
 * `onRejectWithEditor` prop, which calls `rejectAiInlineDiff()` to revert
 * the doc to the baseline before dismissing the suggestion.
 *
 * Defensive: only one inline diff active at a time per editor. If a new
 * synthesized suggestion arrives while one is still pending review, the
 * hook drops it (the producer should have waited). This matches
 * `AiSuggestionExtension`'s chip path which also allows only one
 * suggestion at a time per id.
 */

import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import type { Slice } from '@tiptap/pm/model'
import { useEditorState } from '@tiptap/react'
import {
  registerPendingSuggestionApplier,
  usePendingSuggestionsForField,
  useFormId,
  type PendingSuggestion,
  type PendingSuggestionApplier,
} from '@pilotiq/pilotiq/react'
import { aiInlineDiffPluginKey } from '../extensions/AiInlineDiffExtension.js'
import {
  planReplaceBlock,
  planInsertBlockBefore,
  planDeleteBlock,
  planUpdateBlockMark,
  type BlockMarkRange,
  type TransactionModifier,
} from '../surgicalOps.js'

export interface UseAiInlineDiffOptions {
  /**
   * Parse the suggested string value into a ProseMirror Slice that's
   * compatible with this editor's schema. Returns `null` to skip (e.g.
   * malformed content, unsupported markup) — the suggestion stays in
   * the queue but no diff renders, and the host's fallback path (banner
   * with `onApplyWholeField`) takes over.
   *
   * Renderers implement this per content shape:
   *   - plain text → wrap each line in a `paragraph` node
   *   - markdown   → run through the Markdown extension's parseMarkdown
   *   - HTML       → DOMParser + ProseMirror's DOMParser.parse
   */
  parseSuggestion: (editor: Editor, value: string) => Slice | null
}

/**
 * Returns whether a diff is currently active in the editor. Hosts use
 * this to gate the banner's UI between the legacy `onApplyWholeField`
 * mode and the diff-aware mode (Reject routes through
 * `rejectAiInlineDiff` to revert the doc).
 */
export function useIsAiInlineDiffActive(editor: Editor | null): boolean {
  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) => !!ed && aiInlineDiffPluginKey.getState(ed.state) !== null,
  })
  return active ?? false
}

export function useAiInlineDiff(
  editor: Editor | null,
  fieldName: string,
  options: UseAiInlineDiffOptions,
): void {
  const { list } = usePendingSuggestionsForField(fieldName)
  // Scope the applier registration by the surrounding form's id so
  // multi-form pages route suggestions to the editor instance inside the
  // matching form — without this, two editors on different forms but
  // sharing a field name (e.g. two "summary" RichTextFields, one in the
  // main edit form + one in a Replicate modal) would race on
  // `registerPendingSuggestionApplier(undefined, …)` and the last-mounted
  // editor would steal every approval. Falls back to wildcard scope
  // (`undefined`) when no form is up-tree.
  const formId = useFormId()

  const parseRef = useRef(options.parseSuggestion)
  useEffect(() => { parseRef.current = options.parseSuggestion }, [options.parseSuggestion])

  // Track which ids we've handed off to the editor's diff extension
  // so we don't re-start the diff every render or for already-active
  // suggestions.
  const startedRef = useRef<Set<string>>(new Set())

  // Re-evaluate the suggestion queue when the editor's doc shape
  // changes. Specifically guards against the seed race: collab-enabled
  // markdown/richtext editors mount empty and seed their content
  // asynchronously after the Yjs provider syncs. A suggestion arriving
  // during that window (or before the first user keystroke) sees an
  // empty doc, `planReplaceBlock` returns null for any blockIndex >= 1,
  // the effect bails — and never re-runs because `list` hasn't changed
  // and React doesn't track ProseMirror's doc state. Watching
  // `doc.childCount` flips the diff-start effect from "ran once at
  // suggestion-push time" to "re-runs when the doc reaches usable
  // shape," which closes the silent no-preview gap.
  const childCount = useEditorState({
    editor,
    selector: ({ editor: ed }) => ed?.state.doc.childCount ?? 0,
  }) ?? 0

  // Context → editor: start the diff for each new whole-field /
  // surgical-block suggestion. `meta.surgical` (if present) routes to a
  // precise PM transaction; otherwise we treat the suggested value as a
  // whole-field replacement. `meta.editorRange` (chip path) is filtered
  // out — handled by AiSuggestionExtension elsewhere.
  useEffect(() => {
    if (!editor) return
    const diffable = list.filter(s => !hasEditorRange(s))
    for (const s of diffable) {
      if (startedRef.current.has(s.id)) continue
      const diffActive = aiInlineDiffPluginKey.getState(editor.state) !== null
      const surgical   = readSurgicalMeta(s)

      // Cross-tool-call surgical stacking. When a diff is already active
      // and a fresh surgical suggestion arrives (typically the model
      // emitted a second `update_form_state` tool call instead of
      // batching ops in one), fold the new modifier into the active
      // diff. We dispatch a plain transaction with no extension meta;
      // the plugin's existing "no explicit meta + tr.docChanged" branch
      // adds the steps to the running changeset, so decorations update
      // to cover both ops' ranges and the banner shows the combined
      // count. Accept commits the union, Reject reverts to the same
      // baseline captured when the FIRST suggestion started the diff —
      // semantically "reject all pending suggested changes", which
      // matches the banner copy.
      //
      // Whole-field suggestions still bail when a diff is active —
      // dropping a fresh slice on top of an active review is too
      // disruptive (it'd swap the entire doc mid-review).
      if (diffActive) {
        if (!surgical) continue
        const modifier = planSurgicalModifier(editor, surgical)
        if (!modifier) continue
        editor.commands.command(({ tr, dispatch }) => {
          modifier(tr)
          if (!tr.docChanged) return false
          if (dispatch) dispatch(tr)
          return true
        })
        startedRef.current.add(s.id)
        continue
      }

      if (surgical) {
        const modifier = planSurgicalModifier(editor, surgical)
        if (!modifier) continue
        editor.commands.applySurgicalAiInlineDiff(s.id, modifier)
        startedRef.current.add(s.id)
        continue
      }

      if (typeof s.suggestedValue !== 'string') continue
      const slice = parseRef.current(editor, s.suggestedValue)
      if (!slice) continue
      editor.commands.startAiInlineDiff(s.id, slice)
      startedRef.current.add(s.id)
    }
    // Cleanup: when a suggestion leaves the context AND we previously
    // started a diff for it, the editor should drop the diff state too.
    // Approve dismisses via context → here we drop from startedRef.
    const contextIds = new Set(list.map(s => s.id))
    for (const id of Array.from(startedRef.current)) {
      if (!contextIds.has(id)) startedRef.current.delete(id)
    }
  }, [editor, list, childCount])

  // Cross-tree applier — two paths:
  //
  //   1. Review-mode accept. Banner / chat-sidebar pill calls
  //      `pendingSuggestions.approve(id)` for a suggestion we've already
  //      started a diff for. Clear the diff state — current doc IS the
  //      accepted state.
  //   2. Auto-mode direct apply. AI tool binding bypassed the queue and
  //      called the registry's applier with a synthetic suggestion
  //      carrying `meta.surgical` (the suggestion was never pushed to
  //      the context, so it's not in `startedRef`). Plan the modifier
  //      and dispatch it as a plain transaction — no diff overlay, no
  //      Accept / Reject step. Mirrors `set_value` auto-mode, which
  //      writes directly via the same registry.
  useEffect(() => {
    if (!editor) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      if (startedRef.current.has(suggestion.id)) {
        editor.commands.acceptAiInlineDiff()
        return
      }
      const surgical = readSurgicalMeta(suggestion)
      if (!surgical) return
      const modifier = planSurgicalModifier(editor, surgical)
      if (!modifier) return
      editor.commands.command(({ tr, dispatch }) => {
        modifier(tr)
        if (!tr.docChanged) return false
        if (dispatch) dispatch(tr)
        return true
      })
    }
    return registerPendingSuggestionApplier(formId, fieldName, applier)
  }, [editor, fieldName, formId])
}

function hasEditorRange(s: PendingSuggestion): boolean {
  const meta = (s.meta ?? {}) as Record<string, unknown>
  const range = meta['editorRange'] as { from?: unknown; to?: unknown } | undefined
  return !!(range && typeof range.from === 'number' && typeof range.to === 'number')
}

/**
 * Surgical op carried in `PendingSuggestion.meta.surgical`. The pilotiq-
 * pro `update_form_state` client handler stamps this when the AI agent
 * picks a block-level op instead of `set_value`.
 *
 * `content` is HTML for replace/insert ops, ignored otherwise. `mark` +
 * `range` apply only to the mark op. Discriminated union; readers should
 * narrow on `op`.
 */
type SurgicalOp =
  | { op: 'replace_block';       blockIndex: number; content: string }
  | { op: 'insert_block_before'; blockIndex: number; content: string }
  | { op: 'delete_block';        blockIndex: number }
  | { op: 'update_block_mark';   blockIndex: number; mark: string; range: BlockMarkRange; apply: boolean; attrs?: Record<string, unknown> }

/**
 * Either a single op (when the AI emitted only one surgical change) or
 * an `{ ops: [...] }` batch (when the AI emitted multiple surgical ops
 * in one `update_form_state` tool call). We apply a batch as a single
 * combined diff so the user sees one Accept / Reject for the whole set.
 */
type SurgicalMeta = SurgicalOp | { ops: SurgicalOp[] }

function parseSurgicalOp(obj: Record<string, unknown>): SurgicalOp | null {
  const op = obj['op']
  const blockIndex = obj['blockIndex']
  if (typeof blockIndex !== 'number') return null
  switch (op) {
    case 'replace_block':
    case 'insert_block_before': {
      const content = obj['content']
      if (typeof content !== 'string') return null
      return { op, blockIndex, content }
    }
    case 'delete_block':
      return { op, blockIndex }
    case 'update_block_mark': {
      const mark  = obj['mark']
      const range = obj['range'] as { from?: unknown; to?: unknown } | undefined
      const apply = obj['apply']
      const attrs = obj['attrs']
      if (typeof mark !== 'string') return null
      if (!range || typeof range.from !== 'number' || typeof range.to !== 'number') return null
      if (typeof apply !== 'boolean') return null
      return {
        op,
        blockIndex,
        mark,
        range: { from: range.from, to: range.to },
        apply,
        ...(attrs && typeof attrs === 'object' ? { attrs: attrs as Record<string, unknown> } : {}),
      }
    }
    default:
      return null
  }
}

function readSurgicalMeta(s: PendingSuggestion): SurgicalMeta | null {
  const meta = (s.meta ?? {}) as Record<string, unknown>
  const raw  = meta['surgical']
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  // Batch form: { ops: [SurgicalOp, ...] }
  if (Array.isArray(obj['ops'])) {
    const parsed: SurgicalOp[] = []
    for (const entry of obj['ops'] as unknown[]) {
      if (!entry || typeof entry !== 'object') continue
      const op = parseSurgicalOp(entry as Record<string, unknown>)
      if (op) parsed.push(op)
    }
    if (parsed.length === 0) return null
    return { ops: parsed }
  }
  return parseSurgicalOp(obj)
}

function planOp(editor: Editor, op: SurgicalOp): TransactionModifier | null {
  switch (op.op) {
    case 'replace_block':       return planReplaceBlock(editor, op.blockIndex, op.content)
    case 'insert_block_before': return planInsertBlockBefore(editor, op.blockIndex, op.content)
    case 'delete_block':        return planDeleteBlock(editor, op.blockIndex)
    case 'update_block_mark':   return planUpdateBlockMark(editor, op.blockIndex, op.mark, op.range, op.apply, op.attrs)
  }
}

/**
 * Translate a surgical meta into a single TransactionModifier the diff
 * extension can wrap with a snapshot. For batches, modifiers are
 * computed against the original (pre-transaction) doc and then applied
 * in DESC `blockIndex` order — each subsequent modifier touches earlier
 * positions, so the prior modifiers' edits (at higher positions) don't
 * shift the absolute positions the later modifiers were planned with.
 *
 * Returns null when the batch has no plannable ops (all out-of-range /
 * unparseable). Drops individual non-plannable ops from a batch but
 * still runs whatever did plan, so a single bad op doesn't kill the
 * whole batch.
 */
function planSurgicalModifier(editor: Editor, surgical: SurgicalMeta): TransactionModifier | null {
  if ('ops' in surgical) {
    const sorted = [...surgical.ops].sort((a, b) => b.blockIndex - a.blockIndex)
    const modifiers: TransactionModifier[] = []
    for (const op of sorted) {
      const mod = planOp(editor, op)
      if (mod) modifiers.push(mod)
    }
    if (modifiers.length === 0) return null
    return (tr) => { for (const mod of modifiers) mod(tr) }
  }
  return planOp(editor, surgical)
}
