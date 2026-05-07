/**
 * Right-sidebar toggle button.
 *
 * Mounts in the topbar's right cluster between `NotificationBell` and
 * `UserMenu`. Renders nothing when no `<RightSidebarProvider>` is mounted
 * (i.e., `panel.rightSidebar` was absent from `panelInfo()`), so layouts
 * can include the trigger unconditionally and let it self-suppress.
 *
 * Icon swaps between open and closed states (matches the upstream
 * `PanelRightOpen` / `PanelRightClose` Lucide pair). The keyboard
 * shortcut (Mod-Shift-\) is owned by the provider — the button is just
 * a click affordance.
 */
import React from 'react'
import { PanelRightOpenIcon, PanelRightCloseIcon } from 'lucide-react'
import { cn } from './utils.js'
import { useRightSidebarOptional } from './RightSidebarContext.js'
import { useIconFor } from './icon-context.js'

export function RightSidebarTrigger(): React.ReactElement | null {
  const sidebar = useRightSidebarOptional()
  // When a single contribution is registered, prefer its icon on the
  // trigger. With 2+, fall back to the generic panel icon — the per-tab
  // icons live on the tab strip.
  const single = sidebar && sidebar.contributions.length === 1
    ? sidebar.contributions[0]
    : undefined
  const SingleIcon = useIconFor(single?.icon)

  if (!sidebar) return null
  if (sidebar.contributions.length === 0) return null

  const open = sidebar.open
  const Fallback = open ? PanelRightCloseIcon : PanelRightOpenIcon
  const Icon = SingleIcon ?? Fallback

  return (
    <button
      type="button"
      onClick={sidebar.toggle}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-foreground',
        open && 'bg-accent text-foreground',
      )}
      aria-label={open ? 'Close side panel' : 'Open side panel'}
      aria-pressed={open}
      title={open ? 'Close side panel (⌘⇧\\)' : 'Open side panel (⌘⇧\\)'}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  )
}
