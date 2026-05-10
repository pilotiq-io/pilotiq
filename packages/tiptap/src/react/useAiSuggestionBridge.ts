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
 */
export function useAiSuggestionBridge(editor: Editor | null, fieldName: string): void {
  const { list, dismiss } = usePendingSuggestionsForField(fieldName)

  // Hold the latest `dismiss` in a ref so the editor-side listener — which
  // installs once per editor — always reaches the up-to-date context API.
  const dismissRef = useRef(dismiss)
  useEffect(() => { dismissRef.current = dismiss }, [dismiss])

  // Set of ids this hook pushed; used by both directions for cycle control.
  const pushedRef = useRef<Set<string>>(new Set())

  // Context → editor.
  useEffect(() => {
    if (!editor) return
    const contextIds = new Set(list.map(s => s.id))

    for (const s of list) {
      if (pushedRef.current.has(s.id)) continue
      const meta = (s.meta ?? {}) as Record<string, unknown>
      const range = meta['editorRange'] as { from?: unknown; to?: unknown } | undefined
      if (!range || typeof range.from !== 'number' || typeof range.to !== 'number') continue
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
      // Bail when the suggestion isn't one of ours (no editor range or
      // bridge-pushed entry). Pro provider falls back to plain dismiss.
      if (!pushedRef.current.has(suggestion.id)) return
      editor.chain().focus().approveAiSuggestion(suggestion.id).run()
      // The transaction listener above sees the editor state drop the id
      // and calls `dismiss(id)` on its own — no manual mirror needed.
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
