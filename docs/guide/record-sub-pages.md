# Record sub-pages

`Resource.pages()` can declare custom pages that live under a single
record — they get their own URL (`${resourceBase}/:id/${subPageSlug}`),
their own tab in the record sub-nav strip, and receive the loaded record
in their schema context. Useful for per-record dashboards, activity
logs, profile sections, or any view that's record-scoped without
fitting the standard View / Edit / relation-manager moulds.

## Quick example

```ts
import { Resource, Page, Heading, Text } from '@pilotiq/pilotiq'

class ActivityPage extends Page {
  static override slug  = 'activity'
  static override label = 'Activity'
  static override icon  = 'history'

  static override schema(ctx) {
    return [
      Heading.make(`Activity for ${(ctx.record as { name?: string })?.name}`),
      // …Text / Table / View elements scoped to ctx.record…
    ]
  }
}

class UserResource extends Resource {
  static override label = 'Users'
  static override slug  = 'users'

  static override pages() {
    return {
      record: {
        activity: ActivityPage,
      },
    }
  }
}
```

Open a user and the sub-nav strip becomes:

```
[ View ] [ Edit ] [ Activity ] [ …relation managers ]
```

URL: `/admin/users/u1/activity`.

## What sub-pages receive

The sub-page's `schema(ctx)` is called with the standard
`SchemaContext`, plus the loaded parent record on `ctx.record`. Mode is
`'record'`.

```ts
static override schema(ctx) {
  const record = ctx.record as { id: string; name: string }
  return [
    Heading.make(`Activity for ${record.name}`),
    // …record-scoped elements…
  ]
}
```

The record is loaded by the framework before the schema runs. If the
parent resource has no `static model`, the framework synthesizes a
minimal `{ id: recordId }` placeholder so sub-page schemas can still
reach a stable shape.

## Authorization

Sub-pages run through three gates **in order** before rendering:

1. `Resource.canAccess(user)` — parent resource is accessible at all.
2. `Resource.canView(user, record)` — user can view this record.
3. `SubPage.canAccess(user, record)` — user can reach this specific
   sub-page for this record.

Any predicate that returns `false` or throws results in a 403. The
`Page.canAccess` signature is widened with an optional record arg:

```ts
class ActivityPage extends Page {
  static override async canAccess(user: unknown, record: unknown) {
    return (record as { ownerId: string }).ownerId === (user as { id: string })?.id
  }
}
```

Existing custom-page subclasses with `canAccess(user)` keep working
unchanged — the second arg is optional and ignored by your signature.

## Tab visibility

The sub-page's tab in the `RelationTabs` strip is gated on the same
`canAccess(user, record)` predicate. When it returns `false`, the tab
hides — consistent with the per-tab gating on `__view` / `__edit` /
managers. Throwing predicates fail closed.

If the user navigates directly to a sub-page URL when its gate fails,
the route returns 403 (the chrome was hidden as a hint, but the route
is the source of truth).

## Hiding the strip entirely

Set `static recordSubNavigation = false` on the resource to drop the
whole sub-nav strip (View / Edit / sub-pages / relation managers) from
every record-mode page of that resource. Routes stay registered and
reachable by URL — only the tab chrome disappears. Useful when the
record form carries its own tab navigation and a second strip would
compete with it.

```ts
export class PostResource extends Resource {
  static override recordSubNavigation = false
}
```

## Slug rules

Sub-page slugs are validated at panel boot:

- Must match `[A-Za-z0-9_-]+`.
- Must not collide with the reserved relation-manager tokens
  (`edit`, `delete`, `restore`, `force-delete`, `_form`, `_action`,
  `_search`, `_uploads`, `_attach`, `_detach`, `_bulk-detach`).
- Must not collide with any of the resource's relation-manager
  `relationship` slugs — they share the same URL slot.

Boot fails with a clear error message pointing at the offending
resource + slug. This is intentional: a silent runtime 404 from a
slug collision would be much harder to debug.

## Composition

- **Relation managers** — record sub-page tabs render between `__edit`
  and the manager tabs, in declaration order. Relation managers are
  unaffected.
- **Soft deletes** — sub-page routes don't auto-restore trashed
  records. Override `canView` / `canAccess` on the sub-page if you
  want trashed records hidden.
- **Cluster prefixes** — sub-pages inherit the parent resource's
  cluster prefix via `resourceBasePath(...)`. URLs become
  `${base}/${cluster.slug}/${slug}/:id/${subPageSlug}` for clustered
  resources.

## v1 limits

- One depth. Record sub-pages live under a `Resource` only —
  declaring sub-pages from a `RelationManager` is not supported in
  v1.
- No automatic sidebar surface. Sub-pages are per-record by design —
  they don't appear in the panel sidebar. Use top-level
  `Pilotiq.pages([…])` for sidebar-level pages.
- No automatic page-title prefix. The sub-page's schema renders as-is;
  add your own `Heading` if you want a header.
- Tab badges aren't supported on record sub-pages in v1 (the
  underlying `RelationTabs` element doesn't carry badge metadata).
- No per-record form submits from sub-pages today — sub-pages are
  primarily read / display surfaces. Wire submissions through your
  own actions or by linking back to the resource's edit page.
