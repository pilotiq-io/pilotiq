'use client'

import React from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'
import { useIconFor } from './icon-context.js'
import { useTheme } from './ThemeProvider.js'
import { useNotifications, NotificationList } from './NotificationBell.js'
import type { UserMenuMeta, DatabaseNotificationsMeta } from '../pageData.js'

/**
 * Top-right user dropdown — avatar / initials trigger that opens to
 * the configured user-menu items + a separator + the optional sign-out
 * entry. Renders nothing when `userMenu` is null (no logged-in user).
 *
 * Sign-out renders as a `<form>` so CSRF middleware downstream can
 * verify the request. `method: 'GET'` falls back to a plain `<a>`-style
 * link when the app's logout endpoint is purely redirect-based.
 */
export function UserMenu({
  userMenu,
  notifications,
  before,
  after,
}: {
  userMenu: UserMenuMeta | null | undefined
  /** Database-notifications meta — when present, a "Notifications"
   *  submenu folds the inbox into this dropdown and an unread dot shows
   *  on the avatar. Pass the panel's `databaseNotifications` meta only
   *  for the topbar placement; the sidebar placement keeps the standalone
   *  <NotificationBell>. */
  notifications?: DatabaseNotificationsMeta
  /** Render-hook slot mounted at the top of the dropdown (above the
   *  user-identity label). Pass `<RenderHookSlot
   *  name="panels::user-menu.before" />`. */
  before?:  React.ReactNode
  /** Render-hook slot mounted at the bottom of the dropdown (above the
   *  sign-out separator when present). Pass `<RenderHookSlot
   *  name="panels::user-menu.after" />`. */
  after?:   React.ReactNode
}) {
  // Controlled so a notification row click-through can close the whole
  // menu (closing the root also dismisses the submenu). Hooks run before
  // the early return — `useNotifications` no-ops when `notifications` is
  // undefined, so the call stays unconditional.
  const [open, setOpen] = React.useState(false)
  const notif = useNotifications(notifications)

  if (!userMenu) return null
  const { user, items, signOut } = userMenu

  const displayName = user.name ?? user.email ?? 'Account'
  const initials = computeInitials(user.name ?? user.email)

  const avatarProps: { avatar?: string; initials: string; alt: string } = { initials, alt: displayName }
  if (user.avatar !== undefined) avatarProps.avatar = user.avatar

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="relative inline-flex items-center gap-2 rounded-md p-1 text-sm hover:bg-accent hover:text-accent-foreground transition-colors focus:outline-none"
        aria-label="User menu"
      >
        <Avatar {...avatarProps} />
        {notif.unreadCount > 0 && (
          <span
            className="absolute end-0.5 top-0.5 size-2.5 rounded-full bg-red-500 ring-2 ring-background"
            aria-label={`${notif.unreadCount} unread notifications`}
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {before}
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          {user.name && <span className="font-medium">{user.name}</span>}
          {user.email && (
            <span className="text-xs text-muted-foreground truncate">{user.email}</span>
          )}
          {!user.name && !user.email && (
            <span className="font-medium">Account</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications && (
          <NotificationsSubmenu
            meta={notifications}
            notif={notif}
            onClose={() => setOpen(false)}
          />
        )}
        <ThemeMenuRow />
        {items.length > 0 && <DropdownMenuSeparator />}
        {items.map(item => (
          <UserMenuItemRow key={item.name} item={item} />
        ))}
        {after}
        {signOut && (
          <>
            <DropdownMenuSeparator />
            <SignOutItem signOut={signOut} />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** "Notifications" submenu — flyout carrying the shared
 *  <NotificationList>. Unread count shows as a pill on the trigger. */
function NotificationsSubmenu({
  meta,
  notif,
  onClose,
}: {
  meta:    DatabaseNotificationsMeta
  notif:   ReturnType<typeof useNotifications>
  onClose: () => void
}) {
  const { unreadCount } = notif
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <BellGlyph />
        <span>Notifications</span>
        {unreadCount > 0 && (
          <span className="ms-auto inline-flex min-w-[1.25rem] h-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-80 p-0">
        <NotificationList
          meta={meta}
          items={notif.items}
          loading={notif.loading}
          unreadCount={notif.unreadCount}
          markRead={notif.markRead}
          markAllRead={notif.markAllRead}
          onClose={onClose}
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/** Light/dark toggle as a dropdown row. `closeOnClick={false}` keeps the
 *  menu open so the user sees the theme flip in place. */
function ThemeMenuRow() {
  const { resolved, setTheme } = useTheme()
  const dark = resolved === 'dark'
  return (
    <DropdownMenuItem
      closeOnClick={false}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <SunGlyph /> : <MoonGlyph />}
      <span>{dark ? 'Light mode' : 'Dark mode'}</span>
    </DropdownMenuItem>
  )
}

function UserMenuItemRow({ item }: { item: NonNullable<UserMenuMeta['items']>[number] }) {
  const Icon = useIconFor(item.icon)
  const destructive = item.color === 'destructive'
  const target  = item.openInNewTab ? '_blank' : undefined
  const rel     = item.openInNewTab ? 'noopener noreferrer' : undefined

  // No URL → render as a plain disabled-looking row (rare; usually
  // every item has a destination). Items without a URL still appear
  // for consumers who want a label-only entry (e.g. environment hint).
  if (!item.url) {
    return (
      <DropdownMenuItem destructive={destructive} disabled>
        {Icon && <Icon aria-hidden="true" />}
        <span>{item.label}</span>
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenuItem
      destructive={destructive}
      render={<a href={item.url} target={target} rel={rel} />}
    >
      {Icon && <Icon aria-hidden="true" />}
      <span>{item.label}</span>
    </DropdownMenuItem>
  )
}

function SignOutItem({ signOut }: { signOut: NonNullable<UserMenuMeta['signOut']> }) {
  const formRef = React.useRef<HTMLFormElement | null>(null)

  if (signOut.method === 'GET') {
    return (
      <DropdownMenuItem destructive render={<a href={signOut.url} />}>
        <SignOutIcon />
        <span>{signOut.label}</span>
      </DropdownMenuItem>
    )
  }
  // POST: render a hidden form alongside the menu item; the item's
  // click submits it. CSRF middleware sees a real POST navigation.
  // `closeOnClick: false` is unnecessary — Base UI closes after the
  // click handler runs, but the synchronous `requestSubmit()` triggers
  // a full-page navigation which trumps the close animation.
  return (
    <>
      <form ref={formRef} method="post" action={signOut.url} className="hidden" />
      <DropdownMenuItem
        destructive
        onClick={() => formRef.current?.requestSubmit()}
      >
        <SignOutIcon />
        <span>{signOut.label}</span>
      </DropdownMenuItem>
    </>
  )
}

function Avatar({ avatar, initials, alt }: { avatar?: string; initials: string; alt: string }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={alt}
        className="size-7 rounded-full object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium"
    >
      {initials}
    </span>
  )
}

function SignOutIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  )
}

function BellGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

function SunGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" /><path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </svg>
  )
}

function MoonGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}

function computeInitials(source: string | undefined): string {
  if (!source) return '?'
  const trimmed = source.trim()
  if (!trimmed) return '?'
  // Email → first two letters of the local-part.
  if (trimmed.includes('@')) {
    return trimmed.slice(0, 2).toUpperCase()
  }
  // Name → first letter of the first two whitespace-split tokens.
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase()
}
