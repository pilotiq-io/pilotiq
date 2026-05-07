/**
 * Right-sidebar plugin contributions.
 *
 * The right sidebar is a panel-level surface (mirroring `userMenuItems`
 * / `databaseNotifications` in shape) that plugins register panes on.
 * Pilotiq core ships the chrome — collapse toggle, drag-to-resize, tab
 * strip when 2+ contributions, mobile sheet fallback, keyboard shortcut.
 * Each contribution provides only its body.
 *
 * Wire shape (`RightPanelMeta` / `RightSidebarMeta`) lives in
 * `pageData.ts` next to `DatabaseNotificationsMeta`. The React component
 * reference (`render`) does not serialize over the wire — it rides
 * through the Vite plugin's `_components.ts` manifest keyed by `id`,
 * same posture as component-typed Resource icons.
 *
 * @see docs/plans/right-sidebar.md
 */

import type { ComponentType } from 'react'
import type { IconValue } from './icons/types.js'

/**
 * Body component contract. The component receives runtime context the
 * surrounding chrome already knows about — base path, current pathname,
 * the active contribution id — so plugin authors don't have to plumb it
 * separately.
 *
 * Plugins that need richer state (chat session, presence cache) wrap
 * their own provider around the body internally; pilotiq doesn't
 * prescribe one.
 */
export interface RightPanelProps {
  /** Path-prefix the panel is mounted under (matches `AppShell.basePath`). */
  basePath: string
  /** Live pathname — re-renders on SPA navigation so panes can react to
   *  which page the user is on (record id, resource slug, etc). */
  currentPath?: string
  /** Active contribution id (this contribution's `id` when mounted).
   *  Useful for consumers that share a single context across multiple
   *  registered panes. */
  activeId: string
}

export interface RightPanelContribution {
  /** Stable id (e.g. `'ai.chat'`). Doubles as the localStorage key
   *  segment for `activeId` and the tab strip's discriminator. Must
   *  match `^[A-Za-z0-9_.-]+$`; uniqueness enforced at boot. */
  id: string
  /** Tab strip label. Defaults to `id` when absent. */
  label?: string
  /** Tab strip icon (registry name OR component). */
  icon?: IconValue
  /** Body component. Pilotiq's Vite plugin keys it under `id` in the
   *  emitted `_components.ts` manifest so the client looks it up at
   *  mount time without shipping the component reference over the wire. */
  render: ComponentType<RightPanelProps>
  /** Default open width in px. Clamped to [240, 800]; defaults to 360. */
  defaultWidth?: number
  /**
   * Optional auth gate — runs through `panelInfo()` per request. Mirrors
   * `Resource.canAccess` shape: opaque user, sync or async, throwing →
   * fail-closed (contribution dropped silently).
   */
  canAccess?: (user: unknown) => boolean | Promise<boolean>
  /**
   * Hide from the tab strip without unregistering. Useful for "trigger
   * only" panes opened programmatically by another plugin's affordance.
   * Default `false`.
   */
  hidden?: boolean
  /** Tab strip ordering hint — lower first. Defaults to 100; ties break
   *  by registration order. */
  sort?: number
}

/** Minimum/maximum width (px) the chrome will allow on resize. */
export const RIGHT_PANEL_MIN_WIDTH = 240
export const RIGHT_PANEL_MAX_WIDTH = 800
export const RIGHT_PANEL_DEFAULT_WIDTH = 360

const ID_PATTERN = /^[A-Za-z0-9_.-]+$/

/**
 * Validate one contribution at registration time. Catches the obvious
 * boot-time foot-guns (bad id, missing render) so a misconfigured panel
 * fails on `Pilotiq.make(...)` rather than on first request.
 *
 * @internal
 */
export function validateRightPanel(contribution: RightPanelContribution): void {
  if (typeof contribution.id !== 'string' || contribution.id.length === 0) {
    throw new Error(
      `[Pilotiq] rightPanel: contribution is missing an id. ` +
      `Pass \`{ id: 'my-pane', render: Component }\`.`,
    )
  }
  if (!ID_PATTERN.test(contribution.id)) {
    throw new Error(
      `[Pilotiq] rightPanel: id "${contribution.id}" contains characters outside ` +
      `[A-Za-z0-9_.-]. The id rides in localStorage keys and the meta wire shape.`,
    )
  }
  if (typeof contribution.render !== 'function' && typeof contribution.render !== 'object') {
    throw new Error(
      `[Pilotiq] rightPanel: contribution "${contribution.id}" is missing a \`render\` ` +
      `component. Pass a React component (function or forwardRef object).`,
    )
  }
  if (contribution.defaultWidth !== undefined) {
    const w = contribution.defaultWidth
    if (typeof w !== 'number' || !Number.isFinite(w) || w < RIGHT_PANEL_MIN_WIDTH || w > RIGHT_PANEL_MAX_WIDTH) {
      throw new Error(
        `[Pilotiq] rightPanel: contribution "${contribution.id}" has defaultWidth=${w} ` +
        `outside the [${RIGHT_PANEL_MIN_WIDTH}, ${RIGHT_PANEL_MAX_WIDTH}] range.`,
      )
    }
  }
}

/**
 * Detect duplicate ids across an arrival contribution and the
 * already-registered set. Caller throws — keeps the error message
 * formatting in one place.
 *
 * @internal
 */
export function findDuplicateRightPanelId(
  registered: readonly RightPanelContribution[],
  arriving: RightPanelContribution,
): RightPanelContribution | undefined {
  return registered.find((c) => c.id === arriving.id)
}
