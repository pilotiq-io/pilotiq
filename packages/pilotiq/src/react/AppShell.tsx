import React, { useState } from 'react'
import { SidebarLayout } from './layouts/SidebarLayout.js'
import { TopbarLayout } from './layouts/TopbarLayout.js'
import { ToasterProvider } from './Toaster.js'
import { CommandPalette, CommandPaletteProvider } from './CommandPalette.js'
import type { NotificationMeta } from '../notifications/Notification.js'
import type { ComponentRegistry } from './icon-context.js'
import { ComponentRegistryProvider } from './icon-context.js'
import type { RightPanelRegistry } from './right-panel-registry.js'
import { RightPanelRegistryProvider } from './right-panel-registry.js'
import { RightSidebarProvider, useRightSidebarOptional } from './RightSidebarContext.js'
import { RightSidebar } from './RightSidebar.js'
import { useIsMobile } from './hooks/use-mobile.js'
import type { NavItem, UserMenuMeta, DatabaseNotificationsMeta, RightSidebarMeta } from '../pageData.js'
import type { RenderHookMap } from '../RenderHook.js'
import { RenderHookSlot } from './RenderHookSlot.js'

export interface AppShellProps {
  panel: {
    name: string
    branding: { title?: string; logo?: string }
    /** Pre-grouped navigation tree built by `panelInfo()` (Plan #9). */
    navigation?: NavItem[]
    /** Top-right dropdown shape — `null`/absent suppresses the menu
     *  entirely (no resolver configured or no logged-in user). */
    userMenu?: UserMenuMeta | null
    /** Bell-icon dropdown config — absent suppresses the bell.
     *  `panelInfo()` only ships this when the panel opted in via
     *  `Pilotiq.databaseNotifications()` AND a user resolved. */
    databaseNotifications?: DatabaseNotificationsMeta
    /** Right-sidebar plugin meta — absent suppresses the surface.
     *  `panelInfo()` only ships this when at least one contribution
     *  was registered AND passed the auth gate AND is non-hidden. */
    rightSidebar?: RightSidebarMeta
    /** Pre-resolved render-hook slots for the panel chrome (body /
     *  topbar / sidebar / user-menu / footer / head). Sparse map —
     *  slots with no registered entries are absent. Built by
     *  `panelInfo()` server-side. */
    renderHooks?: RenderHookMap
    themeEditor?: boolean
  }
  basePath: string
  /** Pathname used to compute active-link state in the sidebar/topbar. */
  currentPath?: string
  layout?: 'sidebar' | 'topbar'
  /** Server-flashed notifications from `viewProps.notifications`. The
   * Toaster mounts them on first render. */
  notifications?: NotificationMeta[]
  /** Build-time class manifest emitted by the Pilotiq Vite plugin
   * (`pages/(pilotiq)/_components.ts`). Maps Resource/Global/Page class
   * names to the actual class refs so component-typed icons (e.g.,
   * `Resource.icon = Newspaper`) render. Optional — when missing, only
   * string-registry icons resolve. */
  componentRegistry?: ComponentRegistry
  /**
   * Build-time right-panel registry from the Vite plugin. Maps each
   * `RightPanelContribution.id` to the React component supplied as
   * `render`. Phase C's `RightSidebar` chrome reads this via
   * `useRightPanelComponent(id)`. Sparse `{}` is a valid value — the
   * chrome simply doesn't mount.
   */
  rightPanelRegistry?: RightPanelRegistry
  /**
   * Build-time layout-provider registry from the Vite plugin. Each entry
   * is a React component that wraps the panel's layout tree at the
   * root. Plugins register via `Pilotiq.layoutProvider(C)`; the Vite
   * plugin harvests refs into this array. Empty `[]` is the no-op
   * default — chrome renders without any extra wrapping.
   */
  layoutProviderRegistry?: ReadonlyArray<React.ComponentType<{ children: React.ReactNode; basePath?: string }>>
  children: React.ReactNode
}

export function AppShell({ layout = 'sidebar', notifications, componentRegistry, rightPanelRegistry, layoutProviderRegistry, ...props }: AppShellProps) {
  const Layout = layout === 'topbar' ? TopbarLayout : SidebarLayout
  // exactOptionalPropertyTypes: only spread `initialNotifications` when set.
  const toasterProps = notifications ? { initialNotifications: notifications } : {}

  // Plan #12 — palette open state lives at AppShell so the trigger pill
  // (rendered inside the layout's header) and the palette dialog both
  // observe the same flag via context.
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteProps: {
    basePath:     string
    navigation?:  NavItem[]
    open:         boolean
    onOpenChange: (open: boolean) => void
  } = {
    basePath:     props.basePath,
    open:         paletteOpen,
    onOpenChange: setPaletteOpen,
  }
  if (props.panel.navigation) paletteProps.navigation = props.panel.navigation

  const hooks = props.panel.renderHooks
  const rightSidebarMeta = props.panel.rightSidebar

  const inner = (
    <ToasterProvider {...toasterProps}>
      <CommandPaletteProvider setOpen={setPaletteOpen}>
        <RenderHookSlot name="panels::body.start" hooks={hooks} />
        <RightSidebarLayoutFrame>
          <Layout {...props} />
        </RightSidebarLayoutFrame>
        <RenderHookSlot name="panels::body.end" hooks={hooks} />
        <CommandPalette {...paletteProps} />
        {rightSidebarMeta && (
          <RightSidebar
            basePath={props.basePath}
            {...(props.currentPath !== undefined ? { currentPath: props.currentPath } : {})}
          />
        )}
      </CommandPaletteProvider>
    </ToasterProvider>
  )

  // Plugin-registered layout providers (e.g. AI chat queue, tenant
  // theme switcher). Wraps in registration order: the FIRST registered
  // provider sits OUTERMOST (closest to the layout root); LAST sits
  // INNERMOST (closest to the page tree). Empty / unset → no wrap.
  const wrapped = wrapInLayoutProviders(
    <ComponentRegistryProvider value={componentRegistry}>
      <RightPanelRegistryProvider value={rightPanelRegistry}>
        {rightSidebarMeta ? (
          <RightSidebarProvider meta={rightSidebarMeta} basePath={props.basePath}>
            {inner}
          </RightSidebarProvider>
        ) : (
          inner
        )}
      </RightPanelRegistryProvider>
    </ComponentRegistryProvider>,
    layoutProviderRegistry,
    props.basePath,
  )

  return wrapped
}

/**
 * Fold registered layout providers around `tree` from last to first so
 * the first-registered provider ends up outermost in the React tree
 * (closest to the layout root) — matches the registration-order
 * intuition documented on `Pilotiq.layoutProvider`.
 */
function wrapInLayoutProviders(
  tree:     React.ReactElement,
  registry: ReadonlyArray<React.ComponentType<{ children: React.ReactNode; basePath?: string }>> | undefined,
  basePath: string,
): React.ReactElement {
  if (!registry || registry.length === 0) return tree
  let acc: React.ReactElement = tree
  for (let i = registry.length - 1; i >= 0; i--) {
    const Provider = registry[i]!
    acc = <Provider basePath={basePath}>{acc}</Provider>
  }
  return acc
}

/**
 * Padding shim that compresses host content when the right sidebar is
 * open on desktop. The fixed-position rail would otherwise overlap
 * content; this wrapper reads the optional `RightSidebarProvider`
 * context (it's a no-op when the surface isn't mounted) and applies
 * `padding-inline-end` matching the active panel width.
 *
 * The shim avoids touching SidebarLayout / TopbarLayout internals — the
 * layouts expand to fill the wrapper's content box, so trimming inside
 * the wrapper compresses both the sticky header and the main scroll
 * region together.
 */
function RightSidebarLayoutFrame({ children }: { children: React.ReactNode }) {
  const sidebar = useRightSidebarOptional()
  const isMobile = useIsMobile()
  const apply = sidebar && sidebar.open && !isMobile
  // Always render the same wrapper element so toggling open/closed
  // doesn't remount the Layout subtree (which would drop the user's
  // scroll position and any uncontrolled-input state). Only the inline
  // style flips.
  const style: React.CSSProperties | undefined = apply
    ? { paddingInlineEnd: sidebar!.width, transition: 'padding-inline-end 150ms ease-out' }
    : { transition: 'padding-inline-end 150ms ease-out' }
  return <div style={style}>{children}</div>
}
