import {
  Resource, Column, Action,
  TextField,
  Heading, Text, Icon,
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
 *
 * Tier-3 follow-up — `Table.cards()` demo. Same `Column`s drive search /
 * sort / filter semantics; the per-row visual content comes from
 * `cardSchema(record => …)` and renders as a CSS grid of cards. Top bar
 * gains a "Sort by" picker since column headers are hidden.
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
      .cards()
      .heading('Videos')
      .description('Cards-mode demo — same columns drive search / sort, but each row renders from a per-row schema. Use the "Sort by" picker since column headers are hidden.')
      .cardsPerRow({ default: 1, sm: 2, lg: 3 })
      .columns([
        Column.make('title').sortable().searchable().weight('semibold'),
        Column.make('url').color('muted').limit(50),
        Column.make('createdAt').sortable().since(),
      ])
      .recordUrl((r) => {
        const id = (r as { id?: string })?.id
        return id ? `${ADMIN}/videos/${id}` : undefined
      })
      .cardSchema((record) => {
        const video = record as { title?: string; url?: string; createdAt?: Date | string }
        return [
          Icon.make('video').size(32).color('primary'),
          Heading.make(video.title ?? 'Untitled').level(3),
          Text.make(video.url ?? '').size('sm').color('muted'),
          Text.make(`Added ${formatRelative(video.createdAt)}`).size('xs').color('muted'),
        ]
      })
      .headerActions([
        Action.create(VideoResource, ADMIN),
      ])
      .recordActions([
        Action.edit  (VideoResource, ADMIN),
        Action.view  (VideoResource, ADMIN),
        Action.delete(VideoResource, ADMIN),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(12)
  }

  static override relations() { return [VideosCommentsManager] }
}

function formatRelative(input: Date | string | undefined): string {
  if (!input) return 'recently'
  const date = input instanceof Date ? input : new Date(input)
  const ms   = Date.now() - date.getTime()
  const min  = Math.round(ms / 60_000)
  if (min < 1)   return 'just now'
  if (min < 60)  return `${min}m ago`
  const hr   = Math.round(min / 60)
  if (hr < 24)   return `${hr}h ago`
  const day  = Math.round(hr / 24)
  if (day < 30)  return `${day}d ago`
  const month = Math.round(day / 30)
  return `${month}mo ago`
}
