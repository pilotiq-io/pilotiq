import React from 'react'
import { Separator } from '../ui/separator.js'
import { SearchTrigger } from '../SearchTrigger.js'
import { UserMenu } from '../UserMenu.js'
import { RightSidebarTrigger } from '../RightSidebarTrigger.js'
import { RenderHookSlot } from '../RenderHookSlot.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js'
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
    <span className={cn('ms-1 inline-flex items-center justify-center rounded-md px-1.5 text-xs', BADGE_COLOR[color ?? 'default'])}>
      {value}
    </span>
  )
}

function isActive(url: string, pathname: string | undefined, basePath: string): boolean {
  if (!pathname) return false
  if (url === basePath) return pathname === basePath
  if (url === pathname) return true
  return pathname.startsWith(url + '/')
}

const linkBase =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors'
const linkIdle =
  'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
const linkActive =
  'bg-accent text-accent-foreground'

/** Bare item: a single nav link with no children. */
function FlatLink({ item, pathname, basePath }: { item: NavItem; pathname: string | undefined; basePath: string }) {
  return (
    <a
      href={item.url}
      className={cn(linkBase, isActive(item.url, pathname, basePath) ? linkActive : linkIdle)}
    >
      <NavIcon value={item.icon} />
      <span>{item.label}</span>
      <Badge value={item.badge} color={item.badgeColor} />
    </a>
  )
}

/**
 * Item with children: render as a dropdown trigger; the parent's own URL
 * becomes the first menu entry so users can still navigate to it.
 */
function ParentDropdown({ item, pathname, basePath }: { item: NavItem; pathname: string | undefined; basePath: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(linkBase, isActive(item.url, pathname, basePath) ? linkActive : linkIdle)}
      >
        <NavIcon value={item.icon} />
        <span>{item.label}</span>
        <Badge value={item.badge} color={item.badgeColor} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem render={<a href={item.url} />}>
          <NavIcon value={item.icon} />
          <span>{item.label}</span>
        </DropdownMenuItem>
        {item.children!.map(c => (
          <DropdownMenuItem key={c.name} render={<a href={c.url} />}>
            <NavIcon value={c.icon} />
            <span>{c.label}</span>
            <Badge value={c.badge} color={c.badgeColor} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Group dropdown: the group label triggers the menu; every member
 * (and its children) renders as menu items.
 */
function GroupDropdown({
  label,
  items,
  pathname,
  basePath,
}: {
  label:    string
  items:    NavItem[]
  pathname: string | undefined
  basePath: string
}) {
  const anyActive = items.some(it =>
    isActive(it.url, pathname, basePath) ||
    it.children?.some(c => isActive(c.url, pathname, basePath)),
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(linkBase, anyActive ? linkActive : linkIdle)}>
        <span>{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {items.flatMap(it => {
          const self = (
            <DropdownMenuItem key={it.name} render={<a href={it.url} />}>
              <NavIcon value={it.icon} />
              <span>{it.label}</span>
              <Badge value={it.badge} color={it.badgeColor} />
            </DropdownMenuItem>
          )
          if (!it.children || it.children.length === 0) return [self]
          return [
            self,
            ...it.children.map(c => (
              <DropdownMenuItem key={`${it.name}/${c.name}`} render={<a href={c.url} />} className="ps-6">
                <NavIcon value={c.icon} />
                <span>{c.label}</span>
                <Badge value={c.badge} color={c.badgeColor} />
              </DropdownMenuItem>
            )),
          ]
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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

export function TopbarLayout({ panel, basePath, currentPath, children, componentSlotRegistry }: AppShellProps) {
  const title = panel.branding?.title ?? panel.name
  const groups = groupItems(panel.navigation ?? [])
  const hooks = panel.renderHooks
  // Topbar layout treats `position: 'sidebar'` as a fallback to topbar —
  // no sidebar exists in this layout, so the bell rides in the topbar
  // chrome regardless of the configured position.
  const dn = panel.databaseNotifications
  const NavSlot    = componentSlotRegistry?.nav
  const HeaderSlot = componentSlotRegistry?.header
  const FooterSlot = componentSlotRegistry?.footer
  const slotProps = currentPath !== undefined ? { currentPath } : {}

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {HeaderSlot
        ? <HeaderSlot navigation={panel.navigation ?? []} basePath={basePath} {...slotProps} />
        : <header className="h-14 shrink-0 border-b bg-card flex items-center gap-4 px-6">
            <div className="flex items-center gap-2 me-2">
              {panel.branding?.logo
                ? <>
                    <img src={panel.branding.logo} alt={title} className="h-6 w-6" />
                    <span className="text-sm font-semibold">{title}</span>
                  </>
                : <span className="text-sm font-semibold">{title}</span>
              }
            </div>
            <Separator orientation="vertical" className="h-4" />
            <RenderHookSlot name="panels::topbar.start" hooks={hooks} />
            {NavSlot
              ? <div className="flex items-center gap-1 flex-1 overflow-x-auto">
                  <NavSlot navigation={panel.navigation ?? []} basePath={basePath} {...slotProps} />
                </div>
              : <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
                  <a
                    href={basePath}
                    className={cn(linkBase, currentPath === basePath ? linkActive : linkIdle)}
                  >
                    Dashboard
                  </a>
                  {groups.map((g, idx) => {
                    if (g.group === undefined) {
                      return g.items.map(it => (
                        it.children && it.children.length > 0
                          ? <ParentDropdown key={it.name} item={it} pathname={currentPath} basePath={basePath} />
                          : <FlatLink     key={it.name} item={it} pathname={currentPath} basePath={basePath} />
                      ))
                    }
                    return (
                      <GroupDropdown
                        key={`${g.group}__${idx}`}
                        label={g.group}
                        items={g.items}
                        pathname={currentPath}
                        basePath={basePath}
                      />
                    )
                  })}
                  {panel.themeEditor && (
                    <a
                      href={`${basePath}/theme`}
                      className={cn(linkBase, currentPath === `${basePath}/theme` ? linkActive : linkIdle)}
                    >
                      Theme
                    </a>
                  )}
                </nav>
            }
            <SearchTrigger />
            <RightSidebarTrigger />
            <UserMenu
              userMenu={panel.userMenu}
              {...(dn ? { notifications: dn } : {})}
              before={<RenderHookSlot name="panels::user-menu.before" hooks={hooks} />}
              after={<RenderHookSlot name="panels::user-menu.after"  hooks={hooks} />}
            />
            <RenderHookSlot name="panels::topbar.end" hooks={hooks} />
          </header>
      }
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          {children}
          <RenderHookSlot name="panels::footer" hooks={hooks} />
        </main>
      </div>
      {FooterSlot && <FooterSlot basePath={basePath} {...slotProps} />}
    </div>
  )
}
