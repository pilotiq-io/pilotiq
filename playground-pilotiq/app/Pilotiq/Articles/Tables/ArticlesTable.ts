import { Column, Action, SelectFilter, BooleanFilter, TextField, SelectField, type Table } from '@pilotiq/pilotiq'
import { app } from '@rudderjs/core'

const prisma = (): any => app().make('prisma')

export const ArticlesTable = {
  configure(table: Table): Table {
    return table
      .columns([
        Column.make('title').label('Title').sortable().searchable(),
        Column.make('slug').label('Slug').searchable(),
        Column.make('status').label('Status').sortable(),
        Column.make('featured').label('Featured').sortable(),
        Column.make('publishedAt').label('Published').sortable(),
        Column.make('createdAt').label('Created').sortable(),
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
      .bulkActions([
        Action.make('markFeatured')
          .label('Mark featured')
          .confirm('Mark these articles as featured?')
          .handler(async (ctx) => {
            const ids = (ctx.records as { id?: string }[] | undefined)?.map(r => r.id).filter(Boolean) ?? []
            if (ids.length === 0) return
            await prisma().article.updateMany({
              where: { id: { in: ids } },
              data:  { featured: true },
            })
          }),
      ])
      .recordActions([
        Action.make('toggleFeatured')
          .label('Toggle featured')
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
            const r = ctx.record as { id?: string } | undefined
            if (!r?.id) return
            const status = String(ctx.values?.['status'] ?? 'draft')
            await prisma().article.update({
              where: { id: r.id },
              data:  status === 'published'
                ? { status, publishedAt: new Date() }
                : { status },
            })
          }),
      ])
  },
}
