---
'@pilotiq/pilotiq': patch
---

fix(pilotiq): wire `FormStateProvider` through `FormCollabBinding` (Phase F2)

The F1 registry slot from 0.8.0 was inert — nothing in pilotiq core
consumed `FormCollabBinding`. This patch makes the wiring actually
fire: when a `<RecordCollabRoom>` is mounted up-tree AND a plugin
(e.g. `@pilotiq-pro/collab@0.1`) registered a binding factory,
`FormStateProvider` now:

1. **Mounts on collab activity, not just `stateUrl`.** `FormRenderer`'s
   `useControlled` gate widens from `!!stateUrl` to
   `!!stateUrl || collabActive`. Forms with zero `.live()` fields but
   a record-edit collab room get the controlled path so every
   `useFieldState(name)` consumer (TextInput / Select / Toggle /
   Date / Slider / …) becomes synchronizable.

2. **Constructs a binding on mount.** Calls the registered factory
   with `{ room, formId, initial }`. The binding owns the CRDT
   storage (typically a `Y.Map` on the room's shared ydoc) — pilotiq
   stays Yjs-free.

3. **Lifts already-synced state.** On mount, `binding.get()`'s
   snapshot is shallow-merged on top of the SSR-rendered defaults,
   so subsequent joiners see the room's authoritative state.

4. **Subscribes to remote changes.** `binding.subscribe(snapshot)`
   fires on every Yjs transaction (local + remote). Per-key
   `Object.is` short-circuit collapses local-write echoes into
   no-op renders; remote changes flow through `setValuesState` into
   the controlled inputs.

5. **Proxies `setValue` through the binding.** Every controlled
   write fires `binding.set(name, value)` after the local React
   state update — UNLESS the field opted out via `Field.collab(false)`
   OR the name is a dotted path (Repeater / Builder row leaves stay
   local-only in v1; Phase F.5 tackles `Y.Array<Y.Map>` row identity).

6. **Forwards server-derived values through the binding.** When a
   `.live()` POST response carries `values`, the derived fields
   (e.g. auto-`slug` from `title`) also write through the binding so
   every peer sees the derivation without each peer roundtripping the
   server (Q2 from the F-phase plan).

### Plan + decisions

`pilotiq-pro/docs/plans/collab-form-fields.md` captures the full
phase breakdown; the three open Q's resolved before this patch:

- **Q1** — Idempotent client-side seed (`!ymap.has(k)` per key).
- **Q2** — Server response writes to Y.Map (above).
- **Q3** — `.collab(false)` suppresses both value sync AND presence
  (presence chips land in F4).

### Tested

- All 2938 pilotiq tests pass.
- Two-window smoke test (playground): typing in `title` / changing
  `status` in one window propagates to the other ~instantly.
  Tiptap fields (`body` / `content`) continue to sync via their own
  `Y.XmlFragment` selectors — non-Tiptap fields now share the same
  `Y.Doc` via the `form-data` Y.Map managed by `@pilotiq-pro/collab`'s
  `formCollabBinding` factory.
