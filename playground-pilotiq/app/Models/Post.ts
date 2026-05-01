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
}
