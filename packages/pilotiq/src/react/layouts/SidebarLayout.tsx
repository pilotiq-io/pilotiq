import React from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '../ui/sidebar.js'
import { Separator } from '../ui/separator.js'
import { SearchTrigger } from '../SearchTrigger.js'
import { UserMenu } from '../UserMenu.js'
import { NotificationBell } from '../NotificationBell.js'
import { RightSidebarTrigger } from '../RightSidebarTrigger.js'
import { BreadcrumbsView } from '../SchemaRenderer.js'
import { BreadcrumbHoistProvider } from '../breadcrumb-hoist.js'
import { RenderHookSlot } from '../RenderHookSlot.js'
import type { AppShellProps } from '../AppShell.js'
import { useIconFor } from '../icon-context.js'
import type { SerializedIcon } from '../../icons/types.js'
import type { NavItem } from '../../pageData.js'
import type { NavigationBadgeColor } from '../../Resource.js'
import { cn } from '../utils.js'

function NavIcon({ value }: { value: SerializedIcon | undefined }) {
  const Icon = useIconFor(value)
  if (!Icon) return null
  return <Icon className="size-4" aria-hidden="true" />
}

/** Tailwind utility map shared with `ListTab.badgeColor` so badges read
 *  consistently across the admin panel. */
const BADGE_COLOR: Record<NavigationBadgeColor, string> = {
  default:     'bg-muted text-muted-foreground',
  primary:     'bg-primary/10 text-primary',
  success:     'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning:     'bg-amber-500/10  text-amber-600  dark:text-amber-400',
  destructive: 'bg-red-500/10    text-red-600    dark:text-red-400',
  info:        'bg-sky-500/10    text-sky-600    dark:text-sky-400',
}

function Badge({ value, color }: { value: string | undefined; color: NavigationBadgeColor | undefined }) {
  if (value === undefined) return null
  return (
    <SidebarMenuBadge className={cn('px-1.5 rounded-md', BADGE_COLOR[color ?? 'default'])}>
      {value}
    </SidebarMenuBadge>
  )
}

/**
 * Active-link match is a longest-prefix walk. The dashboard URL (e.g.
 * `/admin`) is a prefix of every other panel URL, so we only return
 * "active" for it on an exact match. Otherwise we accept the URL as a
 * prefix of `pathname` if it is followed by `/` or end-of-string —
 * `/admin/users` should not light up `/admin/user`.
 */
function isActive(url: string, pathname: string | undefined, basePath: string): boolean {
  if (!pathname) return false
  if (url === basePath) return pathname === basePath
  if (url === pathname) return true
  return pathname.startsWith(url + '/')
}

/** Group nav items by `group`, preserving the order each group's first
 *  member appeared in the (already-sorted) flat list. Items without a
 *  group land in a leading unnamed bucket. */
function groupItems(items: NavItem[]): Array<{ group: string | undefined; items: NavItem[] }> {
  const order: Array<string | undefined> = []
  const buckets = new Map<string | undefined, NavItem[]>()
  for (const it of items) {
    const key = it.group
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(it)
  }
  return order.map(g => ({ group: g, items: buckets.get(g)! }))
}

function NavTree({
  items,
  pathname,
  basePath,
}: {
  items:     NavItem[]
  pathname:  string | undefined
  basePath:  string
}) {
  return (
    <SidebarMenu>
      {items.map(it => {
        const active = isActive(it.url, pathname, basePath)
        return (
          <SidebarMenuItem key={it.name}>
            <SidebarMenuButton
              isActive={active}
              render={<a href={it.url} />}
              tooltip={it.label}
            >
              <NavIcon value={it.icon} />
              <span>{it.label}</span>
              <Badge value={it.badge} color={it.badgeColor} />
            </SidebarMenuButton>
            {it.children && it.children.length > 0 && (
              <SidebarMenuSub>
                {it.children.map(child => {
                  const childActive = isActive(child.url, pathname, basePath)
                  return (
                    <SidebarMenuSubItem key={child.name}>
                      <SidebarMenuSubButton
                        isActive={childActive}
                        render={<a href={child.url} />}
                      >
                        <NavIcon value={child.icon} />
                        <span>{child.label}</span>
                        <Badge value={child.badge} color={child.badgeColor} />
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )
                })}
              </SidebarMenuSub>
            )}
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

export function SidebarLayout({ panel, basePath, currentPath, children, componentSlotRegistry, breadcrumb }: AppShellProps) {
  const title = panel.branding?.title ?? panel.name
  const groups = groupItems(panel.navigation ?? [])
  // Sidebar chrome knobs (Pilotiq.sidebar) — default to the historical
  // inset / icon / left when the panel didn't configure them.
  const variant     = panel.sidebar?.variant     ?? 'inset'
  const collapsible = panel.sidebar?.collapsible ?? 'icon'
  const side        = panel.sidebar?.side        ?? 'left'
  const hooks = panel.renderHooks
  const dn = panel.databaseNotifications
  const bellInSidebar = dn && dn.position === 'sidebar'
  const NavSlot    = componentSlotRegistry?.nav
  const HeaderSlot = componentSlotRegistry?.header
  const FooterSlot = componentSlotRegistry?.footer
  const slotProps = currentPath !== undefined ? { currentPath } : {}
  // Hoist the breadcrumb into the header only when we own the header
  // (no custom HeaderSlot) — otherwise the body keeps rendering it.
  const hoistBreadcrumb = !!breadcrumb && !HeaderSlot

  return (
    <BreadcrumbHoistProvider value={hoistBreadcrumb}>
    <SidebarProvider>
      <Sidebar variant={variant} collapsible={collapsible} side={side}>
        <SidebarHeader>
          <RenderHookSlot name="panels::sidebar.start" hooks={hooks} />
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
          <RenderHookSlot name="panels::sidebar.nav.start" hooks={hooks} />
          {NavSlot
            ? <NavSlot navigation={panel.navigation ?? []} basePath={basePath} {...slotProps} />
            : groups.map((g, idx) => (
                <SidebarGroup key={g.group ?? `__top__${idx}`}>
                  {g.group !== undefined && <SidebarGroupLabel>{g.group}</SidebarGroupLabel>}
                  <SidebarGroupContent>
                    <NavTree items={g.items} pathname={currentPath} basePath={basePath} />
                  </SidebarGroupContent>
                </SidebarGroup>
              ))
          }
          <RenderHookSlot name="panels::sidebar.nav.end" hooks={hooks} />
        </SidebarContent>

        <SidebarFooter>
          <RenderHookSlot name="panels::sidebar.footer" hooks={hooks} />
          {bellInSidebar && (
            <SidebarMenu>
              <SidebarMenuItem>
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-xs text-muted-foreground">Notifications</span>
                  <NotificationBell meta={dn} />
                </div>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
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
        {HeaderSlot
          ? <HeaderSlot navigation={panel.navigation ?? []} basePath={basePath} {...slotProps} />
          : <header className={cn(
              'sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
              // Only the inset variant floats content in a rounded card,
              // so only then should the sticky header round its top corners.
              variant === 'inset' && 'md:rounded-t-xl',
            )}>
              <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
                <SidebarTrigger />
                <Separator orientation="vertical" className="me-1 data-[orientation=vertical]:h-4" />
                <RenderHookSlot name="panels::topbar.start" hooks={hooks} />
                {breadcrumb && <BreadcrumbsView items={breadcrumb.items} />}
              </div>
              <div className="flex items-center gap-1 px-3">
                <SearchTrigger />
                <RightSidebarTrigger />
                <UserMenu
                  userMenu={panel.userMenu}
                  {...(dn && dn.position === 'topbar' ? { notifications: dn } : {})}
                  before={<RenderHookSlot name="panels::user-menu.before" hooks={hooks} />}
                  after={<RenderHookSlot name="panels::user-menu.after"  hooks={hooks} />}
                />
                <RenderHookSlot name="panels::topbar.end" hooks={hooks} />
              </div>
            </header>
        }
        <div className="flex flex-1 flex-col p-4">
          {children}
          <RenderHookSlot name="panels::footer" hooks={hooks} />
        </div>
        {FooterSlot && <FooterSlot basePath={basePath} {...slotProps} />}
      </SidebarInset>
    </SidebarProvider>
    </BreadcrumbHoistProvider>
  )
}
