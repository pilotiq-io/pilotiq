import {
  Page, Heading, Text, Section, Grid, Alert,
  type SchemaContext,
} from '@pilotiq/pilotiq'

/**
 * Record sub-page demo — mounted under `PostResource.pages().record`
 * at `${resourceBase}/:id/analytics`. The post record arrives on
 * `ctx.record`; the schema derives a few read-only stats from the
 * body markdown. Click the "Analytics" tab on any post's edit/view
 * page to land here.
 */
export class PostAnalyticsPage extends Page {
  static override slug  = 'analytics'
  static override label = 'Analytics'
  static override icon  = 'chart-bar'

  static override async canAccess(_user: unknown, record: unknown): Promise<boolean> {
    // Demo gate — only allow analytics on records that actually exist.
    // The framework loads the record before calling this; record
    // missing (and the parent resource has no model) gets a stub
    // `{ id }`. Real apps would gate on role / ownership / tenant.
    return record != null && typeof (record as { id?: unknown }).id !== 'undefined'
  }

  static override schema(ctx?: SchemaContext) {
    const record = (ctx?.record ?? {}) as { id?: string; title?: string; body?: string; status?: string }
    const body   = record.body ?? ''
    const trimmed = body.trim()

    // Cheap word-split — splits on whitespace runs and drops empties.
    // Same shape as `Column.words()` / `TextColumn.markdown` reading.
    const words = trimmed.length === 0
      ? 0
      : trimmed.split(/\s+/).filter(Boolean).length
    const characters = body.length
    const charactersNoSpaces = body.replace(/\s/g, '').length
    // ~200 wpm read speed, rounded up to the nearest minute. Zero-body
    // posts read in 0 minutes; floor of 1 min once there's any content.
    const readMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200))

    return [
      Heading.make(record.title ?? 'Post analytics')
        .description('Read-only stats derived from the post body.'),

      Section.make('Body length').schema([
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
          : 'This post is still a draft.',
        ),
      ]),

      body === ''
        ? Alert.make('No body yet — write something to see the stats fill in.').info()
        : Alert.make('Analytics auto-refresh on every page load.').success(),
    ]
  }
}
