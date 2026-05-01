import { Model } from '@rudderjs/orm'
import { User } from './User.js'

export class Post extends Model {
  static override table = 'post'
  /** Plan #13 — opt the rudder side into soft-delete behavior. The
   *  matching `PostResource.softDeletes = true` opts pilotiq's
   *  TrashedFilter / Restore / ForceDelete UX in. Both flags are
   *  required (see `feedback_softdelete_two_sided_optin.md`). */
  static override softDeletes = true

  static override relations = {
    author: { type: 'belongsTo' as const, model: () => User, foreignKey: 'authorId' },
  }

  id!:          string
  title!:       string
  body!:        string | null
  status!:      string
  authorId!:    string
  publishedAt!: Date | null
  createdAt!:   Date
  updatedAt!:   Date
  deletedAt!:   Date | null
  sort!:        number

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
