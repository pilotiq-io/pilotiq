import { EditPage } from '@pilotiq/pilotiq'
import { ArticleResource } from '../ArticleResource.js'

export class EditArticle extends EditPage {
  static override getResource() { return ArticleResource }
}
