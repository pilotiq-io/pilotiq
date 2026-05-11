---
'@pilotiq/pilotiq': minor
---

feat(core): `Resource.pages().record` — custom record sub-pages auto-mounted on the sub-nav strip

Declare custom pages that live under a single record. Each sub-page
gets its own URL (`${resourceBase}/:id/${subPageSlug}`), its own tab in
the record `RelationTabs` strip, receives the loaded record on
`ctx.record`, and runs its own `canAccess(user, record)` gate.

```ts
class ActivityPage extends Page {
  static override slug  = 'activity'
  static override label = 'Activity'
  static override schema(ctx) {
    return [Heading.make(`Activity for ${(ctx.record as { name?: string })?.name}`)]
  }
  // Optional record-aware gate.
  static override async canAccess(user, record) {
    return (record as { ownerId: string })?.ownerId === (user as { id: string })?.id
  }
}

class UserResource extends Resource {
  static override slug = 'users'
  static override pages() {
    return {
      record: {
        activity: ActivityPage,
      },
    }
  }
}
```

**Wiring:**

- `ResourcePages.record?: Record<string, typeof Page>` widening — keeps
  the four standard roles (`index / create / edit / view`) cleanly
  typed; the `record` slot signals "these are per-record sub-pages."
- `Resource.getRecordPages()` accessor (sugar over
  `resolvePages().record ?? {}`).
- `PageMode` widened with `'record'`.
- `Page.canAccess(user, record?)` signature widened — second optional
  arg, back-compat with existing custom-page subclasses that wrote
  `canAccess(user)`.
- Routes: `GET ${resourceBase}/:id/${subPageSlug}` per registered
  sub-page. The Vike `relation-list` route + `dispatchPageData` share
  the URL slot — relation managers tried first, record sub-pages
  second. Boot validation prevents slug collisions.
- New `resourceRecordPageData(pilotiq, slug, recordId, subPageSlug,
  req)` builder mirrors `resourceViewData`'s shape.
- `RelationTabs` strip inserts a tab per sub-page between `__edit` and
  the managers, gated on `SubPage.canAccess(user, record)`. Strip now
  also mounts when ONLY sub-pages exist (no relation managers needed).

**Boot validation:**

Sub-page slugs must match `[A-Za-z0-9_-]+` and must not collide with:
- Reserved relation-manager tokens (`edit`, `delete`, `restore`,
  `force-delete`, `_form`, `_action`, `_search`, `_uploads`,
  `_attach`, `_detach`, `_bulk-detach`).
- Any of the resource's relation-manager `relationship` slugs.

Boot fails with a clear error message — silent 404 at request time is
much harder to debug than a config-time throw.

**v1 limits:** depth-1 only (sub-pages live under `Resource`, not
under `RelationManager`); no automatic sidebar surface (sub-pages are
per-record); no tab badges on record sub-pages.

Plan + guide: `docs/plans/resource-record-sub-pages.md`,
`docs/guide/record-sub-pages.md`.
