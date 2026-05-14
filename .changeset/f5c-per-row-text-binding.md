---
'@pilotiq/pilotiq': minor
---

feat(pilotiq): F.5c — per-row Y.Text composition with F.6

Wires `useFieldState(dottedName).textBinding` to resolve through
`FormCollabBinding.getRowTextBinding(arrayName, rowId, fieldName)` so
Repeater/Builder row text fields ride character-level CRDT when the
plugin implements F.5c. Previously dotted-name `textBinding` always
returned `null`; now it returns a stable handle when:

- the row's `__id` is already stamped in the values map,
- the inner field's `fieldType` is in the F.6 allowlist
  (`text / textarea / email / slug / markdown`),
- the field isn't opted out via `.collab(false)`,
- the active binding implements `getRowTextBinding`.

### Walker

A new `collectRowTextLeavesByArray(formMeta)` helper walks each
Repeater's inner schema + each Builder block's template once at
binding mount and stashes the per-array text-leaf names on
`FormStateApi.rowTextLeaves`. Nested Repeater/Builder boundaries stop
the walk — 5-segment dotted paths remain out of scope.

### Renderer surface unchanged

`BoundTextInput` already branches on `textBinding != null` from F.6,
so rows pick up the character-level path automatically once an F.5c-
capable binding is registered. No new renderer wiring beyond the
walker + `useFieldState` resolver.
