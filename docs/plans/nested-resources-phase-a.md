# Nested Resources — Phase A: depth-2 view-page route

## Goal

Add a read-only **view page** for a related record at:

```
{base}/{slug}/{id}/{rel}/{childId}
```

Today the relation manager surface stops one URL shorter on the read side
— users can see the relation list at `…/{rel}` and edit a row at
`…/{rel}/{childId}/edit`, but there is no way to land on a per-record
detail page for the related record itself.

Phase A is the **smallest** slice of the broader nested-resources scope
in `project_pilotiq_next_session.md`. It explicitly does **not** add
nested RelationManagers (Phase B), breadcrumbs (Phase C), or depth-3
URLs (Phase D).

---

## URL surface (after Phase A)

| URL                                                | role            | status |
|----------------------------------------------------|-----------------|--------|
| `…/{rel}`                                          | relation list   | shipped |
| `…/{rel}/create`                                   | relation create | shipped |
| `…/{rel}/{childId}`                                | **relation view** | **NEW** |
| `…/{rel}/{childId}/edit`                           | relation edit   | shipped |

The reserved-token guard already prevents `{rel}` from colliding with
top-level resource verbs. Among the per-row segments, `edit` and `delete`
are reserved at the second position, so a 5-segment URL where
`parts[4+off]` is a record ID is unambiguous against the existing
`relation-create` (`parts[4+off] === 'create'`) and `relation-edit`
(6 segments, `parts[5+off] === 'edit'`).

---

## Scope (in)

1. **Vike stub** — emit `pages/(pilotiq)/relation-view/{+route.ts,+data.ts,+Page.tsx}`
   in `src/vite.ts` paralleling `relation-edit`. Match shape:
   `parts.length === 5 + off && parts[4+off] !== 'create'`. Route params
   `{ basePath, slug, id, relationship, childId }`.
2. **Hono route** — `GET ${resourceBase}/:id/${rel}/:childId` in
   `src/routes.ts`, registered alongside the existing six-handler set
   inside the `for (const M of R.relations())` loop. Same two-layer auth
   prelude as relation-list/edit (`R.canAccess + R.canView` on parent;
   manager `canView` on child with fall-through to `Related.canView`).
   IDOR check on the child via the relation accessor (mirrors the
   existing edit-route check in `childBelongsToParent`).
3. **`pageData.relationManagerData`** — new `kind: 'relation-view'`
   branch. Loads parent + child, runs the manager's existing
   `static detail(child, parent)` (currently called by Resource view but
   never by the manager surface), returns `RelationManagerResult` with
   `schemaData`. Reuses everything else.
4. **RelationTabs** — the strip emitted by `buildRelationTabs(R, …)`
   already takes an `activeKey` argument and the manager-side tabs key
   off the relationship name. Phase A makes the new view page emit the
   strip with `activeKey = M.relationship` so the user can sideways-nav
   between sibling managers without losing parent context. Same shape
   as the list/create/edit pages.
5. **Tests** — extend `routes-relations.test.ts` and
   `relationManagerData.test.ts` with the view branch (auth pass,
   policy denial, IDOR fail, missing manager, missing child).
6. **Demo** — wire one record-link in the playground's
   `PostsCommentsManager` table that navigates into the new view URL,
   so the user can click into it.

---

## Scope (out — deferred to later phases)

- **Nested RelationManagers (Phase B):** Comment declaring its own
  `static relations()` and the route layer auto-mounting
  `…/{rel}/{childId}/{rel2}/…`. Requires a 6+off / 7+off / 8+off Vike
  stub family and the auto-gen plugin walking parent → manager →
  manager. Big enough to deserve its own plan.
- **Breadcrumbs (Phase C):** server-resolved chain rendered above the
  page heading. Independent of the routing change; can be added once
  Phase B settles the depth-2-or-deeper cases.
- **Depth-3 URLs (Phase D):** audit Filament first — they may stop at
  depth 2 too, in which case Phase D becomes a no-op.

---

## Architecture notes

- **`relationManagerData` signature stays single-parent.** Phase A only
  needs `(parent, relationship, recordId, childId)` — the same shape
  the edit branch already accepts. No threading of parent-of-parent
  tuples; that work belongs to Phase B.
- **No new ORM contract.** `Related.model.find(childId)` is the same
  call the edit branch makes today. The IDOR check reuses
  `childBelongsToParent` verbatim.
- **`Manager.detail(child, parent)`** already exists on the
  `RelationManager` class (line 242) but is currently unused — it
  returns `Element[]` for a future per-child detail surface. Phase A is
  the first consumer; the default `[]` keeps existing managers
  rendering an empty Section until they opt in by overriding `detail()`.
  An empty `[]` schema renders the page chrome (heading + RelationTabs
  strip + back link) with no body — useful as a sideways-nav landing
  even before a manager fills out the detail.
- **Cluster prefix support** comes free via `clusterOffset(parts)` —
  Phase A reads `5 + off` like every other auto-gen stub.

---

## Acceptance

- [ ] `pages/(pilotiq)/relation-view/` regenerates on plugin run.
- [ ] `GET /posts/123/comments/456` returns a 200 with a resolved
      schema for the demo `CommentResource.detail()`.
- [ ] `GET /posts/123/comments/456` 403s when
      `Manager.canView` (or `Related.canView`) returns `false`.
- [ ] `GET /posts/123/comments/789` 404s when comment 789 is not
      attached to post 123 (IDOR).
- [ ] `RelationTabs` highlights the manager's relationship key on the
      view page, matching list / create / edit behaviour.
- [ ] SPA nav between view → edit → list keeps the parent record
      hydrated and AppShell mounted.
- [ ] Existing `relation-edit` and `relation-create` route matches
      remain unaffected (sanity check the parts-length guards).
- [ ] Test count grows by 6–10 (view branch positive + auth-deny + IDOR
      + tabs activeKey + missing-manager + cluster-offset).

---

## Pickup notes for the next session

- Start in `src/vite.ts` (search `relation-edit`, copy/adapt the block).
- Then `src/routes.ts` (search `parentBase` to find the manager loop).
- Then `src/pageData.ts` (search `kind: 'relation-edit'` to find the
  switch). The new builder should be a near-copy of the edit branch
  minus the form-resolve plumbing.
- Tests: `routes-relations.test.ts` for the auth + IDOR matrix;
  `relationManagerData.test.ts` for the data-builder shape.
- Memory to update on completion: `project_pilotiq_relations.md`
  (record Phase A landed) + a fresh `project_pilotiq_next_session.md`
  pointing at Phase B.
