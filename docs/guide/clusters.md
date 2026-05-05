# Clusters

A **cluster** groups related Resources, Globals, and Pages under a shared
URL prefix and a single sidebar entry. Filament users will recognize the
shape: clusters give a slice of the panel its own visual + URL identity
without forcing every grouped item to share a model or template.

```
panel root              /admin
                          ├── Articles            /admin/articles
                          ├── Users               /admin/users
                          └── Content             /admin/content      ← cluster
                              ├── Posts           /admin/content/posts
                              ├── Tags            /admin/content/tags
                              └── Comments        /admin/content/comments
```

Articles + Users stay top-level. Posts / Tags / Comments are grouped
under the `Content` cluster — they share a URL prefix and appear as
nested items beneath the cluster's nav entry.

## Define a cluster

```ts
// app/Pilotiq/Content/ContentCluster.ts
import { Cluster } from '@pilotiq/pilotiq'

export class ContentCluster extends Cluster {
  static override label = 'Content'
  static override slug  = 'content'   // optional — derives from label
  static override icon  = 'folder'
}
```

A cluster has the same nav surface as a `Resource` (label / slug / icon
plus `navigationGroup / navigationSort / navigationLabel /
navigationIcon / navigationBadge / navigationBadgeColor /
navigationParentItem`), one `canAccess(user)` predicate, and an
optional `landingPage`.

## Assign children + register the cluster

```ts
import { Pilotiq } from '@pilotiq/pilotiq'
import { ContentCluster } from './Content/ContentCluster'
import { PostResource } from './Posts/PostResource'
import { TagResource }  from './Tags/TagResource'

class PostResource extends Resource {
  static override cluster = ContentCluster   // ← opt in
  // …
}

Pilotiq.make('Admin')
  .path('/admin')
  .clusters([ContentCluster])                // ← register
  .resources([PostResource, TagResource])
```

`Resource`, `Global`, **and** `Page` all support `static cluster: typeof
SomeCluster`. Children opt in individually; the same cluster can hold a
mix of resource + global + custom-page entries.

The framework throws a clear boot error if a child references a cluster
that wasn't passed to `.clusters([…])`.

## What clusters change

- **URLs** — every route owned by a clustered child gains the cluster
  slug as a prefix segment: list, create, view, edit, delete, restore,
  force-delete, action dispatch, form-state / wizard / mention
  endpoints, deferred `_table` JSON, the editable-cell PATCH route, and
  every relation-manager URL underneath. Top-level children are
  untouched.
- **Sidebar** — clusters render as a parent nav entry; their children
  nest underneath. The cluster's own URL deep-links to the first
  accessible child (or to `static landingPage` when set).
- **Authorization** — `Cluster.canAccess(user)` AND'd with the child's
  own `canAccess`. A denied cluster drops every child from the nav
  and 403s every cluster-prefixed route. Throwing `canAccess`
  predicates fail closed.
- **Global search** — the default `getGlobalSearchResultUrl` threads
  the cluster prefix automatically; overrides should call
  `resourceBasePath` (or compose the prefix manually) to stay
  consistent.

## Auth gate

```ts
class AdminCluster extends Cluster {
  static override label = 'Admin'
  static override async canAccess(user) {
    return (user as { role?: string })?.role === 'admin'
  }
}
```

Members of the cluster never run their own `canAccess` when the
cluster's `canAccess` returns false — the gate composes; both must
pass. Non-members behave exactly as before.

## Landing page

By default, clicking the cluster nav entry deep-links to its first
accessible child. Override with `static landingPage: typeof SomePage`
to land on a curated page instead — useful for an overview / dashboard
inside the cluster.

```ts
import { MyContentDashboard } from './pages/ContentDashboard'

class ContentCluster extends Cluster {
  static override label       = 'Content'
  static override landingPage = MyContentDashboard
}

class MyContentDashboard extends Page {
  static override slug    = 'overview'
  static override cluster = ContentCluster   // landingPage MUST be
  static override label   = 'Content overview' // inside the cluster
  static override schema() {
    return [Heading.make('Content overview')]
  }
}

panel.clusters([ContentCluster]).pages([MyContentDashboard])
```

Boot fails with a clear error when `landingPage` is missing from
`pages()` or its `cluster` doesn't point back at the owning cluster.

## Reserved slugs

Cluster slugs cannot:

- Be empty
- Start with `_`
- Equal `theme` or `api`
- Collide with another cluster's slug
- Collide with a top-level resource / global / page slug

Top-level children (no cluster) cannot share a slug with a registered
cluster — `${base}/${slug}` would resolve to the cluster instead.

## v1 limitations

- No nested clusters. A `Cluster.cluster = ParentCluster` field is not
  supported (yet) — clusters render flat under the panel root or
  `navigationGroup` heading.
- The cluster doesn't aggregate its children's `navigationBadge`. The
  cluster carries its own badge handler if you want one.
- Cluster-internal sidebar (Filament's "show only the cluster's items
  while inside the cluster") isn't implemented; the panel sidebar is
  the same everywhere.
- A `Cluster.canAccess` is invoked twice on every page render — once
  in `panelInfo()` and once on the route. Cache or memoize inside if
  the predicate is expensive.

## See also

- `docs/guide/panels.md` — the broader navigation model.
- `docs/plans/clusters.md` — design notes and the implementation plan.
