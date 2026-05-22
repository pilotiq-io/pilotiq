---
'@pilotiq/pilotiq': patch
---

fix(collab): `useCollabSeed` runs the seedFn for legacy rooms without `.synced`

The Phase 6d migration (`useCollabSeed` consumes the modern `room.synced` Promise stamped by `@pilotiq-pro/collab@>=0.2`'s `<RecordCollabRoom>`) intentionally short-circuited rooms without `.synced` by setting `seeded=true` with no callback fired — the assumption was that legacy providers had already gated first-sync via `onProviderSynced` themselves. But that posture broke adapters that fully migrated TO `useCollabSeed` and stopped calling `onProviderSynced` directly: when the room owner ships a custom provider that doesn't stamp `.synced`, the editor's empty `Y.XmlFragment` never picked up the SSR-rendered `defaultValue`, and the editor's mount-time `onChange('')` then clobbered the hidden FormData input that holds the server-loaded value.

Fix: in the no-`.synced` branch, run the seedFn immediately (wrapped in `ydoc.transact(..., 'pilotiq-collab-seed')` when possible, same as the synced path) before flipping `seeded=true` — treat "no Promise" as "already synced." Idempotent + best-effort: any throw from the seed callback is swallowed (the seed is allowed to fail when the share-type is unavailable, mirroring the synced path's `try/catch`).

Doesn't fix the parallel pilotiq-pro `FormCollabBinding` regression where the binding seeds the form's Y.Map with empty strings (that's the failing `relationship-pk-switch.spec.ts` case — `RecordCollabRoom` stamps `.synced`, so this branch never runs there); fix lives at the binding layer.
