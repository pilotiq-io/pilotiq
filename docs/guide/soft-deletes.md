# Soft deletes

`Resource.softDeletes = true` opts a resource into the soft-delete UX:
deleting a row writes a `deletedAt` timestamp (instead of removing the
row), the list page gets a TrashedFilter, and trashed rows get
**Restore** + **Delete forever** actions in place of the regular Delete.

> Scope: requires `@rudderjs/orm` >= the version that ships
> `Model.softDeletes` (statics: `restore`, `forceDelete`; instance:
> `trashed()`; query: `withTrashed`, `onlyTrashed`).

## Quick example — `Post` with soft-delete

The flag is **two-sided** — both the rudder Model AND the pilotiq
Resource opt in independently. This is intentional (apps can stage
the rollout) but easy to forget; pilotiq throws a clear boot error
when only the resource side is set.

### 1. Schema / migration

Add a `deletedAt` column to the table. The native engine exposes a
`softDeletes()` column helper — on a fresh table:

```ts
// app/Models/__migrations/<ts>_create_post.ts
import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.create('post', (t) => {
      t.string('id').primary()   // app-generated (Model keyType 'ulid')
      t.string('title')
      // ...
      t.softDeletes()            // deletedAt DATETIME nullable
    })
  }
  async down() { await Schema.dropIfExists('post') }
}
```

…or, to add it to an existing table, `await Schema.table('post', (t) => t.softDeletes())`.

Run `pnpm rudder migrate` to apply. This also regenerates
`app/Models/__schema/registry.d.ts`, so `Model.for<'post'>()` sees the
new column with no extra step. (On a Prisma/Drizzle app, add
`deletedAt DateTime?` to the schema and run that toolchain's push +
generate instead.)

### 2. Rudder Model

```ts
// app/Models/Post.ts
import { Model } from '@rudderjs/orm'

export class Post extends Model {
  static override table        = 'post'
  static override softDeletes  = true   // ← rudder side opt-in

  id!:        string
  title!:     string
  deletedAt!: Date | null
}
```

### 3. Pilotiq Resource

```ts
// app/Pilotiq/Posts/PostResource.ts
import {
  Resource, Column, BadgeColumn, Action,
  type Form, type Table,
} from '@pilotiq/pilotiq'
import { Post } from '../../Models/Post.js'

const ADMIN = '/admin'

export class PostResource extends Resource {
  static override label        = 'Posts'
  static override model        = Post
  static override softDeletes  = true   // ← pilotiq side opt-in

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('title').sortable().searchable(),
        Column.make('createdAt').since(),
      ])
      .headerActions([Action.create(PostResource, ADMIN)])
      .recordActions([
        Action.edit       (PostResource, ADMIN),
        Action.delete     (PostResource, ADMIN),  // soft-deletes (writes deletedAt)
        Action.restore    (PostResource, ADMIN),  // auto-shows on trashed rows
        Action.forceDelete(PostResource, ADMIN),  // auto-shows on trashed rows
      ])
      .bulkActions([
        Action.bulkDelete     (PostResource, ADMIN),
        Action.bulkRestore    (PostResource, ADMIN),
        Action.bulkForceDelete(PostResource, ADMIN),
      ])
  }
}
```

That's it. The list page now ships with:

- A **TrashedFilter** dropdown (auto-injected since `softDeletes = true`):
  default scope hides trashed; switch to *With trashed* to see all, or
  *Only trashed* to filter to the trash view.
- **Edit** + **Delete** actions on live rows.
- **Restore** + **Delete forever** actions on trashed rows.
- Bulk variants from the toolbar when rows are selected.

## URLs

```
POST /admin/posts/:id/delete           soft-delete (writes deletedAt)
POST /admin/posts/:id/restore          un-trash (clears deletedAt)
POST /admin/posts/:id/force-delete     hard delete (bypasses soft-delete)
```

## Per-row visibility

Each factory ships with a built-in `.visible()` rule, so wiring all
four into `recordActions([…])` is fine — the renderer hides the
inappropriate pair per row:

| Row state | Edit | Delete | Restore | Delete forever |
|---|---|---|---|---|
| Live (`deletedAt = null`) | ✓ | ✓ | hidden | hidden |
| Trashed (`deletedAt` set) | ✓ | hidden | ✓ | ✓ |

The Edit action stays visible on trashed rows by default — you can edit
a trashed Post (e.g. fix a typo before deciding whether to restore).
Hide it explicitly if that's not the right model for your app:

```ts
Action.edit(R, base).visible(({ record }) => record.deletedAt == null)
```

## Authorization

Two new async predicates land alongside the soft-delete flag:

```ts
class PostResource extends Resource {
  static override softDeletes = true

  static async canRestore(user, record)     { return user?.role === 'editor' }
  static async canForceDelete(user, record) { return user?.role === 'admin' }
}
```

| Method | Default | Notes |
|---|---|---|
| `canRestore(user, record)` | `true` | Auto-hides `Action.restore` when false. Checked on `POST /:id/restore`. |
| `canForceDelete(user, record)` | inherits from `canDelete` | Defaults to whatever `canDelete` returns, on the principle that hard-delete should be at least as restrictive. Override independently to tighten. |

Both fail-closed on throws (matches the rest of Plan #10).

## Custom `deletedAtColumn`

Default is `'deletedAt'` (matches the rudder `Model.softDeletes`
column convention). Override per-resource for non-standard schemas:

```ts
class ArticleResource extends Resource {
  static override softDeletes      = true
  static override deletedAtColumn  = 'archivedAt'
}
```

The pilotiq side reads `record[deletedAtColumn]` for per-row visibility
(Action.delete / restore / forceDelete). The rudder ORM column
is configured separately on the Model side.

## Bulk actions

`Action.bulkDelete / bulkRestore / bulkForceDelete` are handler-style
bulk actions. Drop them into `bulkActions([…])` on the table; the
renderer surfaces the toolbar when rows are selected.

Each iterates `ctx.records` server-side, runs the matching `canX`
predicate per row, and skips rows that fail. The notification reports
the **succeeded** count:

```
3 posts moved to trash
2 posts restored
4 posts permanently deleted
```

Rows that failed policy or threw are silently skipped — surface
fine-grained errors via your own logging if you need to.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Boot error: `softDeletes = true requires a Resource.model` | The flag is on but `static model = …` isn't set | Wire the model. |
| Boot error: `model.restore / model.forceDelete are missing` | Rudder Model lacks the soft-delete primitives | Set `Model.softDeletes = true` on the rudder side, or upgrade `@rudderjs/orm`. |
| Trashed rows show up in the default list | `Model.softDeletes = false` (rudder side) | Both sides must opt in. The rudder default scope is what hides trashed rows in the first place. |
| Restore route 404s | Default scope on `R.model.find(id)` excludes trashed rows | The framework already handles this — the route looks up via `query.withTrashed().where(pk, id).paginate(1, 1)`. If you see this, file a bug. |
| Click "Delete" but the row stays in the list | Working as intended on a soft-delete resource — the row is now in `?trashed=onlyTrashed` | The success toast says "moved to trash"; surface the TrashedFilter prominently. |
| Cascade behavior surprises | `Model.deleting / deleted` events handle cascade per-relation, not pilotiq | Document on a per-resource basis; pilotiq doesn't intervene. |

## Relation managers

When the related Resource has `softDeletes = true`, manager-side soft
deletes wire up automatically:

- **TrashedFilter** is injected into the manager's table — same UX as the
  resource list page. Override by attaching one yourself in
  `M.table()` (e.g. `t.filters([TrashedFilter.make().label('Archive')])`)
  to keep the framework from double-injecting.
- **Per-row actions** — drop in `Action.relationRestore(M, ctx)` and
  `Action.relationForceDelete(M, ctx)` from inside `M.table(table, ctx)`
  alongside `Action.relationDelete(M, ctx)`. Each auto-hides on the
  rows where it doesn't apply: Restore + ForceDelete only show on
  trashed rows; Delete hides on already-trashed rows.
- **Routes** — `POST {base}/{slug}/:id/{rel}/:childId/restore` and
  `/force-delete` mount automatically. Two-layer auth: parent
  `canAccess + canEdit`, then manager `canRestore / canForceDelete`
  with fall-through to the related Resource. IDOR check re-runs the
  parent's relation query through `withTrashed()` so trashed children
  resolve.
- **Authorization** — `RelationManager.canRestore(user, child, parent)`
  defaults to `true`. `canForceDelete` inherits from `canDelete` by
  default (delegates via `this.canDelete`) so locking down delete also
  locks down force-delete. Override either independently when needed.

```ts
class CommentsManager extends RelationManager {
  static override relationship = 'comments'

  static override table(t: Table, ctx: RelationManagerContext): Table {
    return t
      .columns([Column.make('body')])
      .recordActions([
        Action.relationEdit(CommentsManager, ctx),
        Action.relationDelete(CommentsManager, ctx),
        Action.relationRestore(CommentsManager, ctx),
        Action.relationForceDelete(CommentsManager, ctx),
      ])
  }
}
```

## Out of scope

- **Per-user trash isolation** — multi-tenant trash isolation lives in
  user-defined `getEloquentQuery` overrides, not pilotiq.
- **Auto-purge after N days** — trivial cron job in your app, doesn't
  belong in pilotiq.
- **Trash views as separate routes** — no `/posts/trash` URL; the
  TrashedFilter inside the list page is the canonical UX.
