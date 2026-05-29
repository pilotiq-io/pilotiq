import React from 'react'
import { ChevronDownIcon, InboxIcon } from 'lucide-react'
import type { ElementMeta } from '../../../schema/Element.js'
import { Checkbox } from '../../ui/checkbox.js'
import { GroupHeadingLink, makeSpaNavClick } from './links.js'
import { GroupHeaderText } from './filters.js'
import type { NavigateFn } from '../../navigate.js'

// ─── Cards layout for `Table.contentLayout('cards')` ────────

type RenderElement    = (el: ElementMeta, index: number) => React.ReactNode
type RenderRowActions = (rowId: string, rowRecord: Record<string, unknown> | undefined, actions: ElementMeta[]) => React.ReactNode

/**
 * Lookup tables for responsive grid column-counts in `contentLayout:
 * 'cards'`. Tailwind's JIT scanner needs **literal** class strings; we
 * can't construct them at runtime via template literals (`grid-cols-${n}`
 * would never be matched). Limit to 1–6 columns + 12 — covers every
 * reasonable card grid; bigger values are silently capped at 6 for
 * non-base breakpoints in `cardsPerRowClasses`.
 */
const CARDS_GRID_COLS_BASE: Record<number, string> = {
  1:  'grid-cols-1',
  2:  'grid-cols-2',
  3:  'grid-cols-3',
  4:  'grid-cols-4',
  5:  'grid-cols-5',
  6:  'grid-cols-6',
  12: 'grid-cols-12',
}
const CARDS_GRID_COLS_SM: Record<number, string> = {
  1: 'sm:grid-cols-1',  2: 'sm:grid-cols-2',  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',  5: 'sm:grid-cols-5',  6: 'sm:grid-cols-6',
  12: 'sm:grid-cols-12',
}
const CARDS_GRID_COLS_MD: Record<number, string> = {
  1: 'md:grid-cols-1',  2: 'md:grid-cols-2',  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',  5: 'md:grid-cols-5',  6: 'md:grid-cols-6',
  12: 'md:grid-cols-12',
}
const CARDS_GRID_COLS_LG: Record<number, string> = {
  1: 'lg:grid-cols-1',  2: 'lg:grid-cols-2',  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',  5: 'lg:grid-cols-5',  6: 'lg:grid-cols-6',
  12: 'lg:grid-cols-12',
}
const CARDS_GRID_COLS_XL: Record<number, string> = {
  1: 'xl:grid-cols-1',  2: 'xl:grid-cols-2',  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',  5: 'xl:grid-cols-5',  6: 'xl:grid-cols-6',
  12: 'xl:grid-cols-12',
}
const CARDS_GRID_COLS_2XL: Record<number, string> = {
  1: '2xl:grid-cols-1',  2: '2xl:grid-cols-2',  3: '2xl:grid-cols-3',
  4: '2xl:grid-cols-4',  5: '2xl:grid-cols-5',  6: '2xl:grid-cols-6',
  12: '2xl:grid-cols-12',
}

export function pickCardCols(table: Record<number, string>, raw: number | undefined): string | undefined {
  if (raw === undefined) return undefined
  if (table[raw]) return table[raw]
  // Snap unsupported values to nearest available — values outside [1,6]∪{12}
  // round down. Already-clamped to [1,12] server-side.
  if (raw >= 12) return table[12]
  if (raw >= 6) return table[6]
  if (raw >= 5) return table[5]
  if (raw >= 4) return table[4]
  if (raw >= 3) return table[3]
  if (raw >= 2) return table[2]
  return table[1]
}

/** Build a Tailwind grid-cols class string from a per-row config. Default
 * `{ default: 1, sm: 2, lg: 3 }` mirrors Filament's typical card grid. */
export function cardsPerRowClasses(opts: Record<string, number> | undefined): string {
  const cfg = opts ?? {}
  const baseN = cfg['default'] ?? 1
  const out: string[] = [pickCardCols(CARDS_GRID_COLS_BASE, baseN)!]
  if (cfg['sm']  !== undefined) { const c = pickCardCols(CARDS_GRID_COLS_SM,  cfg['sm']);  if (c) out.push(c) }
  if (cfg['md']  !== undefined) { const c = pickCardCols(CARDS_GRID_COLS_MD,  cfg['md']);  if (c) out.push(c) }
  if (cfg['lg']  !== undefined) { const c = pickCardCols(CARDS_GRID_COLS_LG,  cfg['lg']);  if (c) out.push(c) }
  if (cfg['xl']  !== undefined) { const c = pickCardCols(CARDS_GRID_COLS_XL,  cfg['xl']);  if (c) out.push(c) }
  if (cfg['2xl'] !== undefined) { const c = pickCardCols(CARDS_GRID_COLS_2XL, cfg['2xl']); if (c) out.push(c) }
  // Unset fallback covers Filament's typical default — 1 column on mobile,
  // 2 on small screens, 3 on large.
  if (Object.keys(cfg).length === 0) {
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  }
  return out.join(' ')
}


/**
 * Card-grid body for `Table.contentLayout('cards')`. Renders the rows
 * area only — the surrounding chrome (heading / search / filters /
 * pagination / bulk-action toolbar / "Sort by" picker) lives in the
 * parent `TableRendererBody` so both layouts share it.
 *
 * Each card renders its `_cardChildren` schema via the standard
 * `renderElement` walker, so any display-Element (Heading, Text, Image,
 * Icon, Badge entries, layout primitives, etc.) drops in without a new
 * renderer. Per-row chrome attaches via the same `_recordUrl` /
 * `_recordClasses` / `_visibleActions` / `_disabledActions` keys the
 * table-mode renderer reads from — `loadTableRecords` is unchanged.
 *
 * Group banding splits the rows into contiguous sections by
 * `_groupValue`, emitting a heading row above each section. The user's
 * configured per-card grid (`cardsPerRow`) re-applies inside every
 * section so the column count stays consistent.
 */
export function CardsLayoutBody({
  rows, visibleIds, selected, toggleRow,
  hasBulkActions, hasRowActions, rowActions, hasRecordUrl, hasRecordClasses,
  activeEmpty, EmptyIcon, hasFilterOrSearch,
  defaultGroup, groupColumnLabel, groupCollapsible, collapsedGroups, toggleGroupCollapsed,
  cardsPerRow, navigate,
  groupHeadingScopable, buildGroupKeyHref,
  forceSingleColumn,
  renderElement, renderRowActions,
}: {
  rows:              unknown[]
  visibleIds:        string[]
  selected:          Set<string>
  toggleRow:         (id: string) => void
  hasBulkActions:    boolean
  hasRowActions:     boolean
  rowActions:        ElementMeta[]
  hasRecordUrl:      boolean
  hasRecordClasses:  boolean
  activeEmpty:       { heading?: string; description?: string; icon?: string } | undefined
  EmptyIcon:         React.ComponentType<{ className?: string }>
  hasFilterOrSearch: boolean
  defaultGroup:      string | undefined
  groupColumnLabel:  string | undefined
  groupCollapsible:  boolean
  collapsedGroups:   Record<string, boolean>
  toggleGroupCollapsed: (groupValue: string) => void
  cardsPerRow:       Record<string, number> | undefined
  navigate:          NavigateFn
  // Drill-in affordances. Sparse: when `groupHeadingScopable` is false,
  // the heading renders as before; `buildGroupKeyHref` is unused.
  groupHeadingScopable?: boolean
  buildGroupKeyHref?:    (value: string) => string
  // Force a single-column stack regardless of `cardsPerRow` — used by the
  // `stackOnMobile` mobile fallback, where the card body is already inside
  // a `<bp>:hidden` wrapper and should read as stacked rows, not a grid.
  forceSingleColumn?:    boolean
  // Injected renderers — keeps the import cycle clean between
  // SchemaRenderer.tsx's top-level dispatch and this body.
  renderElement:     RenderElement
  renderRowActions:  RenderRowActions
}) {
  const gridClass = forceSingleColumn
    ? 'grid grid-cols-1 gap-3'
    : `grid gap-4 ${cardsPerRowClasses(cardsPerRow)}`

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card py-12 text-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <EmptyIcon className="size-8 opacity-60" />
          <p className="text-base font-medium text-foreground">
            {activeEmpty?.heading
              ?? (hasFilterOrSearch ? 'No matching records' : 'No records yet')}
          </p>
          {(activeEmpty?.description ||
            (hasFilterOrSearch && !activeEmpty?.description)) && (
            <p className="text-sm">
              {activeEmpty?.description
                ?? 'Try clearing filters or adjusting your search.'}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Split rows into contiguous group-banded sections so each section
  // can render its own heading + grid. Without an active group this is
  // one section with no heading.
  type Section = {
    groupValue?:  string
    title?:       string
    description?: string
    indices:      number[]
  }
  const sections: Section[] = []
  if (defaultGroup === undefined) {
    sections.push({ indices: rows.map((_, i) => i) })
  } else {
    let current: Section | undefined
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as Record<string, unknown>
      const v = String(r['_groupValue'] ?? '')
      if (current === undefined || current.groupValue !== v) {
        const title       = r['_groupTitle']       as string | undefined
        const description = r['_groupDescription'] as string | undefined
        current = { groupValue: v, indices: [], ...(title ? { title } : {}), ...(description ? { description } : {}) }
        sections.push(current)
      }
      current.indices.push(i)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, si) => {
        const collapsed = groupCollapsible
          && section.groupValue !== undefined
          && collapsedGroups[section.groupValue] === true
        return (
          <div key={si} className="flex flex-col gap-3">
            {section.groupValue !== undefined && (() => {
              const drillable = groupHeadingScopable === true
                && buildGroupKeyHref !== undefined
                && section.groupValue !== ''
              const headingText = (
                <GroupHeaderText
                  label={groupColumnLabel}
                  value={section.groupValue}
                  title={section.title}
                  description={section.description}
                />
              )
              const headingNode = drillable
                ? <GroupHeadingLink href={buildGroupKeyHref!(section.groupValue!)} navigate={navigate}>{headingText}</GroupHeadingLink>
                : headingText
              if (groupCollapsible) {
                return (
                  <div className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <button
                      type="button"
                      className="inline-flex items-center"
                      onClick={() => toggleGroupCollapsed(section.groupValue!)}
                      aria-expanded={!collapsed}
                      aria-label={collapsed ? 'Expand group' : 'Collapse group'}
                    >
                      <ChevronDownIcon
                        className={[
                          'size-4 transition-transform',
                          collapsed ? '-rotate-90' : '',
                        ].filter(Boolean).join(' ')}
                      />
                    </button>
                    {headingNode}
                  </div>
                )
              }
              return (
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {headingNode}
                </div>
              )
            })()}
            {!collapsed && (
              <div className={gridClass}>
                {section.indices.map((ri) => {
                  const id = visibleIds[ri]!
                  const recordObj = rows[ri] as Record<string, unknown>
                  const isSelected = selected.has(id)
                  const recordUrl = hasRecordUrl ? (recordObj['_recordUrl'] as string | undefined) : undefined
                  const customRowClasses = hasRecordClasses
                    ? (recordObj['_recordClasses'] as string | undefined) ?? ''
                    : ''
                  const cardChildren = (recordObj['_cardChildren'] as ElementMeta[] | undefined) ?? []
                  const cardClassName = [
                    'group relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors',
                    recordUrl ? 'hover:border-primary/40 hover:bg-accent/30' : '',
                    isSelected ? 'border-primary ring-2 ring-primary/20' : '',
                    customRowClasses,
                  ].filter(Boolean).join(' ')

                  return (
                    <div key={id} className={cardClassName}>
                      {recordUrl !== undefined && (
                        <a
                          href={recordUrl}
                          onClick={makeSpaNavClick(recordUrl, navigate)}
                          aria-label="Open record"
                          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="sr-only">Open record</span>
                        </a>
                      )}
                      {hasBulkActions && (
                        <div className="absolute top-3 right-3 z-10">
                          <Checkbox
                            aria-label={`Select row ${id}`}
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(id)}
                            data-no-row-nav
                          />
                        </div>
                      )}
                      <div className="relative z-[1] flex flex-col gap-3">
                        {cardChildren.length === 0 ? (
                          <div className="text-xs italic text-muted-foreground">
                            No card content configured.
                          </div>
                        ) : cardChildren.map((c, i) => renderElement(c, i))}
                      </div>
                      {hasRowActions && (
                        <div className="relative z-10 mt-auto flex items-center justify-end pt-2 border-t border-border/60">
                          {renderRowActions(id, recordObj, rowActions)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
