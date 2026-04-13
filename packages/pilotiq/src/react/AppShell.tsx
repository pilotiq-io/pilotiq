import React from 'react'
import { SidebarLayout } from './layouts/SidebarLayout.js'
import { TopbarLayout } from './layouts/TopbarLayout.js'

export interface AppShellProps {
  panel: {
    name: string
    branding: { title?: string; logo?: string }
    resources?: Array<{ label: string; slug: string; icon: string }>
    pages?: Array<{ label: string; slug: string; icon?: string }>
  }
  basePath: string
  layout?: 'sidebar' | 'topbar'
  children: React.ReactNode
}

export function AppShell({ layout = 'sidebar', ...props }: AppShellProps) {
  return layout === 'topbar'
    ? <TopbarLayout {...props} />
    : <SidebarLayout {...props} />
}
