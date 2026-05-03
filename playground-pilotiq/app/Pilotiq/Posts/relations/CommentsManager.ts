import {
  RelationManager, Column, Action,
  TextField,
  type Form, type Table,
  type RelationManagerContext,
} from '@pilotiq/pilotiq'
import { CommentResource } from '../../Comments/CommentResource.js'

/**
 * Polymorphic follow-up demo — `Post → Comments` (morphMany) manager.
 *
 * Mode auto-detected as `'morphMany'` from `Post.relations.comments.type`.
 * The relation-create POST handler auto-injects `commentableId` +
 * `commentableType` on save, so the form schema can stay clean — no
 * `mutateDataBeforeCreate` shim needed (compare with `PostsManager`
 * which manually defaults `authorId` for its hasMany relation).
 *
 * Reused verbatim by `VideoResource` for the second polymorphic parent.
 */
export class PostsCommentsManager extends RelationManager {
  static override relationship         = 'comments'
  static override label                = 'Comments'
  static override labelSingular        = 'Comment'
  static override icon                 = 'message-square'
  static override recordTitleAttribute = 'body'
  // Manager-level pointer to the related Resource. morphTo (child side)
  // can't auto-discover but morphMany / morphOne always can — this is
  // explicit here because PostsCommentsManager and VideosCommentsManager
  // share the same Comment Resource and both routes need to find it.
  static override relatedResource      = CommentResource

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('body').required().placeholder('Write a comment…'),
    ])
    // No `mutateDataBeforeCreate` — the morphMany route auto-injects
    // commentableId + commentableType from the parent record.
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
        Action.relationCreate(PostsCommentsManager, ctx),
      ])
      .recordActions([
        Action.relationEdit  (PostsCommentsManager, ctx),
        Action.relationDelete(PostsCommentsManager, ctx),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .emptyState({
        heading:     'No comments yet',
        description: 'Be the first to comment on this post.',
      })
  }
}
