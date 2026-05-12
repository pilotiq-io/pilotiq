import React, { useEffect, useState } from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import { readStoredFlag, writeStoredFlag } from '../persistedState.js'
import { layoutClasses, resolveIcon } from './helpers.js'

// ─── Section (stateful when collapsible) ────────────────────

/**
 * `Section` chrome with optional collapse + persisted open/closed state.
 * Renders a card-style border, header (title / description / icon / badge
 * / after-header actions), body, and the collapse toggle when enabled.
 *
 * `renderElement` is injected so the body can re-enter the main switch
 * without creating a SchemaRenderer ↔ SectionRenderer import cycle.
 */
export function SectionRenderer({
  el,
  index,
  renderElement,
}: {
  el:            ElementMeta
  index:         number
  renderElement: (el: ElementMeta, index: number) => React.ReactNode
}) {
  const title       = el['title']       ? String(el['title']) : undefined
  const description = el['description'] ? String(el['description']) : undefined
  const iconName    = el['icon']        ? String(el['icon']) : undefined
  const badge       = el['badge']       ? String(el['badge']) : undefined
  const columns     = Number(el['columns'] ?? 1)
  const collapsible = Boolean(el['collapsible'])
  const compact     = Boolean(el['compact'])
  const dense       = Boolean(el['dense'])
  const secondary   = Boolean(el['secondary'])
  const afterHeader = (el['afterHeader'] as ElementMeta[] | undefined) ?? []
  const persist     = Boolean(el['persistCollapsed'])
  const persistKey  = el['persistKey']
    ? `pilotiq.section.${String(el['persistKey'])}`
    : title
      ? `pilotiq.section.${title.toLowerCase().replace(/\s+/g, '-')}`
      : undefined

  const defaultCollapsed = Boolean(el['defaultCollapsed'])
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  // Plan #8 — persist open/closed state to localStorage. Hydration-safe:
  // initial render uses `defaultCollapsed`; effect overrides from storage
  // after mount so server + client first paint agree.
  useEffect(() => {
    if (!persist || !persistKey) return
    setCollapsed(readStoredFlag(persistKey, defaultCollapsed))
  }, [persist, persistKey, defaultCollapsed])

  useEffect(() => {
    if (!persist || !persistKey) return
    writeStoredFlag(persistKey, collapsed)
  }, [persist, persistKey, collapsed])

  // `dense` tightens the inner spacing between the section's children
  // (orthogonal to `compact`, which trims the section's outer padding /
  // heading). gap-2 ≈ 8px vs gap-4 ≈ 16px.
  const innerGap = dense ? 'gap-2' : 'gap-4'
  const gridClass = columns === 2 ? `grid grid-cols-2 ${innerGap}` : columns === 3 ? `grid grid-cols-3 ${innerGap}` : `flex flex-col ${innerGap}`
  const padding = compact ? 'p-3' : 'p-4'
  const titleSize = compact ? 'text-sm' : 'text-base'
  const Icon = resolveIcon(iconName)

  // `secondary()` flips the section background to the muted token so it
  // visually recedes beneath a primary section. The border thins to the
  // same muted tone for the same reason — a sharp `border-input` line
  // around a muted block looks like a typographic ledger rather than a
  // grouping container.
  const surfaceClass = secondary ? 'bg-muted/40 border-muted' : 'bg-card'

  return (
    <section
      key={index}
      className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'} rounded-lg border ${surfaceClass} ${padding} ${layoutClasses(el)}`.trim()}
    >
      {(title || description || collapsible || badge || afterHeader.length > 0) && (
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {Icon && <Icon className="size-4 mt-0.5 text-muted-foreground" aria-hidden="true" />}
            <div>
              <div className="flex items-center gap-2">
                {title && <h3 className={`${titleSize} font-semibold`}>{title}</h3>}
                {badge && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {badge}
                  </span>
                )}
              </div>
              {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {afterHeader.length > 0 && (
              <div className="flex items-center gap-1">
                {afterHeader.map((a, i) => renderElement(a, i))}
              </div>
            )}
            {collapsible && (
              <button
                type="button"
                onClick={() => setCollapsed(c => !c)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {collapsed ? 'Expand' : 'Collapse'}
              </button>
            )}
          </div>
        </header>
      )}
      {!collapsed && el.children && el.children.length > 0 && (
        <div className={gridClass}>
          {el.children.map((c, i) => renderElement(c, i))}
        </div>
      )}
    </section>
  )
}
