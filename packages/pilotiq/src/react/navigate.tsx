import { createContext, useContext, type ReactNode } from 'react'

export type NavigateFn = (url: string) => void | Promise<void>

const NavigateContext = createContext<NavigateFn | null>(null)

/**
 * Provides an SPA navigation function to pilotiq components — `FilterSelect`
 * uses it so changing a filter doesn't full-reload the page (the surrounding
 * `<FilterPopover>` would unmount on reload, defeating "stay open across
 * filter changes").
 *
 * The auto-generated Vike `+Layout.tsx` wires this with `navigate` from
 * `vike/client/router`. Pilotiq itself does NOT import vike — keeps the
 * package framework-agnostic for future non-vike consumers.
 */
export function NavigateProvider({
  navigate,
  children,
}: {
  navigate: NavigateFn
  children: ReactNode
}) {
  return <NavigateContext.Provider value={navigate}>{children}</NavigateContext.Provider>
}

/**
 * Returns a navigate fn. Falls back to `window.location.href = url` (full
 * reload) when no provider is mounted, so callers don't have to branch.
 */
export function useNavigate(): NavigateFn {
  const ctx = useContext(NavigateContext)
  if (ctx) return ctx
  return (url: string) => {
    if (typeof window !== 'undefined') window.location.href = url
  }
}
