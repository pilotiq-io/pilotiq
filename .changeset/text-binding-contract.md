---
'@pilotiq/pilotiq': minor
---

feat(pilotiq): character-level CRDT contract for plain-text inputs (Phase F.6 a + b)

Open-core scaffolding for `@pilotiq-pro/collab@0.1.x`'s `Y.Text`-per-field
binding. Pilotiq core stays Yjs-free — the contract hands opaque
`TextBinding` handles through. F.6 fully ships when a collab plugin
implements the new optional `getTextBinding` method (today's
`@pilotiq-pro/collab@0.1.0` does); F1-era plugins continue to work
unchanged because the method is optional.

### New exports from `@pilotiq/pilotiq/react`

- **`TextBinding`** — per-field text-CRDT handle: `read() / applyDelta /
  observe(fn) / destroy`. Issued by `FormCollabBinding.getTextBinding(name)`.
- **`TextDelta`** — `insert | delete | replace` op union emitted by
  text renderers.
- **`useFieldState().textBinding: TextBinding | null`** — non-null inside
  a `<RecordCollabRoom>` when the binding has allocated a Y.Text for
  the field; renderers branch on this to take the character-level path.

### `FormCollabBinding` contract

- **`getTextBinding?(name): TextBinding | null`** — new optional method.
  Returns a Y.Text-backed handle for text-shaped fields (the binding
  impl owns the allowlist), or `null` for non-text fields and text
  fields opted out via `.collab(false)`.
- **`FormCollabBindingFactoryArgs.formMeta`** — initial form meta passed
  to the factory so the binding can partition text vs non-text fields
  at construction time. F1-era plugins that destructure `{ room, formId,
  initial }` continue to type-check; the new field is just available
  for plugins that need it.

### `TextLikeInput` / `MarkdownInput` rendering

- When `fs.textBinding` is non-null AND no `TextField.mask(...)` is
  set, the renderer takes a character-level path: initial value from
  `binding.read()`, observer for remote updates with best-effort
  cursor preservation, local edits → `computeDelta(before, after)` →
  `binding.applyDelta`. IME composition is gated until
  `compositionend` so non-Latin input methods don't emit ops for
  intermediate composing characters.
- Masked inputs fall through to today's LWW path — mask + character
  CRDT is incompatible (peers would see raw keystrokes diverged from
  the local mask render).
- `MarkdownInput` gets the same wiring inline — toolbar splices (bold,
  italic, list, …) and paste-uploads ride the same `setValue` pipe
  which routes through the binding when active.

### Helpers (internal)

- `react/fields/textDelta.ts` — pure `computeDelta(before, after)` +
  `preserveCursor(before, after, cursor)`. 19 unit tests.

### Tested

- 2957/2957 pilotiq tests pass (was 2938; +19 textDelta tests).
- `@pilotiq-pro/collab@0.1.x` is the consumer that ships F.6c (the
  Y.Text impl) on top of this contract.
