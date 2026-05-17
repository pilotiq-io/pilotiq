/**
 * PK-switch Phase B — client-side dispatcher.
 *
 * The pilotiq server returns `relationshipRenames: { field, old, new }[]`
 * in the JSON form-submit response whenever a `Repeater.relationship` /
 * `Builder.relationship` create persisted under a DB-assigned PK that
 * differs from the submitter's pre-assigned `__id` (see
 * `pilotiq-pro/docs/plans/repeater-relationship-pk-switch.md`,
 * `pilotiq/src/elements/dispatchForm.ts` for the wire shape).
 *
 * The renames need to land on the form's collab binding so other peers
 * see the CRDT row re-keyed from UUID → PK without reloading. But the
 * binding lives inside `FormStateProvider` (it owns `bindingRef`), while
 * the JSON success path lives in `FormRenderer`'s `onSubmit` — a sibling
 * component, not a context consumer. We bridge them with a per-`formId`
 * module-level registry: `FormStateProvider` registers a handler when
 * its binding mounts; `FormRenderer` dispatches against it after a
 * successful submit.
 *
 * Pattern parallels `repeaterReconcile.ts`'s sessionStorage flag — same
 * formId-keyed seam, different storage. SessionStorage was right for
 * Phase A (the flag has to survive a navigation between submit and
 * next mount); Phase B has to fire BEFORE the navigation, so a plain
 * in-memory Map is the right shape (no SSR / cross-tab concerns).
 *
 * No-op when no handler is registered (consumer has no collab plugin,
 * or the active binding doesn't implement `renameRow`).
 */

/**
 * One UUID → PK rename emitted by the server. Shape mirrors
 * `pilotiq/src/elements/dispatchForm.ts` `RelationshipRename`; we
 * duplicate the shape here so this module stays free of server-only
 * imports (would otherwise pull the form-submit pipeline into the
 * client bundle).
 */
export interface RelationshipRenameEntry {
  field: string
  old:   string
  new:   string
}

export type RelationshipRenameHandler = (
  renames: ReadonlyArray<RelationshipRenameEntry>,
) => void

const handlers = new Map<string, RelationshipRenameHandler>()

/**
 * Called by `FormStateProvider` when its `FormCollabBinding` mounts AND
 * implements `renameRow`. Returns the unsubscribe fn to call on
 * unmount. Idempotent under re-registration on the same `formId` —
 * later writers replace earlier handlers (Forms only mount one
 * provider per id; a second mount means the first unmounted without
 * firing its cleanup, which is acceptable to overwrite).
 */
export function registerRelationshipRenameHandler(
  formId: string,
  fn:     RelationshipRenameHandler,
): () => void {
  if (!formId) return () => {}
  handlers.set(formId, fn)
  return () => {
    // Only clear when the current handler is still ours — protects
    // against StrictMode dev double-mount where the cleanup of the
    // first mount fires AFTER the second mount has installed its
    // handler. Without this guard, the second mount's handler would
    // be wiped before any submit completes.
    if (handlers.get(formId) === fn) handlers.delete(formId)
  }
}

/**
 * Called by `FormRenderer`'s `onSubmit` success path. Invokes the
 * formId's registered handler with the rename list, or no-ops when
 * either side is empty.
 *
 * Errors thrown by the handler propagate — pilotiq's submit path
 * already catches in a `try`, so a misbehaving binding fails the
 * navigate cleanly with a toast rather than wedging the form.
 */
export function applyRelationshipRenames(
  formId:  string,
  renames: ReadonlyArray<RelationshipRenameEntry> | undefined,
): void {
  if (!formId) return
  if (!renames || renames.length === 0) return
  const fn = handlers.get(formId)
  if (!fn) return
  fn(renames)
}

/** Test seam — drop every registered handler. Not exported from the
 *  react barrel. */
export function _resetRelationshipRenameRegistryForTests(): void {
  handlers.clear()
}
