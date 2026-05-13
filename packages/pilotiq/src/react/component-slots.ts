import type * as React from 'react'
import type { NavItem } from '../pageData.js'

/**
 * Props passed to a component registered at `Pilotiq.components({ nav })`.
 *
 * The component owns the entire nav region — for `SidebarLayout` that
 * means the `<SidebarContent>` body (the panel chrome's header / footer
 * still render); for `TopbarLayout` that means the `<nav>` element
 * between the brand cluster and the right-side controls.
 *
 * `navigation` is the pre-grouped, pre-sorted tree built by
 * `panelInfo()` — same shape the default renderers consume — so a
 * custom nav can opt into the framework's `navigationGroup` / `sort` /
 * badge metadata for free, or ignore it and walk a custom tree.
 */
export interface NavComponentProps {
  /**
   * Pre-grouped navigation items. May be empty when nothing the user
   * can access is registered. Items with `children` represent nested
   * sub-navigation (the default sidebar renders these under
   * `SidebarMenuSub`).
   */
  navigation: NavItem[]
  /** Panel base path (e.g. `/admin`). */
  basePath:   string
  /** Current request pathname — undefined when not in a request scope
   *  (e.g. unit-testing the layout standalone). */
  currentPath?: string
}

/**
 * Registry of build-time component overrides registered through
 * `Pilotiq.components({ nav, … })`. The Vite plugin harvests the
 * actual React refs into `pages/(pilotiq)/_components.ts` and forwards
 * them to `<AppShell>`; component refs never travel over the wire.
 *
 * v1 ships only `nav`. The shape is open-ended so additional slots
 * (`header`, `footer`, …) can land without a breaking change when a
 * concrete consumer asks for them.
 */
export interface ComponentSlotRegistry {
  nav?: React.ComponentType<NavComponentProps>
}

/**
 * Active-link match identical to the default sidebar's. Exported so
 * custom nav components can reuse the framework's longest-prefix
 * semantics: the dashboard URL (`basePath`) only matches on exact
 * equality — otherwise it would light up on every panel page — and
 * non-dashboard URLs match as a prefix followed by `/` or end-of-string
 * so `/admin/users` doesn't activate `/admin/user`.
 */
export function isNavItemActive(
  url:        string,
  currentPath: string | undefined,
  basePath:   string,
): boolean {
  if (!currentPath) return false
  if (url === basePath) return currentPath === basePath
  if (url === currentPath) return true
  return currentPath.startsWith(url + '/')
}
