import { Action, ListPage, type ResourceClass } from '@pilotiq/pilotiq'
import { UserResource } from './UserResource.js'

/**
 * URL-bearing actions live here (not in `UserResource.table()`) because
 * the hooks receive the requesting panel's basePath. Users only appear
 * on /admin today, but the hook keeps the resource panel-portable.
 */
export class ListUsers extends ListPage {
  static override getResource() {
    return UserResource
  }

  static override getHeaderActions(_R: ResourceClass, basePath: string): Action[] {
    return [Action.create(UserResource, basePath)]
  }

  static override getRowActions(_R: ResourceClass, basePath: string): Action[] {
    return [
      Action.edit  (UserResource, basePath),
      Action.delete(UserResource, basePath),
    ]
  }
}
