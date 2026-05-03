import {
  Resource, Column, Action,
  TextField,
  type Form, type Table,
} from '@pilotiq/pilotiq'
import { Video } from '../../Models/Video.js'
import { VideosCommentsManager } from './relations/CommentsManager.js'

const ADMIN = '/new-admin'

/**
 * Polymorphic follow-up demo — Video is the second parent in the
 * `commentable` polymorphic. Mounting `VideosCommentsManager` here
 * proves a single Comment table can be sliced by parent type
 * (`commentableType = 'Video'`) without duplicating schema.
 */
export class VideoResource extends Resource {
  static override label                = 'Videos'
  static override labelSingular        = 'Video'
  static override icon                 = 'video'
  static override model                = Video
  static override recordTitleAttribute = 'title'

  static override navigationGroup = 'Content'
  static override navigationSort  = 30

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('title').required(),
      TextField.make('url').required().placeholder('https://…'),
    ])
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('title').sortable().searchable().weight('semibold'),
        Column.make('url').color('muted').limit(50),
        Column.make('createdAt').sortable().since(),
      ])
      .headerActions([
        Action.create(VideoResource, ADMIN),
      ])
      .recordActions([
        Action.edit  (VideoResource, ADMIN),
        Action.view  (VideoResource, ADMIN),
        Action.delete(VideoResource, ADMIN),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
  }

  static override relations() { return [VideosCommentsManager] }
}
