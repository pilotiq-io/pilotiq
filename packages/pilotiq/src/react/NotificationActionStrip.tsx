'use client'

import React from 'react'
import type { NotificationActionMeta } from '../notifications/types.js'
import type { NotificationMeta } from '../notifications/Notification.js'
import { useNavigate } from './navigate.js'
import { useIconFor } from './icon-context.js'
import { cn } from './utils.js'
import type { ActionColor } from '../actions/Action.js'

/**
 * Action strip rendered inside a notification — bell row OR transient
 * toast. Same wire shape on both transports; the differences are:
 *
 *   - **Bell rows** carry a `notificationId`, so handler-mode actions
 *     dispatch via `${actionUrl}` (the registry-handler endpoint
 *     mounted by `databaseNotifications()`). url/post actions also
 *     fire a `markAsRead` POST as a client-side side-effect when the
 *     stored action carries the flag.
 *
 *   - **Transient toasts** have no `notificationId`. v1 supports
 *     url/post only — handler-mode actions on toasts log a warning
 *     and render disabled. (Named handlers without an id have no
 *     dispatch target; closure handlers can't survive the wire round
 *     trip into this component anyway.)
 */
export interface NotificationActionStripProps {
  actions:           readonly NotificationActionMeta[]
  /** Template URL with `:id` and `:actionName` placeholders — set on
   *  bell rows; omitted on transient toasts. */
  actionUrlTemplate?: string
  /** Bell-row context — set when the strip lives inside a persisted
   *  notification. Drives mark-as-read dispatch + handler routing. */
  notificationId?:    string
  /** Bell-row callback — fires when a url/post action with
   *  `markAsRead: true` is clicked. Implementer fires the
   *  `markAsRead` POST and updates local state optimistically. */
  onMarkAsRead?:      (id: string) => void
  /** Drain notifications from a handler dispatch. Bell wires its
   *  `useToast()`; toaster passes a no-op (no nesting). */
  onNotify?:          (notifs: NotificationMeta[]) => void
  /** Bell wires `setOpen(false)` so the dropdown closes after nav;
   *  toaster passes a no-op. */
  onAfterClick?:      () => void
}

const COLOR_CLASSES: Record<ActionColor, string> = {
  primary:     'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  success:     'bg-emerald-500 text-white hover:bg-emerald-600',
  warning:     'bg-amber-500 text-white hover:bg-amber-600',
  info:        'bg-sky-500 text-white hover:bg-sky-600',
  ghost:       'hover:bg-accent hover:text-accent-foreground',
}

const COLOR_OUTLINED: Record<ActionColor, string> = {
  primary:     'border border-primary text-primary hover:bg-primary/10',
  destructive: 'border border-destructive text-destructive hover:bg-destructive/10',
  success:     'border border-emerald-500 text-emerald-600 hover:bg-emerald-500/10',
  warning:     'border border-amber-500 text-amber-600 hover:bg-amber-500/10',
  info:        'border border-sky-500 text-sky-600 hover:bg-sky-500/10',
  ghost:       'border border-input hover:bg-accent hover:text-accent-foreground',
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-7  px-2.5 text-xs',
  md: 'h-8  px-3   text-xs',
  lg: 'h-9  px-3.5 text-sm',
}

export function NotificationActionStrip({
  actions,
  actionUrlTemplate,
  notificationId,
  onMarkAsRead,
  onNotify,
  onAfterClick,
}: NotificationActionStripProps) {
  if (actions.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {actions.map(a => (
        <NotificationActionButton
          key={a.name}
          action={a}
          {...(actionUrlTemplate !== undefined ? { actionUrlTemplate } : {})}
          {...(notificationId    !== undefined ? { notificationId    } : {})}
          {...(onMarkAsRead      !== undefined ? { onMarkAsRead      } : {})}
          {...(onNotify          !== undefined ? { onNotify          } : {})}
          {...(onAfterClick      !== undefined ? { onAfterClick      } : {})}
        />
      ))}
    </div>
  )
}

function NotificationActionButton({
  action: a,
  actionUrlTemplate,
  notificationId,
  onMarkAsRead,
  onNotify,
  onAfterClick,
}: {
  action:            NotificationActionMeta
  actionUrlTemplate?: string
  notificationId?:    string
  onMarkAsRead?:      (id: string) => void
  onNotify?:          (notifs: NotificationMeta[]) => void
  onAfterClick?:      () => void
}) {
  const navigate = useNavigate()
  const Icon = useIconFor(a.icon)

  const baseClass = cn(
    'inline-flex items-center gap-1 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
    SIZE_CLASSES[a.size ?? 'sm'],
    a.color
      ? (a.outlined ? COLOR_OUTLINED[a.color] : COLOR_CLASSES[a.color])
      : (a.outlined
          ? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'),
  )

  const Body = () => (
    <>
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
      <span>{a.label}</span>
    </>
  )

  // ─── url-mode action ──────────────────────────────────
  if (typeof a.url === 'string') {
    const newTab = a.openUrlInNewTab
    const href   = a.url
    const onClick = (e: React.MouseEvent) => {
      e.stopPropagation()
      // Modified clicks (cmd/ctrl/shift) preserve native semantics —
      // open-in-new-tab / save-link / etc. The browser handles the
      // navigation; we still fire mark-as-read so the inbox state
      // converges.
      if (a.markAsRead && notificationId && onMarkAsRead) onMarkAsRead(notificationId)
      if (e.metaKey || e.ctrlKey || e.shiftKey || newTab) return
      e.preventDefault()
      onAfterClick?.()
      navigate(href)
    }
    return (
      <a
        href={href}
        target={newTab ? '_blank' : undefined}
        rel={newTab ? 'noopener noreferrer' : undefined}
        className={baseClass}
        onClick={onClick}
        data-no-row-nav=""
      >
        <Body />
      </a>
    )
  }

  // ─── post-mode action ─────────────────────────────────
  if (typeof a.post === 'string') {
    const target = a.post
    const onSubmit = (e: React.FormEvent) => {
      e.stopPropagation()
      // Form-POST navigates the browser away — fire mark-as-read
      // first so the row's read state converges before the page
      // unloads. Optimistic local flip handles the bell UX.
      if (a.markAsRead && notificationId && onMarkAsRead) onMarkAsRead(notificationId)
      onAfterClick?.()
      // Let the native submission proceed.
    }
    return (
      <form
        method="post"
        action={target}
        onSubmit={onSubmit}
        className="inline-flex"
        data-no-row-nav=""
      >
        <button type="submit" className={baseClass}>
          <Body />
        </button>
      </form>
    )
  }

  // ─── handler-mode action ──────────────────────────────
  // Bell row: dispatch via the action endpoint. Server-side handles
  // markAsRead atomically so the round-trip is one request.
  // Transient toast (no actionUrlTemplate / no notificationId): no
  // dispatch target available in v1 — render disabled with a tooltip.
  if (typeof a.handler === 'string') {
    if (!actionUrlTemplate || !notificationId) {
      return (
        <button
          type="button"
          className={baseClass}
          disabled
          title="Handler-mode actions on transient toasts aren't supported in v1"
          data-no-row-nav=""
        >
          <Body />
        </button>
      )
    }
    const url = actionUrlTemplate
      .replace(':id', encodeURIComponent(notificationId))
      .replace(':actionName', encodeURIComponent(a.name))
    const onClick = async (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      try {
        const r = await fetch(url, {
          method:      'POST',
          headers:     { Accept: 'application/json' },
          credentials: 'same-origin',
        })
        const json = await r.json().catch(() => null) as {
          ok?: boolean
          redirect?: string
          notifications?: NotificationMeta[]
          markedAsRead?: boolean
          error?: string
        } | null
        if (!r.ok || !json?.ok) {
          onNotify?.([{
            id:    `nact-err-${Date.now()}`,
            type:  'error',
            title: json?.error ?? 'Action failed',
          }])
          return
        }
        if (json.notifications?.length) onNotify?.(json.notifications)
        if (json.markedAsRead && notificationId && onMarkAsRead) onMarkAsRead(notificationId)
        onAfterClick?.()
        if (json.redirect) navigate(json.redirect)
      } catch (err) {
        onNotify?.([{
          id:    `nact-err-${Date.now()}`,
          type:  'error',
          title: err instanceof Error ? err.message : 'Action failed',
        }])
      }
    }
    return (
      <button
        type="button"
        className={baseClass}
        onClick={onClick}
        data-no-row-nav=""
      >
        <Body />
      </button>
    )
  }

  // Defensive fallback — wire shape validation should have stripped
  // any malformed entry upstream, but render an inert chip rather
  // than throw.
  return null
}
