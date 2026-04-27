import { Column, Action, SelectFilter, BooleanFilter, type Table } from '@pilotiq/pilotiq'
import { app } from '@rudderjs/core'

const prisma = (): any => app().make('prisma')

export const ArticlesTable = {
  configure(table: Table): Table {
    return table
      .columns([
        Column.make('title').label('Title').sortable().searchable(),
        Column.make('slug').label('Slug').searchable(),
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
      .actions([
        Action.make('markFeatured')
          .label('Mark featured')
          .bulk()
          .confirm('Mark these articles as featured?')
          .handler(async (ctx) => {
            const ids = (ctx.records as { id?: string }[] | undefined)?.map(r => r.id).filter(Boolean) ?? []
            if (ids.length === 0) return
            await prisma().article.updateMany({
              where: { id: { in: ids } },
              data:  { featured: true },
            })
          }),
        Action.make('toggleFeatured')
          .label('Toggle featured')
          .row()
          .handler(async (ctx) => {
            const r = ctx.record as { id?: string; featured?: boolean } | undefined
            if (!r?.id) return
            await prisma().article.update({
              where: { id: r.id },
              data:  { featured: !r.featured },
            })
          }),
      ])
  },
}
