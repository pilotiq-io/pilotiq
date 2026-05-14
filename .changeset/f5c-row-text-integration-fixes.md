---
'@pilotiq/pilotiq': patch
---

fix(pilotiq): F.5c row-text integration — stamp row `__id` and walk `template` not `children`

Two integration gaps in the just-shipped F.5c per-row Y.Text path made
character-level CRDT silently fall back to LWW for every Repeater /
Builder row text leaf. Both green-CI / broken-at-render bugs.

### `collectRowTextLeavesByArray` walked the wrong meta key

The walker read `meta.children` for the Repeater's inner row schema,
but `RepeaterField.toMeta()` emits the row schema under `meta.template`
(`meta.children` is the per-resolved-row child list, not the field-
level template). Walker always returned empty → `FormStateApi.rowTextLeaves`
stayed `null` → `useFieldState(dottedName).textBinding` short-circuited
on every dotted row-leaf name. The unit-test fixture mirrored the same
wrong shape, so CI passed while the renderer was inert.

### `RepeaterInput` / `BuilderInput` never stamped row `__id` in `ctx.values`

`resolveRowTextBinding` looks up `rowIdAtIndex(ctx.values, name, i)` which
reads `values['${name}.${i}.__id']`. The renderer maintained row identity
in local component state but never mirrored it into `ctx.values`, so the
lookup returned `null` and the binding chain never fired — even for
locally-added rows.

Both renderers now mirror `rows` into `ctx.values` via a single
`useEffect` keyed on the rows array. Pre-existing server-seeded rows
were unaffected because the seed wasn't a renderer concern; only
locally-added or remote-reconciled rows hit the gap.

### Tests

`formStateHelpers.test.ts`'s hand-built `repeater()` helper now emits
`template:` instead of `children:` to match `RepeaterField.toMeta()`.
Catches future drift between meta producers and walkers.
