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
 * Props passed to a component registered at `Pilotiq.components({ header })`.
 *
 * The component owns the entire `<header>` chrome bar — in `SidebarLayout`
 * that's the top bar above the main content (sidebar trigger, search,
 * theme toggle, bell, user menu); in `TopbarLayout` that's the *whole*
 * topbar including the brand cluster and the nav region. Setting `header`
 * on `TopbarLayout` makes the `nav` slot irrelevant for that layout —
 * the consumer's header owns everything between page edges.
 *
 * Render hooks that splice INSIDE the default header
 * (`panels::topbar.start`, `panels::topbar.end`, `panels::user-menu.before`,
 * `panels::user-menu.after`) don't fire when the header is replaced —
 * the surrounding container is gone, so there's nowhere to splice into.
 * Hooks rooted outside the header (`panels::sidebar.start` / `.footer`,
 * `panels::sidebar.nav.start` / `.end`, `panels::footer`) keep firing.
 *
 * Shape mirrors `NavComponentProps` so a header that wants to render
 * the nav inline (the TopbarLayout case) can do so without juggling a
 * second slot.
 */
export interface HeaderComponentProps {
  /**
   * Pre-grouped navigation items — same tree the `nav` slot receives.
   * Header consumers that want to mount the topbar nav inline read
   * this; sidebar-layout consumers can ignore it.
   */
  navigation: NavItem[]
  /** Panel base path (e.g. `/admin`). */
  basePath:   string
  /** Current request pathname — undefined when not in a request scope. */
  currentPath?: string
}

/**
 * Props passed to a component registered at `Pilotiq.components({ footer })`.
 *
 * The component mounts as a `<footer>` element BELOW the main content
 * area — outside the scrolling region in both layouts. It is a separate
 * surface from the `panels::footer` render hook, which continues to
 * fire INSIDE the main content area (use the hook to append per-page
 * trailing chrome; use this slot for site-chrome that frames every
 * page like a status bar or copyright row).
 */
export interface FooterComponentProps {
  /** Panel base path (e.g. `/admin`). */
  basePath:   string
  /** Current request pathname — undefined when not in a request scope. */
  currentPath?: string
}

/**
 * Registry of build-time component overrides registered through
 * `Pilotiq.components({ nav, header, footer, … })`. The Vite plugin
 * harvests the actual React refs into `pages/(pilotiq)/_components.ts`
 * and forwards them to `<AppShell>`; component refs never travel over
 * the wire.
 *
 * The shape is open-ended so additional slots can land without a
 * breaking change when a concrete consumer asks for them.
 */
export interface ComponentSlotRegistry {
  nav?:    React.ComponentType<NavComponentProps>
  header?: React.ComponentType<HeaderComponentProps>
  footer?: React.ComponentType<FooterComponentProps>
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
