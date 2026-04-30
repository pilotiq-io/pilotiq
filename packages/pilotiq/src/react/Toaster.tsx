import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2Icon, AlertTriangleIcon, AlertCircleIcon, InfoIcon, XIcon,
  type LucideIcon,
} from 'lucide-react'
import type { NotificationMeta, NotificationType } from '../notifications/Notification.js'

interface ToasterContextValue {
  /** Add a notification to the stack. The id is auto-generated when
   * absent so the same `Notification.make().toMeta()` can be re-used. */
  notify: (n: NotificationMeta | Omit<NotificationMeta, 'id'>) => void
}

const ToasterContext = createContext<ToasterContextValue>({ notify: () => {} })

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  info:    InfoIcon,
  success: CheckCircle2Icon,
  warning: AlertTriangleIcon,
  error:   AlertCircleIcon,
}

const TYPE_CLASSES: Record<NotificationType, string> = {
  info:    'border-blue-200    bg-blue-50    text-blue-900    dark:border-blue-900    dark:bg-blue-950/40    dark:text-blue-100',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
  warning: 'border-amber-200   bg-amber-50   text-amber-900   dark:border-amber-900   dark:bg-amber-950/40   dark:text-amber-100',
  error:   'border-red-200     bg-red-50     text-red-900     dark:border-red-900     dark:bg-red-950/40     dark:text-red-100',
}

const TYPE_ICON_CLASSES: Record<NotificationType, string> = {
  info:    'text-blue-600    dark:text-blue-300',
  success: 'text-emerald-600 dark:text-emerald-300',
  warning: 'text-amber-600   dark:text-amber-300',
  error:   'text-red-600     dark:text-red-300',
}

let _clientIdSeq = 0
function clientId(): string {
  _clientIdSeq += 1
  return `c-${_clientIdSeq}`
}

interface ToastItemProps {
  item:      NotificationMeta
  onDismiss: () => void
}

function ToastItem({ item, onDismiss }: ToastItemProps) {
  const Icon = TYPE_ICONS[item.type]
  const cls  = TYPE_CLASSES[item.type]
  const iconCls = TYPE_ICON_CLASSES[item.type]

  // Auto-dismiss timer. Skip when duration === 0 (persistent until
  // manually dismissed).
  useEffect(() => {
    const ms = item.duration ?? 5000
    if (ms <= 0) return
    const t = setTimeout(onDismiss, ms)
    return () => clearTimeout(t)
  }, [item.duration, onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${cls}`}
    >
      <Icon className={`size-5 mt-0.5 shrink-0 ${iconCls}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug">{item.title}</p>
        {item.body && (
          <p className="text-xs leading-snug mt-0.5 opacity-90">{item.body}</p>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  )
}

/**
 * Provider that mounts the toast stack and exposes `useToast()` to descendants.
 * Wrap your app once near the root (the AppShell does this automatically).
 *
 * `initialNotifications` is the server-flashed list — the AppShell reads
 * it from `viewProps.notifications` and forwards it here. They flash on
 * first mount and then disappear; subsequent re-renders don't re-flash.
 */
export function ToasterProvider({
  children,
  initialNotifications,
}: {
  children:              React.ReactNode
  initialNotifications?: NotificationMeta[]
}) {
  const [items, setItems] = useState<NotificationMeta[]>([])
  // Ref instead of useState: React 18 Strict Mode (dev) intentionally
  // runs effects twice on the same component instance to surface mount-
  // time bugs. With a useState flag the second run sees the stale closure
  // value (state setters are async; the second effect's closure was
  // captured at the same render as the first), so it would re-add the
  // notifications and the user gets duplicate toasts. A ref updates
  // synchronously and is shared across both effect invocations of the
  // same render.
  const flashedRef = useRef(false)

  // Flash server-provided notifications on first mount only.
  useEffect(() => {
    if (flashedRef.current) return
    flashedRef.current = true
    if (initialNotifications && initialNotifications.length > 0) {
      setItems(prev => [...prev, ...initialNotifications])
    }
  }, [initialNotifications])

  const notify = useCallback<ToasterContextValue['notify']>((n) => {
    const id = (n as NotificationMeta).id ?? clientId()
    setItems(prev => [...prev, { ...(n as NotificationMeta), id }])
  }, [])

  const dismiss = useCallback((id: string) => {
    setItems(prev => prev.filter(x => x.id !== id))
  }, [])

  return (
    <ToasterContext.Provider value={{ notify }}>
      {children}
      {/* Stack — fixed bottom-right, click-through unless toast hovered. */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
        {items.map(item => (
          <ToastItem key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToasterContext.Provider>
  )
}

/** Programmatic notify hook for client-side triggers (form submits,
 * client-only handlers, etc.). Falls through silently when no
 * ToasterProvider is mounted. */
export function useToast(): ToasterContextValue {
  return useContext(ToasterContext)
}
