import type { ComponentType } from 'react'
import type { PendingSuggestion } from './PendingSuggestionsContext.js'

/**
 * Props the per-field overlay component receives from `FieldShell` when
 * one or more pending suggestions target the field.
 *
 * The overlay is responsible for both rendering AND applying the
 * suggestion. On Approve, call `onApprove()` (which dismisses the
 * suggestion from the queue) AFTER mutating the form's field value to
 * `suggestion.suggestedValue` — the queue is just a notification surface,
 * applying is the renderer's job.
 *
 * The Tiptap `RichTextField` renderer skips this slot entirely — it
 * mirrors suggestions into the editor's inline AiSuggestion extension
 * instead. Other field types (Text / Textarea / Select / Number / …)
 * render the registered overlay below their input.
 */
export interface PendingSuggestionOverlayProps {
  /** First suggestion targeting this field. Aggregate UIs handle stacks. */
  suggestion: PendingSuggestion
  /** Drop from queue (callable after applying). */
  onApprove:  () => void
  /** Drop from queue without applying. */
  onReject:   () => void
}

let _component: ComponentType<PendingSuggestionOverlayProps> | null = null

/**
 * Register a component to render below any `FieldShell` whose field has at
 * least one matching pending suggestion in the
 * `<PendingSuggestionsContext>` queue. Called once at boot by a plugin
 * (e.g. `@pilotiq-pro/ai`). No-op when no plugin registers — `FieldShell`
 * skips the overlay slot.
 */
export function registerPendingSuggestionOverlay(C: ComponentType<PendingSuggestionOverlayProps>): void {
  _component = C
}

/** Returns the registered overlay component, or `null`. */
export function getPendingSuggestionOverlay(): ComponentType<PendingSuggestionOverlayProps> | null {
  return _component
}
