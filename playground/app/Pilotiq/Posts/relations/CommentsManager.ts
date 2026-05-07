import {
  RelationManager, Column, Action,
  TextField,
  Heading, Text, Section,
  type Form, type Table,
  type RelationManagerContext,
} from '@pilotiq/pilotiq'
import { CommentResource } from '../../Comments/CommentResource.js'
import { CommentRepliesManager } from '../../Comments/relations/RepliesManager.js'

/**
 * Polymorphic follow-up demo — `Post → Comments` (morphMany) manager.
 *
 * Mode auto-detected as `'morphMany'` from `Post.relations.comments.type`.
 * The relation-create POST handler auto-injects `commentableId` +
 * `commentableType` on save, so the form schema can stay clean — no
 * `mutateDataBeforeCreate` shim needed (compare with `PostsManager`
 * which manually defaults `authorId` for its hasMany relation).
 *
 * Reused verbatim by `VideoResource` for the second polymorphic parent.
 */
export class PostsCommentsManager extends RelationManager {
  static override relationship         = 'comments'
  static override label                = 'Comments'
  static override labelSingular        = 'Comment'
  static override icon                 = 'message-square'
  static override recordTitleAttribute = 'body'
  // Manager-level pointer to the related Resource. morphTo (child side)
  // can't auto-discover but morphMany / morphOne always can — this is
  // explicit here because PostsCommentsManager and VideosCommentsManager
  // share the same Comment Resource and both routes need to find it.
  static override relatedResource      = CommentResource

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('body').required().placeholder('Write a comment…'),
    ])
    // No `mutateDataBeforeCreate` — the morphMany route auto-injects
    // commentableId + commentableType from the parent record.
  }

  /**
   * Phase B nested-resources — declare a child manager. The depth-2 URL
   * `posts/:postId/comments/:commentId/replies` mounts automatically;
   * the depth-2 view page (`/posts/:postId/comments/:commentId`) gets a
   * sibling tab strip linking into each declared nested manager.
   */
  static override relations() { return [CommentRepliesManager] }

  // Phase A — read-only detail page for one comment under its parent.
  // Lands at `/new-admin/posts/:postId/comments/:commentId`. Default is
  // an empty `[]`; overriding it surfaces any chrome the manager wants
  // around the child record without leaving the parent's URL space.
  static override detail(record: unknown, parentRecord: unknown) {
    const c = (record ?? {}) as { body?: string; createdAt?: string }
    const p = (parentRecord ?? {}) as { title?: string }
    return [
      Heading.make(`Comment on “${p.title ?? 'post'}”`),
      Section.make().schema([
        Text.make(c.body ?? '').size('base'),
        Text.make(c.createdAt ? new Date(c.createdAt).toLocaleString() : '').size('xs').color('muted'),
      ]),
    ]
  }

  static override table(table: Table, ctx: RelationManagerContext): Table {
    return table
      .columns([
        Column.make('body').limit(80).weight('semibold'),
        Column.make('createdAt').sortable().since(),
      ])
      // Phase A — point clicks at the nested view route under this
      // parent (`{base}/{parentSlug}/{parentId}/{rel}/{childId}`)
      // instead of the standalone CommentResource view, so the user
      // keeps the post's breadcrumb / RelationTabs context.
      .recordUrl((r) => {
        const id = (r as { id?: string })?.id
        return id ? `${ctx.basePath}/${ctx.parentSlug}/${ctx.parentId}/${ctx.relationship}/${id}` : undefined
      })
      .headerActions([
        Action.relationCreate(PostsCommentsManager, ctx),
      ])
      .recordActions([
        Action.relationEdit  (PostsCommentsManager, ctx),
        Action.relationDelete(PostsCommentsManager, ctx),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .emptyState({
        heading:     'No comments yet',
        description: 'Be the first to comment on this post.',
      })
  }
}
