import {
  RelationManager, Column, Action,
  TextField, TextareaField,
  type Form, type Table,
  type RelationManagerContext,
} from '@pilotiq/pilotiq'

/**
 * `Post → Comments` (hasMany) manager — the Comments tab on a post's
 * edit/view page. The relation-create POST stamps `postId` from the
 * parent automatically via `mutateDataBeforeCreate`.
 */
export class CommentsManager extends RelationManager {
  static override relationship         = 'comments'
  static override label                = 'Comments'
  static override labelSingular        = 'Comment'
  static override icon                 = 'message-square'
  static override recordTitleAttribute = 'body'

  static override form(form: Form): Form {
    return form
      .schema([
        TextField.make('authorName').label('Author').placeholder('Jane Reader'),
        TextareaField.make('body').required().rows(3).placeholder('Write a comment…'),
      ])
      .mutateDataBeforeCreate((data, ctx) => {
        const parentId = (ctx as { parentId?: string }).parentId
        return parentId ? { ...data, postId: parentId } : data
      })
  }

  static override table(table: Table, ctx: RelationManagerContext): Table {
    return table
      .columns([
        Column.make('authorName').label('Author').width('160px'),
        Column.make('body').limit(80).weight('semibold'),
        Column.make('createdAt').sortable().since(),
      ])
      .headerActions([
        Action.relationCreate(CommentsManager, ctx),
      ])
      .recordActions([
        Action.relationEdit  (CommentsManager, ctx),
        Action.relationDelete(CommentsManager, ctx),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .emptyState({
        heading:     'No comments yet',
        description: 'Be the first to comment on this post.',
      })
  }
}
