# Repeater.relationship

Tier-2 follow-up to Plan #14 (Repeater). Lets a `Repeater` field back its
rows with a `HasMany` relation on the parent record instead of a JSON
column. Each row maps to a real child record; submit creates / updates /
deletes children against the relation rather than serializing the array
to a single column on the parent.

**Status:** SHIPPED 2026-05-03. Field surface + server pipeline + ORM
descriptor helper + 21 new tests landed in a single pass; tests went
from 1449 → 1470. Playground runtime demo deferred (needs a Prisma
schema migration for a new child model).

---

## Why we want it

The default `Repeater` stores its rows as a JSON blob on the parent record
(`order.lineItems = [{ ... }, ...]`). That works for tightly coupled,
parent-only data, but the moment the rows need to be:

- queried independently (`SELECT FROM line_items WHERE product_id = X`)
- referenced by other models
- partially updated (e.g. a single line item's status flips without a
  parent edit)
- soft-deleted on their own
- sorted with database-side cursors

…the JSON shape gets in the way. The Filament-style answer is to store
each row as a real `LineItem` record with an FK back to the parent
`Order`, and let the `Repeater` field manage the create/update/delete
diff transparently.

`RelationManager` (Plan #11) already covers the case where the related
records get their own page-level table inside a tab on the parent's
edit/view page. `Repeater.relationship` is the *embedded* variant — the
related rows show up inline inside the parent's form, edited as part of
the same submit cycle.

---

## API

```ts
PostResource.form(form) {
  return form.schema([
    TextField.make('title').required(),

    Repeater.make('attachments')
      .relationship('attachments')      // matches Post.relations.attachments
      .schema([
        TextField.make('label').required(),
        TextField.make('url').required(),
      ])
      .reorderable()
      .orderColumn('sort'),             // optional — writes 0-based index per row
  ])
}
```

The argument can also be the relationship name as part of an options
object when the user wants to override discovery:

```ts
Repeater.make('attachments')
  .relationship({
    name:        'attachments',
    model:       Attachment,            // override; default = parent.relations[name].model()
    foreignKey:  'postId',              // override; default = parent.relations[name].foreignKey
    orderColumn: 'sort',                // optional explicit order column
  })
```

`orderColumn` can also be set via the dedicated setter `.orderColumn(col)`
to keep the common case readable.

### Builder surface

| Method | Effect |
|---|---|
| `.relationship(name)` | Shorthand. Stores `{ name }`; resolves `model` + `foreignKey` from `parent.constructor.relations[name]` at submit time. |
| `.relationship({ name, model?, foreignKey?, orderColumn? })` | Object form for explicit overrides. Each field defaults to discovery via the parent's `static relations` map. |
| `.orderColumn(col)` | Sugar over `.relationship({ ..., orderColumn })`. No-op when `relationship` isn't configured. |

`getRelationship()` returns the resolved `{ name, model?, foreignKey?, orderColumn? }` or `undefined`. The user-supplied
`model` / `foreignKey` are stored opaque on the field; lookups against
the parent's relations map happen at submit time so test stubs without a
`relations` map still work.

---

## Data model — parent / child

Caller-supplied. The parent declares the relation in the rudder ORM
convention (`static relations = { attachments: { type: 'hasMany', model:
() => Attachment, foreignKey: 'postId' } }`), and the child model carries
the FK column + any other fields the inner schema declares.

**No new ORM contract methods.** We reuse:
- `parent.related(name)` (rudder convention) or `ModelLike.relatedQuery(parent, name)` for loading existing rows.
- `childModel.create / update / delete` for persisting the diff.

The FK column is stamped on every `create` payload so newly inserted
rows link back to the parent. Updates leave the FK alone (it's already
correct on existing rows). Deletes are by primary key.

---

## Load pipeline

Edit mode. After `applyFillPipeline` produces the values map from the
parent record, walk every top-level relationship-backed Repeater and
replace `values[fieldName]` with rows fetched from the relation:

```ts
async function applyRelationshipRepeaterFill(form, record, parentModel) {
  const out = { ...await applyFillPipeline(form, record) }
  for (const repeater of findRelationshipRepeaters(form.getChildren())) {
    const cfg = repeater.getRelationship()!
    const M   = resolveChildModel(parentModel, cfg)
    const rows = await loadRelationRows(parentModel, record, cfg, M)
    out[repeater.name] = rows.map(r => ({
      __id: String(r[getPrimaryKey(M)]),
      ...stripFkAndPk(r, cfg.foreignKey, getPrimaryKey(M)),
    }))
  }
  return out
}
```

`__id` is stamped to the child's primary key so submitted rows can be
matched back to existing records. The renderer round-trips `__id`
through a hidden input on every row (existing Repeater behavior).

`stripFkAndPk` drops `id` + `foreignKey` from the rendered row so the
inner schema doesn't accidentally surface them as form values. The PK
lives on `__id`; the FK is stamped at save time.

Order: when `orderColumn` is set, rows are loaded ordered by that column
ascending. Without it, rows load in whatever the relation's default
ordering is (rudder ORM defaults to PK ascending).

Create mode is unchanged — a fresh form starts with `values[fieldName] =
[]` (no parent record exists yet, so no rows to load).

---

## Save pipeline

Wedge into `dispatchFormSubmit` AFTER `coerceFormValues + unwrapSimpleRepeaters`,
BEFORE `mutateData`. The coerced shape is `data[fieldName] = [{ __id?, ...row }, ...]`.

```ts
const relationshipDeferrals: Array<{ field, rows, cfg }> = []
walkRepeatersTopLevel(children, repeater => {
  const cfg = repeater.getRelationship()
  if (!cfg) return
  const rows = data[repeater.name]
  delete data[repeater.name]
  if (Array.isArray(rows)) relationshipDeferrals.push({ field: repeater, rows, cfg })
})
```

Pulling the value out of `data` ensures the parent's `M.update / create`
doesn't try to write a JSON column that doesn't exist.

After the parent's `persist()` returns the saved record:

```ts
for (const { field, rows, cfg } of relationshipDeferrals) {
  await persistRelationshipRows(record, field, rows, cfg, parentModel)
}
```

Persistence loop per Repeater:

1. Resolve `(M, foreignKey, orderColumn)` from `cfg` + `parent.constructor.relations[cfg.name]`.
2. Load existing PKs via `resolveRelatedQuery(parentModel, record, cfg.name).paginate(1, 10000)` (cap arbitrary; v1 doesn't paginate the diff — admin Repeaters don't have 10k rows).
3. Build `existingPkSet = new Set(existing.map(r => String(r[pk])))`.
4. Walk submitted `rows` in order:
   - **Update**: `__id` ∈ `existingPkSet` → `M.update(__id, { ...row, [orderColumn]: idx })`. Don't overwrite the FK on update — it's already correct.
   - **Create**: `__id` ∉ `existingPkSet` (or absent) → strip `__id` + drop empty fields, then `M.create({ ...row, [foreignKey]: parentId, [orderColumn]: idx })`.
   - Track the kept PK in a `keptPkSet`.
5. **Delete**: every existing PK NOT in `keptPkSet` → `M.delete(pk)`.

Order column rules:
- If `orderColumn` is unset, skip the `[orderColumn]: idx` stamp on both create and update.
- Reorder-only saves (no row content changed, just drag-and-drop) still flow through update with the new index.

Errors propagate. v1 doesn't wrap the persistence in a transaction; if
the parent saves but a child create fails, the parent edit is committed
and the failure surfaces as a 500. Adding a transaction wrapper is a
follow-up — needs an ORM-side primitive that pilotiq doesn't currently
declare.

---

## Validation

Unchanged. `validateRepeater` already keys per-row errors as
`<field>.<i>.<child>` and respects `Field.distinct()` cross-row uniqueness.
Relationship-backed Repeaters get the same treatment — validation runs
BEFORE the relation diff so a failed row never reaches the persistence
loop.

`Field.unique({ model })` continues to query the child model's full
table, which is the correct semantics: "no two attachments across the
entire system have this label" still means a real DB query.

---

## ORM contract

No additions to `ModelLike` or `ModelQuery`. Two tiny helpers in
`orm/modelDefaults.ts`:

```ts
export interface ParentRelationDescriptor {
  type:        string                          // 'hasMany' (v1 scope)
  model:       () => ModelLike                 // child model factory
  foreignKey:  string                          // FK on child pointing at parent
}

export function getParentRelationDescriptor(
  parentModel: ModelLike,
  name:        string,
): ParentRelationDescriptor | undefined {
  const relations = (parentModel as Record<string, unknown>).relations
  if (!relations || typeof relations !== 'object') return undefined
  const entry = (relations as Record<string, unknown>)[name]
  if (!entry || typeof entry !== 'object') return undefined
  // structural duck-type — `model` is a thunk, `foreignKey` is a string
  const e = entry as Record<string, unknown>
  if (typeof e['foreignKey'] !== 'string') return undefined
  if (typeof e['model'] !== 'function')    return undefined
  return e as unknown as ParentRelationDescriptor
}
```

The descriptor lookup throws a clear error at submit time when:
- the parent model has no `relations` map, OR
- the named relation is missing, OR
- the user explicitly opted out of discovery (no `model` or
  `foreignKey` on the field's relationship config) AND auto-discovery
  fails.

v1 only handles `type === 'hasMany'`. Other types surface a clear "not
yet supported" error — `belongsTo` / `hasOne` are conceptually a single
record so they wouldn't fit the Repeater shape anyway, and `M2M / pivot`
is deferred at the framework level (see `feedback_relations_belongstomany_deferred.md`).

---

## Wire shape

`RepeaterFieldMeta` gains:

```ts
relationship?: {
  name:        string
  orderColumn?: string
}
```

The renderer doesn't actually need this in v1 — every behavioral
difference is server-side. We emit it anyway for diagnostic purposes
(and future UI hooks like a "save in progress" pulse on relation-backed
rows). `model` and `foreignKey` are NOT serialized — they're server-only.

---

## Implementation map

1. **`src/fields/RepeaterField.ts`**
   - Type `RepeaterRelationshipConfig = { name; model?; foreignKey?; orderColumn? }`.
   - Field private `_relationship?: RepeaterRelationshipConfig`.
   - Setter `.relationship(arg)`, sugar `.orderColumn(col)`.
   - Getter `getRelationship()`.
   - `toMeta` adds `relationship: { name, orderColumn? }` when configured (skips `model` / `foreignKey`).
   - Mutual-exclusion guards: `simple()` + `relationship()` is unsupported (throws clear error); `relationship()` is also incompatible with `dehydrated(false)` (the field's whole purpose is to write data — silently dropping it would be confusing).

2. **`src/orm/modelDefaults.ts`**
   - `ParentRelationDescriptor` interface (above).
   - `getParentRelationDescriptor(parentModel, name)` helper.

3. **`src/elements/dispatchForm.ts`**
   - New helper `extractRelationshipRepeaters(elements, data)` — walks
     top-level Repeaters with `getRelationship()`, pulls their values
     out of `data`, returns a deferral list. Mutates `data` in place
     (deletes the keys).
   - New helper `persistRelationshipRows(record, field, rows, cfg, parentModel)`.
   - Wire into `dispatchFormSubmit` between `unwrapSimpleRepeaters` and
     `mutateData`. After `persist()` returns, run the deferral loop.
   - `dispatchFormSubmit` signature gains `parentModel?: ModelLike` on
     the context (already permissive via the index-signature on
     `FormContext`).

4. **`src/pageData.ts`**
   - In `resourceEditData`, after `applyFillPipeline`, walk
     relationship-backed Repeaters and replace their value with rows
     loaded from the relation.
   - New helper `applyRelationshipRepeaterFill(form, record, parentModel)`.
   - Thread `parentModel` through to `dispatchFormSubmit` via the
     `formContext` builder used in `routes.ts` POST handlers (set
     `ctx.parentModel = R.model`).

5. **`src/routes.ts`**
   - `POST /:slug/create` and `POST /:slug/:id/edit` handlers stamp
     `ctx.parentModel = R.model` before `dispatchFormSubmit` so the
     relationship-backed Repeater pipeline can read the parent's
     relations map.

6. **Tests** — `RepeaterField.test.ts` (setter + meta round-trip);
   new `RepeaterRelationship.test.ts` (full pipeline — load, create
   diff, update diff, delete diff, order column write, validation
   short-circuit, mutual-exclusion guards).

7. **Playground** — add a small `Post → comments` (or `Order → lineItems`)
   relationship-backed Repeater demo at `playground-pilotiq`.

8. **Docs** — `docs/api/repeater.md` (or wherever Repeater lives) gets
   a `relationship` section. CLAUDE.md (`packages/pilotiq/CLAUDE.md`)
   gets a one-paragraph note.

9. **Memory** — write `project_pilotiq_repeater_relationship.md` and
   index it in `MEMORY.md`. Tick the gap-audit Tier-2 entry for
   `relationship`.

---

## Out of scope (v1)

- **Builder.relationship.** Filament supports it but Builder rows are
  heterogeneous — the Builder would need a polymorphic `type` column on
  the child model, plus a way to dispatch the diff per block type. Defer
  until someone asks.
- **Many-to-many / pivot.** `belongsToMany` is already deferred at the
  framework level (`feedback_relations_belongstomany_deferred.md`). Same
  ruling here.
- **Polymorphic relations.** Same reasoning.
- **Transactional save.** No transaction wrapper around parent save +
  child diff in v1; partial failure is possible. Follow-up once we have
  an ORM-side `transaction(fn)` primitive.
- **Lazy / paginated load.** v1 reads up to 10k rows; admin Repeaters
  shouldn't grow that large. Add a configurable cap if it bites.
- **Cross-page reorder.** Reorder lives entirely within the rendered row
  list. If the relation has more rows than show, the un-rendered rows
  keep their existing order column.
- **Repeater inside a relationship-backed Repeater.** Outer relationship
  flows through cleanly; inner uses JSON storage on the child row. No
  new behavior, just a callout that nesting still works.

---

## Risks / non-obvious

- **`__id` collision.** Client-side row creation generates UUIDs for
  `__id`. We treat any `__id` not present in `existingPkSet` as a fresh
  insert. UUID v4 collisions with real PKs are theoretically possible
  but vanishingly unlikely (the renderer uses `crypto.randomUUID()`). A
  belt-and-braces alternative is to prefix client-generated ids with
  `_new:` — defer until someone hits the collision.
- **FK stamping under `mutateDataBeforeCreate`.** User code that mutates
  `data` before save sees the parent's data, NOT the relation rows
  (we've already extracted them). Document this clearly so users don't
  expect to mutate `data.attachments[i]` from the parent's mutator.
- **Order column drift.** If the user reorders rows but the
  `orderColumn` write hits a unique constraint (rare — typically `sort`
  isn't unique), the save fails. v1 surfaces this as a 500. A two-pass
  reorder (write to negative numbers first, then to positive) is a
  follow-up if it bites.
- **Renderer doesn't know.** The client renders relationship-backed
  Repeaters identically to JSON-backed ones. Users who add a row, then
  navigate away without saving, lose the row — same UX as JSON-backed.
  Spec says this is fine; we mention it in the docs.
