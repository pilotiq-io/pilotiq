'use client'

import React from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'
import { useIconFor } from './icon-context.js'
import type { UserMenuMeta } from '../pageData.js'

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
  before,
  after,
}: {
  userMenu: UserMenuMeta | null | undefined
  /** Render-hook slot mounted at the top of the dropdown (above the
   *  user-identity label). Pass `<RenderHookSlot
   *  name="panels::user-menu.before" />`. */
  before?:  React.ReactNode
  /** Render-hook slot mounted at the bottom of the dropdown (above the
   *  sign-out separator when present). Pass `<RenderHookSlot
   *  name="panels::user-menu.after" />`. */
  after?:   React.ReactNode
}) {
  if (!userMenu) return null
  const { user, items, signOut } = userMenu

  const displayName = user.name ?? user.email ?? 'Account'
  const initials = computeInitials(user.name ?? user.email)

  const avatarProps: { avatar?: string; initials: string; alt: string } = { initials, alt: displayName }
  if (user.avatar !== undefined) avatarProps.avatar = user.avatar

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-2 rounded-md p-1 text-sm hover:bg-accent hover:text-accent-foreground transition-colors focus:outline-none"
        aria-label="User menu"
      >
        <Avatar {...avatarProps} />
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
