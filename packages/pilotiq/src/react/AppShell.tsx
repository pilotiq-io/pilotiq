import React, { useState } from 'react'
import { SidebarLayout } from './layouts/SidebarLayout.js'
import { TopbarLayout } from './layouts/TopbarLayout.js'
import { ToasterProvider } from './Toaster.js'
import { CommandPalette, CommandPaletteProvider } from './CommandPalette.js'
import type { NotificationMeta } from '../notifications/Notification.js'
import type { ComponentRegistry } from './icon-context.js'
import { ComponentRegistryProvider } from './icon-context.js'
import type { NavItem } from '../pageData.js'

export interface AppShellProps {
  panel: {
    name: string
    branding: { title?: string; logo?: string }
    /** Pre-grouped navigation tree built by `panelInfo()` (Plan #9). */
    navigation?: NavItem[]
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
  children: React.ReactNode
}

export function AppShell({ layout = 'sidebar', notifications, componentRegistry, ...props }: AppShellProps) {
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

  return (
    <ComponentRegistryProvider value={componentRegistry}>
      <ToasterProvider {...toasterProps}>
        <CommandPaletteProvider setOpen={setPaletteOpen}>
          <Layout {...props} />
          <CommandPalette {...paletteProps} />
        </CommandPaletteProvider>
      </ToasterProvider>
    </ComponentRegistryProvider>
  )
}
