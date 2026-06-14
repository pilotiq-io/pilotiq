'use client'

import { useMemo, type ComponentType } from 'react'
import type { SerializedIcon } from '../icons/types.js'
import { useIconFor } from './icon-context.js'
import { useNavigate } from './navigate.js'
import { useSettingsPaneComponent } from './settings-pane-registry.js'
import { SchemaRenderer } from './SchemaRenderer.js'
import { cn } from './utils.js'

/**
 * Rail metadata for one settings pane. Mirrors `SettingsPaneMeta` emitted
 * by `buildSettingsMeta` in `pageData/navigation.ts`. The `render`
 * component never travels here — it's resolved client-side from the Vite
 * plugin's `settingsPaneRegistry` keyed by `id`.
 */
export interface SettingsPaneMeta {
  id:     string
  label:  string
  icon?:  SerializedIcon
  group?: string
  /** Cross-link pane — present means the rail entry navigates away
   *  instead of rendering a body in the shell. */
  href?:  string
}

export interface SettingsShellProps {
  basePath:      string
  panes:         SettingsPaneMeta[]
  /** Active render-pane id. The settings route stamps it; falls back to
   *  the first render pane when absent. */
  activePaneId?: string
  /** Resolved schema for a page-backed active pane (e.g. Profile) —
   *  rendered in-shell via `SchemaRenderer`. Absent for render panes. */
  schemaData?:   unknown[]
  currentPath?:  string
}

function RailIcon({ icon }: { icon?: SerializedIcon }) {
  const Cmp = useIconFor(icon)
  if (!Cmp) return null
  return <Cmp className="size-4 shrink-0" />
}

/**
 * System Settings shell — the iOS-style settings screen. A grouped
 * section rail on the left, the active pane's body on the right. Panes
 * are contributed by core + installed packages via
 * `Pilotiq.settingsPane(...)`.
 */
export function SettingsShell({ basePath, panes, activePaneId, schemaData, currentPath }: SettingsShellProps) {
  const navigate = useNavigate()

  // Render panes (no href) are the ones the shell can host. The active
  // pane defaults to the first render pane when the route didn't pin one.
  const renderPanes = useMemo(() => panes.filter(p => !p.href), [panes])
  const activeId = activePaneId && renderPanes.some(p => p.id === activePaneId)
    ? activePaneId
    : renderPanes[0]?.id

  // Preserve declaration order while bucketing by group. Panes without a
  // group fall into a leading unlabeled section (key '').
  const groups = useMemo(() => {
    const order: string[] = []
    const byGroup = new Map<string, SettingsPaneMeta[]>()
    for (const p of panes) {
      const g = p.group ?? ''
      if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g) }
      byGroup.get(g)!.push(p)
    }
    return order.map(g => ({ group: g, panes: byGroup.get(g)! }))
  }, [panes])

  const ActivePane: ComponentType<{ basePath: string; currentPath?: string; activeId: string }> | undefined =
    useSettingsPaneComponent(activeId ?? '')

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start h-full">
      {/* Section rail */}
      <nav className="md:w-60 md:shrink-0">
        <h1 className="mb-3 px-2 text-lg font-semibold">Settings</h1>
        <div className="flex flex-col gap-4">
          {groups.map(({ group, panes: groupPanes }) => (
            <div key={group || '_'} className="flex flex-col gap-1">
              {group && (
                <div className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group}
                </div>
              )}
              {groupPanes.map((pane) => {
                const isActive = !pane.href && pane.id === activeId
                const target = pane.href ?? `${basePath}/settings/${pane.id}`
                return (
                  <button
                    key={pane.id}
                    type="button"
                    onClick={() => void navigate(target)}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      isActive
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <RailIcon icon={pane.icon} />
                    <span className="truncate">{pane.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </nav>

      {/* Active pane body — page-backed schema wins, then a registry
          render component, then fallbacks. */}
      <div className="min-w-0 flex-1 h-full">
        {activeId && schemaData ? (
          <SchemaRenderer elements={schemaData as Parameters<typeof SchemaRenderer>[0]['elements']} />
        ) : activeId && ActivePane ? (
          <ActivePane basePath={basePath} {...(currentPath !== undefined ? { currentPath } : {})} activeId={activeId} />
        ) : activeId ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            Settings pane <code className="font-mono">{activeId}</code> has no registered component.
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            No settings available.
          </div>
        )}
      </div>
    </div>
  )
}
