# Polymorphic Relation Manager (`morphMany / morphOne / morphTo`)

**Status:** SHIPPED — 2026-05-03 (cont'd).
**Closes:** the polymorphic gap deferred at Plan #11 (`relations.md`) and the M2M follow-up (`relations-m2m.md`).
**Cross-repo:** depends on `@rudderjs/orm`'s polymorphic support shipped 2026-05-03 (handoff plan: `~/Projects/rudder/docs/plans/2026-05-03-orm-polymorphic-relations.md`).

---

## What this adds

`Resource.relations()` can now register a `RelationManager` whose underlying ORM relation is polymorphic:

| Parent declaration | Mode | UI surface |
|---|---|---|
| `Post.relations.comments = { type: 'morphMany', model: () => Comment, morphName: 'commentable' }` | `'morphMany'` | List / Create / Edit / Delete tab. Create POST auto-fills `commentableId` + `commentableType` on the child. |
| `User.relations.avatar = { type: 'morphOne',  model: () => Image,   morphName: 'imageable'  }` | `'morphMany'` | Same surface — `morphOne` collapses into `'morphMany'` for action defaults (one row is still a row). |
| `Comment.relations.commentable = { type: 'morphTo', morphName: 'commentable', types: () => [Post, Video] }` | `'morphTo'` | Recognized in the mode union; **no auto-actions**, **no auto-discovery** (target class is dynamic). Users must set `static relatedResource` if they want to project a manager from the child side at all. |

Deferred (parallel to rudder's deferral):
- `morphToMany` / `morphedByMany` — the polymorphic-pivot variants.
- `Action.relationMorphAttach` factory — re-link an existing standalone child to the URL-scoped parent. Out of v1 because the dominant morphMany flow is *create-with-parent*, not *attach-detached*. Add when a real consumer hits it.

---

## Public surface

### `RelationMode` widened

```ts
export type RelationMode = 'hasMany' | 'belongsToMany' | 'morphMany' | 'morphTo'
```

`hasOne` / `belongsTo` keep collapsing to `'hasMany'` (one-row table is still a table; managers on the inverse side are uncommon). `morphOne` similarly collapses to `'morphMany'`. The full mapping lives in `normalizeRelationMode(relationType)` exported from `@pilotiq/pilotiq` so `routes.ts`, `pageData.ts`, and any future call site stay in lockstep.

### `getMorphRelationDescriptor(M, name)`

Reads the polymorphic-relation entry off a parent model's `static relations[name]`. Returns `{ morphName, morphType?, model? }` for `morphMany` / `morphOne`. Returns `undefined` for `morphTo` (no single `model` thunk), non-polymorphic types, or malformed entries.

### `computeMorphPayload(parent, descriptor)`

Mirrors rudder's `Model.morph(name, parent)` write helper but lives in pilotiq (so the package stays free of a runtime `@rudderjs/orm` dep). Returns:

```ts
{ [`${morphName}Id`]: parent[primaryKey], [`${morphName}Type`]: parent.constructor.morphAlias ?? parent.constructor.name }
```

Throws when the parent's primary key is unset (matches rudder's `Model.morph` posture — a parent must be saved first).

---

## Auto-injection on create + edit

When `mode === 'morphMany'`, the `POST {base}/{slug}/:id/{rel}/create` and `POST {base}/{slug}/:id/{rel}/:childId/edit` handlers compose a `mutateDataBeforeCreate` / `mutateDataBeforeUpdate` hook on the manager form that runs AFTER any user-supplied hook and spreads the morph payload into the data:

```ts
const morphDesc    = getMorphRelationDescriptor(R.model, rel)
const morphPayload = computeMorphPayload(parentRecord, morphDesc)
const existing     = form.getMutateDataBeforeCreate()
form.mutateDataBeforeCreate(async (data, ctx) => {
  const next = existing ? await existing(data, ctx) : data
  return { ...next, ...morphPayload }   // framework wins last
})
```

**Why framework-wins-last matters:** an attacker POSTing `commentableId=…&commentableType=…` could otherwise reassign a child to a different polymorphic parent. The injection re-stamps the columns from the URL-scoped parent record, so submitted body values cannot tamper with ownership.

End-to-end verified in playground:
- `POST /new-admin/posts/<id>/comments/create body="…"&commentableId=v1&commentableType=Video` lands the row with `commentableId=<post-id>, commentableType=Post`. Body fields ignored.
- `POST /new-admin/videos/<id>/comments/create body="…"` lands `commentableType=Video` (different parent class on same Comment table).

---

## Implementation map

| File | Change |
|---|---|
| `packages/pilotiq/src/RelationManager.ts` | Widen `RelationMode` union. Drop "polymorphic gated on ORM support" caveat (scope to `morphToMany` / `morphedByMany` only). Add and export `normalizeRelationMode(relationType)`. |
| `packages/pilotiq/src/orm/modelDefaults.ts` | Add `MorphRelationDescriptor`, `getMorphRelationDescriptor`, `computeMorphPayload`. |
| `packages/pilotiq/src/routes.ts` | Use `normalizeRelationMode` for the registration-time mode lookup. In the `relation-create` POST handler, compose a `mutateDataBeforeCreate` that spreads `computeMorphPayload(parent, descriptor)` when `mode === 'morphMany'`. Same defense on the `relation-edit` POST handler via `mutateDataBeforeUpdate`. |
| `packages/pilotiq/src/pageData.ts` | Use `normalizeRelationMode` in `relationManagerData`. |
| `packages/pilotiq/src/RelationManager.test.ts` | Tests for `normalizeRelationMode`, `getMorphRelationDescriptor`, `computeMorphPayload`. |
| `packages/pilotiq/src/routes-relations.test.ts` | Tests for end-to-end morph injection on create + edit, anti-tamper, parent-class discriminator vs `morphAlias`, multiple parent types sharing the same Comment table. |
| `playground-pilotiq/prisma/schema/app.prisma` | New `Comment` (with `commentableId` / `commentableType` indexed pair) + `Video` models. Mirrored to `playground/prisma/schema/app.prisma` for hoisted-client parity. |
| `playground-pilotiq/app/Models/Comment.ts` | morphTo with `types: () => [Post, Video]`. |
| `playground-pilotiq/app/Models/Video.ts` | morphMany pointing back at Comment. |
| `playground-pilotiq/app/Models/Post.ts` | New `comments: morphMany` entry (kept alongside `author: belongsTo`). |
| `playground-pilotiq/app/Pilotiq/Comments/CommentResource.ts` | Top-level Comments resource so manager rows can drill in. |
| `playground-pilotiq/app/Pilotiq/Posts/relations/CommentsManager.ts` + `Videos/relations/CommentsManager.ts` | Two managers wired to the same `CommentResource` — one Comment table, two parent types. |
| `playground-pilotiq/app/Pilotiq/Videos/VideoResource.ts` | Second polymorphic parent. |

---

## Test coverage

21 new tests across two files:

- **`RelationManager.test.ts`:**
  - `normalizeRelationMode` — 4 cases (belongsToMany / morphMany+morphOne / morphTo / fallback).
  - `getMorphRelationDescriptor` — 6 cases (morphMany ✓, morphOne ✓, morphTo ✗, non-polymorphic ✗, missing morphName ✗, morphType override).
  - `computeMorphPayload` — 5 cases (defaults, morphAlias override, morphType override, primaryKey override, unset-pk throws).

- **`routes-relations.test.ts`:**
  - Auto-injection on create POST.
  - Different parent class → different discriminator.
  - Anti-tamper: tampered `commentableId` + `commentableType` body fields overwritten.
  - Composition with user `mutateDataBeforeCreate` (user runs first, framework wins last).
  - `morphAlias` honored over class name.
  - Re-stamp on edit POST so ownership cannot be reassigned.

1797 tests passing total.

---

## What this plan deliberately doesn't do

- **No `Action.relationMorphAttach` factory.** v1 keeps the morphMany surface to *create-with-parent*. Re-linking existing standalone records is an edge case; user code can call `M.update(id, { ...Model.morph(name, parent) })` directly if needed.
- **No morphTo write surface.** A morphTo manager (child viewed from its parent's tab) is unusual and the auto-discovery story is broken (target class is dynamic). Users can declare one with `static relatedResource = …` but no auto-actions inject.
- **No `Repeater.relationship` polymorphic mode.** Mirrors the rudder-side limit: morphTo / morphMany are deferred-only on `Repeater.relationship` until a consumer asks. Plan: defer.
- **No `morphToMany` / `morphedByMany`.** Gated on `@rudderjs/orm` shipping pivot-polymorphic. Same deferral as M2M's pivot-extras.
