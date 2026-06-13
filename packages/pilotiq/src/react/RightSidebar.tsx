/**
 * Right-sidebar chrome — outer panel that hosts plugin contributions.
 *
 * Mounted by `AppShell` only when `panel.rightSidebar` is present in the
 * server-built meta. Reads runtime state (open / activeId / width) from
 * `useRightSidebar()` and resolves each contribution's body via
 * `useRightPanelComponent(id)` (Phase B's `_components.ts` manifest).
 *
 * Desktop: right-docked `position: fixed` rail with a 4px left-edge resize
 * handle. The companion `<RightSidebarSpacer>` reserves layout width on
 * the host so content compresses instead of clipping under the rail.
 *
 * Mobile (< md breakpoint): collapses to an overlay `<Sheet>` — no resize
 * handle, fixed width.
 *
 * Tab strip: hidden when only one contribution is registered (single-tab
 * UX matches VS Code's "Outline / etc." behaviour). Tabs persist active
 * selection through the provider's localStorage round-trip.
 */
import React from 'react'
import { XIcon } from 'lucide-react'
import { cn } from './utils.js'
import { useRightSidebar } from './RightSidebarContext.js'
import { useRightPanelComponent } from './right-panel-registry.js'
import { useIconFor } from './icon-context.js'
import { useIsMobile } from './hooks/use-mobile.js'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from './ui/sheet.js'
import type { SerializedIcon } from '../icons/types.js'
import type { RightPanelMeta } from '../pageData.js'

export interface RightSidebarProps {
  basePath: string
  /** Live pathname — re-renders the panel body on SPA nav so consumers
   *  can react to which page the user is on. */
  currentPath?: string
  /** Breadcrumb-resolved leaf title of the current page (record title on
   *  record pages). Forwarded to panes as `RightPanelProps.recordTitle`. */
  recordTitle?: string
}

function PanelIcon({ value }: { value: SerializedIcon | undefined }) {
  const Icon = useIconFor(value)
  if (!Icon) return null
  return <Icon className="size-4" aria-hidden="true" />
}

function PanelBody({
  contribution,
  basePath,
  currentPath,
  recordTitle,
}: {
  contribution: RightPanelMeta
  basePath:     string
  currentPath?: string
  recordTitle?: string
}) {
  const Component = useRightPanelComponent(contribution.id)
  if (!Component) {
    return (
      <div className="p-4 text-sm text-destructive">
        <p className="font-medium">Right panel not registered</p>
        <p className="mt-1 text-muted-foreground">
          No client component is bound to <code className="rounded bg-muted px-1">{contribution.id}</code>.
          The Vite plugin&apos;s <code className="rounded bg-muted px-1">_components.ts</code> manifest is missing this entry —
          extract the <code className="rounded bg-muted px-1">render</code> reference to a named export.
        </p>
      </div>
    )
  }
  // Component reads its own context as needed; we forward the well-known
  // RightPanelProps (basePath / currentPath / activeId) defined in
  // `RightPanel.ts` so plugin authors don't have to plumb it themselves.
  // `currentPath` is conditionally spread so an absent value does not
  // collide with the prop's `undefined`-disallowed (exactOptional) shape.
  const props: { basePath: string; activeId: string; currentPath?: string; recordTitle?: string } = {
    basePath,
    activeId: contribution.id,
  }
  if (currentPath !== undefined) props.currentPath = currentPath
  if (recordTitle !== undefined) props.recordTitle = recordTitle
  return <Component {...props} />
}

function TabStrip({
  contributions,
  activeId,
  setActiveId,
}: {
  contributions: RightPanelMeta[]
  activeId:      string | null
  setActiveId:   (id: string) => void
}) {
  if (contributions.length < 2) return null
  return (
    <div role="tablist" className="flex items-center gap-0 border-b bg-muted/30 px-1">
      {contributions.map((c) => {
        const active = c.id === activeId
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setActiveId(c.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-xs font-medium transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <PanelIcon value={c.icon} />
            <span>{c.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function PanelHeader({
  active,
  onClose,
  hideTabs,
}: {
  active:   RightPanelMeta | undefined
  onClose:  () => void
  hideTabs: boolean
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      {hideTabs && active && (
        <>
          <PanelIcon value={active.icon} />
          <span className="text-sm font-medium">{active.label}</span>
        </>
      )}
      <button
        type="button"
        onClick={onClose}
        className={cn(
          'ms-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
          'hover:bg-accent hover:text-foreground',
        )}
        aria-label="Close right sidebar"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * Outer chrome. Renders a fixed-position rail on desktop and a Sheet on
 * mobile. Reads its open / width / active state from the surrounding
 * `RightSidebarProvider`.
 */
export function RightSidebar({ basePath, currentPath, recordTitle }: RightSidebarProps): React.ReactElement | null {
  const sidebar  = useRightSidebar()
  const isMobile = useIsMobile()

  // Drag-resize: the provider owns width state + per-basePath
  // localStorage persistence, so the chrome just listens at the document
  // level and forwards each delta into `sidebar.setWidth`.
  const onPointerDown = (e: React.PointerEvent<HTMLElement>): void => {
    e.preventDefault()
    const startX     = e.clientX
    const startWidth = sidebar.width
    const onMove = (ev: PointerEvent): void => {
      const delta = startX - ev.clientX
      sidebar.setWidth(startWidth + delta)
    }
    const onUp = (): void => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup',   onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup',   onUp)
  }

  const active = sidebar.contributions.find((c) => c.id === sidebar.activeId)
              ?? sidebar.contributions[0]
  const hideTabs = sidebar.contributions.length < 2

  if (!sidebar.open) return null

  if (isMobile) {
    return (
      <Sheet open={sidebar.open} onOpenChange={sidebar.setOpen}>
        <SheetContent
          side="right"
          className="flex w-[min(20rem,calc(100vw-3rem))] flex-col p-0"
          showCloseButton={false}
        >
          <SheetHeader className="border-b">
            <SheetTitle>{active?.label ?? 'Side panel'}</SheetTitle>
          </SheetHeader>
          <TabStrip
            contributions={sidebar.contributions}
            activeId={sidebar.activeId}
            setActiveId={sidebar.setActiveId}
          />
          <div className="flex-1 overflow-y-auto">
            {active && (
              <PanelBody
                contribution={active}
                basePath={basePath}
                {...(currentPath !== undefined ? { currentPath } : {})}
                {...(recordTitle !== undefined ? { recordTitle } : {})}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      data-pilotiq-right-sidebar=""
      style={{ width: sidebar.width }}
      className={cn(
        'fixed inset-y-0 end-0 z-30 flex flex-col border-s bg-background shadow-sm',
      )}
      role="complementary"
      aria-label={active?.label ?? 'Side panel'}
    >
      {/* Left-edge resize handle. Thin strip; 4px wide hit area, 1px
          highlight band on hover. Pointer events live at document level
          inside the handler so leaving the strip doesn't end the drag. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize side panel"
        onPointerDown={onPointerDown}
        className={cn(
          'absolute inset-y-0 start-0 w-1 cursor-ew-resize',
          'hover:bg-border/80',
        )}
      />
      <PanelHeader active={active} onClose={() => sidebar.setOpen(false)} hideTabs={hideTabs} />
      <TabStrip
        contributions={sidebar.contributions}
        activeId={sidebar.activeId}
        setActiveId={sidebar.setActiveId}
      />
      <div className="flex-1 overflow-y-auto">
        {active && (
          <PanelBody
            contribution={active}
            basePath={basePath}
            {...(currentPath !== undefined ? { currentPath } : {})}
            {...(recordTitle !== undefined ? { recordTitle } : {})}
          />
        )}
      </div>
    </aside>
  )
}
