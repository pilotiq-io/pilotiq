import {
  Page, Heading, Text, Section, Grid, Alert,
  type SchemaContext,
} from '@pilotiq/pilotiq'
import { tiptapText } from './tiptapText.js'

/**
 * Record sub-page — mounted under `PostResource.pages().record` at
 * `${resourceBase}/:id/analytics` and surfaced as a tab on the post's
 * sub-nav strip. The post record arrives on `ctx.record`; the schema
 * derives read-only stats from the Tiptap content document.
 */
export class PostAnalyticsPage extends Page {
  static override slug  = 'analytics'
  static override label = 'Analytics'
  static override icon  = 'chart-bar'

  static override async canAccess(_user: unknown, record: unknown): Promise<boolean> {
    return record != null && typeof (record as { id?: unknown }).id !== 'undefined'
  }

  static override schema(ctx?: SchemaContext) {
    const record = (ctx?.record ?? {}) as { id?: string; title?: string; content?: unknown; status?: string }
    const body    = tiptapText(record.content)
    const trimmed = body.trim()

    const words = trimmed.length === 0
      ? 0
      : trimmed.split(/\s+/).filter(Boolean).length
    const characters = body.length
    const charactersNoSpaces = body.replace(/\s/g, '').length
    // ~200 wpm read speed, rounded up to the nearest minute.
    const readMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200))

    return [
      Heading.make(record.title ?? 'Post analytics')
        .description('Read-only stats derived from the post content.'),

      Section.make('Content length').schema([
        Grid.make().columns(3).schema([
          Text.make(`${words} words`).size('xl').weight('semibold'),
          Text.make(`${characters} characters`).size('xl').weight('semibold'),
          Text.make(`${charactersNoSpaces} chars (no spaces)`).size('xl').weight('semibold'),
        ]),
      ]),

      Section.make('Reading time').schema([
        Text.make(`About ${readMinutes} minute${readMinutes === 1 ? '' : 's'} at ~200 wpm.`).size('lg'),
      ]),

      Section.make('Status').schema([
        Text.make(record.status === 'published'
          ? 'This post is published — visible to readers.'
          : 'This post is not published yet.',
        ),
      ]),

      words === 0
        ? Alert.make('No content yet — write something to see the stats fill in.').info()
        : Alert.make('Analytics refresh on every page load.').success(),
    ]
  }
}
