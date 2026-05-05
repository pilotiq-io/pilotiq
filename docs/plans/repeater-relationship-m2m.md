# Repeater.relationship — M2M family (`belongsToMany` / `morphToMany` / `morphedByMany`)

Follow-up to `repeater-relationship.md` and `builder-relationship.md`.
Closes the last gap on the relation-feature parity board: the M2M family.

**Status:** SHIPPED 2026-05-05. Test count `@pilotiq/pilotiq` 2095 → 2105
(+10) — six describe blocks under three M2M variants (`belongsToMany`,
`morphToMany`, `morphedByMany`) plus one Builder.relationship deferred-
error assertion. Builder.relationship M2M family stays explicitly
deferred (heterogeneous `{type, data}` envelope doesn't compose with
pivot semantics).

## Why now

The relation-feature parity board (see `relations-m2m.md` for the
`RelationManager` siblings) tracks both kinds of M2M support. The
manager-side surface shipped 2026-05-03 once the ORM landed
`belongsToMany / morphToMany / morphedByMany` accessors. The embedded
variant (`Repeater.relationship` / `Builder.relationship`) was held back
in v1 with an explicit "deferred" guard in `resolveChildAndAttachment` /
`resolveBuilderChildAndAttachment` ("only 'hasMany' and 'morphMany' /
'morphOne' are supported"). This plan removes that guard for the
Repeater side.

The Builder side is **explicitly out of scope** in v1 — see "Why
Builder is excluded" below.

## ORM surface (verified)

`@rudderjs/orm` ships pivot-mutation accessors for all three M2M
relation types. Each lives as an instance method on the parent
(`parent[rel]()`) returning an accessor object with `attach`,
`detach`, `sync`:

```ts
interface BelongsToManyAccessor {
  attach(input: AttachInput, flatPivot?: Record<string, unknown>): Promise<void>
  detach(ids?: ReadonlyArray<number | string>): Promise<number>
  sync(desiredIds, flatPivot?): Promise<{ attached: unknown[]; detached: unknown[] }>
}
// MorphToManyAccessor and MorphedByManyAccessor share the same shape;
// their pivot rows carry an extra `<morphName>Type` column written
// transparently by the accessor.
```

Per `feedback_m2m_accessor_shape.md`, `parent.related(rel)` returns a
deferred-QB Proxy that does NOT expose pivot mutations. Pilotiq's
existing `resolveM2MAccessor(parent, rel)` (in `actions/Action.ts`)
already prefers the instance-method shape and falls back to legacy
`related(rel)` shapes — reuse it here.

## Semantics

The natural mapping for "embed M2M rows in a parent form" is:

> Each Repeater row is an inline-editable **related** record. Create-row
> creates the related model AND attaches a pivot link. Edit-row updates
> the related model and leaves the pivot alone. Delete-row detaches the
> pivot link and **does not delete the related model** (it may be
> attached to other parents).

This is the Filament `Repeater::relationship()`-on-`belongsToMany`
default, minus the `cascadeDelete` option (deferred — see "Out of
scope").

### Identity rules (mirroring hasMany / morphMany)

- Submitted row with `__id` matching an existing pivoted PK → update via
  `M.update(__id, payload)`. Pivot untouched.
- Submitted row without `__id` (or with one not in the existing set) →
  `M.create(payload)`, then `parent[rel]().attach([newChild.pk])`.
- Existing pivoted PK absent from the submitted `__id` set →
  `parent[rel]().detach([pk])`. **No `M.delete(pk)`.**

### Why detach-only (not detach-and-delete)

The related child may be attached to other parents (the whole point of
M2M). Default-deleting it from the row-delete handler would silently
nuke other relationships. The `cascadeDelete` opt-in is a Tier-2
follow-up.

## Field surface

No new setters. `.relationship()` on a M2M-typed relation Just Works:

```ts
Repeater.make('tags')
  .relationship('tags')                 // Article.relations.tags = { type: 'belongsToMany', ... }
  .schema([
    TextField.make('name').required(),
    TextField.make('slug'),
  ])
```

Object form unchanged:

```ts
Repeater.make('tags')
  .relationship({
    name:  'tags',
    model: Tag,                          // override; default = parent.relations[name].model()
    // foreignKey: not used under M2M; ignored if passed
  })
```

### `.orderColumn(col)` — explicit error

Rejected at extract time. Pivot-side ordering needs ORM
`orderByPivot` which v1 doesn't expose (see `feedback_relations_belongstomany_deferred.md`
"Two carve-outs"). Throwing a clear error beats silently writing into a
non-existent column on the related model:

```
[Pilotiq] Repeater.relationship("tags"): orderColumn() is not supported under
'belongsToMany' / 'morphToMany' / 'morphedByMany' v1. Pivot-side ordering needs
ORM `orderByPivot` which is deferred.
```

## Wire shape

Unchanged. `meta.relationship?: { name, orderColumn? }`. The persisted
relation type is invisible to the renderer — all M2M dispatch happens
server-side at submit time.

## Resolver changes (`resolveChildAndAttachment`)

The current shape returns a tagged union:

```ts
type RepeaterChildAttachment =
  | { kind: 'hasMany';   model: ModelLike; foreignKey: string }
  | { kind: 'morphMany'; model: ModelLike; morph: MorphRelationDescriptor }
```

Widen to:

```ts
type RepeaterChildAttachment =
  | { kind: 'hasMany';        model: ModelLike; foreignKey: string }
  | { kind: 'morphMany';      model: ModelLike; morph: MorphRelationDescriptor }
  | { kind: 'belongsToMany';  model: ModelLike; relation: string }
  | { kind: 'morphToMany';    model: ModelLike; relation: string }
  | { kind: 'morphedByMany';  model: ModelLike; relation: string }
```

The three M2M variants carry only the relation name (so the persist
pipeline can call `resolveM2MAccessor(parent, name)`) and the related
model (for the `M.create / M.update` calls).

Detection order in `resolveChildAndAttachment`:

1. `getParentRelationDescriptor(parentModel, name)` — covers `hasMany` AND
   the M2M family (the descriptor reads `static relations[name]` and
   returns `{ type, model: () => Child, foreignKey? }`). Currently
   `getParentRelationDescriptor` rejects entries without `foreignKey`,
   which works for hasMany but blocks belongsToMany. Either:
   - **(a)** widen `getParentRelationDescriptor` to allow missing
     `foreignKey` AND surface `pivotTable` / `morphName`, OR
   - **(b)** add a parallel `getM2MRelationDescriptor(parentModel, name)`
     that rejects nothing.

   Plan picks **(a)** — the existing helper is a thin reader over
   `static relations[name]`, and tightening its return-type surface
   (foreignKey now `string | undefined`) is a one-line change.
   Downstream callers (only `resolveChildAndAttachment` /
   `resolveBuilderChildAndAttachment`) already check `foreignKey`
   before using it.

2. `getMorphRelationDescriptor(parentModel, name)` — covers `morphMany`
   / `morphOne` (existing) AND `morphToMany` / `morphedByMany`. Same
   shape, same helper, just three more recognized type strings.

   `getMorphRelationDescriptor` currently returns the descriptor only
   when `type === 'morphMany' || 'morphOne'`. Widen the gate to also
   accept `morphToMany` / `morphedByMany`.

After detection, branch on `descriptor.type`:

| `type` | Branch |
|---|---|
| `hasMany` | unchanged |
| `morphMany` / `morphOne` | unchanged |
| `belongsToMany` | new — return `{ kind: 'belongsToMany', model, relation: name }` |
| `morphToMany` | new — return `{ kind: 'morphToMany', model, relation: name }` |
| `morphedByMany` | new — return `{ kind: 'morphedByMany', model, relation: name }` |
| anything else | preserve existing "deferred" error |

`cfg.foreignKey` is silently ignored under M2M (it doesn't apply).
`cfg.orderColumn` throws under M2M (see above).

## Persist changes (`persistRelationshipRows`)

Current loop walks submitted rows + builds a `keptPks` set + diffs against
existing rows from `loadRelationRows(parentModel, parent, cfg.name)`.
Pivot the dispatch on `attachment.kind`:

```ts
const isM2M = attachment.kind === 'belongsToMany'
           || attachment.kind === 'morphToMany'
           || attachment.kind === 'morphedByMany'

const accessor = isM2M ? resolveM2MAccessor(parent, cfg.name) : undefined
if (isM2M && !accessor) {
  throw new Error(`[Pilotiq] Repeater.relationship("${cfg.name}"): could not resolve the M2M accessor on parent ...`)
}
```

For each submitted row:

- **Update** (`__id` matches existing PK):
  - hasMany / morphMany: existing — `M.update(submittedId, payloadWithoutAttachmentCols)`.
  - **M2M:** `M.update(submittedId, payload)`. No attachment cols to strip
    (the related model has none — pivot lives on its own table).
- **Create** (`__id` absent or non-matching):
  - hasMany: existing — stamp `payload[foreignKey] = parentPk`, `M.create(payload)`.
  - morphMany: existing — `Object.assign(payload, morphStamp)`, `M.create(payload)`.
  - **M2M:** `const child = await M.create(payload); await accessor.attach([child[childPk]])`.
    The accessor handles the pivot insert (and morph stamping under
    `morphToMany` / `morphedByMany`).

For each existing PK absent from `keptPks`:

- hasMany / morphMany: existing — `M.delete(pk)`.
- **M2M:** `await accessor.detach([pk])`. No `M.delete`.

`orderColumn` block stays in the hasMany / morphMany branches only —
the new M2M throw at extract time means we never reach this loop with
M2M + orderColumn set.

## Load pipeline (`applyRelationshipRepeaterFill`)

`parent.related(name)` already returns the related child rows for M2M
(the deferred QB resolves to a JOIN through the pivot when iterated).
The existing "strip PK and FK from rendered row" logic is the only
question:

- PK strip: keep — the `__id` slot carries the PK; we don't want it
  surfacing in the inner schema's form values too.
- FK strip: under M2M there is no FK on the related child. The current
  code does `delete row[foreignKey]` only when `foreignKey` is defined
  on the descriptor; under M2M `foreignKey` is `undefined` so the strip
  is naturally a no-op. Audit and confirm.
- Morph cols strip: applies only to morphMany / morphOne. Under
  morphToMany / morphedByMany the morph cols live on the *pivot* row,
  not on the related child. The strip naturally no-ops. Audit and
  confirm.

Net change to the load pipeline: **none** — it already does the right
thing once `getParentRelationDescriptor` returns descriptors with
optional `foreignKey`.

## Why Builder is excluded

`Builder.relationship` stores rows as `{ type, data }` where `type` is
the block discriminator and `data` is a JSON column. Under M2M, the
*related* model would need to carry both a `type` column and a `data`
column AND be linked via a pivot. That shape is workable but not
useful: the pivot adds indirection without paying for itself, and the
heterogeneous-blocks-as-shared-related-model use case is vanishingly
rare. The natural M2M-with-Builder shape is per-block-type model
dispatch (each block points at a different related model + a different
pivot), which is already on the deferred list (see
`project_pilotiq_next_session.md`).

`resolveBuilderChildAndAttachment` keeps its current "M2M deferred"
throw with a refreshed error message pointing at this plan doc:

```
[Pilotiq] Builder.relationship("blocks"): belongsToMany / morphToMany / morphedByMany are
not supported in v1 — the heterogeneous {type, data} envelope doesn't compose cleanly
with M2M pivot semantics. Use a hasMany or morphMany relation, or open an issue if you
have a use case for per-block-type pivot dispatch.
```

## Out of scope (deferred)

- **Pivot-extras editing** — the related model's `data` would need to be
  separable from the pivot's columns (`addedBy`, `sortOrder`, etc.). ORM
  v1 doesn't surface pivot reads. Same carve-out as `relations-m2m.md`.
- **Reorderable pivot rows** — needs ORM `orderByPivot`. Same carve-out.
- **`cascadeDelete: true` opt-in** — row-delete also calling
  `M.delete(pk)`. Useful when the related model is owned solely by the
  parent (rare in practice for M2M).
- **`syncWithoutDetaching` / `toggle`** — call sites are direct
  `parent[rel]()` from a custom `Action.handler`.
- **Builder.relationship M2M** — see above.
- **Per-block-type model dispatch on Builder.relationship** —
  prerequisite for ever supporting M2M on Builder.

## File touches

- `src/orm/modelDefaults.ts` — widen `getParentRelationDescriptor` so
  `foreignKey` is optional on the return type; widen
  `getMorphRelationDescriptor`'s gate to accept `morphToMany` /
  `morphedByMany`.
- `src/elements/dispatchForm.ts`:
  - `RepeaterChildAttachment` union — three new variants.
  - `resolveChildAndAttachment` — three new branches; `orderColumn`
    rejection under M2M.
  - `persistRelationshipRows` — M2M dispatch via `resolveM2MAccessor`.
  - `resolveBuilderChildAndAttachment` — refresh deferred error message.
  - `loadRelationRows` — unchanged.
- `src/actions/Action.ts` — extract `resolveM2MAccessor` to its own
  module (`src/orm/m2mAccessor.ts`) so `dispatchForm.ts` can import it
  without dragging in the Action surface. `Action.ts` re-imports.
- `src/pageData.ts:applyRelationshipRepeaterFill` — audit the strip
  logic confirms no change is required (FK strip naturally no-ops when
  `foreignKey` is undefined).
- `src/fields/RepeaterField.ts` — no changes.
- `src/fields/RepeaterRelationship.test.ts` — three new describe blocks
  (`belongsToMany` / `morphToMany` / `morphedByMany`) mirroring the
  existing `morphMany` block. Each covers create+attach, update-doesnt-touch-pivot,
  delete-detaches-only, descriptor lookup, missing accessor surfacing
  the right error, `orderColumn` rejection.
- `docs/guide/repeater.md` — "Many-to-many relations" subsection under
  "Relationship-backed rows".
- `docs/plans/admin-gap-audit.md` — Repeater row updated; the
  relation-feature parity row marked closed.
- `docs/plans/relations-m2m.md` — "embedded variant" line updated to
  point at this plan as shipped (was previously deferred).

## Test plan

Coverage targets in `src/fields/RepeaterRelationship.test.ts`:

For each of `belongsToMany` / `morphToMany` / `morphedByMany`:
1. **Create flow** — submit a row without `__id`; assert `M.create`
   receives the payload (no FK / morph col stamp), then `accessor.attach`
   is called with the new child's PK.
2. **Update flow** — submit a row with `__id` matching an existing
   pivoted PK; assert `M.update(__id, payload)`; assert
   `accessor.attach` / `accessor.detach` are NOT called.
3. **Delete flow** — submit a row set that omits an existing PK; assert
   `accessor.detach([pk])`; assert `M.delete` is NOT called.
4. **Mixed** — one create, one update, one delete in the same submit.
5. **Descriptor lookup** — config-only path (no `cfg.model` override),
   reading `static relations[name].model` thunk.
6. **Override path** — `cfg.model` provided explicitly, no
   `static relations` map on the parent.
7. **Missing accessor** — parent doesn't expose `parent[rel]()` AND
   doesn't expose `related(rel)` returning an accessor; assert clear
   error message.
8. **`orderColumn` rejection** — `cfg.orderColumn = 'sort'` should throw
   at extract time (before any DB call).

Plus one Builder block:

9. **Builder.relationship M2M throws deferred error** — assert
   `extractRelationshipBuilders` raises with the new message pointing at
   this plan.

## Rollout

Single-PR plan-doc-first per `feedback_when_to_write_plan_doc.md` (new
peer surface area). Plan landed before code; status flipped to ✅
shipped after merge. Test count target: `@pilotiq/pilotiq` 2095 → ~2120
(+~25 across the three describe blocks). `@pilotiq/tiptap` unchanged.

## Open questions

1. **Should `belongsToMany` rows behave like a `MultiSelectField` (pick
   from existing) by default, with inline-create as a `.cloneable()`-ish
   opt-in?** — Filament defaults to inline-edit; pick-from-existing is
   what the relation-manager M2M flow covers via
   `Action.relationAttach`. Sticking with inline-edit defaults here so
   the embedded variant has a different shape from the manager variant.
2. **Should we surface a `cascadeDelete: true` on the field setter as
   part of v1?** — Tier-2 follow-up; default off matches the
   detach-only safe semantic.
