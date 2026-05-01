import {
  RelationManager, Column, BadgeColumn,
  TextField, TextareaField, SelectField,
  type Form, type Table,
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
 *
 * Header/row action buttons are intentionally omitted — `Resource.form/table`
 * have access to `basePath` via the page lifecycle, but `RelationManager`
 * statics don't (yet). For now the demo navigates via direct URLs:
 *   - List:   /new-admin/users/:userId/posts
 *   - Create: /new-admin/users/:userId/posts/create
 *   - Edit:   /new-admin/users/:userId/posts/:postId/edit
 * Click a post row to drill into its top-level `PostResource` view at
 * /new-admin/posts/:postId.
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

  static override table(table: Table): Table {
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
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .emptyState({
        heading:     'No posts yet',
        description: 'This user has not published anything.',
      })
  }
}
