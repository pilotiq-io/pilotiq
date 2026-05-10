import React, { createContext, useContext, useMemo } from 'react'

/**
 * One AI- (or extension-) sourced suggested field-value change. Sits in a
 * unified queue read by:
 *
 *   - the Tiptap `RichTextField` renderer — for `richtext` fields, the
 *     suggestion is mirrored into the editor's `AiSuggestion` extension as
 *     an inline diff with per-hunk Approve/Reject chips
 *   - `FieldShell`'s overlay slot — for any other field type, a registered
 *     overlay component renders a `currentValue` vs `suggestedValue` diff
 *     card below the input
 *   - aggregate "Pending suggestions" pills (e.g. in a chat sidebar) — read
 *     the full list to show counts + bulk approve / reject affordances
 *
 * The shape is intentionally generic — the `meta` bag carries field-type-
 * specific extras (e.g. `editorRange: { from, to }` for `richtext`).
 *
 * Pilotiq core does NOT push or apply suggestions itself. The provider
 * implementation + push paths live in plugin packages (e.g.
 * `@pilotiq-pro/ai`); core just owns the type, context, and hooks so any
 * field renderer can subscribe through one open-core seam.
 */
export interface PendingSuggestion {
  /** Stable id; the producer is responsible for uniqueness. */
  id:              string
  /** Field name this suggestion targets. Matched verbatim in the renderer. */
  fieldName:       string
  /**
   * Form scope. Multi-form pages (Plan #5 reactive fields) stamp the form's
   * id here so a renderer in form A doesn't pick up a suggestion meant for
   * form B. Optional — when both producer and consumer omit it, suggestions
   * are global.
   */
  formId?:         string
  /** Snapshot of the field's value at the time the suggestion was produced. */
  currentValue:    unknown
  /** Proposed replacement. */
  suggestedValue:  unknown
  /** Optional attribution surfaced on the diff overlay / inline chip. */
  source?: {
    agentSlug?:  string
    agentLabel?: string
  }
  /** Wallclock ms when produced. Producers fill this in on `push`. */
  createdAt:       number
  /** Field-type-specific extras (e.g. `editorRange: { from, to }`). Sparse. */
  meta?:           Record<string, unknown>
}

export interface PendingSuggestionsApi {
  /** Full list across every field + form. Aggregate consumers read this. */
  list:        readonly PendingSuggestion[]
  /** Add a suggestion to the queue. Returns the (possibly producer-supplied) id. */
  push:        (suggestion: Omit<PendingSuggestion, 'createdAt'> & { createdAt?: number }) => string
  /**
   * Drop the suggestion from the queue. Used by both inline approval
   * paths (where the renderer applies directly and just notifies the
   * queue) AND by Reject. For aggregate consumers (e.g. a chat-pill
   * "Approve all" button) that live outside the form's React tree, see
   * `approve` below — it looks up a registered applier and calls it
   * before dismissing.
   */
  dismiss:     (id: string) => void
  /**
   * Apply + dismiss. Resolves the suggestion's `(formId, fieldName)`
   * pair against `PendingSuggestionApplierRegistry`; if an applier is
   * registered (FieldShell + Tiptap bridge auto-register on mount),
   * runs it and then dismisses. If no applier is registered (or the
   * applier throws), falls through to a plain `dismiss` so the queue
   * still clears — never strands an entry.
   *
   * Use this from cross-tree surfaces (chat-sidebar pending-pill).
   * Inline surfaces (FieldShell overlay, Tiptap chip) apply via their
   * own React-tree-local mutators and call `dismiss` directly.
   */
  approve:     (id: string) => void
  /**
   * Drop every suggestion matching the optional filter. With no filter,
   * empties the entire queue.
   */
  dismissAll:  (filter?: { fieldName?: string; formId?: string }) => void
  /**
   * Apply + dismiss every suggestion matching the optional filter.
   * Calls `approve(id)` per entry — same fall-through semantics if an
   * applier is missing or throws.
   */
  approveAll:  (filter?: { fieldName?: string; formId?: string }) => void
}

const NOOP_API: PendingSuggestionsApi = Object.freeze({
  list:       Object.freeze([]) as readonly PendingSuggestion[],
  push:       () => '',
  dismiss:    () => {},
  approve:    () => {},
  dismissAll: () => {},
  approveAll: () => {},
})

/**
 * Context default is a no-op API — fields that subscribe in trees without a
 * real provider mounted (e.g. the marketing site's preview, headless tests)
 * see an empty list and no-op approval methods. Never throws.
 */
export const PendingSuggestionsContext = createContext<PendingSuggestionsApi>(NOOP_API)

/** Read the full queue + producer methods. Used by aggregate UIs. */
export function usePendingSuggestions(): PendingSuggestionsApi {
  return useContext(PendingSuggestionsContext)
}

/**
 * Subscribe a single field-renderer to its slice of the queue. Returns
 * `list` already filtered + a `dismiss` callback that the renderer wires
 * to its Approve / Reject buttons.
 *
 * Matching rules:
 *   - `s.fieldName === fieldName` (verbatim)
 *   - if both `formId` args are non-`undefined`, they must match; otherwise
 *     the entry passes (so global suggestions reach scoped readers and
 *     vice-versa)
 *
 * The list reference is stable across renders unless the underlying
 * filtered slice actually changes — useful for `useEffect` dependencies
 * in renderers that mirror suggestions into their own state.
 */
export function usePendingSuggestionsForField(
  fieldName: string,
  formId?:   string,
): {
  list:    readonly PendingSuggestion[]
  dismiss: (id: string) => void
} {
  const api = useContext(PendingSuggestionsContext)
  const list = useMemo(() => api.list.filter(s => {
    if (s.fieldName !== fieldName) return false
    if (formId === undefined || s.formId === undefined) return true
    return s.formId === formId
  }), [api.list, fieldName, formId])
  return { list, dismiss: api.dismiss }
}
