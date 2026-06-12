import React, { useEffect, useState } from 'react'
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
import { RecordWrapperGate, type RecordCollabMap } from './RecordWrapperGate.js'
import { CustomPageWrapperGate, type PageCollabMap } from './CustomPageWrapperGate.js'
import { useIsMobile } from './hooks/use-mobile.js'
import type { NavItem, UserMenuMeta, DatabaseNotificationsMeta, RightSidebarMeta } from '../pageData.js'
import type { RenderHookMap } from '../RenderHook.js'
import { RenderHookSlot } from './RenderHookSlot.js'
import type { ComponentSlotRegistry } from './component-slots.js'
import { CurrentUserProvider } from './CurrentUserContext.js'
import { PanelI18nProvider, type PanelI18nBundle } from './PanelI18nContext.js'

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
    /** Per-resource collab opt-in map — read by `RecordWrapperGate` to
     *  decide whether to mount the plugin-registered RecordWrapper on
     *  a record edit/view URL. Absent when no resource opted in. */
    recordCollab?: RecordCollabMap
    /** Per-custom-page collab opt-in map — read by `CustomPageWrapperGate`
     *  to decide whether to mount the plugin-registered CustomPageWrapper
     *  on a custom-page URL. Absent when no page opted in. */
    pageCollab?: PageCollabMap
    /** Pre-resolved render-hook slots for the panel chrome (body /
     *  topbar / sidebar / user-menu / footer / head). Sparse map —
     *  slots with no registered entries are absent. Built by
     *  `panelInfo()` server-side. */
    renderHooks?: RenderHookMap
    themeEditor?: boolean
    /** Sidebar chrome options for the `'sidebar'` layout (variant /
     *  collapsible / side). Absent → defaults (`inset` / `icon` /
     *  `left`). Built by `panelInfo()` from `Pilotiq.sidebar(...)`. */
    sidebar?: {
      variant?:     'sidebar' | 'floating' | 'inset'
      collapsible?: 'offcanvas' | 'icon' | 'none'
      side?:        'left' | 'right'
    }
    /** AI suggestion mode — absent means `'auto'` (the default). When
     *  set to `'review'`, AI plugins read this and stage writes as
     *  `PendingSuggestion`s for user approval instead of applying
     *  immediately. Plan: `docs/plans/ai-review-mode.md`. */
    aiSuggestionsMode?: 'auto' | 'review'
    /** Server-resolved panel-i18n bundle (`{ [namespace]: mergedStrings }`).
     *  Absent when no package called `registerPanelI18n()`. Mounted via
     *  `<PanelI18nProvider>`; client components read with `usePanelI18n(ns)`. */
    i18n?: PanelI18nBundle
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
  layoutProviderRegistry?: ReadonlyArray<React.ComponentType<{ children: React.ReactNode; basePath?: string; currentPath?: string }>>
  /**
   * Build-time chrome-slot overrides from the Vite plugin. Populated
   * when the panel module calls `Pilotiq.components({ nav, … })`.
   * Sparse `{}` is the no-op default. Currently only `nav` is honored;
   * additional slots will land as concrete consumers ask.
   */
  componentSlotRegistry?: ComponentSlotRegistry
  /** Page breadcrumb element meta, extracted from `schemaData` by the
   *  auto-gen `+Layout`. The sidebar layout renders it in the header
   *  (next to the toggle) and suppresses the in-body copy; the topbar
   *  layout ignores it and keeps the breadcrumb in the body. */
  breadcrumb?: BreadcrumbMeta
  children: React.ReactNode
}

/** Minimal shape of the `breadcrumbs` element meta consumed by the
 *  header. Mirrors what `Breadcrumbs.toMeta()` emits. */
export interface BreadcrumbMeta {
  type:  'breadcrumbs'
  items: { label: string; url?: string }[]
}

export function AppShell({ layout = 'sidebar', notifications, componentRegistry, rightPanelRegistry, layoutProviderRegistry, ...props }: AppShellProps) {
  const Layout = layout === 'topbar' ? TopbarLayout : SidebarLayout
  // exactOptionalPropertyTypes: only spread `initialNotifications` when set.
  const toasterProps = notifications ? { initialNotifications: notifications } : {}

  // Stamp the panel-wide AI suggestion mode on a window global so the
  // AI plugin's `update_form_state` client-tool handler can read it
  // without context plumbing. Singleton flag — doesn't change between
  // pages within the same panel. Absent on the wire means the default
  // ('review' — panelInfo emits sparsely). Plan: `docs/plans/ai-review-mode.md`.
  const aiSuggestionsMode = props.panel.aiSuggestionsMode ?? 'review'
  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as unknown as { __pilotiqAiSuggestionsMode?: 'auto' | 'review' }).__pilotiqAiSuggestionsMode = aiSuggestionsMode
  }, [aiSuggestionsMode])

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

  // Record-scoped wrapper (collab room, audit trail, …) — pass-through
  // when no plugin registered a wrapper or when the URL isn't a
  // record-edit page. Wrapping `children` before forwarding to `Layout`
  // mounts the wrapper around the page content area only, leaving the
  // sidebar / topbar chrome outside.
  const layoutProps = {
    ...props,
    children: (
      <RecordWrapperGate
        basePath={props.basePath}
        {...(props.currentPath !== undefined ? { currentPath: props.currentPath } : {})}
        {...(props.panel.recordCollab !== undefined ? { recordCollab: props.panel.recordCollab } : {})}
      >
        <CustomPageWrapperGate
          basePath={props.basePath}
          {...(props.currentPath !== undefined ? { currentPath: props.currentPath } : {})}
          {...(props.panel.pageCollab !== undefined ? { pageCollab: props.panel.pageCollab } : {})}
        >
          {props.children}
        </CustomPageWrapperGate>
      </RecordWrapperGate>
    ),
  }

  const inner = (
    <ToasterProvider {...toasterProps}>
      <CommandPaletteProvider setOpen={setPaletteOpen}>
        <RenderHookSlot name="panels::body.start" hooks={hooks} />
        <RightSidebarLayoutFrame>
          <Layout {...layoutProps} />
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
    props.currentPath,
  )

  // `CurrentUserProvider` sits OUTSIDE the layout-provider chain so
  // plugin-registered providers (e.g. `@pilotiq-pro/collab`'s
  // CollabProvider, which threads the user into CollaborationCaret
  // presence labels) can read the active user via `useCurrentUser()`.
  // Value source mirrors what the top-right user dropdown renders.
  // `PanelI18nProvider` sits outermost so every chrome + page + plugin
  // component (incl. layout-provider-wrapped subtrees) reads the same
  // server-resolved i18n bundle via `usePanelI18n()`. No-op when absent.
  return (
    <PanelI18nProvider {...(props.panel.i18n ? { i18n: props.panel.i18n } : {})}>
      <CurrentUserProvider value={props.panel.userMenu?.user ?? null}>
        {wrapped}
      </CurrentUserProvider>
    </PanelI18nProvider>
  )
}

/**
 * Fold registered layout providers around `tree` from last to first so
 * the first-registered provider ends up outermost in the React tree
 * (closest to the layout root) — matches the registration-order
 * intuition documented on `Pilotiq.layoutProvider`.
 */
function wrapInLayoutProviders(
  tree:       React.ReactElement,
  registry:   ReadonlyArray<React.ComponentType<{ children: React.ReactNode; basePath?: string; currentPath?: string }>> | undefined,
  basePath:   string,
  currentPath?: string,
): React.ReactElement {
  if (!registry || registry.length === 0) return tree
  let acc: React.ReactElement = tree
  for (let i = registry.length - 1; i >= 0; i--) {
    const Provider = registry[i]!
    acc = <Provider basePath={basePath} {...(currentPath !== undefined ? { currentPath } : {})}>{acc}</Provider>
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
