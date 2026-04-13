import React from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '../ui/sidebar.js'
import { Separator } from '../ui/separator.js'
import { ThemeToggle } from '../ThemeToggle.js'
import type { AppShellProps } from '../AppShell.js'

export function SidebarLayout({ panel, basePath, children }: AppShellProps) {
  const title = panel.branding?.title ?? panel.name

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<a href={basePath} />} tooltip={title}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  {panel.branding?.logo
                    ? <img src={panel.branding.logo} alt={title} className="size-4" />
                    : <span className="text-xs font-bold">{title.charAt(0).toUpperCase()}</span>
                  }
                </div>
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">{title}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {panel.resources && panel.resources.length > 0 && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {panel.resources.map(r => (
                    <SidebarMenuItem key={r.slug}>
                      <SidebarMenuButton render={<a href={`${basePath}/${r.slug}`} />} tooltip={r.label}>
                        <span>{r.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          {panel.pages && panel.pages.length > 0 && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {panel.pages.map(p => (
                    <SidebarMenuItem key={p.slug}>
                      <SidebarMenuButton render={<a href={`${basePath}/${p.slug}`} />} tooltip={p.label}>
                        <span>{p.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          {panel.themeEditor && (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<a href={`${basePath}/theme`} />} tooltip="Theme">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><path d="M17.5 10.5 19 12l-5.5 5.5"/><circle cx="8.5" cy="8.5" r="2.5"/><path d="M5 12 2.5 14.5 8 20l2.5-2.5"/><path d="m6 18 4-4"/></svg>
                  <span>Theme</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-background">
          <div className="flex flex-1 items-center gap-2 px-3">
            <SidebarTrigger className="-ms-1" />
            <Separator orientation="vertical" className="me-2 data-[orientation=vertical]:h-4" />
          </div>
          <div className="flex items-center gap-1 px-3">
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
