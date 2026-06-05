import { ListPage, ListTab } from '@pilotiq/pilotiq'
import { Post } from '../../Models/Post.js'
import { PostResource } from './PostResource.js'

/**
 * Posts list with status tabs. `modifyQuery` scopes the table's query
 * per tab; badges show live counts (draft count tinted warning).
 *
 * Imports PostResource circularly (it references this class from
 * `pages()`) — safe because `getResource()` only dereferences the
 * binding at request time, long after both modules evaluated.
 */
export class ListPosts extends ListPage {
  static override getResource() {
    return PostResource
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
