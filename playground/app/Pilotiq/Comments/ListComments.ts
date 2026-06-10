import { Action, ListPage, type ResourceClass } from '@pilotiq/pilotiq'
import { CommentResource } from './CommentResource.js'

/**
 * URL-bearing actions live here (not in `CommentResource.table()`)
 * because the hooks receive the requesting panel's basePath — the
 * resource is registered on both /admin and /guest. No Create header
 * action: comments are authored from the post's Comments tab; this
 * list is moderation-only.
 */
export class ListComments extends ListPage {
  static override getResource() {
    return CommentResource
  }

  static override getRowActions(_R: ResourceClass, basePath: string): Action[] {
    return [
      Action.edit  (CommentResource, basePath),
      Action.delete(CommentResource, basePath),
    ]
  }

  static override getBulkActions(_R: ResourceClass, basePath: string): Action[] {
    return [Action.bulkDelete(CommentResource, basePath)]
  }
}
