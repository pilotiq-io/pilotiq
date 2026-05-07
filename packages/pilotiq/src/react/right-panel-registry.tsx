import React, { createContext, useContext, type ComponentType } from 'react'
import type { RightPanelProps } from '../RightPanel.js'

/**
 * Build-time right-panel manifest. Maps each registered contribution's
 * `id` (e.g. `'ai.chat'`) to the React component the user passed as
 * `render`. The Pilotiq Vite plugin emits this map by walking every
 * panel's `cfg.rightPanels` and stamping `_rightPanels[c.id] = c.render`
 * into `pages/(pilotiq)/_components.ts`.
 *
 * The body component never crosses the wire — only its tab-strip meta
 * does (`RightPanelMeta`). The chrome (Phase C) calls
 * `getRightPanelComponent(id)` to resolve a `RightPanelMeta.id` into
 * the actual component at mount time.
 *
 * Sparse: when a panel has no contributions, the registry is `{}` and
 * the chrome never mounts (server-side `RightSidebarMeta` is also
 * absent in that case — defense in depth).
 */
export type RightPanelRegistry = Record<string, ComponentType<RightPanelProps>>

const Ctx = createContext<RightPanelRegistry | undefined>(undefined)

export function RightPanelRegistryProvider({
  value,
  children,
}: {
  value: RightPanelRegistry | undefined
  children: React.ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Read the full registry (for chrome that wants to enumerate). */
export function useRightPanelRegistry(): RightPanelRegistry | undefined {
  return useContext(Ctx)
}

/**
 * Look up a single registered body component by `id`. Returns
 * `undefined` when the registry is missing or the id was never
 * registered — the caller paints its own missing-component fallback.
 */
export function useRightPanelComponent(id: string): ComponentType<RightPanelProps> | undefined {
  const registry = useContext(Ctx)
  return registry?.[id]
}
