import { ViewPage, Action } from '@pilotiq/pilotiq'
import { ArticleResource } from '../ArticleResource.js'

export class ViewArticle extends ViewPage {
  static override getResource() { return ArticleResource }

  // Edit / Delete shown above the detail content. Pass `recordId` to
  // bake the URL at config time (view-page context).
  static override getActions(R: typeof ArticleResource, recordId: string | undefined, basePath: string) {
    if (!recordId) return []
    return [
      Action.edit(R, basePath, recordId),
      Action.delete(R, basePath, recordId),
    ]
  }
}
