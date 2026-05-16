/**
 * Phase A of the `Repeater.relationship` PK-switch reconciliation
 * (see `pilotiq-pro/docs/plans/repeater-relationship-pk-switch.md`).
 *
 * When a parent form submit creates new relationship-backed rows, the
 * server assigns each child a DB primary key — but the row's `__id` in
 * the row CRDT is still the renderer-minted UUID from the local session.
 * After redirect, the submitting tab's pageData carries `__id = String(pk)`
 * while CRDT still has the UUID, so the renderer ends up showing the
 * same row twice (DB PK from initialRows + orphan UUID from CRDT).
 *
 * Phase A fix: the submitting tab marks itself for a one-shot CRDT
 * reconcile on the next mount via a per-formId sessionStorage flag.
 * `RepeaterInput` / `BuilderInput` read the flag on mount and, when set,
 * snapshot the row CRDT after a short settle (waiting for WS sync) and
 * reconcile against `initialRows` — removing orphan CRDT rows not in
 * the form's authoritative data, and adding missing CRDT rows (rare,
 * happens when the row was DB-seeded outside the collab session).
 *
 * The flag is scoped per-tab via sessionStorage, so other peers' tabs
 * never run the reconciler — preserving their in-flight edits.
 *
 * Phase B (server-side rename via the @rudderjs/sync Y.Doc seam) will
 * extend this to other peers without requiring them to reload.
 */

const STORAGE_PREFIX = 'pilotiq.repeaterReconcile.'

function storageKey(formId: string): string {
  return STORAGE_PREFIX + formId
}

/**
 * Called by `FormRenderer` on submit success. Records that this tab
 * has just persisted the form, so the next mount of any Repeater /
 * Builder under the same form runs the PK-switch reconciler. No-op
 * when `formId` is empty or `sessionStorage` is unavailable (SSR).
 */
export function markSubmitForReconcile(formId: string): void {
  if (!formId) return
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(storageKey(formId), '1')
  } catch {
    // Quota exceeded / disabled — silently skip. Reconciliation is
    // an optimization, not a correctness requirement.
  }
}

/**
 * Called by `RepeaterInput` / `BuilderInput` on mount. Returns `true`
 * iff the form was just submitted in this tab AND clears the flag so
 * subsequent mounts no-op. Idempotent across multiple Repeater/Builder
 * fields on the same form — the FIRST reader clears the flag, so
 * siblings see `false`. To avoid that, both fields call this helper at
 * the same mount tick — for v1 we accept the limitation: only the first
 * Repeater on the form runs the reconciler; siblings don't.
 *
 * If a future need surfaces (multiple relationship-backed Repeaters on
 * the same form), switch to a per-field flag keyed by `formId.fieldName`
 * or have the FormRenderer dispatch a custom event instead.
 */
export function consumeReconcileFlag(formId: string): boolean {
  if (!formId) return false
  if (typeof sessionStorage === 'undefined') return false
  try {
    const v = sessionStorage.getItem(storageKey(formId))
    if (v !== '1') return false
    sessionStorage.removeItem(storageKey(formId))
    return true
  } catch {
    return false
  }
}

export interface ReconcileInputs {
  /** Current CRDT row id order (post-WS-sync). */
  current:        readonly string[]
  /** Authoritative row id list from server-rendered initialRows. */
  authoritative:  readonly string[]
}

export interface ReconcilePlan {
  /** Row ids present in CRDT but not in initialRows — orphan UUIDs. */
  toRemove: string[]
  /** Row ids present in initialRows but not in CRDT — DB rows not yet
   *  in the room (rare; only happens when DB was seeded outside collab). */
  toAdd:    string[]
}

/**
 * Pure helper: compute the symmetric difference. Exported separately so
 * unit tests don't need a DOM / sessionStorage shim to verify the
 * reconciliation arithmetic.
 */
export function computeReconcilePlan({ current, authoritative }: ReconcileInputs): ReconcilePlan {
  const currentSet = new Set(current)
  const authSet    = new Set(authoritative)
  const toRemove: string[] = []
  const toAdd:    string[] = []
  for (const id of current)       if (!authSet.has(id))    toRemove.push(id)
  for (const id of authoritative) if (!currentSet.has(id)) toAdd.push(id)
  return { toRemove, toAdd }
}
