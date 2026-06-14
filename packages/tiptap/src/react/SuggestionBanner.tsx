import { useMemo } from 'react'
import {
  usePendingSuggestionsForField,
  usePendingSuggestions,
  type PendingSuggestion,
} from '@pilotiq/pilotiq/react'

/**
 * Bottom-of-editor banner UI for whole-field AI suggestions on Tiptap
 * surfaces whose content shape can't survive the inline chip widget's
 * plain-text replace (richtext, markdown). The chip path renders the
 * replacement via `Element.textContent = replacement` which surfaces raw
 * HTML / markdown as literal text — fine for plain `TextField`, ugly for
 * the others.
 *
 * Visible only when at least one pending suggestion targets this field
 * AND lacks `meta.editorRange` (i.e. a whole-field replacement from
 * `update_form_state`'s `set_value` op). Range-anchored suggestions stay
 * on the editor-side chip widget path — those have a precise location
 * the user wants to see in context.
 *
 * Phase 1 ships banner-only ("Changes suggested — Accept / Reject"); no
 * inline diff visualization yet. Phase 2 will replace the banner-only
 * UX with a `prosemirror-changeset`-driven inline diff on the editor's
 * doc itself, with the banner staying as the global Accept-all / Reject
 * control bar. See `[[project_pilotiq_text_field_tiptap_rules]]`.
 *
 * Approve runs the renderer-supplied `onApplyWholeField(value)` callback
 * AND dismisses the suggestion from the queue. Reject just dismisses
 * (no doc mutation). Multiple pending whole-field suggestions on the
 * same field stack — Accept all / Reject all collapse the queue in one
 * pass.
 */
export interface SuggestionBannerProps {
  /** Field name, matches the suggestion's `fieldName`. */
  fieldName: string
  /**
   * Apply a whole-field suggestion to the underlying editor. Receives the
   * raw `suggestedValue` string from the suggestion. The renderer wires
   * its own content-shape-aware `setContent` here (markdown source for
   * MarkdownEditor, HTML / JSON for TiptapEditor).
   *
   * Skipped when `onAcceptViaEditor` is supplied — that path means the
   * editor already holds the proposed state via `InlineDiffExtension`,
   * and Accept routes through `acceptInlineDiff()` instead. The host
   * still calls `pendingSuggestions.approve(id)` afterwards to dismiss
   * the queue entry.
   */
  onApplyWholeField: (suggestedValue: string) => void
  /**
   * Diff-aware Accept hook. When supplied, the banner calls this first
   * (so the editor commits its diff state) and then dismisses via the
   * context. `onApplyWholeField` is NOT called in this mode — the
   * editor's current doc is already the accepted state.
   *
   * Sparse so the simple banner path (Phase 1, no diff) keeps its
   * existing semantics.
   */
  onAcceptViaEditor?: () => void
  /**
   * Diff-aware Reject hook. When supplied, the banner calls this first
   * (so the editor reverts to the baseline) and then dismisses via the
   * context. Sparse — see `onAcceptViaEditor`.
   */
  onRejectViaEditor?: () => void
  /** Optional class on the outer banner element. Defaults to a minimal styled chrome. */
  className?: string
}

/**
 * Hook variant — returns banner state without rendering, for renderers
 * that want to compose their own chrome. Renderer-agnostic.
 */
export function useSuggestionBanner(fieldName: string): {
  pending:    readonly PendingSuggestion[]
  approveAll: (apply: (value: string) => void) => void
  rejectAll:  () => void
} {
  const { list, dismiss } = usePendingSuggestionsForField(fieldName)

  // Only whole-field suggestions land in the banner. Range-anchored ones
  // ride the editor chip widget.
  const pending = useMemo(
    () => list.filter(s => !hasEditorRange(s)),
    [list],
  )

  const approveAll = (apply: (value: string) => void): void => {
    for (const s of pending) {
      if (typeof s.suggestedValue === 'string') apply(s.suggestedValue)
      dismiss(s.id)
    }
  }

  const rejectAll = (): void => {
    for (const s of pending) dismiss(s.id)
  }

  return { pending, approveAll, rejectAll }
}

function hasEditorRange(s: PendingSuggestion): boolean {
  const meta = (s.meta ?? {}) as Record<string, unknown>
  const range = meta['editorRange'] as { from?: unknown; to?: unknown } | undefined
  return !!(range && typeof range.from === 'number' && typeof range.to === 'number')
}

export function SuggestionBanner({
  fieldName,
  onApplyWholeField,
  onAcceptViaEditor,
  onRejectViaEditor,
  className,
}: SuggestionBannerProps): React.ReactElement | null {
  const { pending, approveAll, rejectAll } = useSuggestionBanner(fieldName)
  const { dismiss } = usePendingSuggestions()

  if (pending.length === 0) return null

  // First (and usually only) pending suggestion drives the agent-label
  // display. Multiple-at-once is rare in practice — the banner shows the
  // most recent producer to keep the chrome compact.
  const head = pending[0]!
  const sourceLabel = head.source?.agentLabel ?? null

  const handleAccept = (): void => {
    // Diff-active path — editor's current doc IS the accepted state.
    // Commit via the editor command, then drop the queue entries.
    if (onAcceptViaEditor) {
      onAcceptViaEditor()
      for (const s of pending) dismiss(s.id)
      return
    }
    approveAll(onApplyWholeField)
  }

  const handleReject = (): void => {
    // Diff-active path — editor still holds the proposed state; revert
    // to the captured baseline before dismissing.
    if (onRejectViaEditor) {
      onRejectViaEditor()
      for (const s of pending) dismiss(s.id)
      return
    }
    rejectAll()
  }

  // Per-suggestion controls when there's more than one — keeps the UX
  // discoverable. Single suggestion: Accept / Reject only.
  const single = pending.length === 1

  return (
    <div
      role="region"
      aria-label="AI suggested changes"
      data-pilotiq-suggestion-banner=""
      className={className ?? 'pilotiq-suggestion-banner'}
    >
      <span className="pilotiq-suggestion-banner-icon" aria-hidden="true">💡</span>
      <span className="pilotiq-suggestion-banner-label">
        {single
          ? sourceLabel
            ? `Changes suggested by ${sourceLabel}`
            : 'Changes suggested'
          : `${pending.length} changes suggested`}
      </span>
      <div className="pilotiq-suggestion-banner-actions">
        <button
          type="button"
          className="pilotiq-suggestion-banner-reject"
          onClick={handleReject}
        >
          {single ? 'Reject' : 'Reject all'}
        </button>
        <button
          type="button"
          className="pilotiq-suggestion-banner-accept"
          onClick={handleAccept}
        >
          {single ? 'Accept' : 'Accept all'}
        </button>
      </div>
    </div>
  )
}
