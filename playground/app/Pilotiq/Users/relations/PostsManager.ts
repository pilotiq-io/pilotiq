import {
  RelationManager, Column, BadgeColumn, Action,
  TextField, TextareaField, SelectField,
  type Form, type Table,
  type RelationManagerContext,
} from '@pilotiq/pilotiq'

/**
 * Plan #11 — `User → Posts` (hasMany) manager.
 *
 * - Mounts on `UserResource.relations()` and renders as a tab on the
 *   user's Edit/View page (auto-wired by `RelationTabs`).
 * - Routes register at `/new-admin/users/:id/posts/...`.
 * - The manager's table runs against `user.related('posts')` (rudder
 *   ORM convention — `User.relations.posts` declares the hasMany).
 * - `mutateDataBeforeCreate` defaults the foreign key from the parent
 *   record so the create form doesn't surface `authorId`.
 * - Header/row action buttons use `Action.relation*(M, ctx)` factories
 *   — the framework pipes `RelationManagerContext` (basePath /
 *   parentId / relationship) into `static table()` so URLs are
 *   templated automatically.
 */
export class PostsManager extends RelationManager {
  static override relationship         = 'posts'
  static override label                = 'Posts'
  static override labelSingular        = 'Post'
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
        // Stamp the foreign key from the parent record. `ctx.parentId`
        // is set by the relation route handler before `dispatchFormSubmit`
        // runs, so this works on a fresh create where the FK input
        // doesn't surface in the form schema.
        const parentId = (ctx as { parentId?: string }).parentId
        return parentId ? { ...data, authorId: parentId } : data
      })
  }

  static override table(table: Table, ctx: RelationManagerContext): Table {
    return table
      .columns([
        Column.make('title').sortable().searchable().weight('semibold'),
        BadgeColumn.make('status').colors({
          draft:     'gray',
          published: 'success',
        }),
        Column.make('createdAt').sortable().since(),
      ])
      .recordUrl((r) => {
        const id = (r as { id?: string })?.id
        return id ? `/new-admin/posts/${id}` : undefined
      })
      .headerActions([
        Action.relationCreate(PostsManager, ctx),
      ])
      .recordActions([
        Action.relationEdit(PostsManager, ctx),
        Action.relationDelete(PostsManager, ctx),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .emptyState({
        heading:     'No posts yet',
        description: 'This user has not published anything.',
      })
  }
}
