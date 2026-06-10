import {
  Resource, Column,
  TextField, TextareaField, SelectField,
  type Form, type Table,
} from '@pilotiq/pilotiq'
import { Comment } from '../../Models/Comment.js'
import { Post } from '../../Models/Post.js'
import { ListComments } from './ListComments.js'

/**
 * Top-level moderation surface for comments. Day-to-day commenting
 * happens on the post's Comments tab; this list shows everything in
 * one place so spam is easy to sweep.
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
      SelectField.make('postId')
        .label('Post')
        .required()
        .options(async () => {
          const posts = await Post.query().paginate(1, 200)
          return posts.data.map((p) => ({ value: p.id, label: p.title }))
        }),
      TextField.make('authorName').label('Author').placeholder('Jane Reader'),
      TextareaField.make('body').required().rows(3).placeholder('Comment body…'),
    ])
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('authorName').label('Author').width('160px'),
        Column.make('body').limit(80).weight('semibold').searchable(),
        Column.make('createdAt').sortable().since(),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(15)
  }

  // Actions live on ListComments — its hooks receive the requesting
  // panel's basePath (this resource serves both /admin and /guest).
  static override pages() {
    return { index: ListComments }
  }
}
