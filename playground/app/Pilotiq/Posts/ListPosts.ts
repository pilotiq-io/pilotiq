import { Action, ListPage, ListTab, type ResourceClass } from '@pilotiq/pilotiq'
import { Post } from '../../Models/Post.js'
import { PostResource } from './PostResource.js'

/**
 * Posts list with status tabs. `modifyQuery` scopes the table's query
 * per tab; badges show live counts (draft count tinted warning).
 *
 * Imports PostResource circularly (it references this class from
 * `pages()`) — safe because `getResource()` only dereferences the
 * binding at request time, long after both modules evaluated.
 *
 * URL-bearing actions live HERE (not in `PostResource.table()`) because
 * the hooks receive the requesting panel's `basePath` — the resource is
 * registered on both /admin and /guest, so a hardcoded base would point
 * one panel's rows at the other. The `publish` handler action stays in
 * `table()` (no URL baked in — routes stamp its dispatchUrl per panel).
 */
export class ListPosts extends ListPage {
  static override getResource() {
    return PostResource
  }

  static override getHeaderActions(_R: ResourceClass, basePath: string): Action[] {
    return [Action.create(PostResource, basePath)]
  }

  static override getRowActions(_R: ResourceClass, basePath: string): Action[] {
    return [
      Action.edit       (PostResource, basePath),
      Action.delete     (PostResource, basePath),
      Action.restore    (PostResource, basePath),
      Action.forceDelete(PostResource, basePath),
    ]
  }

  static override getBulkActions(_R: ResourceClass, basePath: string): Action[] {
    return [
      Action.bulkDelete     (PostResource, basePath),
      Action.bulkRestore    (PostResource, basePath),
      Action.bulkForceDelete(PostResource, basePath),
    ]
  }

  static override getTabs() {
    return [
      ListTab.make('all').label('All').default(),
      ListTab.make('draft')
        .label('Drafts')
        .badge(async () => {
          const n = await Post.where('status', 'draft').count()
          return n > 0 ? String(n) : undefined
        })
        .badgeColor('warning')
        .modifyQuery((q) => q.where('status', 'draft')),
      ListTab.make('published')
        .label('Published')
        .modifyQuery((q) => q.where('status', 'published')),
      ListTab.make('archived')
        .label('Archived')
        .modifyQuery((q) => q.where('status', 'archived')),
    ]
  }
}
