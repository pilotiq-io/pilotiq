import {
  Resource, Column, BadgeColumn,
  TextField, TextareaField, SelectField,
  type Form, type Table,
} from '@pilotiq/pilotiq'
import { Post } from '../../Models/Post.js'

/**
 * Plan #11 demo — top-level Posts resource. The `User → Posts` manager
 * defaults its row links to this resource's view URL
 * (`/new-admin/posts/:id`), so registering it lets the click-through
 * "drill into the full record context" pattern work end-to-end.
 */
export class PostResource extends Resource {
  static override label                = 'Posts'
  static override labelSingular        = 'Post'
  static override icon                 = 'newspaper'
  static override model                = Post
  static override recordTitleAttribute = 'title'

  static override navigationGroup = 'Content'
  static override navigationSort  = 20

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('title').required(),
      TextField.make('authorId').required().helperText('User id'),
      TextareaField.make('body').rows(6),
      SelectField.make('status').default('draft').options([
        { value: 'draft',     label: 'Draft' },
        { value: 'published', label: 'Published' },
      ]),
    ])
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('title').sortable().searchable().weight('semibold'),
        BadgeColumn.make('status').colors({
          draft:     'gray',
          published: 'success',
        }),
        Column.make('authorId').label('Author').color('muted'),
        Column.make('createdAt').sortable().since(),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
  }
}
