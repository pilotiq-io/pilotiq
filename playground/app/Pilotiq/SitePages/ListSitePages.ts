import { Action, ListPage, type ResourceClass } from '@pilotiq/pilotiq'
import { PageResource } from './PageResource.js'

/**
 * URL-bearing actions live here (not in `PageResource.table()`)
 * because the hooks receive the requesting panel's basePath — the
 * resource is registered on both /admin and /guest. Named ListSitePages
 * (not ListPages) to keep visual distance from the ListPage base class.
 */
export class ListSitePages extends ListPage {
  static override getResource() {
    return PageResource
  }

  static override getHeaderActions(_R: ResourceClass, basePath: string): Action[] {
    return [Action.create(PageResource, basePath)]
  }

  static override getRowActions(_R: ResourceClass, basePath: string): Action[] {
    return [
      Action.edit  (PageResource, basePath),
      Action.delete(PageResource, basePath),
    ]
  }
}
