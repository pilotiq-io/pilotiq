import { ListPage, Action, ListTab } from '@pilotiq/pilotiq'
import { app } from '@rudderjs/core'
import { ArticleResource } from '../ArticleResource.js'

const prisma = (): any => app().make('prisma')

export class ListArticles extends ListPage {
  static override getResource() { return ArticleResource }

  // Filament-style explicit row + header actions. Pilotiq's defaults
  // for these are `[]` — opt in here so the table shows New / Edit / Delete.
  static override getHeaderActions(R: typeof ArticleResource, basePath: string) {
    return [Action.create(R, basePath)]
  }

  static override getRowActions(R: typeof ArticleResource, basePath: string) {
    return [
      Action.edit(R, basePath),
      Action.delete(R, basePath),
    ]
  }

  // Filament-style query-shortcut tabs above the table. Each tab narrows
  // the underlying ORM query via `modifyQuery` and shows a server-counted
  // badge. URL persistence via `?tab=name` — switching tabs SPA-navigates.
  static override getTabs() {
    return [
      ListTab.make('all').label('All'),
      ListTab.make('drafts')
        .label('Drafts')
        .badgeColor('warning')
        .badge(async () => prisma().article.count({ where: { status: 'draft' } }))
        .modifyQuery((q: any) => q.where('status', 'draft')),
      ListTab.make('published')
        .label('Published')
        .badgeColor('success')
        .badge(async () => prisma().article.count({ where: { status: 'published' } }))
        .modifyQuery((q: any) => q.where('status', 'published')),
      ListTab.make('archived')
        .label('Archived')
        .badge(async () => prisma().article.count({ where: { status: 'archived' } }))
        .modifyQuery((q: any) => q.where('status', 'archived')),
    ]
  }
}
