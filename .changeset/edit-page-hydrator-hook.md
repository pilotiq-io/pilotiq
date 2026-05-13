---
'@pilotiq/pilotiq': minor
---

feat(pilotiq): `Pilotiq.editPageHydrator(fn)` — server-side hook for resource edit pages

Open-core scaffolding for the SSR-from-Y.Doc consumer in
`@pilotiq-pro/collab` (kills the DB → Y.Doc value flicker on collab'd
edit pages). Pilotiq core stays Yjs-free — the hook's return type is
`Record<string, unknown>` so consumer-side Yjs imports stay confined
to the plugin.

### New surface

- **`panel.editPageHydrator(fn)`** — fluent builder method. Registers a
  server-side hook called on every resource edit page after the standard
  fill pipeline (`loadRecord` → `mutateFormDataBeforeFill` →
  `fillFromRecord` → `mutateFormDataAfterFill` →
  `applyRelationshipRepeaterFill` → `applyRelationshipBuilderFill`).
  Multiple registrations welcome — walked sequentially in registration
  order; each non-null return merges onto the form's default values
  (later returns override earlier ones on key conflicts).
- **`EditPageHydrator`** — function type:
  `(ctx) => Record<string, unknown> | null | Promise<…>`.
- **`EditPageHydratorContext`** — `{ resource: ResourceClass, recordId:
  string, currentValues: Record<string, unknown> }`. `currentValues` is
  the fill-pipeline result so hydrators can read DB-row values before
  deciding what to overlay.

### Failure mode is permissive

A hydrator that throws or returns `null` contributes nothing; the page
still renders against the fill-pipeline values it received. Errors emit
a `console.warn` so silent reliance on missing data is visible.

### Where it runs

Only on the fresh-load branch in `resourceEditData()` (not on the
validation-error round-trip — overlaying server-derived values there
would clobber the user's just-submitted input that the page is
re-displaying for them to fix).

### Tested

- 2981/2981 pilotiq tests pass (was 2971; +10 new: hydrator merge order,
  throw-swallow, null + non-object returns, ctx passthrough, builder
  method registration order).
