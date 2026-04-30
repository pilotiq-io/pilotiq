import React from 'react'
import { SidebarLayout } from './layouts/SidebarLayout.js'
import { TopbarLayout } from './layouts/TopbarLayout.js'
import { ToasterProvider } from './Toaster.js'
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
  return (
    <ComponentRegistryProvider value={componentRegistry}>
      <ToasterProvider {...toasterProps}>
        <Layout {...props} />
      </ToasterProvider>
    </ComponentRegistryProvider>
  )
}
