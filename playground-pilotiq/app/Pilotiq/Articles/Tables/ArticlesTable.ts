import {
  Column, BadgeColumn, BooleanColumn,
  Action, ActionGroup,
  SelectFilter, BooleanFilter,
  TextField, SelectField,
  Notification,
  type Table,
} from '@pilotiq/pilotiq'
import { app } from '@rudderjs/core'

const prisma = (): any => app().make('prisma')

export const ArticlesTable = {
  configure(table: Table): Table {
    return table
      .heading('Articles')
      .description('Manage published content, drafts, and archived posts.')
      .striped()
      .emptyState({
        heading:     'No articles yet',
        description: 'Create your first article to get started.',
        icon:        'inbox',
      })
      .columns([
        Column.make('title').label('Title').sortable().searchable().weight('semibold'),
        Column.make('slug').label('Slug').searchable().color('muted').lineClamp(1),
        BadgeColumn.make('status').label('Status').sortable().colors({
          draft:     'gray',
          published: 'success',
          archived:  'warning',
        }),
        BooleanColumn.make('featured').label('Featured').sortable().alignment('center'),
        Column.make('publishedAt').label('Published').sortable().dateTime(),
        Column.make('createdAt').label('Created').sortable().since(),
      ])
      .filters([
        SelectFilter.make('status').options([
          { value: 'draft',     label: 'Draft' },
          { value: 'published', label: 'Published' },
          { value: 'archived',  label: 'Archived' },
        ]),
        BooleanFilter.make('featured').label('Featured'),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
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
