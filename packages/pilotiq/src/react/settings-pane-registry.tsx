import React, { createContext, useContext, type ComponentType } from 'react'
import type { SettingsPaneProps } from '../SettingsPane.js'

/**
 * Build-time settings-pane manifest. Maps each registered render-type
 * pane's `id` (e.g. `'theme'`, `'ai'`) to the React component the user
 * passed as `render`. The Pilotiq Vite plugin emits this map by walking
 * every panel's `cfg.settingsPanes` and stamping
 * `_settingsPanes[c.id] = c.render` into
 * `pages/(pilotiq)/_components.ts`.
 *
 * The body component never crosses the wire — only its rail meta does
 * (`SettingsPaneMeta`). The `SettingsShell` calls
 * `useSettingsPaneComponent(id)` to resolve a `SettingsPaneMeta.id` into
 * the actual component at mount time.
 *
 * Sparse: when a panel has no render-type panes, the registry is `{}`.
 */
export type SettingsPaneRegistry = Record<string, ComponentType<SettingsPaneProps>>

const Ctx = createContext<SettingsPaneRegistry | undefined>(undefined)

export function SettingsPaneRegistryProvider({
  value,
  children,
}: {
  value: SettingsPaneRegistry | undefined
  children: React.ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Read the full registry (for shells that want to enumerate). */
export function useSettingsPaneRegistry(): SettingsPaneRegistry | undefined {
  return useContext(Ctx)
}

/**
 * Look up a single registered body component by `id`. Returns
 * `undefined` when the registry is missing or the id was never
 * registered — the caller paints its own missing-component fallback.
 */
export function useSettingsPaneComponent(id: string): ComponentType<SettingsPaneProps> | undefined {
  const registry = useContext(Ctx)
  return registry?.[id]
}
