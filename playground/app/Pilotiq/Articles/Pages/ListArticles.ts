import { ListPage, Action, ListTab, Heading } from '@pilotiq/pilotiq'
import { Article } from '../../../Models/Article.js'
import { ArticleResource } from '../ArticleResource.js'

export class ListArticles extends ListPage {
  static override getResource() { return ArticleResource }

  // Page header: the single page title + a subheading (Filament-style).
  // The table no longer carries its own heading, so this is the only
  // "Articles" title on the page.
  static override getHeader(R: typeof ArticleResource) {
    return [
      Heading.make(R.label)
        .level(1)
        .description('Manage published content, drafts, and archived posts.'),
    ]
  }

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
        .badge(async () => Article.where('status', 'draft').count())
        .modifyQuery((q: any) => q.where('status', 'draft')),
      ListTab.make('published')
        .label('Published')
        .badgeColor('success')
        .badge(async () => Article.where('status', 'published').count())
        .modifyQuery((q: any) => q.where('status', 'published')),
      ListTab.make('archived')
        .label('Archived')
        .badge(async () => Article.where('status', 'archived').count())
        .modifyQuery((q: any) => q.where('status', 'archived')),
    ]
  }
}
