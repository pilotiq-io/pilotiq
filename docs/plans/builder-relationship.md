# Builder.relationship

Tier-2 follow-up to Plan #14 / Builder. Sibling of `Repeater.relationship`
(see `docs/plans/repeater-relationship.md`). Lets a `Builder` field back
its heterogeneous rows with a `HasMany` relation on the parent record
instead of a JSON column. Each row maps to a real child record; submit
creates / updates / deletes children against the relation rather than
serializing the array to a single column on the parent.

**Status:** PROPOSED 2026-05-05.

---

## Why we want it

The default `Builder` stores its rows as a JSON blob on the parent
(`page.content = [{ __id, type, data: {…} }, …]`). The same arguments
that drove `Repeater.relationship` apply: queryability, partial updates,
soft-delete, FK references, and database-side sort. For a CMS-style page
builder where each block is a real row, JSON storage is the wrong shape.

`RelationManager` covers the parent-tab-with-table case. Builder
mirrors `Repeater`'s embedded variant — heterogeneous block rows show up
inline inside the parent's form, edited as part of the same submit cycle.

The original Repeater plan deferred this case because heterogeneous rows
need a polymorphic `type` column on the child + a way to dispatch the
diff per block type. The answer turns out to be straightforward: store
`type` as a column and `data` as a JSON column on the child. That mirrors
the in-memory envelope exactly and lets the existing pipelines run with
minimal new logic.

---

## API

```ts
PageResource.form(form) {
  return form.schema([
    TextField.make('title').required(),

    Builder.make('content')
      .relationship('blocks')                // matches Page.relations.blocks
      .blocks([
        Block.make('heading').schema([…]),
        Block.make('paragraph').schema([…]),
        Block.make('image').schema([…]),
      ])
      .reorderable()
      .orderColumn('sort'),                  // optional — writes 0-based index per row
  ])
}
```

Object form for explicit overrides:

```ts
Builder.make('content')
  .relationship({
    name:        'blocks',
    model:       PageBlock,           // override; default = parent.relations[name].model()
    foreignKey:  'pageId',            // override; default = parent.relations[name].foreignKey
    typeColumn:  'type',              // default 'type'
    dataColumn:  'data',              // default 'data'
    orderColumn: 'sort',              // optional explicit order column
  })
```

`orderColumn` can also be set via the dedicated setter `.orderColumn(col)`
(parallel to RepeaterField).

### Builder surface

| Method | Effect |
|---|---|
| `.relationship(name)` | Shorthand. Stores `{ name }`; resolves `model` + `foreignKey` from `parent.constructor.relations[name]` at submit time. |
| `.relationship({ name, model?, foreignKey?, typeColumn?, dataColumn?, orderColumn? })` | Object form. Each field defaults to discovery via the parent's `static relations` map; `typeColumn` and `dataColumn` default to `'type'` and `'data'`. |
| `.orderColumn(col)` | Sugar over `.relationship({ ..., orderColumn })`. Throws when `relationship()` not set first. |

`getRelationship()` returns the resolved
`{ name, model?, foreignKey?, typeColumn?, dataColumn?, orderColumn? }`
or `undefined`.

---

## Data model — parent / child

Caller-supplied. Two shapes the child must carry:

- A discriminator column (default `type`) — `string`. Holds the block
  name from the user's `.blocks([Block.make('heading')])` registration.
- A payload column (default `data`) — JSON-typed. Holds the per-block
  inner-schema values verbatim.

Plus the standard FK + PK + optional `sort` column. Example Prisma:

```prisma
model PageBlock {
  id     Int    @id @default(autoincrement())
  pageId Int
  type   String
  data   Json
  sort   Int    @default(0)
  page   Page   @relation(fields: [pageId], references: [id], onDelete: Cascade)
}
```

The parent declares the relation in the rudder ORM convention
(`static relations = { blocks: { type: 'hasMany', model: () => PageBlock,
foreignKey: 'pageId' } }`).

**No new ORM contract methods.** Reuses
`parent.related(name)` / `ModelLike.relatedQuery(parent, name)` for
loading and `childModel.create / update / delete` for persisting the
diff. `getParentRelationDescriptor` (already shipped for Repeater)
handles the lookup.

---

## Load pipeline

Edit mode. After `applyFillPipeline` produces the values map from the
parent record, walk every top-level relationship-backed Builder and
replace `values[fieldName]` with rows fetched from the relation:

```ts
async function applyRelationshipBuilderFill(form, values, record, parentModel) {
  const out = { ...values }
  for (const builder of findRelationshipBuilders(form.getChildren())) {
    const cfg = builder.getRelationship()!
    const rows = await loadRelationRows(parentModel, record, cfg.name)

    out[builder.name] = rows.map(row => {
      const r       = { ...row }
      const pkValue = r[pkColumn]
      const type    = r[cfg.typeColumn ?? 'type']
      const data    = r[cfg.dataColumn ?? 'data']
      delete r[pkColumn]
      if (cfg.foreignKey) delete r[cfg.foreignKey]
      delete r[cfg.typeColumn ?? 'type']
      delete r[cfg.dataColumn ?? 'data']
      return {
        __id: pkValue !== undefined ? String(pkValue) : undefined,
        type: typeof type === 'string' ? type : '',
        data: parseDataPayload(data),  // object | JSON-stringified-object → Record
      }
    })
  }
  return out
}
```

`parseDataPayload` handles the case where the ORM returns JSON columns
as a string (Prisma normally hydrates `Json` to an object, but adapters
vary). Strings are `JSON.parse`d once; objects pass through; other
shapes coerce to `{}` (the inner schema renders fresh defaults).

`__id` is stamped to the child's PK so submitted rows can be matched
back to existing records. The renderer already round-trips `__id`
through a hidden input on every Builder row.

Order: when `orderColumn` is set, rows load ordered by that column
ascending. Without it, default ORM ordering (PK ascending) wins.

Create mode is unchanged — a fresh form starts with `values[fieldName] =
[]` (no parent record exists yet, so no rows to load).

Non-`type` / `data` / FK / PK columns on the child are NOT surfaced to
the inner schema — the JSON envelope is the source of truth for
per-block fields. If a user later wants to denormalize a column out of
`data` into a real child column, they can do it via a per-block
`mutateBeforeCreate` hook + a custom `query()` override.

---

## Save pipeline

Wedge into `dispatchFormSubmit` AFTER `coerceFormValues +
unwrapSimpleRepeaters + extractRelationshipRepeaters`, BEFORE
`mutateData`. The coerced shape after `coerceBuilderValue` is
`data[fieldName] = [{ __id?, type, data: {…} }, …]`.

```ts
const builderDeferrals: Array<{ field, rows, cfg }> = []
walkBuildersTopLevel(children, builder => {
  const cfg = builder.getRelationship()
  if (!cfg) return
  const rows = data[builder.name]
  delete data[builder.name]
  if (Array.isArray(rows)) builderDeferrals.push({ field: builder, rows, cfg })
})
```

Pulling the value out of `data` ensures the parent's `M.update / create`
doesn't try to write a JSON column that doesn't exist.

After the parent's `persist()` returns the saved record:

```ts
for (const { field, rows, cfg } of builderDeferrals) {
  await persistRelationshipBuilderRows(record, field, rows, cfg, parentModel)
}
```

Persistence loop per Builder:

1. Resolve `(M, foreignKey, type, typeColumn, dataColumn, orderColumn)`
   from `cfg` + `getParentRelationDescriptor(parentModel, cfg.name)`.
2. Load existing PKs via
   `resolveRelatedQuery(parentModel, record, cfg.name).paginate(1, 10000)`.
3. Build `existingPkSet = new Set(existing.map(r => String(r[pk])))`.
4. Walk submitted `rows` in order:
   - **Update**: `__id` ∈ `existingPkSet` →
     `M.update(__id, { [typeColumn]: row.type, [dataColumn]: row.data, [orderColumn]: idx })`.
     The FK is **deleted** from the update payload (don't let a tampered
     client re-link a child to a different parent).
   - **Create**: `__id` ∉ `existingPkSet` (or absent) →
     `M.create({ [typeColumn]: row.type, [dataColumn]: row.data, [foreignKey]: parentPk, [orderColumn]: idx })`.
   - Track the kept PK in a `keptPkSet`.
5. **Delete**: every existing PK NOT in `keptPkSet` → `M.delete(pk)`.

Order column rules mirror Repeater:
- `orderColumn` unset → skip the `[orderColumn]: idx` stamp on both
  create and update.
- Reorder-only saves (no row content changed, just drag-and-drop) flow
  through update with the new index.

Errors propagate. v1 isn't transactional — partial failure leaves the
parent saved and some children unchanged (same posture as Repeater).

---

## Validation

Unchanged. `validateBuilder` already keys per-row errors as
`<field>.<i>.data.<child>` and respects `Block.maxItems` per-type caps,
field-level `min/maxItems`, and `Field.distinct()` cross-row uniqueness.
Validation runs BEFORE the relation diff so a failed row never reaches
the persistence loop.

`Field.unique({ model })` continues to query the configured model's full
table; for a relationship-backed Builder, that model is the **child**
model the user passed (or the relation descriptor resolves), and the
unique check probes that table — same correct semantics as Repeater.

---

## ORM contract

No additions. Reuses the existing `getParentRelationDescriptor` helper
shipped for Repeater.relationship.

The descriptor lookup throws a clear error at submit time when:
- the parent model has no `relations` map, OR
- the named relation is missing, OR
- the user explicitly opted out of discovery (no `model` or `foreignKey`
  on the field's relationship config) AND auto-discovery fails, OR
- the relation type is anything other than `'hasMany'` (v1 scope).

---

## Wire shape

`BuilderFieldMeta` gains:

```ts
relationship?: {
  name:         string
  typeColumn?:  string
  dataColumn?:  string
  orderColumn?: string
}
```

The renderer doesn't need behavior change in v1 — every difference is
server-side. We emit the meta anyway for diagnostic purposes (and
future UI hooks like a "save in progress" pulse on relation-backed
rows). `model` and `foreignKey` are NOT serialized — they're server-only.

---

## Implementation map

1. **`src/fields/BuilderField.ts`**
   - `BuilderRelationshipConfig = { name; model?; foreignKey?; typeColumn?; dataColumn?; orderColumn? }`.
   - Field private `_relationship?: BuilderRelationshipConfig`.
   - Setter `.relationship(arg)`.
   - Sugar `.orderColumn(col)`.
   - Getter `getRelationship()`.
   - `toMeta` adds `relationship: { name, typeColumn?, dataColumn?, orderColumn? }`
     when configured (skips `model` / `foreignKey`; skips
     `typeColumn` / `dataColumn` when default).
   - Mutual-exclusion guard: `.relationship()` is incompatible with
     `.dehydrated(false)` (the field's whole purpose is to write data —
     silently dropping it would be confusing). `simple()` doesn't
     exist on Builder, so no parallel guard there.

2. **`src/elements/dispatchForm.ts`**
   - `BuilderRelationshipDeferral` record shape (mirrors
     `RelationshipDeferral`).
   - `extractRelationshipBuilders(elements, data)` — walks top-level
     Builders with `getRelationship()`, pulls their values out of
     `data`, returns a deferral list. Mutates `data` in place.
   - `persistRelationshipBuilderRows(parent, deferral, parentModel)` —
     calls a shared `resolveChildModelAndFk` (refactored out of
     `Repeater`'s sibling) to resolve `(model, foreignKey, type)`.
     Emits `[typeColumn]: row.type`, `[dataColumn]: row.data` on both
     create + update payloads.
   - Wire into `dispatchFormSubmit` between
     `extractRelationshipRepeaters` and `mutateData`. After `persist()`
     returns, run the deferral loop.

3. **`src/pageData.ts`**
   - In `resourceEditData`, after `applyFillPipeline +
     applyRelationshipRepeaterFill`, walk relationship-backed Builders
     and replace their value with rows loaded from the relation.
   - New helper `applyRelationshipBuilderFill(form, values, record,
     parentModel)`.
   - Reuse `loadRelationRows` from dispatchForm.ts.
   - `findRelationshipBuilders` mirrors `findRelationshipRepeaters` —
     same walker, structural `isBuilderField` guard.

4. **`src/routes.ts`** — already threads `parentModel: R.model` onto
   the FormContext for resource create + edit (Repeater plan landed
   that). No new wiring; relation-manager forms also already get
   `parentModel`. Globals stay intentionally skipped.

5. **Tests** — `BuilderField.test.ts` (setter + meta round-trip + guards);
   new `BuilderRelationship.test.ts` (full pipeline — load, create
   diff, update diff, delete diff, mixed, order column, parentModel
   guard, descriptor failure, override-only path).

6. **Docs** — `docs/guide/builder.md` gets a "Relationship-backed rows"
   section. `packages/pilotiq/CLAUDE.md` line on Builder gets a
   sentence appended. `docs/plans/admin-gap-audit.md` ticks the Builder
   relationship row.

7. **Memory** — write `project_pilotiq_builder_relationship.md` and
   index it in `MEMORY.md`. Cross-link from
   `project_pilotiq_relations.md` follow-up section. Update
   `project_pilotiq_next_session.md`.

---

## Out of scope (v1)

- **Per-block-type model dispatch.** Each block points at a different
  child model. Storage split across N tables. Complex (joins to load
  in a single ordered list; cross-table sort). Defer until a real
  consumer asks. The single-model + JSON-`data` approach in v1
  matches Filament and covers the page-builder case.
- **Many-to-many / pivot.** Same ruling as Repeater.relationship —
  framework-level deferral. (`feedback_relations_belongstomany_deferred.md`.)
- **Polymorphic relations.** Same reasoning. The `morphMany` parent
  side could work conceptually (parent stamps `<morphName>Id` /
  `<morphName>Type` on every child create the way `RelationManager`
  does); deferred until a consumer asks.
- **Transactional save.** No transaction wrapper around parent save +
  child diff in v1; partial failure is possible. Follow-up once we
  have an ORM-side `transaction(fn)` primitive.
- **Lazy / paginated load.** v1 reads up to 10k rows; admin Builders
  shouldn't grow that large.
- **Block.relationship()** — per-block-type relation override.
  Conceptually neat but complex and unmotivated. Defer.

---

## Risks / non-obvious

- **`__id` collision.** Same as Repeater — UUIDs vs PKs. Practically
  impossible.
- **JSON column round-trip.** Different ORMs serialize JSON columns
  differently. Prisma hydrates to objects on read; some others return
  strings. `parseDataPayload` handles both.
- **Unknown block types in DB rows.** If a row's `type` column doesn't
  match any registered block (config rolled back, e.g.), the row
  surfaces with `type` set to that string and the Builder renderer
  shows the "Unknown block type" placeholder — values round-trip
  verbatim through the JSON `data` envelope. Same posture as the
  default JSON-storage Builder.
- **Tampered `type` change.** A submitted row can change its `type`
  on update. The persist pipeline writes the new `type` column +
  the new `data` payload as-is — it's the inner schema that decides
  what fields are valid for a given type. If a user really wants to
  forbid type changes after creation, they handle it in
  `mutateBeforeUpdate`.
- **FK stamping under `mutateDataBeforeCreate`.** User mutators on
  the parent see `data` *without* the relation rows (we've already
  extracted them). Document this so users don't expect to mutate
  `data.content[i]` from the parent's mutator. Per-row mutation
  belongs in `Block.schema` field-level lifecycle.
- **Order column drift.** If a unique index sits on `orderColumn`
  (rare), the reorder write may collide. Surface as 500 in v1; a
  two-pass reorder is a follow-up.
