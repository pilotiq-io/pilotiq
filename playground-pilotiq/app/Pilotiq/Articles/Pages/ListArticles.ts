import { ListPage, Action } from '@pilotiq/pilotiq'
import { ArticleResource } from '../ArticleResource.js'

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
}
