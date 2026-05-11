import React, { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'
import { alertStyles, TEXT_COLOR_CLASSES } from './constants.js'

// ─── Alert renderer ─────────────────────────────────────────
//
// Owns dismissal state (per-mount + optional localStorage persistence)
// + icon dispatch + footer-actions alignment. Lifted out of the inline
// `case 'alert'` branch when Alert gained `dismissible() / iconColor() /
// footerActionsAlignment()` setters — those need component-local state
// (the dismiss button, the persisted-dismissal hydration on mount), and
// inlining the hooks under a switch arm is fragile.

const ALERT_TYPE_ICONS: Record<string, ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>> = {
  info:    InfoIcon,
  warning: TriangleAlertIcon,
  success: CircleCheckIcon,
  danger:  CircleAlertIcon,
}

const ALERT_TYPE_DEFAULT_ICON_COLOR: Record<string, string> = {
  info:    'info',
  warning: 'warning',
  success: 'success',
  danger:  'destructive',
}

const ALERT_ACTIONS_ALIGNMENT: Record<string, string> = {
  start:  'justify-start',
  center: 'justify-center',
  end:    'justify-end',
}

function alertPersistKey(persistKey: string): string {
  return `pilotiq.alert.${persistKey}`
}

export function AlertRenderer(props: {
  alertType:         string
  content:           string
  title?:            string
  dismissible?:      boolean
  persistDismissal?: string
  iconColor?:        string
  actionsAlignment?: string
  footer:            React.ReactNode[]
}): React.ReactNode {
  const {
    alertType, content, title, dismissible,
    persistDismissal, iconColor, actionsAlignment, footer,
  } = props
  const [dismissed, setDismissed] = useState(false)

  // Hydrate persisted-dismissal on first paint. `useState(false)` keeps
  // SSR + first client paint identical (Hydration safe); the effect
  // flips to dismissed if localStorage has the flag set.
  useEffect(() => {
    if (!persistDismissal) return
    if (typeof window === 'undefined') return
    try {
      if (window.localStorage.getItem(alertPersistKey(persistDismissal)) === '1') {
        setDismissed(true)
      }
    } catch { /* localStorage blocked (Safari ITP / SSR) — render visible */ }
  }, [persistDismissal])

  if (dismissed) return null

  const styles    = alertStyles[alertType] ?? alertStyles['info']!
  const Icon      = ALERT_TYPE_ICONS[alertType] ?? InfoIcon
  const iconColorKey = iconColor ?? ALERT_TYPE_DEFAULT_ICON_COLOR[alertType] ?? 'info'
  const iconColorCls = TEXT_COLOR_CLASSES[iconColorKey] ?? ''
  const alignCls  = ALERT_ACTIONS_ALIGNMENT[actionsAlignment ?? 'start'] ?? 'justify-start'

  const handleDismiss = (): void => {
    setDismissed(true)
    if (persistDismissal && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(alertPersistKey(persistDismissal), '1')
      } catch { /* localStorage blocked — dismiss is per-mount only */ }
    }
  }

  return (
    <div className={`relative rounded-lg border p-4 ${styles} ${dismissible ? 'pr-9' : ''}`}>
      <div className="flex gap-3">
        <Icon className={`size-5 shrink-0 mt-0.5 ${iconColorCls}`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          {title !== undefined && <p className="font-medium mb-1">{title}</p>}
          <p className="text-sm">{content}</p>
          {footer.length > 0 && (
            <div className={`flex items-center gap-2 mt-3 ${alignCls}`}>
              {footer}
            </div>
          )}
        </div>
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="absolute top-3 right-3 inline-flex h-6 w-6 items-center justify-center rounded opacity-70 hover:opacity-100 transition-opacity"
        >
          <XIcon className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
