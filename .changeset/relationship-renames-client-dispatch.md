---
'@pilotiq/pilotiq': minor
---

feat(react): apply relationship-row UUID → PK renames against the active form's collab binding on submit success

Closes the client-side half of the PK-switch Phase B wire (`pilotiq-pro/docs/plans/repeater-relationship-pk-switch.md`). The previous changeset shipped server-side `relationshipRenames` emission; this one dispatches them against the form's collab binding so non-submitting peers converge on the DB-assigned PK without reloading.

New optional `FormCollabBinding.renameRow?(arrayName, oldId, newId): void` contract on the binding interface — bindings that omit it silently skip the apply step (the documented pre-Phase-B posture; Phase A's submitter-side reconciler still cleans orphans on next mount). `@pilotiq-pro/collab@0.0.x` ships a matching forward to `Y.Map`-based rename-by-clone.

Internally the wire is a per-`formId` module-level registry (`react/fields/relationshipRenameDispatch.ts`) — `FormStateProvider` registers a handler when the binding mounts; `FormRenderer`'s submit-success path calls `applyRelationshipRenames(formId, renames)` *before* `markSubmitForReconcile + navigate` so the Yjs transact lands on the local doc while the binding is still mounted. StrictMode-safe cleanup (clears the slot only when the current handler matches).

The submitter-only Phase A `repeaterReconcile.ts` reconciler stays in place — it composes with Phase B (no-ops on a freshly-renamed CRDT) and remains the fallback for bindings without `renameRow` plus the close-tab-mid-flush edge case.
