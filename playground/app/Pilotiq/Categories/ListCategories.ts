import { Action, ListPage, type ResourceClass } from '@pilotiq/pilotiq'
import { CategoryResource } from './CategoryResource.js'

/**
 * URL-bearing actions live here (not in `CategoryResource.table()`)
 * because the hooks receive the requesting panel's basePath — the
 * resource is registered on both /admin and /guest.
 */
export class ListCategories extends ListPage {
  static override getResource() {
    return CategoryResource
  }

  static override getHeaderActions(_R: ResourceClass, basePath: string): Action[] {
    return [Action.create(CategoryResource, basePath)]
  }

  static override getRowActions(_R: ResourceClass, basePath: string): Action[] {
    return [
      Action.edit  (CategoryResource, basePath),
      Action.delete(CategoryResource, basePath),
    ]
  }
}
