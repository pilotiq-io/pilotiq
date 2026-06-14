'use client'

import { useEffect, useState } from 'react'
import type { SettingsPaneProps } from '../SettingsPane.js'

interface SettingsMetaResponse {
  versions?: { rudder?: string; pilotiq?: string }
}

/**
 * Built-in "General" settings pane. Shows the framework + panel-builder
 * versions; a home for general panel settings as they're added.
 *
 * Fetches its data from `${basePath}/api/_settings-meta` (server-resolved),
 * mirroring how the Appearance pane reads `${basePath}/api/_theme` — so the
 * component stays client-safe (no Node-only version reads in the bundle).
 */
export function GeneralSettingsPane({ basePath }: SettingsPaneProps) {
  const [meta, setMeta] = useState<SettingsMetaResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${basePath}/api/_settings-meta`, { headers: { Accept: 'application/json' } })
        const data = (await res.json()) as SettingsMetaResponse
        if (!cancelled) setMeta(data)
      } catch {
        if (!cancelled) setMeta({})
      }
    })()
    return () => { cancelled = true }
  }, [basePath])

  const rudder  = meta?.versions?.rudder
  const pilotiq = meta?.versions?.pilotiq

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">Panel information and general settings.</p>
      </div>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-medium">About</h3>
        </div>
        <dl className="divide-y">
          <VersionRow label="Pilotiq" value={pilotiq} loading={meta === null} />
          <VersionRow label="Rudder"  value={rudder}  loading={meta === null} />
        </dl>
      </section>
    </div>
  )
}

function VersionRow({ label, value, loading }: { label: string; value: string | undefined; loading: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm">
        {loading ? <span className="text-muted-foreground">…</span> : value ? `v${value}` : '—'}
      </dd>
    </div>
  )
}
