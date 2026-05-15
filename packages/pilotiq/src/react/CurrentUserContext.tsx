import { createContext, useContext, type ReactNode } from 'react'

/**
 * Resolved identity of the user driving the current page. Mirrors the
 * `UserMenuMeta.user` shape that `panelInfo()` ships to the renderer —
 * whichever fields the `Pilotiq.user(req => …)` resolver populated.
 *
 * `null` is the no-user state: either the panel never wired a resolver,
 * or the resolver returned `null` for this request. Consumers should
 * gracefully fall back (no avatar, no presence label, etc.) rather than
 * treating absence as an error.
 */
export interface CurrentUser {
  name?:   string
  email?:  string
  avatar?: string
}

const CurrentUserContext = createContext<CurrentUser | null>(null)

/**
 * Mounted by `AppShell` around the layout-provider chain so plugins
 * (collab user presence, audit-trail attribution, analytics
 * client-side opt-outs, …) can read the active user via
 * `useCurrentUser()` without prop-drilling through `panel`.
 *
 * Value source is `viewProps.panel.userMenu?.user` — the same shape the
 * top-right dropdown renders. The provider sits OUTSIDE
 * `layoutProviderRegistry` so plugin-registered layout providers can
 * subscribe.
 */
export function CurrentUserProvider({
  value,
  children,
}: {
  value: CurrentUser | null
  children: ReactNode
}): ReactNode {
  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>
}

/**
 * Read the active user inside any descendant of `<AppShell>`. Returns
 * `null` outside an `AppShell` mount (defensive — keeps storybook /
 * isolated-render tests from throwing) and when no user resolved for
 * the request.
 */
export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext)
}
