import React, { createContext, useContext } from 'react'
import { getIcon, type IconType } from '../icons/registry.js'
import type { SerializedIcon } from '../icons/types.js'

/**
 * Build-time component manifest. Maps Resource/Global/Page class names
 * (e.g., `'ArticleResource'`) to the class itself. The Pilotiq Vite
 * plugin emits this map by reading `app/Pilotiq/AdminPanel.ts` and
 * re-exporting every registered class. The auto-gen `+Layout.tsx`
 * imports it and passes it to `AppShell`.
 *
 * Only used to resolve component-typed icons (`Resource.icon = Newspaper`).
 * String-typed icons go through `getIcon()` against the runtime registry.
 */
export type ComponentRegistry = Record<string, { icon?: unknown; navigationIcon?: unknown }>

const Ctx = createContext<ComponentRegistry | undefined>(undefined)

export function ComponentRegistryProvider({
  value,
  children,
}: {
  value: ComponentRegistry | undefined
  children: React.ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useComponentRegistry(): ComponentRegistry | undefined {
  return useContext(Ctx)
}

/**
 * Resolve a `SerializedIcon` from `viewProps` to a React component.
 *
 * - `string` → look up in the runtime `registerIcons()` registry.
 * - `{ class: 'ArticleResource' }` → look up in the build-time component
 *   manifest. If the entry has its own `.navigationIcon` it wins;
 *   otherwise falls through to `.icon`. The icon prop on the class
 *   itself can be either another component (returned directly) or
 *   another string (re-resolved through the runtime registry).
 * - `undefined` → returns `undefined` (caller picks its own fallback).
 */
export function useIconFor(value: SerializedIcon | undefined): IconType | undefined {
  const manifest = useComponentRegistry()
  if (value === undefined) return undefined
  if (typeof value === 'string') return getIcon(value)
  if (typeof value === 'object' && 'class' in value) {
    const entry = manifest?.[value.class]
    if (!entry) return undefined
    const candidate = entry.navigationIcon ?? entry.icon
    if (candidate === undefined || candidate === null) return undefined
    // String → re-resolve through the runtime registry; otherwise
    // (function or forwardRef/memo object) treat as a renderable component.
    if (typeof candidate === 'string') return getIcon(candidate)
    if (typeof candidate === 'function' || typeof candidate === 'object') return candidate as IconType
    return undefined
  }
  return undefined
}
