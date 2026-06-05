import {
  RelationManager, Column, BadgeColumn, Action,
  type Table,
  type RelationManagerContext,
} from '@pilotiq/pilotiq'

/**
 * `Category → Posts` (belongsToMany via `category_post`) manager. Mode
 * auto-detects as M2M, so the header gets an Attach picker and rows get
 * Detach instead of create/delete — the posts themselves live under the
 * Posts resource.
 */
export class CategoryPostsManager extends RelationManager {
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
        return id ? `/admin/posts/${id}` : undefined
      })
      .headerActions([
        Action.relationAttach(CategoryPostsManager, ctx),
      ])
      .recordActions([
        Action.relationDetach(CategoryPostsManager, ctx),
      ])
      .bulkActions([
        Action.relationBulkDetach(CategoryPostsManager, ctx),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .emptyState({
        heading:     'No posts in this category',
        description: 'Attach existing posts, or set categories from the post form.',
      })
  }
}
