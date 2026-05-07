import React, { useState } from 'react'
import { SidebarLayout } from './layouts/SidebarLayout.js'
import { TopbarLayout } from './layouts/TopbarLayout.js'
import { ToasterProvider } from './Toaster.js'
import { CommandPalette, CommandPaletteProvider } from './CommandPalette.js'
import type { NotificationMeta } from '../notifications/Notification.js'
import type { ComponentRegistry } from './icon-context.js'
import { ComponentRegistryProvider } from './icon-context.js'
import type { RightPanelRegistry } from './right-panel-registry.js'
import { RightPanelRegistryProvider } from './right-panel-registry.js'
import type { NavItem, UserMenuMeta, DatabaseNotificationsMeta, RightSidebarMeta } from '../pageData.js'
import type { RenderHookMap } from '../RenderHook.js'
import { RenderHookSlot } from './RenderHookSlot.js'

export interface AppShellProps {
  panel: {
    name: string
    branding: { title?: string; logo?: string }
    /** Pre-grouped navigation tree built by `panelInfo()` (Plan #9). */
    navigation?: NavItem[]
    /** Top-right dropdown shape — `null`/absent suppresses the menu
     *  entirely (no resolver configured or no logged-in user). */
    userMenu?: UserMenuMeta | null
    /** Bell-icon dropdown config — absent suppresses the bell.
     *  `panelInfo()` only ships this when the panel opted in via
     *  `Pilotiq.databaseNotifications()` AND a user resolved. */
    databaseNotifications?: DatabaseNotificationsMeta
    /** Right-sidebar plugin meta — absent suppresses the surface.
     *  `panelInfo()` only ships this when at least one contribution
     *  was registered AND passed the auth gate AND is non-hidden. */
    rightSidebar?: RightSidebarMeta
    /** Pre-resolved render-hook slots for the panel chrome (body /
     *  topbar / sidebar / user-menu / footer / head). Sparse map —
     *  slots with no registered entries are absent. Built by
     *  `panelInfo()` server-side. */
    renderHooks?: RenderHookMap
    themeEditor?: boolean
  }
  basePath: string
  /** Pathname used to compute active-link state in the sidebar/topbar. */
  currentPath?: string
  layout?: 'sidebar' | 'topbar'
  /** Server-flashed notifications from `viewProps.notifications`. The
   * Toaster mounts them on first render. */
  notifications?: NotificationMeta[]
  /** Build-time class manifest emitted by the Pilotiq Vite plugin
   * (`pages/(pilotiq)/_components.ts`). Maps Resource/Global/Page class
   * names to the actual class refs so component-typed icons (e.g.,
   * `Resource.icon = Newspaper`) render. Optional — when missing, only
   * string-registry icons resolve. */
  componentRegistry?: ComponentRegistry
  /**
   * Build-time right-panel registry from the Vite plugin. Maps each
   * `RightPanelContribution.id` to the React component supplied as
   * `render`. Phase C's `RightSidebar` chrome reads this via
   * `useRightPanelComponent(id)`. Sparse `{}` is a valid value — the
   * chrome simply doesn't mount.
   */
  rightPanelRegistry?: RightPanelRegistry
  children: React.ReactNode
}

export function AppShell({ layout = 'sidebar', notifications, componentRegistry, rightPanelRegistry, ...props }: AppShellProps) {
  const Layout = layout === 'topbar' ? TopbarLayout : SidebarLayout
  // exactOptionalPropertyTypes: only spread `initialNotifications` when set.
  const toasterProps = notifications ? { initialNotifications: notifications } : {}

  // Plan #12 — palette open state lives at AppShell so the trigger pill
  // (rendered inside the layout's header) and the palette dialog both
  // observe the same flag via context.
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteProps: {
    basePath:     string
    navigation?:  NavItem[]
    open:         boolean
    onOpenChange: (open: boolean) => void
  } = {
    basePath:     props.basePath,
    open:         paletteOpen,
    onOpenChange: setPaletteOpen,
  }
  if (props.panel.navigation) paletteProps.navigation = props.panel.navigation

  const hooks = props.panel.renderHooks

  return (
    <ComponentRegistryProvider value={componentRegistry}>
      <RightPanelRegistryProvider value={rightPanelRegistry}>
        <ToasterProvider {...toasterProps}>
          <CommandPaletteProvider setOpen={setPaletteOpen}>
            <RenderHookSlot name="panels::body.start" hooks={hooks} />
            <Layout {...props} />
            <RenderHookSlot name="panels::body.end" hooks={hooks} />
            <CommandPalette {...paletteProps} />
          </CommandPaletteProvider>
        </ToasterProvider>
      </RightPanelRegistryProvider>
    </ComponentRegistryProvider>
  )
}
