import type { PendingSuggestion } from './PendingSuggestionsContext.js'

/**
 * A function that applies a `PendingSuggestion` to its target field —
 * registered by the field renderer (or editor adapter) on mount, looked
 * up by aggregate consumers (e.g. a chat-sidebar pending-pill's
 * "Approve all" button) that live outside the form's React tree.
 *
 * The applier is responsible for the apply *only*. Dismissing the
 * suggestion from the queue is the caller's job — the apply path is
 * decoupled from the queue-side bookkeeping so a future Phase that
 * mirrors approvals to a server can do both via different code paths.
 */
export type PendingSuggestionApplier = (suggestion: PendingSuggestion) => void

interface RegistryEntry {
  formId:    string | undefined
  fieldName: string
  apply:     PendingSuggestionApplier
}

const _entries = new Map<string, RegistryEntry>()

/**
 * Compose the registry key. `formId` defaults to `'*'` (global form
 * scope) so renderers in non-multi-form pages don't have to thread an
 * id. Form-scoped registrations always win over the wildcard when both
 * exist for the same field name.
 */
function keyFor(formId: string | undefined, fieldName: string): string {
  return `${formId ?? '*'}::${fieldName}`
}

/**
 * Register an applier for `(formId, fieldName)`. Returns an unregister
 * function for `useEffect` cleanup. Re-registering with the same key
 * replaces the previous entry — the most recently mounted renderer
 * wins (typical in multi-instance form scenarios where an old form
 * unmounts after a new one mounts during navigation).
 */
export function registerPendingSuggestionApplier(
  formId:    string | undefined,
  fieldName: string,
  apply:     PendingSuggestionApplier,
): () => void {
  const key = keyFor(formId, fieldName)
  const entry: RegistryEntry = { formId, fieldName, apply }
  _entries.set(key, entry)
  return () => {
    // Only delete if this entry is still the one we registered — a
    // re-register from another instance may have replaced us.
    if (_entries.get(key) === entry) _entries.delete(key)
  }
}

/**
 * Look up an applier for `(formId, fieldName)`. Tries the form-scoped
 * key first; falls back to the wildcard form ('*') so a producer that
 * pushed a suggestion without `formId` still resolves an applier from
 * a single-form page.
 */
export function getPendingSuggestionApplier(
  formId:    string | undefined,
  fieldName: string,
): PendingSuggestionApplier | undefined {
  if (formId !== undefined) {
    const scoped = _entries.get(keyFor(formId, fieldName))
    if (scoped) return scoped.apply
  }
  const wild = _entries.get(keyFor(undefined, fieldName))
  return wild?.apply
}

/**
 * Test seam — clear the registry between tests. Not part of the public
 * API.
 */
export function _clearAppliersForTests(): void {
  _entries.clear()
}
