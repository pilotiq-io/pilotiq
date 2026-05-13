---
'@pilotiq/pilotiq': minor
---

feat(pilotiq): collab open-core wiring + `Field.collab()` opt-out

Three new module-singleton registries + a URL gate + a `.collab()` setter
on the `Field` base — the open-core scaffolding pro collab plugins (e.g.
`@pilotiq-pro/collab`) plug into. Pilotiq core stays Yjs-free; the
registries hand opaque values back and forth.

### Registries (all exported from `@pilotiq/pilotiq/react`)

- **`CollabRoomContext`** — React context exposing the active record's
  `{ ydoc, provider, user? }` triplet. `useCollabRoom()` returns `null`
  when no `<RecordCollabRoom>` is mounted up-tree.
- **`registerCollabExtensions(factory)`** / **`getCollabExtensions()`** —
  module slot for a `CollabExtensionFactory` that returns Tiptap-style
  collab extensions for a given `{ ydoc, provider, fieldName, user }`.
  Pilotiq treats the returned values as opaque `unknown[]`; the consumer
  (typically `@pilotiq/tiptap`) spreads them into its editor.
- **`registerRecordWrapper(C)`** / **`getRecordWrapper()`** — module
  slot for a record-scoped React wrapper. `AppShell` wraps every
  record-edit page's children with the registered wrapper, scoped to
  `{ resourceSlug, recordId }`.
- **`registerFormCollabBinding(factory)`** / **`getFormCollabBinding()`** —
  module slot for a form-level CRDT binding (form-data `Y.Map` proxy);
  consumed by `FormStateProvider` in Phase F2.

### URL gate

- **`RecordWrapperGate`** — internal component AppShell mounts around
  `props.children`. Parses the current path against `basePath`; when it
  matches a `/.../:id/edit` URL AND a wrapper is registered, wraps with
  `<Wrapper resourceSlug={slug} recordId={id}>{children}</Wrapper>`.
  Pass-through otherwise.
- **`parseRecordEditUrl(currentPath, basePath)`** — pure helper exported
  alongside. Handles bare resource edit, cluster-prefixed edits, and
  nested-relation edits (slash-joined slug-path picks up the parent +
  relation chain so two URLs that target different records always
  produce different rooms downstream).

### `Field.collab(enabled = true)`

New setter on the base class — every subclass (Text, Toggle, Select,
Date, Slider, …, RichText) inherits. `.collab(false)` stamps
`meta.collab === false`; the renderer is expected to skip the collab
layer entirely (no value sync, no presence chip). Absent = inherit the
panel default.

### Acceptance

- Pilotiq builds + 2938 tests pass (12 new for `parseRecordEditUrl`).
- Consumers (e.g. `@pilotiq-pro/collab`) wire collab through these
  registries; pilotiq core carries no Yjs / Tiptap dep.
