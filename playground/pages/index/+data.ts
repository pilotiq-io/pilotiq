import { app } from '@rudderjs/core'
import { AuthManager, Auth, runWithAuth } from '@rudderjs/auth'
import type { PageContextServer } from 'vike/types'

export type Data = Awaited<ReturnType<typeof data>>

export async function data(pageContext: PageContextServer) {
  const manager = app().make<AuthManager>('auth.manager')

  let user: Record<string, unknown> | null = null
  await runWithAuth(manager, async () => {
    const authUser = await Auth.user()
    if (authUser) {
      user = {
        id:    authUser.getAuthIdentifier(),
        name:  (authUser as unknown as Record<string, unknown>)['name'] ?? '',
        email: (authUser as unknown as Record<string, unknown>)['email'] ?? '',
        role:  (authUser as unknown as Record<string, unknown>)['role'] ?? 'user',
      }
    }
  })

  return {
    title: 'Pilotiq',
    user,
  }
}
