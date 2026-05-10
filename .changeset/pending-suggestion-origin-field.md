---
'@pilotiq/pilotiq': minor
---

feat(core): `PendingSuggestion.origin` for cross-surface filtering

Widen the `PendingSuggestion` type with an optional `origin` block so
aggregate UIs (pending-pills, overlays, etc.) can filter the shared
panel-wide queue down to the surface that produced each entry. Backward
compatible — existing producers that don't stamp `origin` keep working;
consumers that don't read it see the same flat queue they always did.

```ts
export interface PendingSuggestionOrigin {
  surface:    'sidebar' | 'popover' | 'field-action'
  runId?:     string
  agentSlug?: string
}

export interface PendingSuggestion {
  // …existing fields…
  origin?:    PendingSuggestionOrigin
}
```

Plugin packages (`@pilotiq-pro/ai`) stamp `origin` when they push from a
known surface — the popover-chat scopes its `<PendingSuggestionsPill>`
filter to `o => o?.runId === currentRunId` so it only surfaces its own
session's output, even when sidebar-originated suggestions are still
visible in the same panel-wide queue.

No wire-shape break, no consumer code required.
