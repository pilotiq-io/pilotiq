import {
  RelationManager, Column, Action,
  TextField,
  Heading, Text, Section,
  type Form, type Table,
  type RelationManagerContext,
} from '@pilotiq/pilotiq'
import { ReplyResource } from '../../Replies/ReplyResource.js'

/**
 * Phase B nested-resources demo — `Comment` owns `Reply` rows. Mounts
 * at `/new-admin/posts/:postId/comments/:commentId/replies` once
 * `PostsCommentsManager.relations()` returns `[CommentRepliesManager]`.
 *
 * Three-layer auth applies automatically:
 *   - PostResource.canAccess + canEdit (gates the post)
 *   - PostsCommentsManager.canView(comment, post) (gates drilling in)
 *   - CommentRepliesManager.canViewAny / canCreate / canEdit / canDelete
 *
 * Same `Action.relation*` factories you'd use on a depth-1 manager;
 * the pilotiq core picks up the chain from `ctx.chain` and prepends
 * the outer `posts/:postId/comments/` segment to each generated URL.
 */
export class CommentRepliesManager extends RelationManager {
  static override relationship         = 'replies'
  static override label                = 'Replies'
  static override labelSingular        = 'Reply'
  static override icon                 = 'corner-down-right'
  static override recordTitleAttribute = 'body'
  // Set explicitly so the manager doesn't require a top-level
  // ReplyResource registration on the admin panel — replies are only
  // reachable through this nested URL space.
  static override relatedResource      = ReplyResource

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('body').required().placeholder('Write a reply…'),
    ])
  }

  static override detail(record: unknown, parentRecord: unknown) {
    const r = (record ?? {}) as { body?: string; createdAt?: string }
    const c = (parentRecord ?? {}) as { body?: string }
    return [
      Heading.make('Reply'),
      Section.make().schema([
        Text.make(r.body ?? '').size('base'),
        Text.make(c.body ? `On comment: “${c.body}”` : '').size('xs').color('muted'),
      ]),
    ]
  }

  static override table(table: Table, ctx: RelationManagerContext): Table {
    return table
      .columns([
        Column.make('body').limit(80).weight('semibold'),
        Column.make('createdAt').sortable().since(),
      ])
      .recordUrl((r) => {
        const id = (r as { id?: string })?.id
        // Build the depth-2 view URL by reading the chain off ctx.
        // Equivalent to:
        //   `${basePath}/${parentSlug}/${chain[0].recordId}/${chain[0].relationship}/${parentId}/${relationship}/${id}`
        if (!id) return undefined
        const head = `${ctx.basePath}/${ctx.parentSlug}`
        let mid = ''
        for (const step of ctx.chain ?? []) {
          mid += `/${step.recordId}/${step.relationship}`
        }
        return `${head}${mid}/${ctx.parentId}/${ctx.relationship}/${id}`
      })
      .headerActions([
        Action.relationCreate(CommentRepliesManager, ctx),
      ])
      .recordActions([
        Action.relationEdit  (CommentRepliesManager, ctx),
        Action.relationDelete(CommentRepliesManager, ctx),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .emptyState({
        heading:     'No replies yet',
        description: 'Be the first to reply to this comment.',
      })
  }
}

