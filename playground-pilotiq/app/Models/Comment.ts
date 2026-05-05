import { Model } from '@rudderjs/orm'
import { Post } from './Post.js'
import { Video } from './Video.js'
import { Reply } from './Reply.js'

/**
 * Polymorphic follow-up demo — `Comment.commentable` is a `morphTo`
 * pointing at a closed list of allowed parent classes (Post + Video).
 * The persisted discriminator in `commentableType` is each class's
 * `morphAlias ?? name` — we let it default to the JS class names here.
 *
 * camelCase columns (`commentableId` / `commentableType`) are the rudder
 * ORM convention — a deliberate divergence from Laravel's snake_case.
 *
 * Phase B nested-resources demo — `replies` is a hasMany pointing at
 * the new `Reply` model. The pilotiq side wires this up via
 * `PostsCommentsManager.relations() = [CommentRepliesManager]` so the
 * URL `posts/:postId/comments/:commentId/replies` mounts.
 */
export class Comment extends Model {
  static override table = 'comment'

  static override relations = {
    commentable: {
      type:      'morphTo' as const,
      morphName: 'commentable',
      types:     () => [Post, Video],
    },
    replies: { type: 'hasMany' as const, model: () => Reply, foreignKey: 'commentId' },
  }

  id!:              string
  body!:            string
  commentableId!:   string
  commentableType!: string
  createdAt!:       Date
  updatedAt!:       Date
}
