import { Model } from '@rudderjs/orm'
import { Comment } from './Comment.js'
import { Tag } from './Tag.js'

/**
 * Polymorphic follow-up demo — Video is a parent that owns Comments
 * via the same `commentable` polymorphic relation Post uses. Stored
 * discriminator: `'Video'` (the class name; no `morphAlias` override).
 *
 * Polymorphic M2M follow-up — Video also owns Tags via the shared
 * `taggable` pivot (parallel to `Post.tags`). The ORM stamps
 * `taggableType = 'Video'` so a single `Tag` row can attach to either
 * a Post or a Video.
 */
export class Video extends Model {
  static override table = 'video'

  static override relations = {
    comments: {
      type:      'morphMany' as const,
      model:     () => Comment,
      morphName: 'commentable',
    },
    tags: {
      type:       'morphToMany' as const,
      model:      () => Tag,
      pivotTable: 'taggable',
      morphName:  'taggable',
    },
  }

  id!:        string
  title!:     string
  url!:       string
  createdAt!: Date
  updatedAt!: Date
}
