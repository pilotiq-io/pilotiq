import type { ComponentType, ReactNode } from 'react'

/**
 * Props the custom-page wrapper receives from `CustomPageWrapperGate`
 * when the current URL resolves to an opted-in custom page (a `Page`
 * subclass with `static collab = { room: '…' }`).
 *
 * The wrapper owns whatever page-scoped context the plugin provides —
 * `@pilotiq-pro/collab` mounts a collab room here so every collab
 * field inside the page tree shares one Y.Doc + WS connection. Other
 * plugins could mount per-page presence, audit logging, etc.
 *
 * `pageSlug` is the gate's URL slug (cluster-prefixed for clustered
 * pages). `room` is the literal `room` value the page declared on
 * `static collab` — opaque to pilotiq; the plugin is free to namespace
 * it internally before opening the WS.
 */
export interface CustomPageWrapperProps {
  pageSlug: string
  room:     string
  presence: boolean
  children: ReactNode
}

let _component: ComponentType<CustomPageWrapperProps> | null = null

/**
 * Register a component that wraps the page tree on every opted-in
 * custom-page route. Called once at boot by a plugin (e.g.
 * `@pilotiq-pro/collab`). No-op when no plugin registers —
 * `CustomPageWrapperGate` passes through unchanged.
 */
export function registerCustomPageWrapper(C: ComponentType<CustomPageWrapperProps>): void {
  _component = C
}

/** Returns the registered wrapper component, or `null`. */
export function getCustomPageWrapper(): ComponentType<CustomPageWrapperProps> | null {
  return _component
}

/** Test-only — drops any registered wrapper so tests stay isolated. */
export function _resetCustomPageWrapper(): void {
  _component = null
}
