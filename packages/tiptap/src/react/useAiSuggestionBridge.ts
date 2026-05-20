import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import {
  registerPendingSuggestionApplier,
  usePendingSuggestionsForField,
  type PendingSuggestion,
  type PendingSuggestionApplier,
} from '@pilotiq/pilotiq/react'
import { aiSuggestionPluginKey } from '../extensions/AiSuggestionExtension.js'

/**
 * Two-way sync between the cross-package `<PendingSuggestionsContext>`
 * queue and this editor's `AiSuggestionExtension` state.
 *
 *   - **Context → editor**: every entry whose `meta.editorRange = { from, to }`
 *     is present and whose `suggestedValue` is a string gets pushed into the
 *     editor as an inline-diff hunk via `addAiSuggestion`. Entries leaving the
 *     queue are removed from the editor via `rejectAiSuggestion` (no doc edit).
 *
 *   - **Editor → context**: when a chip's Approve / Reject button removes a
 *     hunk from the editor's plugin state, the matching id is dismissed from
 *     the queue (`dismiss(id)`) so other surfaces (e.g. the chat-sidebar pill,
 *     a future FieldShell overlay) clear in lock-step. The doc mutation
 *     itself happens inside the editor — context is just a notification.
 *
 * Cycle protection: the hook tracks which ids it has personally pushed to
 * the editor (`pushed`). The Context→editor pass never re-pushes an id that's
 * already there, and the Editor→context pass only dismisses ids that this
 * hook had previously pushed (so an id added directly by host code via
 * `editor.commands.addAiSuggestion(...)` doesn't get reflected back through
 * a context that never knew about it).
 *
 * **Whole-field fallback** (chat-driven suggestions). Producers like
 * `@pilotiq-pro/ai`'s `update_form_state` tool push suggestions that target
 * the whole field — no `meta.editorRange`, just `suggestedValue` as a string.
 * Without `editorRange` the bridge can't render the inline-diff chip widget
 * (it has nowhere to anchor), so the host renderer passes an
 * `onApplyWholeField(value)` callback. When the chat-sidebar Approve fires
 * for a non-bridge-pushed id, the registered applier calls this callback
 * instead of no-op'ing — letting each renderer apply the suggestion the
 * right way for its shape (plain text → `plainTextToDoc`, markdown → set
 * markdown source, richtext → setContent with HTML/JSON). The host is also
 * responsible for the Approve UI — FieldShell hides its legacy overlay
 * whenever a Tiptap renderer is mounted (richtext / markdown / collab text).
 */
export interface UseAiSuggestionBridgeOptions {
  /**
   * Apply a whole-field suggestion that lacks `meta.editorRange`. Each
   * Tiptap renderer passes its own implementation (different content
   * shapes — plain text, markdown source, HTML/JSON). Omit for editors
   * that should ignore whole-field suggestions entirely.
   */
  onApplyWholeField?: (suggestedValue: string) => void

  /**
   * Synthesize a `{ from, to }` range for whole-field suggestions so the
   * inline-diff chip widget can render BEFORE the user approves. The
   * extension's `applyApprove` inserts a plain text node spanning the
   * synthesized range — safe only for editors whose schema accepts a
   * text-node replacement covering the whole doc (CollabTextRenderer's
   * plain-text schema fits; richtext / markdown lose formatting if
   * approved that way). Return `undefined` to skip synthesis and fall
   * through to the legacy `onApplyWholeField` callback (silent swap).
   */
  synthesizeWholeFieldRange?: (
    editor:     Editor,
    suggestion: PendingSuggestion,
  ) => { from: number; to: number } | undefined
}

export function useAiSuggestionBridge(
  editor: Editor | null,
  fieldName: string,
  options: UseAiSuggestionBridgeOptions = {},
): void {
  const { list, dismiss } = usePendingSuggestionsForField(fieldName)

  // Hold the latest `dismiss` in a ref so the editor-side listener — which
  // installs once per editor — always reaches the up-to-date context API.
  const dismissRef = useRef(dismiss)
  useEffect(() => { dismissRef.current = dismiss }, [dismiss])

  // Same ref pattern for the whole-field applier — captured here so the
  // applier closure registered below stays stable across re-renders without
  // re-registering on every option change.
  const onApplyWholeFieldRef = useRef(options.onApplyWholeField)
  useEffect(() => { onApplyWholeFieldRef.current = options.onApplyWholeField }, [options.onApplyWholeField])
  const synthesizeRangeRef = useRef(options.synthesizeWholeFieldRange)
  useEffect(() => { synthesizeRangeRef.current = options.synthesizeWholeFieldRange }, [options.synthesizeWholeFieldRange])

  // Set of ids this hook pushed; used by both directions for cycle control.
  const pushedRef = useRef<Set<string>>(new Set())

  // Context → editor.
  useEffect(() => {
    if (!editor) return
    const contextIds = new Set(list.map(s => s.id))

    for (const s of list) {
      if (pushedRef.current.has(s.id)) continue
      const meta = (s.meta ?? {}) as Record<string, unknown>
      const rawRange = meta['editorRange'] as { from?: unknown; to?: unknown } | undefined
      let range: { from: number; to: number } | undefined
      if (rawRange && typeof rawRange.from === 'number' && typeof rawRange.to === 'number') {
        range = { from: rawRange.from, to: rawRange.to }
      } else {
        // Producer didn't supply a range — let the renderer synthesize one
        // so the inline-diff chip widget can still render. Safe to skip
        // when the renderer abstains (richtext / markdown — they'd lose
        // formatting if the chip's plain-text replace approved them).
        range = synthesizeRangeRef.current?.(editor, s)
        if (!range) continue
      }
      const replacement = typeof s.suggestedValue === 'string' ? s.suggestedValue : ''
      editor.commands.addAiSuggestion({
        id:          s.id,
        from:        range.from,
        to:          range.to,
        replacement,
        ...(s.source ? { source: s.source } : {}),
      })
      pushedRef.current.add(s.id)
    }

    for (const id of Array.from(pushedRef.current)) {
      if (contextIds.has(id)) continue
      // Context dropped the suggestion — remove from editor without
      // mutating the doc (rejectAiSuggestion drops state only).
      editor.commands.rejectAiSuggestion(id)
      pushedRef.current.delete(id)
    }
  }, [editor, list])

  // Editor → context.
  useEffect(() => {
    if (!editor) return
    const handler = () => {
      const ps = aiSuggestionPluginKey.getState(editor.state)
      if (!ps) return
      const editorIds = new Set(ps.suggestions.map((s: { id: string }) => s.id))
      for (const id of Array.from(pushedRef.current)) {
        if (editorIds.has(id)) continue
        // Chip removed the suggestion (Approve mutated the doc, Reject did
        // not — either way it's gone from editor state). Mirror to context.
        pushedRef.current.delete(id)
        dismissRef.current(id)
      }
    }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor])

  // Cross-tree applier (Phase 8.5). When an aggregate consumer (e.g. a
  // chat-sidebar pending-pill) calls `pendingSuggestions.approve(id)`,
  // the pro provider looks up the applier registered for this
  // `(formId, fieldName)` and invokes it. We translate that into the
  // editor's own approve command — same path the inline chip click takes.
  useEffect(() => {
    if (!editor) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      // Editor-range path — the bridge has pushed this id into the editor
      // as an inline diff hunk. Forward Approve to the editor command; the
      // transaction listener above mirrors the dismiss back into context.
      if (pushedRef.current.has(suggestion.id)) {
        editor.chain().focus().approveAiSuggestion(suggestion.id).run()
        return
      }
      // Whole-field path — the producer didn't supply `meta.editorRange`
      // (e.g. `@pilotiq-pro/ai`'s `update_form_state` tool). Delegate to
      // the renderer-supplied callback so the editor's content shape
      // (plain text / markdown source / HTML) gets the right replacement.
      // Context's `approve()` will dismiss the queue entry afterwards;
      // we don't dismiss here.
      const apply = onApplyWholeFieldRef.current
      if (apply && typeof suggestion.suggestedValue === 'string') {
        apply(suggestion.suggestedValue)
      }
    }
    // Editor renderers don't currently have access to a `formId` here;
    // pass `undefined` so the wildcard form scope resolves. Phase 8.5+
    // can thread `formId` via the bridge call site if a future multi-
    // form richtext consumer needs it.
    return registerPendingSuggestionApplier(undefined, fieldName, applier)
  }, [editor, fieldName])
}

// Re-export the pending-suggestion type for consumers that import the hook
// from this module directly — saves them a separate `@pilotiq/pilotiq/react`
// import when wiring an external producer.
export type { PendingSuggestion }
