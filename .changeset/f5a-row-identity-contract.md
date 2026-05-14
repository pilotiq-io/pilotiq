---
'@pilotiq/pilotiq': minor
---

feat(pilotiq): F.5a — Repeater/Builder row-identity contract for collab

Widens `FormCollabBinding` with five optional row-array methods plus a
`RowsEvent` type so the upcoming `Y.Array<Y.Map>` impl in
`@pilotiq-pro/collab` (F.5b) has a stable surface to hook into. Renderer
side wiring is live in this release — `RepeaterInput` + `BuilderInput`
already dispatch `add` / `remove` / `reorder` / `subscribe` through the
binding when one is registered and reconcile remote row events into
their local state by `__id`. No behaviour change for non-collab forms
or bindings that pre-date F.5; pre-F.5 bindings keep typechecking
because every new method is optional.

### New public surface

- **`useRowBinding(arrayName)`** — returns a `RowBindingApi` pre-bound
  to a Repeater/Builder field name, or `null` when no F.5 binding is
  active (outside a collab room, pre-F.5 plugin, opted out via
  `.collab(false)`, or non-array field).
- **`RowBindingApi`** — `{ add, remove, reorder, subscribe }`. Each
  method's `arrayName` arg is pre-bound; `subscribe(fn)` returns an
  unsubscribe function for `useEffect` cleanup.
- **`RowsEvent`** — `add | remove | move` discriminated union with
  `rowId` + indices for the renderer to reconcile against its current
  `rows` state.
- **`FormCollabBinding.addRow / removeRow / reorderRows / setRow /
  getRowTextBinding / subscribeRows`** — all optional. Bindings opt
  into F.5 by implementing the trio `addRow + removeRow + reorderRows`;
  `subscribeRows` and `setRow` layer on for remote-event + dotted-path
  routing; `getRowTextBinding` is reserved for F.5c (per-row `Y.Text`).

### `FormStateProvider` routing

- `setValue` and the live-resolve overlay both route through
  `routeBindingWrite` — top-level names go to `binding.set`, row leaves
  (matching `parseRowFieldPath`) go to `binding.setRow` when available.
  Pre-F.5 row leaves continue to stay local-only.
- The provider walks `formMeta` for top-level Repeater/Builder field
  names at binding mount and builds a per-array `RowBindingApi` map
  exposed via `useRowBinding`.

### Known v1 limitations (kept from the F.5 plan)

- Nested Repeaters (e.g. `articles.0.comments.0.body`) stay local-only
  — `parseRowFieldPath` returns `null` and the binding never sees them.
- Server-derived row values now propagate through `setRow` when
  available; without an F.5 binding they continue to be dropped.
- F.5c (`getRowTextBinding`) — character-level `Y.Text` per row text
  field — lands in a follow-up; row leaves stay on row-level LWW until
  then.
