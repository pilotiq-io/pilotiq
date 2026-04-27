import { ListPage } from '@pilotiq/pilotiq'
import { ArticleResource } from '../ArticleResource.js'

export class ListArticles extends ListPage {
  static override getResource() { return ArticleResource }
}
