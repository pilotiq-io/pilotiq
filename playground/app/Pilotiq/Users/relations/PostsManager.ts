import {
  RelationManager, Column, BadgeColumn, Action,
  type Table,
  type RelationManagerContext,
} from '@pilotiq/pilotiq'

/**
 * `User → Posts` (belongsToMany via `post_author`) manager — the posts
 * this user co-authors. M2M mode: Attach picker in the header, Detach
 * on rows; authorship is also editable from the post form's Authors
 * multi-select (same pivot).
 */
export class UserPostsManager extends RelationManager {
  static override relationship         = 'posts'
  static override label                = 'Posts'
  static override labelSingular        = 'Post'
  static override icon                 = 'newspaper'
  static override recordTitleAttribute = 'title'

  static override table(table: Table, ctx: RelationManagerContext): Table {
    return table
      .columns([
        Column.make('title').sortable().searchable().weight('semibold'),
        BadgeColumn.make('status').colors({
          draft:     'gray',
          published: 'success',
          archived:  'warning',
        }),
        Column.make('createdAt').sortable().since(),
      ])
      .recordUrl((r) => {
        const id = (r as { id?: string })?.id
        return id ? `${ctx.basePath}/posts/${id}` : undefined
      })
      .headerActions([
        Action.relationAttach(UserPostsManager, ctx),
      ])
      .recordActions([
        Action.relationDetach(UserPostsManager, ctx),
      ])
      .bulkActions([
        Action.relationBulkDetach(UserPostsManager, ctx),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .emptyState({
        heading:     'No posts yet',
        description: 'Attach posts this user co-authors.',
      })
  }
}
