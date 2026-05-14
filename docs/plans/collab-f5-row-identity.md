# Collab F.5 — Repeater / Builder row identity via `Y.Array<Y.Map>`

> **Status:** drafting 2026-05-14
> **Scope:** unblock concurrent row edits on Repeater + Builder fields by giving each row its own CRDT-anchored identity. Compose with F.6 so text fields inside rows get character-level Y.Text instead of LWW row-level reads.
>
> **Out of scope (v1):** nested Repeaters (a Repeater inside a Repeater) — flat-array-per-Repeater only; relationship-backed row CRDT semantics on M2M pivot extras (still go through ORM dispatch, not CRDT); Tiptap fields inside rows (handled by their own `Y.XmlFragment`, but row-id addressing for them is left to F.5d if needed).

---

## TL;DR

| Decision | Choice | Why |
|---|---|---|
| CRDT shape for rows | **`Y.Array<Y.Map>` per Repeater/Builder field** — one Y.Map per row, ordered by Y.Array position | Idiomatic Yjs; concurrent inserts both survive; reorder via `yarr.move()`; row identity is structural. |
| Row anchor key | **Existing `__id` on each row** — UUID for new rows, DB PK for relationship-backed | Already round-trips via hidden input + drives React `key=`. No new identity machinery needed. |
| Text fields inside rows | **`Y.Text` lazily lazily allocated under `rowMap.get(fieldName)`** | Composes with F.6's `BoundTextInput` path; row's Y.Map can hold mixed Y.Map + Y.Text + scalar values. |
| Renderer state model | **Unchanged — dotted-path leaves stay** (`useFieldState('tags.0.label')`) | Avoid an invasive form-state refactor; the binding translates dotted-path ↔ row-Y.Map at the contract boundary. |
| Local row tracking | **Renderer keeps mapping `__id → rowIndex`** alongside its `rows` state | Required to bridge dotted-path indices (which shift on remote insert) and stable IDs (which don't). |
| Contract gap | **Widen `FormCollabBinding` with row-array methods** — see [§Contract widening](#contract-widening) | Five new optional methods + one factory arg. Additive — non-collab forms unchanged. Pre-F.5 bindings keep type-checking. |
| Opt-out scope | **Unchanged — per-Field `.collab(false)`** | Already works for row leaves via meta tree walk. |
| Server-resolve roundtrip for row leaves | **Opens the `name.includes('.')` gate** in `FormStateProvider` server-resolve path | Routes `tags.0.slug` through `binding.setRow` so peers receive server-derived row values. |
| Migration | **Auto-migrate top-level array values seeded as JSON** to `Y.Array<Y.Map>` on first F.5 connect | Forms previously synced via opaque LWW need a one-time structural lift. Idempotent. |
| Phasing | **3 phases shipped independently** — see [§Phasing](#phasing) | F.5a (contract) → F.5b (row-array CRDT in binding) → F.5c (per-row Y.Text composition with F.6). |
| Estimated diff | **~600 LOC + ~300 LOC tests across pilotiq core + pilotiq-pro/collab** | Roughly 2× collab-opt-in. Largest piece is the dotted-path-to-row-Y.Map translator in the binding. |

---

## Why F.5 is needed

The Phase-F memory file lists two known limitations of v1:
- *"Two peers typing simultaneously into an empty Y.Text → both survive."* Stems from F.6's no-client-seed posture. Phase E (server `onFirstConnect`) closed this for top-level text fields, but **row-leaf text fields still ride LWW row-level reads** because the binding has no addressing into rows.
- *"Repeater/Builder text leaves stay LWW until Phase F.5 unblocks row identity."* Same root cause.

There's also a **silent data-loss bug** the surveys surfaced that hasn't been called out explicitly: top-level array fields (Repeater values like `tags`) DO sync today via the binding's flat-key path. The whole array is stored as opaque JSON in the Y.Map, so concurrent inserts on two peers race — one peer's row is lost on the next sync. This bug only manifests when two peers add rows simultaneously to the same Repeater, which is rare but consequential when it happens.

F.5 closes both.

---

## Current state (from surveys)

Three load-bearing facts to anchor the design:

1. **Row identity is already in the data plane.** Every row carries a stable `__id` — client-generated UUID for new rows, DB PK for relationship-backed rows — round-tripped through a hidden input (`<input type="hidden" name="${prefix}.__id" />`). React keys rows by `row.id`. The renderer's `reorderRows`, `removeRow`, `moveRow` operations all key by `__id`, not by index. **F.5 builds on this; no new identity machinery is needed.**

2. **Form values are flat dotted-path keys.** `useFieldState('tags.0.label')` is how a Repeater's inner field is addressed. The renderer maintains a separate `rows` array (with `__id` per row) that drives mounting; the values map is a flat-key projection. F.5 does not change this.

3. **Today's binding contract has explicit gates against row leaves.**
   - `FormStateContext.tsx:375` — `binding.set` writes are gated by `!name.includes('.')`.
   - `FormStateContext.tsx:457-461` — server-resolve roundtrips are gated by `!name.includes('.')` too.
   - The collab binding's `walkTopLevelFields` halts at `fieldType === 'repeater' | 'builder'` boundaries.
   
   These gates are the v1 deferral mechanism; F.5 unlocks them with row-scoped routing.

---

## Design

### CRDT shape per Repeater field

Per Repeater (or Builder) field, the binding maintains:

```
ydoc.getArray(<arrayName>)   // Y.Array<Y.Map>
└── Y.Map (row 0)
│   ├── '__id': <string>         // mirror of renderer's row.id
│   ├── 'label': <scalar>          // LWW field value
│   ├── 'body':  Y.Text            // text field — character-level CRDT (F.5c only)
│   └── (Builder only) 'type': <string>, 'data': Y.Map<...>
├── Y.Map (row 1)
└── …
```

- **Y.Array** because Yjs's array semantics handle concurrent insert/remove correctly. Reorder is a single `move(from, to)` op.
- **Y.Map per row** because row-internal field writes are per-key LWW (booleans, enums, dates, etc.) — same as the top-level form Y.Map.
- **Y.Text per row text field** is allocated lazily under the row's Y.Map when the renderer requests `getRowTextBinding(arrayName, rowId, fieldName)`.

### Dotted-path ↔ row-Y.Map translation

The binding becomes the translator. Renderer-side code keeps writing `binding.setRow(arrayName, rowId, fieldName, value)` (new method); the binding resolves `rowId → row Y.Map` via a `Map<rowId, Y.Map>` index it maintains alongside the Y.Array.

**Lookup index lifecycle:**
- Build at binding construction by walking the existing Y.Array (if any rows exist from persistence).
- Update on local `addRow` / `removeRow`.
- Update on remote Y.Array `observe(event)` — `event.changes.added` adds entries, `.deleted` removes them. Reorders don't change the index (`__id → Y.Map` mapping is position-independent).

### Builder per-block-type

Builder rows already carry `{ __id, type, data }`. Mapping is straightforward:
- `rowMap.get('__id')` — string mirror of the renderer's `row.id`.
- `rowMap.get('type')` — the block discriminator (scalar string).
- `rowMap.get('data')` — `Y.Map` containing the per-block-type subschema values (or `Y.Text` for text leaves).

When the renderer changes a block's type (rare — usually delete-add), it goes through `removeRow` + `addRow`, not in-place mutation. Documented in the v1 plan.

### `Repeater.simple(field)` flat-array variant

`simple()` Repeaters store `[v, v, …]` (flat scalars), not `[{name: v}]`. Mapping:
- `Y.Array<Y.Map>` still — each Y.Map has one key, the inner field's name.
- The renderer's wrap/unwrap (`unwrapSimpleRepeaters` in `dispatchForm.ts`) is unchanged; F.5 operates on the wrapped shape.

### `Repeater.relationship` row backing

Relationship-backed rows persist via the ORM on save, not via CRDT. F.5 syncs the **in-form-state row identity + field values** during editing — but the actual `M.create` / `M.update` / `M.delete` happens on form submission, same as today.

This means: two users editing the same record's hasMany rows simultaneously will see each other's changes via CRDT. On submit, the diff logic in `persistRelationshipRows` resolves based on submitted `__id` values — same as today. CRDT and ORM-diff happen at different timepoints; no conflict.

**Pivot extras (M2M):** same — synced through the row's Y.Map under the pivot-column names, persisted via `accessor.updatePivot` on save.

---

## Contract widening

Five new optional methods on `FormCollabBinding`. All additive — non-collab forms + pre-F.5 bindings still typecheck.

```ts
export interface FormCollabBinding {
  // ── existing v1 surface (unchanged) ──
  get():        Record<string, unknown>
  set(name: string, value: unknown): void
  subscribe(fn: (snapshot: Record<string, unknown>) => void): () => void
  getTextBinding?(name: string): TextBinding | null
  destroy():    void

  // ── F.5 widening (all optional) ──
  
  /**
   * Add a row to a Repeater/Builder field. Idempotent — calling with an
   * existing rowId no-ops. Renderer calls this when the user clicks
   * "Add row" or pastes content that produces a new row.
   */
  addRow?(arrayName: string, rowId: string, initial: Record<string, unknown>): void

  /**
   * Remove a row by stable id. Idempotent — missing rowId is a no-op.
   */
  removeRow?(arrayName: string, rowId: string): void

  /**
   * Reorder rows. `newOrder` is the full list of row ids in their new
   * positions. Binding computes the minimal Y.Array move sequence.
   */
  reorderRows?(arrayName: string, newOrder: string[]): void

  /**
   * Write a single field on a row. Replaces dotted-path `set` for row
   * leaves. Type-checking: the binding routes by allowlist same as
   * top-level `set` — text fields go through Y.Text deltas if a row
   * Y.Text exists, scalars hit the row Y.Map.
   */
  setRow?(arrayName: string, rowId: string, fieldName: string, value: unknown): void

  /**
   * Per-row TextBinding for character-level CRDT inside a row. Composes
   * with F.6's BoundTextInput path. Returns null for non-text fields,
   * or when the row hasn't been seeded yet.
   */
  getRowTextBinding?(arrayName: string, rowId: string, fieldName: string): TextBinding | null

  /**
   * Subscribe to row-lifecycle events on a Repeater/Builder array.
   * Fires on remote add/remove/move. Local mutations fire too (so the
   * renderer can reconcile against its own dispatched action).
   */
  subscribeRows?(arrayName: string, fn: (event: RowsEvent) => void): () => void
}

export type RowsEvent =
  | { kind: 'add';    rowId: string; index: number; values: Record<string, unknown> }
  | { kind: 'remove'; rowId: string; index: number }
  | { kind: 'move';   rowId: string; from: number; to: number }
```

### Factory args

Already passes `formMeta`; no new arg needed for F.5. The binding walks `formMeta` at construction to find Repeater/Builder fields → opens a Y.Array per field → builds the rowId index.

---

## Phasing

Three independent phases, each shippable on its own.

### F.5a — pilotiq core: contract widening + renderer wiring (no CRDT impl yet)

- Widen `FormCollabBinding` with the 5 optional methods + `RowsEvent` type.
- Update `FormStateProvider`:
  - On Repeater/Builder local row add/remove/reorder, call `binding.addRow` / `removeRow` / `reorderRows` if the method exists.
  - Open the server-resolve gate for dotted-path values; route through `binding.setRow` if `setRow` exists.
  - Subscribe to `binding.subscribeRows` for each opted-in Repeater; reconcile remote events into the renderer's `rows` state by `__id`.
- Update `RepeaterInput` + `BuilderInput`:
  - On user mutation, call the new binding methods. Fall back to today's local-only behavior when methods are absent.
- Tests: contract unit tests, no CRDT (uses a stub binding).

**Shippable as 0.10.0 → 0.11.0 minor on pilotiq.** No behavior change for non-collab forms; collab consumers see no immediate effect until F.5b lands the pro side.

### F.5b — pilotiq-pro: Y.Array<Y.Map> implementation in `formCollabBinding`

- Implement the 5 new methods in `formCollabBinding`:
  - On construction, walk `formMeta` for Repeater/Builder fields. For each, open `ydoc.getArray(name)`. Build `Map<rowId, Y.Map>` index from existing array entries.
  - `addRow` — create a new Y.Map, seed with `initial`, push to Y.Array, update index.
  - `removeRow` — find row Y.Map by `__id` in index, splice out of Y.Array, remove from index.
  - `reorderRows` — compute minimal Y.Array move sequence; apply in one transaction.
  - `setRow` — look up row Y.Map by `__id` in index, write field via LWW.
  - `subscribeRows` — observe Y.Array, emit add/remove/move events.
- Migration of existing top-level array values stored as opaque JSON in Y.Map:
  - On construction, detect `Y.Map.has(arrayName) && Array.isArray(Y.Map.get(arrayName))` → lift each row into a new Y.Map in the new Y.Array → delete the old Y.Map entry. Idempotent. One-shot per existing room.
- Tests: in-binding unit tests (no React) for each new method + the migration.

**Shippable as patch on pilotiq-pro/collab.** Fixes the silent concurrent-insert data-loss bug for any consumer who upgrades both core + collab.

### F.5c — per-row Y.Text composition with F.6

- `getRowTextBinding(arrayName, rowId, fieldName)` opens `rowMap.get(fieldName) as Y.Text` (or creates one if absent), wraps in the existing `TextBinding` contract.
- `FormStateProvider` calls `getRowTextBinding` for every text-shaped row leaf at row-mount and unmount time (cached in a `Map<rowId+fieldName, TextBinding>`).
- `BoundTextInput` already takes a `TextBinding | null` from `useFieldState` — wire `useFieldState('tags.0.label').textBinding` to thread through the row binding when inside a row context.
- Tests: two-window smoke confirming character-level sync inside Repeater rows; concurrent typing into the same row's same field merges character-by-character.

**Shippable as minor on pilotiq + pilotiq-pro/collab.** Unblocks consumers wanting collab-aware nested forms.

---

## Open questions

1. **Reorder atomicity vs. partial visibility.** During a multi-row reorder (e.g. drag rows 0+1 to positions 2+3), if the binding emits N Y.Array moves in one transact, do peers see one final layout or N intermediate states? Yjs's transaction model says one final state per `transact` block, but worth confirming with a stress test.

2. **Nested Repeater interaction.** A Repeater inside a Repeater (`articles[0].comments[0].body`) is out of scope v1, but: should F.5a's contract methods accept dotted-path `arrayName` to keep the door open, or stick to flat names? Inclined to flat names + defer nested Repeaters entirely.

3. **Cross-form row identity collision.** Two forms editing the same record (rare — but custom panel pages might) could open two Y.Arrays under the same name. Same posture as the top-level Y.Map (single `form-data` per room — multi-form pages share via LWW). For Y.Array<Y.Map> this is more complex: two forms trying to push different rows would interleave. Inclined to document v1 limitation + defer to a future "form scope key" plan.

4. **Yjs Y.Map<Y.Text> mixed values.** Yjs docs say a Y.Map can hold both scalar values AND Yjs collaborative types (Y.Text, Y.Map, Y.Array). Worth a quick spike to confirm Y.Text values survive `Y.Map.toJSON()` round-trips through `@rudderjs/sync` persistence. If not, fall back to separate per-row text maps keyed under e.g. `${arrayName}/text/${rowId}/${fieldName}`.

5. **`Repeater.relationship` PK churn.** When a relationship-backed Repeater row is saved, its `__id` switches from a UUID to the DB PK. Do peers' `Y.Array<Y.Map>` indices update correctly when the renderer rewrites `rowMap.set('__id', newPK)`? Or does the row-id index need rebuild after save? Inclined to: rebuild index on `subscribe` snapshot if any `__id` changed.

6. **Should F.5a require F.6 to compose?** F.5a's `setRow` would route text-field values through `Y.Text` deltas if F.5c is also live. Without F.5c, `setRow` on a text field falls through to row Y.Map LWW — same as today's top-level whole-row LWW. Acceptable v1 limitation, but worth flagging that F.5a alone doesn't fix the text-races-inside-rows issue (only F.5c does).
