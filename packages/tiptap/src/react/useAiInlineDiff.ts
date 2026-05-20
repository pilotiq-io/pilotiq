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
import {
  registerPendingSuggestionApplier,
  usePendingSuggestionsForField,
  type PendingSuggestion,
  type PendingSuggestionApplier,
} from '@pilotiq/pilotiq/react'
import { aiInlineDiffPluginKey } from '../extensions/AiInlineDiffExtension.js'

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
  // Re-render on every editor transaction so the hook tracks state
  // changes (start / accept / reject). useEditorState would be the
  // idiomatic way; we read directly here to keep the dep surface tiny.
  const [, force] = useReducerForceUpdate()
  useEffect(() => {
    if (!editor) return
    const handler = () => force()
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor, force])
  if (!editor) return false
  return aiInlineDiffPluginKey.getState(editor.state) !== null
}

export function useAiInlineDiff(
  editor: Editor | null,
  fieldName: string,
  options: UseAiInlineDiffOptions,
): void {
  const { list } = usePendingSuggestionsForField(fieldName)

  const parseRef = useRef(options.parseSuggestion)
  useEffect(() => { parseRef.current = options.parseSuggestion }, [options.parseSuggestion])

  // Track which ids we've handed off to the editor's diff extension
  // so we don't re-start the diff every render or for already-active
  // suggestions.
  const startedRef = useRef<Set<string>>(new Set())

  // Context → editor: start the diff for each new whole-field suggestion.
  useEffect(() => {
    if (!editor) return
    const wholeField = list.filter(s => !hasEditorRange(s))
    for (const s of wholeField) {
      if (startedRef.current.has(s.id)) continue
      if (typeof s.suggestedValue !== 'string') continue
      // Bail when a different diff is already showing — one at a time.
      // Producer should serialize calls; if not, the second suggestion
      // sits in the queue until the first is approved/rejected.
      if (aiInlineDiffPluginKey.getState(editor.state) !== null) continue
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
  }, [editor, list])

  // Cross-tree applier — when the banner / chat-sidebar pill calls
  // `pendingSuggestions.approve(id)` for one of our tracked suggestions,
  // accept the diff. Editor is the source of truth for the new doc.
  useEffect(() => {
    if (!editor) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      if (!startedRef.current.has(suggestion.id)) return
      editor.commands.acceptAiInlineDiff()
    }
    return registerPendingSuggestionApplier(undefined, fieldName, applier)
  }, [editor, fieldName])
}

function hasEditorRange(s: PendingSuggestion): boolean {
  const meta = (s.meta ?? {}) as Record<string, unknown>
  const range = meta['editorRange'] as { from?: unknown; to?: unknown } | undefined
  return !!(range && typeof range.from === 'number' && typeof range.to === 'number')
}

// useReducer + dispatch is the smallest-API force-update primitive React
// ships. Hoisted into a helper so the call site stays one line.
import { useReducer } from 'react'
function useReducerForceUpdate(): [number, () => void] {
  const [n, inc] = useReducer((x: number) => (x + 1) | 0, 0)
  return [n, () => inc()]
}
