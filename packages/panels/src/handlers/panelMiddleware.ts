import type { MiddlewareHandler } from '@rudderjs/core'
import type { Panel } from '../Panel.js'
import type { PanelContext, PanelUser } from '../types.js'
import { asAuth } from './types.js'

interface AuthManagerLike {
  guard(name?: string): {
    user(): Promise<({ getAuthIdentifier(): string } & Record<string, unknown>) | null>
  }
}

interface CoreModule {
  app(): { make(key: string): unknown }
}

export function buildPanelMiddleware(panel: Panel): MiddlewareHandler[] {
  const guard = panel.getGuard()
  if (!guard) return []

  const mw: MiddlewareHandler = async (req, res, next) => {
    // Resolve the authenticated user.
    // Check __rjs_user (set by AuthMiddleware), then fall back to DI auth manager.
    const auth = asAuth(req)
    const rawUser = (auth.raw as Record<string, unknown> | undefined)?.['__rjs_user'] as PanelUser | undefined
    let user: PanelUser | undefined = rawUser ?? auth.user
    if (!user) {
      try {
        const core = await import('@rudderjs/core') as unknown as CoreModule
        const manager = core.app().make('auth.manager') as AuthManagerLike
        const authUser = await manager.guard().user()
        if (authUser) {
          const fields = Object.fromEntries(
            Object.entries(authUser as Record<string, unknown>)
              .filter(([_k, v]) => typeof v !== 'function'),
          ) as Record<string, unknown>
          delete fields['password']
          user = {
            id:    authUser.getAuthIdentifier(),
            name:  String((authUser as Record<string, unknown>)['name'] ?? ''),
            email: String((authUser as Record<string, unknown>)['email'] ?? ''),
            ...fields,
          }
        }
      } catch {
        // auth not configured
      }
    }

    const ctx: PanelContext = {
      user,
      headers: req.headers as Record<string, string>,
      path:    req.path,
      params:  {},
    }
    const allowed = await guard(ctx)
    if (!allowed) {
      return res.status(401).json({ message: 'Unauthorized.' })
    }
    await next()
  }

  return [mw]
}
