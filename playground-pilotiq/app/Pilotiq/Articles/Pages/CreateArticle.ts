import { CreatePage } from '@pilotiq/pilotiq'
import { ArticleResource } from '../ArticleResource.js'

export class CreateArticle extends CreatePage {
  static override getResource() { return ArticleResource }
}
