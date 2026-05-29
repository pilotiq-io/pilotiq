'use client'

import React from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'
import { useNavigate } from './navigate.js'
import { useIconFor } from './icon-context.js'
import { cn } from './utils.js'
import type { DatabaseNotificationsMeta } from '../pageData.js'
import type { DatabaseNotificationMeta } from '../notifications/database.js'
import type { NavigationBadgeColor } from '../Resource.js'
import type { NotificationMeta as NotificationMetaImport } from '../notifications/Notification.js'
import { NotificationActionStrip } from './NotificationActionStrip.js'
import { useToast } from './Toaster.js'

const BADGE_COLOR: Record<NavigationBadgeColor, string> = {
  default:     'bg-muted text-muted-foreground',
  primary:     'bg-primary text-primary-foreground',
  success:     'bg-emerald-500 text-white',
  warning:     'bg-amber-500   text-white',
  destructive: 'bg-red-500     text-white',
  info:        'bg-sky-500     text-white',
}

const TYPE_DOT: Record<NonNullable<DatabaseNotificationMeta['type']>, string> = {
  info:    'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error:   'bg-red-500',
}

export interface UseNotificationsResult {
  unreadCount: number
  items:       DatabaseNotificationMeta[]
  loading:     boolean
  markRead:    (id: string) => void
  markAllRead: () => void
  refetch:     () => Promise<void>
}

/**
 * Data + mutation lifecycle for `Pilotiq.databaseNotifications()` —
 * shared by the standalone <NotificationBell> and the user-menu
 * notifications submenu (<NotificationList>). No-ops cleanly when `meta`
 * is absent so a caller (e.g. UserMenu) can call it unconditionally.
 *
 * Lifecycle:
 *   - First mount: fetch the current list via `meta.listUrl`.
 *   - Polling: when `meta.polling > 0`, refetch every N seconds. Pauses
 *     while the tab is hidden so a backgrounded tab stops tickling the
 *     server.
 *   - Broadcast: when `meta.broadcast` is present, a WS message triggers
 *     the same `refetch()` (low-latency hint, not a payload transport).
 *   - Mark-read: optimistic flip, then refetch to rebase the count.
 */
export function useNotifications(meta?: DatabaseNotificationsMeta): UseNotificationsResult {
  const [data, setData] = React.useState<{
    notifications: DatabaseNotificationMeta[]
    unreadCount:   number
  } | null>(null)
  const [loading, setLoading] = React.useState(false)

  // Latest-wins seq tracking — a slow first request can't clobber a
  // fresh second one (same pattern as the search palette / live form).
  const seqRef     = React.useRef(0)
  const latestRef  = React.useRef(0)
  const refetch = React.useCallback(async () => {
    if (!meta) return
    const seq = ++seqRef.current
    setLoading(true)
    try {
      const r = await fetch(meta.listUrl, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })
      if (!r.ok) return
      const json = await r.json() as {
        notifications?: DatabaseNotificationMeta[]
        unreadCount?:   number
      }
      if (seq < latestRef.current) return
      latestRef.current = seq
      setData({
        notifications: json.notifications ?? [],
        unreadCount:   json.unreadCount   ?? 0,
      })
    } catch { /* network-flake; the next poll retries */ }
    finally {
      if (seq >= latestRef.current) setLoading(false)
    }
  }, [meta?.listUrl])

  // First mount + polling.
  React.useEffect(() => {
    void refetch()
  }, [refetch])

  React.useEffect(() => {
    if (!meta || meta.polling === null || meta.polling === 0) return
    const ms = meta.polling * 1000
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void refetch()
    }
    const id = window.setInterval(tick, ms)
    return () => window.clearInterval(id)
  }, [meta?.polling, refetch])

  // Phase 2 broadcast subscription — RudderSocket loads via dynamic
  // import so the bell doesn't bundle broadcast for apps that don't
  // enable it. Failures silently fall back to polling.
  React.useEffect(() => {
    if (!meta?.broadcast) return
    if (typeof window === 'undefined') return
    let cancelled = false
    let socket:   { disconnect(): void } | null = null

    const wsUrl = meta.broadcast.wsUrl || sameOriginWsUrl()
    const channelName = meta.broadcast.channel
    const eventName   = meta.broadcast.event

    void (async () => {
      try {
        const RudderSocket = await loadRudderSocket()
        if (!RudderSocket || cancelled) return
        const s = new RudderSocket(wsUrl)
        socket = s
        // Strip the `private-` prefix — `RudderSocket.private(name)`
        // re-adds it. Empty token: the server-side auth callback reads
        // the upgrade request's cookies, not a per-message bearer token.
        const bareName = channelName.replace(/^private-/, '')
        s.private(bareName, '').on(eventName, () => {
          if (cancelled) return
          void refetch()
        })
      } catch { /* package not vendored / connect failed — polling covers it */ }
    })()

    return () => {
      cancelled = true
      socket?.disconnect()
    }
  }, [meta?.broadcast?.wsUrl, meta?.broadcast?.channel, meta?.broadcast?.event, refetch])

  const markRead = React.useCallback(async (id: string) => {
    if (!meta) return
    // Optimistic flip — stays responsive even on slow networks.
    setData(prev => prev && {
      notifications: prev.notifications.map(n =>
        n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
      ),
      unreadCount: Math.max(0, prev.unreadCount - 1),
    })
    try {
      await fetch(meta.readUrl.replace(':id', encodeURIComponent(id)), {
        method:  'POST',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })
    } catch { /* swallow — next poll resyncs */ }
    void refetch()
  }, [meta?.readUrl, refetch])

  const markAllRead = React.useCallback(async () => {
    if (!meta) return
    setData(prev => prev && {
      notifications: prev.notifications.map(n =>
        n.readAt ? n : { ...n, readAt: new Date().toISOString() }),
      unreadCount: 0,
    })
    try {
      await fetch(meta.readAllUrl, {
        method:  'POST',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })
    } catch { /* swallow */ }
    void refetch()
  }, [meta?.readAllUrl, refetch])

  return {
    unreadCount: data?.unreadCount ?? 0,
    items:       data?.notifications ?? [],
    loading,
    markRead,
    markAllRead,
    refetch,
  }
}

/**
 * The scrollable list body — header (with "Mark all as read") + rows.
 * Used inside the bell's popup and the user-menu notifications submenu.
 * `onClose` lets the host dropdown close on row click-through.
 */
export function NotificationList({
  meta,
  items,
  loading,
  unreadCount,
  markRead,
  markAllRead,
  onClose,
}: {
  meta:        DatabaseNotificationsMeta
  items:       DatabaseNotificationMeta[]
  loading:     boolean
  unreadCount: number
  markRead:    (id: string) => void
  markAllRead: () => void
  onClose:     () => void
}) {
  const navigate = useNavigate()
  const toast    = useToast()
  return (
    <>
      <header className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">Notifications</span>
        {unreadCount > 0 && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => { void markAllRead() }}
          >
            Mark all as read
          </button>
        )}
      </header>

      <div className="max-h-96 overflow-y-auto">
        {items.length === 0
          ? <EmptyState loading={loading} />
          : items.map(n => (
              <NotificationRow
                key={n.id}
                notification={n}
                actionUrlTemplate={meta.actionUrl}
                onMarkRead={markRead}
                onNavigate={(href) => { onClose(); navigate(href) }}
                onNotify={(notifs) => notifs.forEach(t => toast.notify(t))}
                onAfterClick={onClose}
              />
            ))
        }
      </div>
    </>
  )
}

/**
 * Bell-icon dropdown for `Pilotiq.databaseNotifications()`. Renders
 * nothing when `meta` is absent — `panelInfo()` only ships the meta
 * when the panel opted in AND a user resolved. Used for the
 * `position: 'sidebar'` placement; the topbar placement folds the same
 * list into the user-menu submenu instead.
 */
export function NotificationBell({ meta }: { meta?: DatabaseNotificationsMeta }) {
  // Guard before any hooks — `panelInfo()` only ships `meta` when the panel
  // opted in AND a user resolved, so render nothing otherwise. The hook-using
  // body lives in `NotificationBellInner` so the rules-of-hooks order stays
  // stable regardless of whether `meta` is present.
  if (!meta) return null
  return <NotificationBellInner meta={meta} />
}

function NotificationBellInner({ meta }: { meta: DatabaseNotificationsMeta }) {
  const [open, setOpen] = React.useState(false)
  const { unreadCount, items, loading, markRead, markAllRead } = useNotifications(meta)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="relative inline-flex items-center justify-center size-9 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors focus:outline-none"
        aria-label={meta.trigger?.label ?? 'Notifications'}
      >
        <BellIcon icon={meta.trigger?.icon} />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -end-0.5 inline-flex min-w-[1rem] h-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none',
              BADGE_COLOR[meta.badgeColor],
            )}
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <NotificationList
          meta={meta}
          items={items}
          loading={loading}
          unreadCount={unreadCount}
          markRead={markRead}
          markAllRead={markAllRead}
          onClose={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationRow({
  notification: n,
  actionUrlTemplate,
  onMarkRead,
  onNavigate,
  onNotify,
  onAfterClick,
}: {
  notification:       DatabaseNotificationMeta
  actionUrlTemplate?: string
  onMarkRead:         (id: string) => void
  onNavigate:         (url: string) => void
  onNotify:           (notifs: NotificationMetaImport[]) => void
  onAfterClick:       () => void
}) {
  const RowIcon = useIconFor(n.icon)
  const unread  = !n.readAt

  const onClick = (e: React.MouseEvent) => {
    // Modified clicks (cmd/ctrl/middle) preserve native semantics.
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    if (unread) onMarkRead(n.id)
    if (n.url) onNavigate(n.url)
  }

  // Body wrapper is `<a>` when the row has a click-through url, plain
  // `<button>` otherwise. Form-mode + handler-mode action buttons in
  // the strip can't validly nest inside an `<a>`/`<button>`, so the
  // strip lives as a sibling under a shared chrome `<div>`.
  const Tag: 'a' | 'button' = n.url ? 'a' : 'button'
  const tagProps: React.AnchorHTMLAttributes<HTMLAnchorElement> & React.ButtonHTMLAttributes<HTMLButtonElement> = {
    onClick,
    className: 'w-full text-start flex items-start gap-2 focus:outline-none',
  }
  if (Tag === 'a') {
    tagProps.href = n.url!
  } else {
    tagProps.type = 'button'
  }

  return (
    <div
      className={cn(
        'px-3 py-2 hover:bg-accent transition-colors border-b last:border-b-0',
        unread && 'bg-primary/5',
      )}
    >
      <Tag {...(tagProps as React.HTMLAttributes<HTMLElement>)}>
        <span
          className={cn(
            'mt-1.5 inline-block size-2 rounded-full shrink-0',
            n.type ? TYPE_DOT[n.type] : 'bg-muted-foreground/40',
          )}
          aria-hidden="true"
        />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            {RowIcon && <RowIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />}
            <span className={cn('text-sm leading-tight', unread ? 'font-medium' : '')}>
              {n.title || 'Notification'}
            </span>
          </span>
          {n.body && (
            <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {n.body}
            </span>
          )}
          <span className="block text-[11px] text-muted-foreground/70 mt-1">
            {formatRelative(n.createdAt)}
          </span>
        </span>
      </Tag>
      {n.actions && n.actions.length > 0 && (
        <div className="ms-4">
          <NotificationActionStrip
            actions={n.actions}
            {...(actionUrlTemplate !== undefined ? { actionUrlTemplate } : {})}
            notificationId={n.id}
            onMarkAsRead={onMarkRead}
            onNotify={onNotify}
            onAfterClick={onAfterClick}
          />
        </div>
      )}
    </div>
  )
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="px-3 py-8 text-center text-sm text-muted-foreground">
      {loading ? 'Loading…' : 'No notifications'}
    </div>
  )
}

function BellIcon({ icon }: { icon: string | undefined }) {
  // Honor `meta.trigger.icon` when set (string registry name); fall
  // through to the bundled bell glyph otherwise. The registry-resolved
  // hook returns `null` when no entry is registered, so a misspelt name
  // still shows the default bell — better than a silent blank.
  const Icon = useIconFor(icon)
  if (Icon) return <Icon className="size-5" aria-hidden="true" />
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

/** Soft-load `RudderSocket` from whichever path the consuming app
 *  vendored it to. `@rudderjs/broadcast` ships the client as
 *  `client/RudderSocket.ts`, intended for vendor:publish copy into the
 *  app's `src/`. We try a stack of common locations in order, returning
 *  the first that resolves; falls through to `null` when nothing's
 *  reachable so the bell silently continues with polling.
 *
 *  Apps that vendor the file under a custom path can register their
 *  own loader by setting `window.__pilotiqRudderSocket` to the class
 *  constructor before the bell mounts. */
type RudderSocketCtor = new (url: string) => {
  private(name: string, token: string): {
    on(event: string, handler: (data: unknown) => void): unknown
  }
  disconnect(): void
}

async function loadRudderSocket(): Promise<RudderSocketCtor | null> {
  // Allow apps to register a custom-path RudderSocket without us
  // having to guess at the import path.
  const w = typeof window !== 'undefined'
    ? (window as unknown as { __pilotiqRudderSocket?: RudderSocketCtor })
    : null
  if (w?.__pilotiqRudderSocket) return w.__pilotiqRudderSocket

  // Apps that vendor:publish the broadcast client typically end up
  // with `src/RudderSocket.ts` (or `.js`); try common shapes via the
  // app's import-map / module resolution. The dynamic import is
  // wrapped in a try/catch so missing modules don't surface.
  const candidates = [
    '@rudderjs/broadcast/client/RudderSocket.js',
    '@rudderjs/broadcast/client/RudderSocket',
  ]
  for (const id of candidates) {
    try {
      const mod = await import(/* @vite-ignore */ id) as { RudderSocket?: RudderSocketCtor }
      if (mod.RudderSocket) return mod.RudderSocket
    } catch { /* try next */ }
  }
  return null
}

/** Same-origin `ws://…/ws` (or `wss://` on https). Used when
 *  `meta.broadcast.wsUrl` is empty — the default for apps that boot
 *  `BroadcastingProvider` with no custom path. */
function sameOriginWsUrl(): string {
  if (typeof window === 'undefined') return ''
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

function formatRelative(ts: number): string {
  const now = Date.now()
  const diff = Math.max(0, now - ts)
  const sec  = Math.floor(diff / 1000)
  if (sec < 45)         return 'Just now'
  if (sec < 90)         return '1 minute ago'
  const min = Math.floor(sec / 60)
  if (min < 60)         return `${min} minutes ago`
  const hr  = Math.floor(min / 60)
  if (hr  < 24)         return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.floor(hr / 24)
  if (day < 7)          return `${day} day${day === 1 ? '' : 's'} ago`
  return new Date(ts).toLocaleDateString()
}
