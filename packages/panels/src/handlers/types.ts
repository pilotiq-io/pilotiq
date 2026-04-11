import type { AppRequest, AppResponse, MiddlewareHandler } from '@rudderjs/core'
import type { PanelUser } from '../types.js'

export type RouteHandler = (req: AppRequest, res: AppResponse) => unknown | Promise<unknown>

export interface RouterLike {
  get(path: string, handler: RouteHandler, mw?: MiddlewareHandler[]): void
  post(path: string, handler: RouteHandler, mw?: MiddlewareHandler[]): void
  put(path: string, handler: RouteHandler, mw?: MiddlewareHandler[]): void
  delete(path: string, handler: RouteHandler, mw?: MiddlewareHandler[]): void
}

/**
 * Session shape used by panels handlers (`persist: 'session'` tabs/forms).
 * The framework's session manager exposes more methods, but panels only
 * needs `put`.
 */
export interface SessionLike {
  get?(key: string): unknown
  put(key: string, value: unknown): void
}

/**
 * `AppRequest` augmented with the auth + session fields the panels
 * handlers read at runtime. These are populated by the rudderjs auth
 * middleware and session middleware respectively — both optional, so
 * both fields are optional here too.
 */
export interface AuthenticatedRequest extends AppRequest {
  user?:    PanelUser
  session?: SessionLike
}

/** Cast helper — narrows an `AppRequest` to its panels-aware shape. */
export function asAuth(req: AppRequest): AuthenticatedRequest {
  return req as AuthenticatedRequest
}
