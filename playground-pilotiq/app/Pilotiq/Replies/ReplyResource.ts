import { Resource, type Form, TextField } from '@pilotiq/pilotiq'
import { Reply } from '../../Models/Reply.js'

/**
 * Phase B nested-resources demo — `Reply` is reachable only via the
 * nested manager URL (`/new-admin/posts/:postId/comments/:commentId/replies/...`),
 * so this Resource is intentionally NOT registered on the admin panel.
 * It exists so `CommentRepliesManager.relatedResource` can point at a
 * concrete Resource class — the chain walker uses it for form auto-wire
 * (loadRecord / save) plus URL generation against the related slug.
 */
export class ReplyResource extends Resource {
  static override label         = 'Replies'
  static override labelSingular = 'Reply'
  static override slug          = 'replies'
  static override get model() { return Reply }

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('body').required(),
    ])
  }
}
