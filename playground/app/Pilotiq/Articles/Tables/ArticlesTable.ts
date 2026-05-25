import {
  Column, TextColumn, BadgeColumn, BooleanColumn, IconColumn, ImageColumn,
  Action, ActionGroup,
  BooleanFilter, MultiSelectFilter, FormFilter,
  QueryBuilderFilter,
  TextConstraint, NumberConstraint, DateConstraint, SelectConstraint, BooleanConstraint,
  TextField, SelectField,
  Notification,
  Sum, Count,
  TableGroup,
  type Table,
} from '@pilotiq/pilotiq'
import { app } from '@rudderjs/core'

const prisma = (): any => app().make('prisma')

export const ArticlesTable = {
  configure(table: Table): Table {
    return table
      // No table .heading()/.description() here — the page header (set in
      // ListArticles.getHeader) already shows "Articles" + subheading.
      // Repeating the resource name on the table reads as a duplicate title
      // (Filament shows the title once, in the page header).
      .striped()
      // Responsive: classic table on desktop, one auto-card per row below
      // `md` (no cardSchema → built from columns + recordTitleAttribute +
      // the `coverImage` ImageColumn). Resize the window to see the switch.
      .stackOnMobile('md')
      .emptyState({
        heading:     'No articles yet',
        description: 'Create your first article to get started.',
        icon:        'inbox',
      })
      .columns([
        // Image column → renders the URL value as a 40px square thumbnail.
        // `placeholder('—')` is the fallback when coverImage is null.
        ImageColumn.make('coverImage').label('Cover').size(40).square()
          .placeholder('—'),
        // TextColumn is the canonical text-cell builder; Column.make() is
        // an alias. Spelled out here for symmetry with the other column
        // subclasses below.
        TextColumn.make('title').label('Title').sortable().searchable()
          .weight('semibold')
          .summarize([Count.make().label('Articles')]),
        // Limit truncates the rendered cell to N chars + '…'. Hover for
        // the full slug via .tooltip().
        TextColumn.make('slug').label('Slug').searchable().color('muted')
          .limit(28).tooltip('Full slug'),
        BadgeColumn.make('status').label('Status').sortable().colors({
          draft:     'gray',
          published: 'success',
          archived:  'warning',
        }),
        // Icon column — different visual from BadgeColumn for the same
        // value space. Renders just the icon (no label) so it reads as
        // a glyph at-a-glance. Keep on the demo for parity with the
        // value→{icon,color} branch of formatCell.
        IconColumn.make('status').label('').alignment('center')
          .options({
            draft:     { icon: 'pencil',        color: 'muted'   },
            published: { icon: 'check-circle-2', color: 'success' },
            archived:  { icon: 'archive',       color: 'warning' },
          })
          .recordUrl(false),
        BooleanColumn.make('featured').label('Featured').sortable().alignment('center')
          .summarize([Sum.make().label('Featured')]),
        // numeric() — render an integer as a locale-aware number. Demo
        // counts the article's tags JSON length server-side via
        // formatStateUsing (the column's underlying value is JSON, so
        // numeric() alone wouldn't know to count).
        TextColumn.make('tags').label('Tag count').alignment('end')
          .formatStateUsing((value) => {
            try {
              const arr = JSON.parse(String(value ?? '[]')) as unknown[]
              return String(arr.length)
            } catch {
              return '0'
            }
          }),
        Column.make('publishedAt').label('Published').sortable().dateTime()
          .placeholder('Not yet'),
        Column.make('createdAt').label('Created').sortable().since(),
      ])
      // Three group options — user picks which one is active via the
      // "Group by" dropdown above the table; "status" is the default.
      .groups([
        TableGroup.make<{ status?: string }>('status')
          .label('Status')
          .collapsible()
          .getTitleFromRecordUsing((r) => {
            switch (r.status) {
              case 'draft':     return 'Drafts'
              case 'published': return 'Published'
              case 'archived':  return 'Archived'
              default:          return r.status ?? 'Unknown'
            }
          }),
        TableGroup.make('featured')
          .label('Featured')
          .collapsible(),
        TableGroup.make('createdAt')
          .label('Created date')
          .date()
          .collapsible(),
      ])
      .defaultGroup('status')
      .filters([
        // Multi-select: comma-separated URL value (?status=draft,published)
        // contributes a where('status','IN',[...]) clause.
        MultiSelectFilter.make('status').options([
          { value: 'draft',     label: 'Draft' },
          { value: 'published', label: 'Published' },
          { value: 'archived',  label: 'Archived' },
        ]),
        BooleanFilter.make('featured').label('Featured'),
        // Multi-field: title-LIKE + slug-LIKE bundled into one URL key as
        // `?advanced={"titleContains":"…","slugContains":"…"}`. Empty
        // sub-fields drop out of the encoded payload, so a partial fill
        // doesn't bloat the URL.
        FormFilter.make('advanced')
          .label('Advanced')
          .form([
            TextField.make('titleContains').label('Title contains').placeholder('e.g. tutorial'),
            TextField.make('slugContains').label('Slug contains').placeholder('e.g. blog-'),
          ])
          .handle((q, { titleContains, slugContains }) => {
            if (typeof titleContains === 'string' && titleContains !== '') {
              q = q.where('title', 'LIKE', `%${titleContains}%`)
            }
            if (typeof slugContains === 'string' && slugContains !== '') {
              q = q.where('slug', 'LIKE', `%${slugContains}%`)
            }
            return q
          })
          .formIndicator(({ titleContains, slugContains }) => {
            const parts: string[] = []
            if (titleContains) parts.push(`title~"${titleContains}"`)
            if (slugContains)  parts.push(`slug~"${slugContains}"`)
            return parts.length > 0 ? `Advanced: ${parts.join(', ')}` : 'Advanced'
          }),
        // Filament-style QueryBuilder — composable runtime conditions.
        // Each row picks a constraint (column) + operator + value; the
        // tree JSON-encodes into a single URL key and AND-chains every
        // rule into the list query.
        QueryBuilderFilter.make('runtime')
          .label('Runtime filter')
          .constraints([
            TextConstraint.make('title').label('Title'),
            TextConstraint.make('slug').label('Slug'),
            SelectConstraint.make('status').label('Status').options([
              { value: 'draft',     label: 'Draft' },
              { value: 'published', label: 'Published' },
              { value: 'archived',  label: 'Archived' },
            ]),
            BooleanConstraint.make('featured').label('Featured'),
            DateConstraint.make('publishedAt').label('Published'),
            DateConstraint.make('createdAt').label('Created'),
            NumberConstraint.make('viewCount').label('View count'),
          ]),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      // Filament-style per-cell links → view page. Each data cell wraps
      // its content in `<a href>`; the row-actions cell stays unwrapped
      // so clicking an action only fires the action (no overlapping
      // row-level click handler).
      .recordUrl((r) => {
        const id = (r as { id?: string })?.id
        return id ? `/new-admin/articles/${id}` : undefined
      })
      // Tint archived rows so they read as de-emphasised. Server-side
      // per-row eval — Tailwind classes get appended onto the <tr>.
      .recordClasses((r) => {
        const status = (r as { status?: string })?.status
        if (status === 'archived') return 'opacity-60 italic'
        return undefined
      })
      .headerActions([
        ActionGroup.make('manage')
          .label('Manage')
          .icon('more-horizontal')
          .outlined()
          .actions([
            Action.make('archiveDrafts')
              .label('Archive all drafts')
              .confirm('Archive every draft article? This is reversible.')
              .handler(async () => {
                await prisma().article.updateMany({
                  where: { status: 'draft' },
                  data:  { status: 'archived' },
                })
              }),
            Action.make('clearFeatured')
              .label('Un-feature all')
              .handler(async () => {
                await prisma().article.updateMany({
                  where: { featured: true },
                  data:  { featured: false },
                })
              }),
          ]),
      ])
      .bulkActions([
        Action.make('markFeatured')
          .label('Mark featured')
          .color('success')
          .tooltip('Pin selected articles to the home feed')
          .confirm('Mark these articles as featured?')
          .handler(async (ctx) => {
            const ids = (ctx.records as { id?: string }[] | undefined)?.map(r => r.id).filter(Boolean) ?? []
            if (ids.length === 0) return
            await prisma().article.updateMany({
              where: { id: { in: ids } },
              data:  { featured: true },
            })
            return {
              notify: Notification.make(`${ids.length} article${ids.length === 1 ? '' : 's'} featured`)
                .body('They now appear in the home feed.')
                .success(),
            }
          }),
      ])
      .recordActions([
        Action.make('toggleFeatured')
          .label('Toggle featured')
          // Only show when article is published — drafts can't be featured.
          .visible(({ record }) => (record as { status?: string })?.status === 'published')
          .handler(async (ctx) => {
            const r = ctx.record as { id?: string; featured?: boolean } | undefined
            if (!r?.id) return
            await prisma().article.update({
              where: { id: r.id },
              data:  { featured: !r.featured },
            })
          }),
        Action.make('changeStatus')
          .label('Change status…')
          // Disable for archived articles — you have to restore first.
          .disabled(({ record }) => (record as { status?: string })?.status === 'archived')
          .modalHeading('Change article status')
          .modalDescription('Pick a new status. Empty publish date is fine.')
          .modalSubmitLabel('Save')
          .schema([
            SelectField.make('status').required().options([
              { value: 'draft',     label: 'Draft' },
              { value: 'published', label: 'Published' },
              { value: 'archived',  label: 'Archived' },
            ]),
            TextField.make('reason').label('Reason (optional)'),
          ])
          .handler(async (ctx) => {
            const r = ctx.record as { id?: string; title?: string } | undefined
            if (!r?.id) return
            const status = String(ctx.values?.['status'] ?? 'draft')
            await prisma().article.update({
              where: { id: r.id },
              data:  status === 'published'
                ? { status, publishedAt: new Date() }
                : { status },
            })
            return {
              notify: Notification.make(`Status updated`)
                .body(`"${r.title ?? 'Article'}" is now ${status}.`)
                .success(),
            }
          }),
      ])
  },
}
