'use client'

/**
 * Client-side reader for the server-resolved `panel.i18n` bundle.
 *
 * `AppShell` mounts `<PanelI18nProvider i18n={panel.i18n}>` around the whole
 * tree; plugin components call `usePanelI18n<T>(namespace)` to read their
 * merged i18n object. NO translation happens here — the strings were resolved
 * (bundled defaults deep-merged with overrides) server-side and arrived as
 * data. This is purely a typed accessor.
 *
 * Per the rudder convention's point #6, consumers must NOT recompute their
 * i18n on the client (the `@rudderjs/localization` override cache is
 * server-only). When the namespace is absent — its package didn't register, or
 * SSR didn't include it — `usePanelI18n` returns `undefined`; the consumer
 * falls back to its own client-bundled `en` defaults (`?? en`).
 *
 * A window-global mirror (`__pilotiqPanelI18n`) backs components rendered
 * OUTSIDE the provider (detached popovers / portals), mirroring AppShell's
 * `__pilotiqAiSuggestionsMode` posture.
 */

import { createContext, useContext, useEffect, type ReactNode } from 'react'
import type { PanelI18nBundle } from '../i18n/registry.js'

export type { PanelI18nBundle }

interface WindowWithI18n extends Window {
  __pilotiqPanelI18n?: PanelI18nBundle
}

const PanelI18nContext = createContext<PanelI18nBundle | null>(null)

export function PanelI18nProvider({
  i18n,
  children,
}: {
  i18n?: PanelI18nBundle
  children: ReactNode
}) {
  const value = i18n ?? null

  // Mirror to a window global for out-of-tree consumers. Effect (not render)
  // so SSR stays pure; in-tree components always have the context regardless.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as WindowWithI18n
    if (value) w.__pilotiqPanelI18n = value
    else delete w.__pilotiqPanelI18n
  }, [value])

  return <PanelI18nContext.Provider value={value}>{children}</PanelI18nContext.Provider>
}

function readBundle(ctx: PanelI18nBundle | null): PanelI18nBundle | null {
  if (ctx) return ctx
  if (typeof window !== 'undefined') return (window as WindowWithI18n).__pilotiqPanelI18n ?? null
  return null
}

/**
 * Read a namespace's server-resolved i18n object. Returns `undefined` when the
 * namespace wasn't shipped — the consumer should fall back to its own bundled
 * `en` defaults.
 *
 * @example
 *   import { usePanelI18n } from '@pilotiq/pilotiq/react'
 *   import { en, type AiI18n } from './i18n/en.js'
 *   const t = usePanelI18n<AiI18n>('pilotiq-ai') ?? en
 *   <button>{t.discussInChat}</button>
 */
export function usePanelI18n<T = Record<string, unknown>>(namespace: string): T | undefined {
  const ctx = useContext(PanelI18nContext)
  return readBundle(ctx)?.[namespace] as T | undefined
}
