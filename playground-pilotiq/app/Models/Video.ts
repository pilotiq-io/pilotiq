import { Model } from '@rudderjs/orm'
import { Comment } from './Comment.js'

/**
 * Polymorphic follow-up demo — Video is a parent that owns Comments
 * via the same `commentable` polymorphic relation Post uses. Stored
 * discriminator: `'Video'` (the class name; no `morphAlias` override).
 */
export class Video extends Model {
  static override table = 'video'

  static override relations = {
    comments: {
      type:      'morphMany' as const,
      model:     () => Comment,
      morphName: 'commentable',
    },
  }

  id!:        string
  title!:     string
  url!:       string
  createdAt!: Date
  updatedAt!: Date
}
