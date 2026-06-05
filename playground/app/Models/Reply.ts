import { Model } from '@rudderjs/orm'

/**
 * Phase B nested-resources demo — replies sit one URL layer deeper than
 * comments. `Comment.relations.replies` (hasMany) is what the chain
 * walker reads at depth 2; this model itself stays plain since replies
 * have no further relations.
 */
export class Reply extends Model.for<'reply'>() {
  static override table = 'reply'
  static override keyType = 'ulid' as const
}
