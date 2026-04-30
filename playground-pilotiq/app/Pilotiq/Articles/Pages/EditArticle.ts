import { EditPage } from '@pilotiq/pilotiq'
import { ArticleResource } from '../ArticleResource.js'

export class EditArticle extends EditPage {
  static override getResource() { return ArticleResource }

  // Stamp the edit timestamp before persisting so it picks up the latest
  // save and not whatever was in the form payload.
  static override beforeUpdate = async (data: Record<string, unknown>) => {
    data['updatedAt'] = new Date()
  }

  // Custom toast wording — overrides the framework default of "Article saved".
  static override getSavedNotificationTitle() {
    return 'Article updated'
  }

  // Stay on the edit page after save instead of redirecting to the list.
  static override getRedirectUrl = (record: unknown) => {
    const id = (record as { id?: unknown }).id
    return id !== undefined ? `articles/${String(id)}/edit` : 'articles'
  }
}
