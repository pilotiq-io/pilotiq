---
'@pilotiq/pilotiq': minor
---

feat(repeater, builder): emit per-row UUID → PK renames from relationship-backed creates

`Repeater.relationship` / `Builder.relationship` row creates now emit `{ field, old, new }` renames whenever the renderer-minted `__id` (typically a UUID) differs from the DB-assigned primary key. Renames are aggregated through `DispatchSuccess.relationshipRenames` (new field, defaulting to `[]`) and serialized into the form-submit JSON response under `relationshipRenames` when non-empty. The 303-redirect form-post path is unaffected (renames are a collab-only concern).

Phase B groundwork for `pilotiq-pro/docs/plans/repeater-relationship-pk-switch.md` — a future `@pilotiq-pro/collab` adapter can subscribe to the JSON response and rename the row in the shared CRDT so non-submitting peers converge on the new PK without reloading. With no adapter registered, renames silently no-op (non-collab forms unaffected).

New public type `RelationshipRename` re-exported from `@pilotiq/pilotiq`.
