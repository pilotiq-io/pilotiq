# Nested Resources — Phase B: depth-2 nested RelationManagers

## Goal

Mount RelationManagers *inside* a depth-1 manager's per-record view, so a
related record can have its own relations:

```
/posts/123/comments/456                    # Phase A ✅ view
/posts/123/comments/456/replies            # Phase B list   (NEW)
/posts/123/comments/456/replies/create     # Phase B create (NEW)
/posts/123/comments/456/replies/789        # Phase B view   (NEW)
/posts/123/comments/456/replies/789/edit   # Phase B edit   (NEW)
```

Mirrors `Resource.relations()` one level deeper. A `RelationManager`
declares its own `static relations(): typeof RelationManager[]`; the
Vite plugin emits the four nested page roles and `routes.ts` mounts a
list/create/view/edit/delete handler set per (R, M, N) tuple.

---

## URL surface (after Phase B)

| URL                                                 | role                  | status  |
|-----------------------------------------------------|-----------------------|---------|
| `…/{rel}/{childId1}/{rel2}`                         | nested-list           | **NEW** |
| `…/{rel}/{childId1}/{rel2}/create`                  | nested-create         | **NEW** |
| `…/{rel}/{childId1}/{rel2}/{childId2}`              | nested-view           | **NEW** |
| `…/{rel}/{childId1}/{rel2}/{childId2}/edit`         | nested-edit           | **NEW** |
| `…/{rel}/{childId1}/{rel2}/{childId2}/delete`       | nested-delete (POST)  | **NEW** |

Disambiguation is mechanical: every nested route adds two more URL
segments than the depth-1 sibling, and the reserved-relationship-token
guard (extended at boot to walk the nested level) prevents `${rel2}`
from colliding with `'edit'`, `'create'`, or any of the underscore
reserved tokens. The 6-segment shape splits between `relation-edit`
(`parts[5+off] === 'edit'`) and `nested-relation-list`
(`parts[5+off]` is the nested relationship key) using the same trick
as the depth-1 disambiguation at length 4.

---

## Architecture

### Scope shape (additive)

`RelationManagerScope` keeps its four depth-1 variants unchanged and
adds four nested siblings:

```ts
type RelationManagerScope =
  | { kind: 'relation-list',   slug, recordId, relationship, query? }
  | { kind: 'relation-create', slug, recordId, relationship, prefill? }
  | { kind: 'relation-view',   slug, recordId, relationship, childId }
  | { kind: 'relation-edit',   slug, recordId, relationship, childId, prefill? }
  // Phase B
  | { kind: 'nested-relation-list',   slug, chain: [Step, Step], query? }
  | { kind: 'nested-relation-create', slug, chain: [Step, Step], prefill? }
  | { kind: 'nested-relation-view',   slug, chain: [Step, Step], childId }
  | { kind: 'nested-relation-edit',   slug, chain: [Step, Step], childId, prefill? }

type Step = { recordId: string, relationship: string }
```

Backwards-compatible — every existing depth-1 caller stays untouched.

### Three-layer auth

`resolveRelationChain` runs every gate in order; failure short-circuits
to either `null` (404) or `{ ok: false, status: 403 }`:

1. **Resource gate** — `R.canAccess(user)` (cluster gate composes when
   the parent is in a Cluster).
2. **Resource-record gate** — `R.canEdit(user, parent)` (Phase A
   posture: managing a parent's relations requires editing the parent).
3. **Outer-manager view gate** — `M1.canView(user, child1, parent)`. The
   gate to *drill into* the leaf parent — Filament-style: viewing the
   comment is the prerequisite for entering its sub-relations.
4. **IDOR layer 1** — `child1` (chain[1].recordId) must currently
   resolve via `parent.related(chain[0].relationship)`. Guards URL
   tampering on the middle id.
5. **Leaf-manager scope gate** — `M2.canViewAny / canCreate / canView /
   canEdit / canDelete` per scope. Falls through to the related
   Resource's policy when M2 hasn't overridden.
6. **IDOR layer 2** — for view / edit / delete: `child2` (the leaf
   record id) must belong to `child1` under
   `chain[1].relationship`. Same `childBelongsToParent` helper Phase A
   uses; runs against `Related1.model`'s relation accessor.

### Boot validation

`registerPilotiqRoutes` walks every `R.relations()` and now also walks
each `M.relations()`. Two new errors:

- Reserved-relationship-token collision under a nested manager.
- A nested manager declaring its own `relations()` (depth-3+) — Phase B
  caps at 2; Filament does too.

### URL generation in Action factories

Single helper `relationUrlPrefix(ctx)`:

- depth-1 (no chain): `${base}/${parentSlug}/${parentId}/${relationship}`
- depth-2 (1-step chain): `${base}/${parentSlug}/${chain[0].recordId}/${chain[0].relationship}/${parentId}/${relationship}`

Used by `Action.relationCreate / Edit / Delete / Restore /
ForceDelete / Detach`. Renderer-side `:id` substitution still works on
top of the chain prefix — the helper produces the segment up to (and
including) the leaf manager's relationship key.

### `RelationManagerContext` extension

Adds optional `chain?: readonly RelationChainContextEntry[]`
(slug + recordId + relationship per outer layer). Empty / absent on
depth-1; one entry on depth-2. User code in `static table(table, ctx)`
can read `ctx.chain` to template URLs that match the nested space —
the demo `CommentRepliesManager` does this for `Table.recordUrl`.

### `RelationTabs` on nested pages

A second strip variant — `buildNestedRelationTabs(R, M, ...)` — emits
a "View (the leaf parent)" tab plus one tab per sibling nested manager.
Prepended onto the schema for all four nested page roles, mirroring
the Phase A behaviour for the depth-1 space.

---

## Files touched

- `packages/pilotiq/src/RelationManager.ts` — `static relations()`
  default + `chain?` on `RelationManagerContext` +
  `RelationChainContextEntry` interface.
- `packages/pilotiq/src/pageData.ts` — `RelationManagerScope` union
  widened, `RelationChainStep` interface, `resolveRelationChain`,
  four `buildNested*` builders, `nestedManagerCtx` /
  `nestedResponseEnvelope` helpers, `buildNestedRelationTabs`,
  `dispatchPageData` cases for the four nested page roles.
- `packages/pilotiq/src/vite.ts` — four new `+route.ts` stub blocks
  (`nested-relation-list / -create / -view / -edit`).
- `packages/pilotiq/src/routes.ts` — boot validation walks nested
  managers; per-(R,M,N) loop mounts seven handlers (list, create
  GET+POST, view, edit GET+POST, delete).
- `packages/pilotiq/src/actions/Action.ts` — `relationUrlPrefix`
  helper; six factory URL templates re-route through it.
- `packages/pilotiq/src/nestedRelationManagerData.test.ts` (new) — 19
  cases covering happy paths, every chain failure mode, and three-layer
  auth.
- `packages/pilotiq/src/routes-nested-relations.test.ts` (new) — 13
  cases covering route registration, boot validation guards, list /
  view / create / edit / delete handlers, IDOR layers 1 + 2.

## Playground demo

- `playground-pilotiq/prisma/schema/app.prisma` — new `Reply` table.
- `playground-pilotiq/app/Models/Reply.ts` — rudder Model.
- `playground-pilotiq/app/Models/Comment.ts` — `relations.replies`
  hasMany.
- `playground-pilotiq/app/Pilotiq/Replies/ReplyResource.ts` — minimal
  Resource (intentionally NOT registered on the panel; pointed at
  via `CommentRepliesManager.relatedResource`).
- `playground-pilotiq/app/Pilotiq/Comments/relations/RepliesManager.ts`
  — the leaf manager. `Table.recordUrl` builds the depth-2 view URL
  via `ctx.chain`.
- `playground-pilotiq/app/Pilotiq/Posts/relations/CommentsManager.ts`
  — `static relations() = [CommentRepliesManager]` ties it in.

To exercise the demo:

```bash
cd playground-pilotiq
pnpm exec prisma db push --schema prisma/schema
pnpm dev
# → /new-admin/posts/:postId/comments/:commentId → Replies tab strip
```

---

## Tests

`2294 → 2326` (+32 new). All suites green; no regressions.

---

## Out of scope (Phase C / D)

- **Phase C** — server-resolved breadcrumb component above the page
  heading.
- **Phase D** — depth-3+ URLs. Audit Filament first; likely a no-op.
- **Nested M2M** — `belongsToMany / morphToMany / morphedByMany`
  managers under a nested manager. The depth-2 routes mount, but the
  nested attach / detach / `_action` surface ISN'T wired in v1
  (depth-1 still has the full surface). Add when a consumer asks.
- **Soft-delete on nested managers** — restore / force-delete routes
  aren't mounted at depth-2 in v1; same posture as M2M.

---

## Pickup notes

The chain abstraction is set up to extend cleanly to depth-3 if
Filament ends up shipping it: `chain` is already a list, the chain
walker is per-step, and the auth ladder generalises (an extra
`canView` gate per intermediate hop). Phase D would mainly add Vite
stubs, route mounts, and a third bullet to the `RelationManagerScope`
chain tuple. Worth a fresh plan doc.
