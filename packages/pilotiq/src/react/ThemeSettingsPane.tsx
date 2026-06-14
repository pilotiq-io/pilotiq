'use client'

import { useEffect, useState } from 'react'
import type { ThemeConfig } from '../theme/types.js'
import type { SettingsPaneProps } from '../SettingsPane.js'
import { ThemeSettingsPage } from './ThemeSettingsPage.js'
import { useNavigate } from './navigate.js'

/**
 * Settings-pane adapter for the Theme editor. Registered by the
 * `themeEditor()` plugin as the built-in `'theme'` pane.
 *
 * The generic settings shell hands every pane only `SettingsPaneProps`
 * ({ basePath, … }) — it doesn't know about theme-specific server data.
 * So this adapter fetches the panel's theme state from the unchanged
 * `${basePath}/api/_theme` endpoint and feeds it into `ThemeSettingsPage`
 * (which initializes its editor state from `initialConfig` at mount —
 * hence we hold the page back until the fetch resolves).
 */
export function ThemeSettingsPane({ basePath, activeId }: SettingsPaneProps) {
  const navigate = useNavigate()
  const [state, setState] = useState<
    { initialConfig: Partial<ThemeConfig>; codeTheme: Partial<ThemeConfig> } | null
  >(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${basePath}/api/_theme`, { headers: { Accept: 'application/json' } })
        const data = (await res.json()) as { config?: Partial<ThemeConfig>; overrides?: Partial<ThemeConfig> }
        if (cancelled) return
        const config = data.config ?? {}
        // initialConfig = code defaults merged with persisted overrides
        // (what the editor opens with); codeTheme = pure code defaults
        // (what "Reset to Defaults" snaps back to).
        setState({ initialConfig: { ...config, ...(data.overrides ?? {}) }, codeTheme: config })
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [basePath])

  if (failed) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        Failed to load theme settings.
      </div>
    )
  }
  if (!state) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        Loading theme…
      </div>
    )
  }

  return (
    <ThemeSettingsPage
      panelPath={basePath}
      initialConfig={state.initialConfig}
      codeTheme={state.codeTheme}
      // After save/reset, re-fetch the surrounding panel data so the
      // server-resolved theme (chrome CSS) re-renders in lockstep with
      // the live preview the page already applied to the parent doc.
      onNavigate={async () => { await navigate(`${basePath}/settings/${activeId}`) }}
    />
  )
}
