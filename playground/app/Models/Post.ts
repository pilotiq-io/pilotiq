import { Model } from '@rudderjs/orm'
import { User } from './User.js'
import { Comment } from './Comment.js'
import { Tag } from './Tag.js'

export class Post extends Model.for<'post'>() {
  static override table = 'post'
  static override keyType = 'ulid' as const
  /** Plan #13 — opt the rudder side into soft-delete behavior. The
   *  matching `PostResource.softDeletes = true` opts pilotiq's
   *  TrashedFilter / Restore / ForceDelete UX in. Both flags are
   *  required (see `feedback_softdelete_two_sided_optin.md`). */
  static override softDeletes = true

  static override relations = {
    author:   { type: 'belongsTo' as const, model: () => User, foreignKey: 'authorId' },
    // Polymorphic follow-up — Post owns Comments via the
    // `commentable` morph (parent side). Reads compose as
    // `post.related('comments')` → Comment.where(commentableId, post.id)
    //                                      .where(commentableType, 'Post')`.
    comments: { type: 'morphMany' as const, model: () => Comment, morphName: 'commentable' },
    // Polymorphic M2M follow-up — Post owns Tags via the shared
    // `taggable` pivot (taggableId + taggableType). Reads + writes
    // flow through `post.related('tags').{paginate, attach, detach}`;
    // the ORM stamps + filters `taggableType = 'Post'` automatically.
    // Pivot table is shared with Video (both `morphToMany Tag`).
    tags:     { type: 'morphToMany' as const, model: () => Tag, pivotTable: 'taggable', morphName: 'taggable' },
  }

  /** Reorderable rows — pilotiq's `Table.reorderable('sort')` POSTs the
   * new id order here. We re-stamp the `sort` column 1..n in array
   * order. A real app should run this inside a transaction and drop
   * any unknown ids; the demo keeps it simple. */
  static async reorder(ids: Array<string | number>): Promise<void> {
    await Promise.all(ids.map((id, i) =>
      Post.update(id, { sort: i + 1 } as Partial<Post>),
    ))
  }
}
