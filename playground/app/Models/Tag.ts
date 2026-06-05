import { Model } from '@rudderjs/orm'

/**
 * M2M demo target — paired with Article via an explicit `article_tag`
 * pivot (`belongsToMany`) AND with Post / Video via the shared
 * `taggable` polymorphic pivot (`morphedByMany` — inverse polymorphic
 * side).
 *
 * Per-class declarations on the inverse side: `morphedByMany` targets
 * ONE concrete inverse class per relation key, so we declare `posts`
 * and `videos` separately rather than walking a polymorphic types list.
 * Both share the same `taggable` pivot — the ORM filters by
 * `taggableType` so reads + writes are scoped to the matching class
 * automatically.
 */
import { Post } from './Post.js'
import { Video } from './Video.js'

export class Tag extends Model.for<'tag'>() {
  static override table = 'tag'
  static override keyType = 'ulid' as const

  static override relations = {
    posts: {
      type:       'morphedByMany' as const,
      model:      () => Post,
      pivotTable: 'taggable',
      morphName:  'taggable',
    },
    videos: {
      type:       'morphedByMany' as const,
      model:      () => Video,
      pivotTable: 'taggable',
      morphName:  'taggable',
    },
  }
}
