import { ViewPage } from '@pilotiq/pilotiq'
import { ArticleResource } from '../ArticleResource.js'

export class ViewArticle extends ViewPage {
  static override getResource() { return ArticleResource }
}
