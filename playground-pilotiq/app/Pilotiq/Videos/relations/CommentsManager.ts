import {
  RelationManager, Column, Action,
  TextField,
  type Form, type Table,
  type RelationManagerContext,
} from '@pilotiq/pilotiq'
import { CommentResource } from '../../Comments/CommentResource.js'

/**
 * Polymorphic follow-up demo — `Video → Comments` (morphMany) manager.
 *
 * Identical shape to `PostsCommentsManager`; mounted on a different
 * parent so the same Comment table is filtered by `commentableType`
 * server-side. The relation-create POST handler auto-fills
 * `commentableType = 'Video'` from `parent.constructor.name`.
 *
 * Two managers wired to the same Resource is the polymorphic story:
 * one Comment store, multiple parent types, no schema duplication.
 */
export class VideosCommentsManager extends RelationManager {
  static override relationship         = 'comments'
  static override label                = 'Comments'
  static override labelSingular        = 'Comment'
  static override icon                 = 'message-square'
  static override recordTitleAttribute = 'body'
  static override relatedResource      = CommentResource

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('body').required().placeholder('Comment on this video…'),
    ])
  }

  static override table(table: Table, ctx: RelationManagerContext): Table {
    return table
      .columns([
        Column.make('body').limit(80).weight('semibold'),
        Column.make('createdAt').sortable().since(),
      ])
      .recordUrl((r) => {
        const id = (r as { id?: string })?.id
        return id ? `/new-admin/comments/${id}` : undefined
      })
      .headerActions([
        Action.relationCreate(VideosCommentsManager, ctx),
      ])
      .recordActions([
        Action.relationEdit  (VideosCommentsManager, ctx),
        Action.relationDelete(VideosCommentsManager, ctx),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .emptyState({
        heading:     'No comments yet',
        description: 'No one has commented on this video.',
      })
  }
}
