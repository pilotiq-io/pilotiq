# Relation Managers

A `RelationManager` projects a related collection onto a parent record's edit / view page as a separate tab — full table chrome, create / edit / delete actions, optional attach / detach for M2M. Each manager runs against `parent.related(relationName).query()` and uses the related Resource's `Model` for persistence.

## Basics — `hasMany`

```ts
import { RelationManager, Table, Form, Column, TextField, Textarea } from '@pilotiq/pilotiq'

export class CommentsRelationManager extends RelationManager {
  static override relationName       = 'comments'                // matches Post.relations.comments
  static override label              = 'Comments'
  static override labelSingular      = 'Comment'
  static override icon               = 'message-square'
  static override recordTitleAttribute = 'body'

  static override form(form: Form, ctx) {
    return form.schema([
      Textarea.make('body').required().rows(4),
    ])
  }

  static override table(table: Table, ctx) {
    return table
      .columns([
        Column.make('body').limit(80).searchable(),
        Column.make('author.name').label('Author'),
        Column.make('createdAt').since().sortable(),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .recordActions([
        Action.relationEdit(this, ctx),
        Action.relationDelete(this, ctx),
      ])
      .headerActions([
        Action.relationCreate(this, ctx),
      ])
  }
}

class PostResource extends Resource {
  static override model = Post
  static override relations() {
    return [CommentsRelationManager]
  }
}
```

The parent (`Post`) must declare the relation in its `static relations`:

```ts
export class Post extends Model {
  static override relations = {
    comments: { type: 'hasMany', model: () => Comment, foreignKey: 'postId' },
  }
}
```

That gives you:

- New tab on `/admin/posts/:id` and `/admin/posts/:id/edit` labeled "Comments"
- Tab content is the manager's `table()` — rows from `Post.find(id).related('comments').query()`
- Routes: `GET ${base}/posts/:id/comments` (list), `GET/POST .../comments/create`, `GET/POST .../comments/:childId/edit`, `POST .../comments/:childId/delete`
- IDOR check on edit/delete: framework re-runs the relation query before each, throws 404 if the child no longer belongs to the parent

`ctx: RelationManagerContext` carries `basePath / parentSlug / parentId / relationship / parentRecord / mode` so factories can wire URLs without manual threading.

## Polymorphic — `morphMany` / `morphTo`

Parent-side (`morphMany`):

```ts
// Post.ts
export class Post extends Model {
  static override relations = {
    comments: { type: 'morphMany', model: () => Comment, name: 'commentable' },
  }
}

// Video.ts
export class Video extends Model {
  static override relations = {
    comments: { type: 'morphMany', model: () => Comment, name: 'commentable' },
  }
}

// Comment.ts (child-side morphTo)
export class Comment extends Model {
  static override relations = {
    commentable: { type: 'morphTo', name: 'commentable' },
  }
  commentableId!: string
  commentableType!: 'Post' | 'Video'
  body!: string
}
```

Same manager for both parents — register it on `PostResource.relations()` and `VideoResource.relations()`. The framework auto-fills `commentableId = parent.id` and `commentableType = 'Post' | 'Video'` (read from `parent.constructor.morphAlias ?? parent.constructor.name`) on create + edit. **The framework wins last** — a tampered POST body (`commentableId=v1&commentableType=Video`) cannot reassign a child to a different polymorphic parent.

Child-side (`morphTo`) — the child class itself can be a Resource, but doesn't get auto-actions or auto-discovery:

```ts
export class CommentResource extends Resource {
  static override model = Comment
  // The morphTo column drives display only; the parent is dynamic
}
```

Set `static relatedResource = SomeResource` explicitly on the manager if you want a custom view of the comment.

## Many-to-many — `belongsToMany`

```ts
// Article.ts
export class Article extends Model {
  static override relations = {
    tags: { type: 'belongsToMany', model: () => Tag, pivot: 'article_tag' },
  }
}

// Tag.ts
export class Tag extends Model {
  static override relations = {
    articles: { type: 'belongsToMany', model: () => Article, pivot: 'article_tag' },
  }
}

// TagsRelationManager.ts
export class TagsRelationManager extends RelationManager {
  static override relationName = 'tags'
  static override label        = 'Tags'

  static override table(table: Table, ctx) {
    return table
      .columns([
        Column.make('name').searchable(),
        Column.make('slug'),
      ])
      .headerActions([
        Action.relationAttach(this, ctx),                // modal picker
      ])
      .recordActions([
        Action.relationDetach(this, ctx),                // unlink (don't delete tag)
      ])
      .bulkActions([
        Action.relationBulkDetach(this, ctx),
      ])
  }

  // M2M-only authorization predicates
  static override async canAttach(user, parentRecord)         { return Boolean(user) }
  static override async canDetach(user, child, parentRecord)  { return user.role === 'admin' }
}
```

The framework dispatches via `parent[relationName]().attach() / .detach()` instead of `M.create() / M.delete()`. Important distinctions:

- **`relationDetach` unlinks the pivot row only** — the related `Tag` still exists. `relationDelete` (which would delete the Tag itself) auto-hides under M2M.
- **`relationAttach` modal-form** uses a `SelectField` populated by `loadAttachableCandidates()` — fetches up to 50 candidate rows server-side and filters out already-attached IDs.
- **`relationCreate` / `relationEdit`** still auto-hide under M2M — the existing tag is edited via its own `TagResource` route, not the relation manager.

Pivot extras (columns on the `article_tag` pivot itself) aren't editable through `RelationManager` in v1 — see `Repeater.relationship().pivotColumns([…])` for that pattern, or use a `Repeater.relationship` instead.

## Authorization — manager + Resource fall-through

`RelationManager` exposes seven async predicates:

```ts
class CommentsRelationManager extends RelationManager {
  static override async canViewAny(user, parentRecord)                  { return true }
  static override async canView(user, child, parentRecord)              { return true }
  static override async canCreate(user, parentRecord)                    { return Boolean(user) }
  static override async canEdit(user, child, parentRecord)              { return user.id === child.authorId }
  static override async canDelete(user, child, parentRecord)            { return user.role === 'admin' }
  static override async canAttach(user, parentRecord)                    { return false }   // not M2M
  static override async canDetach(user, child, parentRecord)            { return false }
}
```

Fall-through behavior:

- Predicates that ARE overridden on the manager: use the manager's value.
- Predicates that are NOT overridden: fall through to the related Resource's matching predicate via reference-equality check on the prototype.
- `canAttach` / `canDetach` are manager-only — they DON'T fall through (attach/detach are pivot operations, not record operations).

For the route handler, the framework runs `parent.canAccess + parent.canEdit` first, then the manager-scope predicate. Both must pass.

## Reserved relation tokens

Relation names are validated at panel boot. The following tokens are reserved and throw a clear error if used as `relationName`:

`edit`, `delete`, `restore`, `force-delete`, `_form`, `_action`, `_search`, `_uploads`, `_attach`, `_detach`, `_bulk-detach`

If you have a relation that collides (rare), rename the relation on the Model.

## Soft-delete on relation children

Same two-sided opt-in as Resources. When the related Model AND the related Resource both declare `softDeletes = true`, the manager auto-injects `TrashedFilter`, and `Action.relationRestore` / `relationForceDelete` factories become available.

```ts
class CommentsRelationManager extends RelationManager {
  static override relationName = 'comments'

  static override table(table, ctx) {
    return table
      .columns([...])
      .recordActions([
        Action.relationEdit(this, ctx),
        Action.relationDelete(this, ctx),         // shows on active rows
        Action.relationRestore(this, ctx),        // shows on trashed rows
        Action.relationForceDelete(this, ctx),    // shows on trashed rows
      ])
  }
}
```

## Replicate (clone) a child

```ts
.recordActions([
  Action.relationReplicate(this, ctx, undefined, {
    excludeAttributes: ['publishedAt'],            // strip these from the clone
    beforeReplicaSaved: (replica, ctx) => {
      replica.body = `[Copy] ${replica.body}`
      return replica
    },
  }),
])
```

The framework strips PK + soft-delete column + your `excludeAttributes`, runs `beforeReplicaSaved`, then **force-pins the parent attachment column back** so a tampered source row can't slip a different parent in by riding its own FK column. Auto-hides on M2M (replicate doesn't fit pivot semantics) and on `morphTo` (no single owner to pin to).

## Nested relations (depth-2)

A manager can register its own sub-managers — a Post → Comments → CommentReplies chain:

```ts
class CommentsRelationManager extends RelationManager {
  static override relations() {
    return [CommentRepliesRelationManager]
  }
}
```

The Comments tab on a Post shows the regular comments table; clicking a comment opens its edit/view page with the CommentReplies sub-tab. Sub-manager URLs are `${base}/posts/:postId/comments/:commentId/replies`.

Depth-2 supports the full surface of depth-1 (form, table, actions, soft delete, replicate, M2M, polymorphic). Depth-3+ deferred — you'd usually denormalize at that point.

## Common pitfalls

- **`relationName` typo** — silently makes the manager point at a non-existent relation. The framework catches it at boot if the parent's `static relations` map doesn't contain the key (clear error message). If you skip declaring relations on the parent Model, the M2M / morph type can't be detected and falls back to `'hasMany'` — also caught at boot with a clear warning.
- **`Action.relationEdit / relationDelete` outside `RelationManager.table()`** doesn't work — they need the `ctx` arg from the manager. Use `Action.edit(R, base, id)` for the related Resource's standalone edit page.
- **Forgetting `static relatedResource`** on a `morphTo` manager means the framework can't resolve form / detail schemas for the child. Set it explicitly when the child is polymorphic.
- **M2M `canCreate` semantics** — for M2M, `canCreate` controls whether the user can create a NEW tag (via the regular TagResource path). Use `canAttach` to control whether they can link an existing tag to this parent.
- **Pivot reads aren't surfaced via `belongsToMany` v1** — if you need extra columns on the pivot table (e.g. `created_at` on `article_tag`), use a `Repeater.relationship('articleTags')` with the pivot model as a regular `hasMany` instead. The `RelationManager` route layer can't expose pivot extras without ORM changes.
