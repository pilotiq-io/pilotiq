import React from 'react'
import { SidebarLayout } from './layouts/SidebarLayout.js'
import { TopbarLayout } from './layouts/TopbarLayout.js'
import { ToasterProvider } from './Toaster.js'
import type { NotificationMeta } from '../notifications/Notification.js'

export interface AppShellProps {
  panel: {
    name: string
    branding: { title?: string; logo?: string }
    resources?: Array<{ label: string; slug: string; icon: string }>
    pages?: Array<{ label: string; slug: string; icon?: string }>
    themeEditor?: boolean
  }
  basePath: string
  layout?: 'sidebar' | 'topbar'
  /** Server-flashed notifications from `viewProps.notifications`. The
   * Toaster mounts them on first render. */
  notifications?: NotificationMeta[]
  children: React.ReactNode
}

export function AppShell({ layout = 'sidebar', notifications, ...props }: AppShellProps) {
  const Layout = layout === 'topbar' ? TopbarLayout : SidebarLayout
  // exactOptionalPropertyTypes: only spread `initialNotifications` when set.
  const toasterProps = notifications ? { initialNotifications: notifications } : {}
  return (
    <ToasterProvider {...toasterProps}>
      <Layout {...props} />
    </ToasterProvider>
  )
}
