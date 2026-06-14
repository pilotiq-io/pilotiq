/**
 * System Settings panes — the iOS-style settings contributions.
 *
 * Settings is the admin-runtime configuration surface, conceptually
 * distinct from user content (Pages / Globals). A single "Settings" gear
 * nav entry opens a shell with a section rail; each pane is one
 * contribution registered via `Pilotiq.settingsPane(c)` /
 * `Pilotiq.settingsPanes([…])`.
 *
 * Installed packages inject their own panes from inside their plugin's
 * `register(panel)` hook — `@pilotiq-pro/ai` adds an "AI" pane, the
 * built-in `themeEditor()` plugin adds the "Theme" pane, etc. — exactly
 * the way an iOS app shows up in Settings once installed.
 *
 * Shape mirrors `RightPanelContribution`: the React `render` reference
 * never crosses the wire — it rides through the Vite plugin's
 * `_components.ts` manifest (`settingsPaneRegistry`) keyed by `id`, same
 * posture as right-panel bodies and component-typed icons. Only the
 * pane's metadata (`SettingsPaneMeta`, in `pageData/navigation.ts`)
 * serializes.
 */

import type { ComponentType } from 'react'
import type { IconValue } from './icons/types.js'
import type { Page } from './Page.js'

/**
 * Body component contract for a render-type pane. Receives the runtime
 * context the surrounding shell already knows — base path, live
 * pathname, and the active pane id — so pane authors don't re-plumb it.
 *
 * Panes own their own data: a pane that persists values fetches/saves
 * against its own endpoint (the Theme pane reads `${basePath}/api/_theme`)
 * rather than relying on shell-provided props.
 */
export interface SettingsPaneProps {
  /** Path-prefix the panel is mounted under (matches `AppShell.basePath`). */
  basePath: string
  /** Live pathname — re-renders on SPA navigation. */
  currentPath?: string
  /** Active pane id (this pane's `id` when mounted). */
  activeId: string
}

export interface SettingsPaneContribution {
  /** Stable id (e.g. `'theme'`, `'ai'`). Doubles as the URL segment
   *  (`${base}/settings/<id>`) and the section-rail discriminator. Must
   *  match `^[A-Za-z0-9_.-]+$`; uniqueness enforced at boot. */
  id: string
  /** Section-rail label. */
  label: string
  /** Section-rail icon (registry name OR component). */
  icon?: IconValue
  /** Rail grouping header (iOS-style), e.g. `'General'` | `'Integrations'`.
   *  Panes without a group fall into an unlabeled leading section. */
  group?: string
  /** Body component. One of `render` / `page` / `href`. The Vite plugin
   *  keys it under `id` in the emitted `_components.ts` manifest so the
   *  client resolves it at mount without shipping the reference over the
   *  wire. */
  render?: ComponentType<SettingsPaneProps>
  /** Page-backed pane — the pane renders this Page's schema *inside* the
   *  settings shell (the rail persists), like a mini sub-page. The Page's
   *  own route still works standalone; here its resolved schema is shipped
   *  in the settings shell data. One of `render` / `page` / `href`. */
  page?: typeof Page
  /** Cross-link pane — the rail renders a link to this URL and clicking
   *  navigates away from the shell. One of `render` / `page` / `href`. */
  href?: string
  /**
   * Optional auth gate — runs through `panelInfo()` per request. Mirrors
   * `Resource.canAccess` shape: opaque user, sync or async; throwing →
   * fail-closed (pane dropped silently).
   */
  canAccess?: (user: unknown) => boolean | Promise<boolean>
  /** Hide from the rail without unregistering. Default `false`. */
  hidden?: boolean
  /** Rail ordering hint — lower first. Defaults to 100; ties break by
   *  registration order. */
  sort?: number
}

const ID_PATTERN = /^[A-Za-z0-9_.-]+$/

/**
 * Validate one contribution at registration time. Catches the obvious
 * boot-time foot-guns (bad id, missing/ambiguous body) so a misconfigured
 * panel fails on `Pilotiq.make(...)` rather than on first request.
 *
 * @internal
 */
export function validateSettingsPane(contribution: SettingsPaneContribution): void {
  if (typeof contribution.id !== 'string' || contribution.id.length === 0) {
    throw new Error(
      `[Pilotiq] settingsPane: contribution is missing an id. ` +
      `Pass \`{ id: 'my-pane', label: '…', render: Component }\`.`,
    )
  }
  if (!ID_PATTERN.test(contribution.id)) {
    throw new Error(
      `[Pilotiq] settingsPane: id "${contribution.id}" contains characters outside ` +
      `[A-Za-z0-9_.-]. The id rides in the settings URL and the meta wire shape.`,
    )
  }
  if (typeof contribution.label !== 'string' || contribution.label.length === 0) {
    throw new Error(
      `[Pilotiq] settingsPane: contribution "${contribution.id}" is missing a \`label\`.`,
    )
  }
  const hasRender = contribution.render !== undefined
  const hasPage = contribution.page !== undefined
  const hasHref = typeof contribution.href === 'string' && contribution.href.length > 0
  const sources = [hasRender, hasPage, hasHref].filter(Boolean).length
  if (sources > 1) {
    throw new Error(
      `[Pilotiq] settingsPane: contribution "${contribution.id}" sets more than one of ` +
      `\`render\` / \`page\` / \`href\`. A pane has exactly one body source — pick one.`,
    )
  }
  if (sources === 0) {
    throw new Error(
      `[Pilotiq] settingsPane: contribution "${contribution.id}" needs one of \`render\` ` +
      `(a component), \`page\` (a Page to render in-shell), or \`href\` (a link).`,
    )
  }
  if (hasRender && typeof contribution.render !== 'function' && typeof contribution.render !== 'object') {
    throw new Error(
      `[Pilotiq] settingsPane: contribution "${contribution.id}" \`render\` must be a React ` +
      `component (function or forwardRef object).`,
    )
  }
}

/**
 * Detect duplicate ids across an arrival contribution and the
 * already-registered set. Caller throws — keeps the error formatting in
 * one place.
 *
 * @internal
 */
export function findDuplicateSettingsPaneId(
  registered: readonly SettingsPaneContribution[],
  arriving: SettingsPaneContribution,
): SettingsPaneContribution | undefined {
  return registered.find((c) => c.id === arriving.id)
}
