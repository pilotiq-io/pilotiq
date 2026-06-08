# Relations

`RelationManager` embeds a related resource's table (and optionally form) on a
parent record's Edit/View page, gated through the parent's authorization and
routed under the parent's URL.

> Scope: `hasOne`, `hasMany`, `belongsTo`, `belongsToMany`, plus the
> polymorphic `morphMany / morphOne / morphTo`. `morphToMany` and
> `morphedByMany` (polymorphic-pivot) remain deferred until
> `@rudderjs/orm` lands them.

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

## Record sub-navigation

When a Resource declares any `relations()`, every record-scoped page —
View, Edit, and each manager's list / create / edit pages — auto-mounts
a **`RelationTabs`** strip at the top of the schema. The strip is
Filament-style record sub-navigation and contains:

```
[ View ] [ Edit ] [ Manager A ] [ Manager B ] …
```

The active tab is whichever page you're currently on (`__view`,
`__edit`, or the manager's `relationship` key). Tabs are plain
`<a href>` links so cmd-click and middle-click open in a new tab; SPA
nav keeps the layout mounted. Icons come from `Resource.icon` for the
`View` / `Edit` tabs and `RelationManager.icon` for each manager tab.

The `View` and `Edit` tabs are dropped automatically when the
corresponding Page role isn't registered — overriding
`static pages()` to omit `view: …` or `edit: …` removes the broken
link. The strip itself is suppressed entirely when a Resource has no
relation managers (a record with no relations doesn't need a sub-nav
of one tab).

To drop the strip even when managers exist, set
`static recordSubNavigation = false` on the Resource — routes stay
registered and reachable by URL, only the tab chrome disappears.

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

### Foreign keys on `hasMany` create

Unlike the polymorphic path — where `relation-create` / `relation-edit`
**force-pin** the morph columns after your hooks run as anti-tamper
protection (see [Auto-injection of morph columns](#auto-injection-of-morph-columns)) —
the plain `hasMany` create path does **not** force-pin the parent foreign
key. The **form owns it**: the FK is whatever your form submits, defaulted
by `mutateDataBeforeCreate` (the `User → Posts` example above sets
`authorId` from `ctx.parentId`). This matches Filament.

Two consequences worth knowing:

- **The FK column must stay fillable** on the child rudder Model. The
  manager writes the child through `M.create(...)`; if the FK is absent
  from the model's `fillable`, rudder silently drops it and you get an
  orphaned row with a null FK.
- **A form that exposes the FK lets a submitted value win.** Don't put the
  parent FK in the manager's form schema (or leave it ungated by a
  `mutateDataBeforeCreate` that re-stamps `ctx.parentId`) unless you mean
  to let the user choose the parent — a crafted POST can otherwise set it
  to any value. The convention is to omit the FK from the form and default
  it from `ctx.parentId`, so the URL-scoped parent always wins. If you
  need belt-and-suspenders pinning, re-stamp it in `mutateDataBeforeCreate`
  (which runs last, like the morph injection).

## Reactive integration (limitation)

When the parent record's edit page has `live()` fields and the manager's tab
shows a count badge, **the badge does not auto-update on parent state
changes**. The badge resolves once when the page loads.

The standard form-post-303 path on create/edit/delete reloads the page, so the
worst case is a stale badge between batched edits. Acceptable for v1.

A follow-up plan will add a `Tabs.dependsOn([fields])` builder that triggers
manager-tab badge re-fetch when listed fields change, plus a count-aware
manager list endpoint that returns the current count alongside rows.

## Many-to-many

`belongsToMany` ships in the M2M follow-up. Declare the relation with an
explicit pivot on the parent's rudder Model, and pilotiq's
`RelationManager` flips into pivot-mutation mode automatically:

```ts
// app/Models/Article.ts
import { Model } from '@rudderjs/orm'
import { Tag } from './Tag.js'

export class Article extends Model {
  static override table = 'article'
  static override relations = {
    tags: {
      type:       'belongsToMany' as const,
      model:      () => Tag,
      pivotTable: 'article_tag',
      // foreignPivotKey defaults to 'articleId', relatedPivotKey to 'tagId'.
    },
  }
}
```

```ts
// app/Models/__migrations/<ts>_create_article_tag.ts — explicit pivot table.
// The pivot is a pure data container: rudder's belongsToMany writes its
// rows directly via raw queries (`insertMany` / `deleteAll`), so no
// relation declarations are needed on either model — just the table.
await Schema.create('article_tag', (t) => {
  t.string('articleId')
  t.string('tagId')
  t.primary(['articleId', 'tagId'])
})
```

Apply with `pnpm rudder migrate`. (On Prisma, declare an explicit
`@@map("article_tag")` model — implicit `_ArticleToTag` relation arrays
are not supported, for the same direct-write reason.)

```ts
// app/Pilotiq/Articles/relations/TagsManager.ts
import { RelationManager, Action, Column, type RelationManagerContext, type Table } from '@pilotiq/pilotiq'

export class TagsManager extends RelationManager {
  static override relationship  = 'tags'
  static override label         = 'Tags'
  static override labelSingular = 'Tag'

  static override table(table: Table, ctx: RelationManagerContext): Table {
    return table
      .columns([Column.make('name').sortable().searchable()])
      .headerActions([ Action.relationAttach(TagsManager, ctx) ])
      .recordActions([ Action.relationDetach(TagsManager, ctx) ])
      .bulkActions([   Action.relationBulkDetach(TagsManager, ctx) ])
  }
}
```

The three new factories:

- `Action.relationAttach(M, ctx)` — header button, opens a modal with a
  searchable `SelectField` populated from the related Resource's model
  with already-attached records filtered out. Submit calls
  `parent.related(rel).attach([id])`.
- `Action.relationDetach(M, ctx)` — row button, destructive, with a
  confirm prompt that frames the operation as **detach** (the related
  record stays in place; only the pivot row is removed). POSTs to
  `${base}/${slug}/:id/${rel}/${childId}/_detach`.
- `Action.relationBulkDetach(M, ctx)` — bulk variant of the above.
  Iterates `ctx.records`, applies `M.canDetach` per row, then calls
  `parent.related(rel).detach(ids)` once.

All three short-circuit to `visible: false` when `ctx.mode !==
'belongsToMany'`, which makes them safe to drop into a manager whose
relation type might switch later.

Two new authorization predicates:

- `static canAttach(user, parentRecord)` — gate the header `Attach`
  button. Default `true`. Manager-only — does not fall through to the
  related Resource's `canCreate` because attaching is a pivot
  operation, not a record creation.
- `static canDetach(user, record, parentRecord)` — gate per-row detach
  + bulk-detach. Default `true`. Same manager-only rationale.

The standard `Action.relationCreate / relationEdit / relationDelete`
factories auto-hide under M2M (no per-pivot-row form, and detach ≠
delete). To create a brand-new Tag from scratch and attach it, do it
in two steps: navigate to the Tag Resource, create, then come back to
the Article and attach. (A combined "create-and-attach" affordance is
deferred — file a request if you need it.)

### What the M2M manager does NOT support (yet)

- **Pivot extras editing.** `@rudderjs/orm` v1 doesn't surface pivot
  columns on the read side, so any UI for editing pivot data would be
  write-only. `attach({ tag1: { addedBy: 'admin' } })` works at the
  ORM level but the manager has no display surface for it. Wait for
  ORM `withPivot([…])`.
- **Reorderable pivot rows.** Needs ORM `orderByPivot('position')` +
  `withPivot(['position'])`. Same gating.
- **Polymorphic M2M (`morphedByMany`).** Still deferred — ORM does
  ship `morphMany / morphOne / morphTo` (see "Polymorphic" below) but
  not the polymorphic-pivot variant.
- **`syncWithoutDetaching` / `toggle`.** The accessor is exposed via
  `parent.related(rel)`; users with custom needs reach for it directly
  inside a regular `Action.handler`.

## Polymorphic

`morphMany / morphOne / morphTo` ship in the polymorphic follow-up. One
related table can attach to several parent types — Comments on Posts
and Videos, Images on Users and Products, etc. — without per-parent FK
columns. Declare on each side of the relation:

```ts
// app/Models/Comment.ts — the child side carries `commentable_id` + `commentable_type`.
import { Model } from '@rudderjs/orm'
import { Post } from './Post.js'
import { Video } from './Video.js'

export class Comment extends Model {
  static override table = 'comment'
  static override relations = {
    commentable: {
      type:      'morphTo' as const,
      morphName: 'commentable',
      types:     () => [Post, Video],   // closed list of allowed parents
    },
  }

  id!: string
  body!: string
  commentableId!:   string   // camelCase column convention (rudder ORM divergence from Laravel)
  commentableType!: string
}
```

```ts
// app/Models/Post.ts — parent side, morphMany.
import { Model } from '@rudderjs/orm'
import { Comment } from './Comment.js'

export class Post extends Model {
  static override table = 'post'
  static override relations = {
    comments: {
      type:      'morphMany' as const,
      model:     () => Comment,
      morphName: 'commentable',
    },
  }
}
```

Wire a `RelationManager` on the parent side; pilotiq auto-detects the
mode as `'morphMany'` from `Post.relations.comments.type`. The same
manager class can be mounted on multiple parents — pilotiq uses
`parent.constructor.name` (or `static morphAlias`) to populate
`commentableType` per-row.

```ts
// app/Pilotiq/Posts/relations/CommentsManager.ts
import { RelationManager, Action, Column, TextField, type RelationManagerContext, type Form, type Table } from '@pilotiq/pilotiq'
import { CommentResource } from '../../Comments/CommentResource.js'

export class CommentsManager extends RelationManager {
  static override relationship    = 'comments'
  static override label           = 'Comments'
  static override labelSingular   = 'Comment'
  static override relatedResource = CommentResource

  static override form(form: Form): Form {
    // No mutateDataBeforeCreate — the framework auto-fills
    // commentableId + commentableType from the URL parent.
    return form.schema([TextField.make('body').required()])
  }

  static override table(table: Table, ctx: RelationManagerContext): Table {
    return table
      .columns([Column.make('body'), Column.make('createdAt').sortable().since()])
      .headerActions([ Action.relationCreate(CommentsManager, ctx) ])
      .recordActions([ Action.relationEdit(CommentsManager, ctx), Action.relationDelete(CommentsManager, ctx) ])
  }
}
```

### Auto-injection of morph columns

When `mode === 'morphMany'`, the `relation-create` and `relation-edit`
POST handlers automatically inject the morph columns on the child:

- `<morphName>Id` ← `parent[primaryKey]`
- `<morphName>Type` ← `parent.constructor.morphAlias ?? parent.constructor.name`

The injection runs **after** any user-supplied `mutateDataBeforeCreate`
/ `mutateDataBeforeUpdate` so the framework wins last. This is anti-
tamper protection: a tampered POST body sending
`commentableId=<other-parent>&commentableType=<other-class>` is silently
overwritten with the URL-scoped parent's values, so a child can't be
reassigned to a different polymorphic parent through a manipulated form.

### `morphTo` (child-side) managers

A `morphTo` relation has no single related model — the target class is
dynamic (`Post` or `Video` per row). Pilotiq recognizes the mode but
does **not** auto-discover the related Resource and does **not**
auto-inject create / edit / delete actions. If you need to project a
manager from the child side, set `static relatedResource =` explicitly
and wire actions yourself. Most users won't — comments are normally
viewed from the post / video edit page, not the other way around.

### What polymorphic does NOT support (yet)

- **`morphToMany` / `morphedByMany`** — polymorphic-pivot variants.
  Same gating story as plain `belongsToMany` had: needs an ORM-side
  primitive first.
- **`Action.relationMorphAttach`** — re-link an existing standalone
  child to the URL parent (vs the dominant *create-with-parent* flow).
  Out of v1; user code can call
  `M.update(id, { ...computeMorphPayload(parent, desc) })` directly via
  a regular `Action.handler` if needed.
- **`Repeater.relationship` polymorphic mode** — JSON-Repeater rows
  storing a polymorphic `type` column. Deferred alongside the existing
  Repeater.relationship `hasMany`-only scope.

## Out of scope

These are deferred to follow-up plans and explicitly do **not** ship in
Plan #11 or its M2M / polymorphic follow-ups:

- **`morphToMany` / `morphedByMany`** — polymorphic-pivot variants;
  gated on `@rudderjs/orm` shipping the primitive.
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
