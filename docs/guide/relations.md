# Relations

`RelationManager` embeds a related resource's table (and optionally form) on a
parent record's Edit/View page, gated through the parent's authorization and
routed under the parent's URL.

> Scope: `hasOne`, `hasMany`, `belongsTo` — what `@rudderjs/orm` supports
> today. `belongsToMany` (pivot) and polymorphic relations are deferred until
> the underlying ORM lands them.

## Quick example — `User → Posts`

Declare the relation on the rudder ORM model:

```ts
// app/Models/User.ts
import { Model } from '@rudderjs/orm'
import { Post } from './Post.js'

export class User extends Model {
  static override table = 'user'
  static override relations = {
    posts: { type: 'hasMany' as const, model: () => Post, foreignKey: 'authorId' },
  }
  id!: string
  name!: string
  email!: string
}
```

Define the manager:

```ts
// app/Pilotiq/Users/relations/PostsManager.ts
import { RelationManager, Column, BadgeColumn, Action,
         TextField, TextareaField, SelectField,
         type Form, type Table,
         type RelationManagerContext } from '@pilotiq/pilotiq'

export class PostsManager extends RelationManager {
  static override relationship         = 'posts'   // matches User.relations.posts
  static override label                = 'Posts'
  static override icon                 = 'newspaper'
  static override recordTitleAttribute = 'title'

  static override form(form: Form): Form {
    return form
      .schema([
        TextField.make('title').required(),
        TextareaField.make('body').rows(6),
        SelectField.make('status').default('draft').options([
          { value: 'draft',     label: 'Draft' },
          { value: 'published', label: 'Published' },
        ]),
      ])
      .mutateDataBeforeCreate((data, ctx) => {
        // The relation route stamps `parentId` onto FormContext.
        const parentId = (ctx as { parentId?: string }).parentId
        return parentId ? { ...data, authorId: parentId } : data
      })
  }

  static override table(table: Table, ctx: RelationManagerContext): Table {
    return table
      .columns([
        Column.make('title').sortable().searchable(),
        BadgeColumn.make('status').colors({ draft: 'gray', published: 'success' }),
        Column.make('createdAt').sortable().since(),
      ])
      .recordUrl(r => `/admin/posts/${(r as { id: string }).id}`)
      .headerActions([
        Action.relationCreate(PostsManager, ctx),
      ])
      .recordActions([
        Action.relationEdit(PostsManager, ctx),
        Action.relationDelete(PostsManager, ctx),
      ])
      .defaultSort('createdAt', 'desc')
  }
}
```

Mount it on the parent resource:

```ts
// app/Pilotiq/Users/UserResource.ts
import { Resource, Column, TextField, EmailField, type Form, type Table } from '@pilotiq/pilotiq'
import { User }         from '../../Models/User.js'
import { PostsManager } from './relations/PostsManager.js'

export class UserResource extends Resource {
  static override label = 'Users'
  static override model = User

  static override relations() {
    return [PostsManager]
  }

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('name').required(),
      EmailField.make('email').required(),
    ])
  }

  static override table(table: Table): Table {
    return table.columns([
      Column.make('name').sortable().searchable(),
      Column.make('email').searchable(),
    ])
  }
}
```

That's it. The `EditPage` and `ViewPage` for `UserResource` now render a tab
strip with **Edit** + **Posts**, and the manager registers six routes under
`/admin/users/:id/posts/...`.

## URLs

```
GET    /admin/users/:id/posts                  list manager
GET    /admin/users/:id/posts/create           create form
POST   /admin/users/:id/posts/create           submit
GET    /admin/users/:id/posts/:postId/edit     edit form
POST   /admin/users/:id/posts/:postId/edit     submit
POST   /admin/users/:id/posts/:postId/delete   delete
```

The manager's row click navigates to the **related Resource's** view URL by
default (`/admin/posts/:postId`). Override via `Table.recordUrl(fn)` on the
manager's table to keep navigation in-place.

## Reserved relationship tokens

A manager's `relationship` cannot collide with one of these reserved URL
segments under `${base}/${slug}/:id/...`:

```
edit  delete  _form  _action  _search  _uploads
```

Collisions throw at panel boot with a clear error pointing at the offending
manager.

## Authorization

Two layers per route. Both must pass.

1. **Parent gate** — `R.canAccess(user)` then `R.canEdit(user, parentRecord)`.
   "Can you edit the user? Then you can manage their relations."
2. **Manager gate** — the manager's own `canViewAny / canView / canCreate /
   canEdit / canDelete`. Defaults all return `true`.

When the manager **hasn't overridden** a predicate, pilotiq falls through to
the **related Resource's** matching predicate (when one is registered for the
same model). Avoids redefining the same policy in two places.

```ts
class PostsManager extends RelationManager {
  static override relationship = 'posts'

  // Override only when the policy needs to differ from the related
  // resource's. Otherwise PostResource.canDelete is used automatically.
  static override async canDelete(user, _post, _parentUser) {
    return (user as { role?: string })?.role === 'admin'
  }
}
```

Throws inside any predicate fail closed. 403 from the manager routes is a
distinct layer from 401 (which `Pilotiq.guard()` enforces).

## Form lifecycle hooks

The manager's form runs the **same** lifecycle as a Resource form
(`mutateData / mutateDataBeforeCreate / beforeSave / handleCreate / afterSave
/ redirectAfterSave`, etc.). The relation route additionally stamps four
fields onto `FormContext`:

| Field            | Description                                    |
|---|---|
| `parent`         | the parent Resource class                      |
| `parentId`       | parent record id (string)                      |
| `parentRecord`   | the loaded parent record                       |
| `relationship`   | the relationship key (e.g. `'posts'`)          |

Use them to default foreign keys (`mutateDataBeforeCreate` above) or stamp
audit fields (`beforeSave`).

## Reactive integration (limitation)

When the parent record's edit page has `live()` fields and the manager's tab
shows a count badge, **the badge does not auto-update on parent state
changes**. The badge resolves once when the page loads.

The standard form-post-303 path on create/edit/delete reloads the page, so the
worst case is a stale badge between batched edits. Acceptable for v1.

A follow-up plan will add a `Tabs.dependsOn([fields])` builder that triggers
manager-tab badge re-fetch when listed fields change, plus a count-aware
manager list endpoint that returns the current count alongside rows.

## Out of scope

These are deferred to follow-up plans and explicitly do **not** ship in
Plan #11:

- **`belongsToMany` / pivot / many-to-many.** `@rudderjs/orm` does not yet
  support M2M. When it does, a follow-up plan adds `attach / detach / sync`
  actions and pivot-form support. Until then, hand-roll a join resource (e.g.
  `UserRoleResource`) and use two `hasMany` managers.
- **Polymorphic relations** (`morphMany / morphTo`) — same blocker.
- **`RelationGroup`** — tabbing multiple managers under one label. Each
  manager already gets its own tab; grouping is a Tier-2 polish.
- **Implicit row actions.** The manager's `static table()` does *not*
  auto-inject Edit / Delete buttons — placement stays Filament-style
  explicit. Use the `Action.relationCreate / relationEdit /
  relationDelete(M, ctx)` factories shown in the quick example to wire
  them. The `ctx` argument carries `basePath / parentSlug / parentId /
  relationship / parentRecord / related` so URLs are templated for you,
  and visibility predicates fall through to the related Resource's
  `canX` when the manager hasn't overridden.

## Custom resource discovery

Pilotiq discovers the **related Resource** by matching
`parentModel.relations[relationship].model()` against `cfg.resources[i].model`.
Override the auto-discovery with `static relatedResource = OtherResource` on
the manager when:

- the parent's ORM doesn't follow the rudder relations convention
- multiple resources share the same model (e.g. `BlogPostResource` and
  `DraftResource` both backed by `Post`)
- the related model isn't registered as a standalone Resource

Without an explicit override, ambiguity throws at panel boot.

## Custom relation queries

Override `ModelLike.relatedQuery(parent, relationName)` on the parent's
static model when your ORM doesn't expose a `parent.related(name)` chain that
returns a `ModelQuery`. Pilotiq calls
`M.relatedQuery?.(parent, name) ?? defaultRelatedQuery(parent, name)` when
auto-wiring `Table.records()` for the manager.
