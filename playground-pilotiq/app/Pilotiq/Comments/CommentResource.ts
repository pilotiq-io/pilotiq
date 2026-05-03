import {
  Resource, Column, Action,
  TextField,
  type Form, type Table,
} from '@pilotiq/pilotiq'
import { Comment } from '../../Models/Comment.js'

const ADMIN = '/new-admin'

/**
 * Polymorphic follow-up demo — top-level Comments resource.
 *
 * Lets row links from `PostsCommentsManager` / `VideosCommentsManager`
 * drill into the full record context (`/new-admin/comments/:id`). The
 * `commentableId` / `commentableType` columns surface read-only on the
 * list page so the polymorphic ownership is visible without dropping
 * into the morphTo `commentable` accessor (which would require an extra
 * round-trip per row).
 */
export class CommentResource extends Resource {
  static override label                = 'Comments'
  static override labelSingular        = 'Comment'
  static override icon                 = 'message-square'
  static override model                = Comment
  static override recordTitleAttribute = 'body'

  static override navigationGroup = 'Content'
  static override navigationSort  = 40

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('body').required().placeholder('Comment body…'),
    ])
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('body').limit(80).weight('semibold'),
        Column.make('commentableType').label('On').color('muted').width('120px'),
        Column.make('commentableId').label('Owner ID').color('muted').width('200px'),
        Column.make('createdAt').sortable().since(),
      ])
      .recordActions([
        Action.edit  (CommentResource, ADMIN),
        Action.delete(CommentResource, ADMIN),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(15)
  }
}
