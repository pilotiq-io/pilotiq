import React, { useEffect, useState } from 'react'
import { ChevronDownIcon, GripVerticalIcon, InboxIcon } from 'lucide-react'
import type { ElementMeta } from '../../../schema/Element.js'
import { useNavigate } from '../../navigate.js'
import { readStoredFlag, writeStoredFlag } from '../../persistedState.js'
import { useToast } from '../../Toaster.js'
import { Checkbox } from '../../ui/checkbox.js'
import { Input } from '../../ui/input.js'
import {
  Table as DataTable, TableBody, TableCell, TableFooter,
  TableHead, TableHeader, TableRow,
} from '../../ui/table.js'
import { pickEditableCell } from '../../cells/EditableCell.js'
import { resolveIcon } from '../helpers.js'
import type { RenderActionOptions } from '../action/buttons.js'
import {
  buildTableQuery, nextSortDir, prefixK, SearchFormHiddenInputs,
  type TableUrlState,
} from './url.js'
import { formatCell, rowId } from './formatCell.js'
import {
  ActiveFiltersBar, ColumnsToggleDropdown, FilterPopover, FilterStrip, FilterStripToggle,
  GroupHeaderText, resolveColumnUrl, SortByPicker, TableGroupPicker,
} from './filters.js'
import { ActiveGroupKeyChip, GroupHeadingLink, RecordCellLink } from './links.js'
import { CardsLayoutBody } from './CardsLayoutBody.js'
import { renderRowActions } from './renderRowActions.js'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ─── stackOnMobile responsive class maps ───────────────────
// Literal Tailwind strings (the JIT scanner can't see runtime-built class
// names). `TABLE_VISIBLE` shows the classic table at/above the breakpoint;
// `MOBILE_ONLY` shows the card body (and the sort picker) only below it.
const STACK_TABLE_VISIBLE: Record<string, string> = {
  sm: 'hidden sm:block',
  md: 'hidden md:block',
  lg: 'hidden lg:block',
}
const STACK_MOBILE_ONLY: Record<string, string> = {
  sm: 'sm:hidden',
  md: 'md:hidden',
  lg: 'lg:hidden',
}

// Per-column responsive visibility (`Column.visibleFrom` / `hiddenFrom`).
// Literal Tailwind strings for the JIT; `table-cell` is the default cell
// display so the breakpoint variant toggles it cleanly. Applied to EVERY
// per-column cell (header / data / group-summary / footer) so a hidden
// column drops consistently and the columns stay aligned.
const COL_VISIBLE_FROM: Record<string, string> = {
  sm: 'hidden sm:table-cell',  md: 'hidden md:table-cell',  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',  '2xl': 'hidden 2xl:table-cell',
}
const COL_HIDDEN_FROM: Record<string, string> = {
  sm: 'table-cell sm:hidden',  md: 'table-cell md:hidden',  lg: 'table-cell lg:hidden',
  xl: 'table-cell xl:hidden',  '2xl': 'table-cell 2xl:hidden',
}
function colResponsiveClass(col: Record<string, unknown>): string {
  const vf = col['visibleFrom'] as string | undefined
  if (vf !== undefined && COL_VISIBLE_FROM[vf]) return COL_VISIBLE_FROM[vf]
  const hf = col['hiddenFrom'] as string | undefined
  if (hf !== undefined && COL_HIDDEN_FROM[hf]) return COL_HIDDEN_FROM[hf]
  return ''
}

// ─── Table body ─────────────────────────────────────────────
//
// The biggest component in the renderer. Handles column rendering,
// sorting + pagination + search URL state, group banding + drill-in,
// per-row inline edit / delete, bulk-action toolbar, deferred-load
// state, optional cards layout dispatch, and the empty / loading
// states.

/** Dependencies threaded in from the top-level dispatch — the body
 *  recurses into the main element renderer (for column cells that hold
 *  Heading / Text / Element-typed content), dispatches row + bulk
 *  actions through `renderActionLike`, and reads form schema for
 *  inline-edit modals via `renderFormChild`. */
export interface TableBodyDeps {
  renderElement:    (el: ElementMeta, index: number) => React.ReactNode
  renderActionLike: (el: ElementMeta, index: number, opts?: RenderActionOptions) => React.ReactNode
  renderFormChild:  (child: ElementMeta, index: number, values: Record<string, unknown>, errors: Record<string, string[]>) => React.ReactNode
}

/**
 * Column-header sort indicator (lucide `arrow-up-down`). The up arrow (left
 * half) and down arrow (right half) are independently colored: the half
 * matching the active sort direction is `text-foreground`, the rest stays
 * muted. With no active sort both halves are muted (and lift slightly on
 * header hover to hint they're clickable).
 */
function SortIcon({ direction }: { direction: 'asc' | 'desc' | undefined }) {
  const up   = direction === 'asc'  ? 'text-foreground' : 'text-muted-foreground/40 group-hover:text-muted-foreground/70'
  const down = direction === 'desc' ? 'text-foreground' : 'text-muted-foreground/40 group-hover:text-muted-foreground/70'
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0 transition-colors" aria-hidden="true"
    >
      {/* up arrow (left) — highlighted when sorted ascending */}
      <g className={up}>
        <path d="m3 8 4-4 4 4" />
        <path d="M7 4v16" />
      </g>
      {/* down arrow (right) — highlighted when sorted descending */}
      <g className={down}>
        <path d="m21 16-4 4-4-4" />
        <path d="M17 20V4" />
      </g>
    </svg>
  )
}


/**
 * Wraps the table in `@dnd-kit` drag context only when the table is
 * reorderable — otherwise a pass-through so non-reorderable tables pay
 * nothing and `useSortable` (which needs a `SortableContext` ancestor) is
 * never reached. Sensors are created in the parent so the hooks stay
 * unconditional.
 */
function ReorderProvider({
  enabled, ids, sensors, onDragEnd, children,
}: {
  enabled:   boolean
  ids:       string[]
  sensors:   ReturnType<typeof useSensors>
  onDragEnd: (e: DragEndEvent) => void
  children:  React.ReactNode
}) {
  if (!enabled) return <>{children}</>
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

/**
 * A reorderable data row: `@dnd-kit`'s `useSortable` drives the transform/
 * transition for a smooth drag. The grip cell carries the drag listeners
 * (the handle), so cell links/inputs stay clickable; the rest of the row's
 * cells arrive as `children`. Only rendered inside a `ReorderProvider`.
 */
function SortableDataRow({
  id, disabled, reorderEnabled, dataState, rowClassName, children,
}: {
  id:             string
  disabled:       boolean
  reorderEnabled: boolean
  dataState:      'selected' | undefined
  rowClassName:   string | undefined
  children:       React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    ...(transition ? { transition } : {}),
  }
  return (
    <TableRow
      ref={setNodeRef}
      data-state={dataState}
      style={style}
      className={[
        rowClassName,
        isDragging ? 'relative z-10 bg-card shadow-lg' : '',
      ].filter(Boolean).join(' ') || undefined}
    >
      <TableCell className="w-9 px-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={!reorderEnabled}
          aria-label={reorderEnabled ? 'Drag to reorder' : 'Reorder paused — clear filters and sort to enable'}
          className={
            reorderEnabled
              ? 'inline-flex touch-none cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing'
              : 'inline-flex cursor-not-allowed text-muted-foreground/40'
          }
        >
          <GripVerticalIcon className="size-4" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  )
}

export function TableRendererBody({ el, deps }: { el: ElementMeta; deps: TableBodyDeps }) {
  const { renderElement, renderActionLike, renderFormChild } = deps
  const navigate = useNavigate()
  const children = el.children ?? []
  const columns  = children.filter(c => c.type === 'column')
  // `Column.toggleable()` columns — sourced from the resolved meta. The
  // user's per-table visibility map is owned + persisted below; the full
  // `columns` list stays available for the toolbar dropdown so hidden
  // columns can be re-shown without a roundtrip.
  const toggleableColumns = columns.filter(c => c['toggleable'] !== undefined)
  // Actions and ActionGroups share placement — both show up in the
  // header/bulk/row toolbars depending on their `placement` field.
  const actionLike = children.filter(c => c.type === 'action' || c.type === 'actionGroup' || c.type === 'slotComponent')
  const filters    = children.filter(c => c.type === 'filter')
  const hasRecordUrl     = Boolean(el['recordUrl'])
  const hasRecordClasses = Boolean(el['recordClasses'])
  const pollInterval     = typeof el['pollInterval'] === 'number' ? el['pollInterval'] as number : undefined
  const defaultGroup     = typeof el['defaultGroup'] === 'string' ? el['defaultGroup'] as string : undefined
  const activeGroupKey   = typeof el['activeGroupKey'] === 'string' ? el['activeGroupKey'] as string : undefined
  const summaries        = el['summaries'] as Record<string, Array<{ kind: string; value: string; label?: string }>> | undefined
  const groupSummaries   = el['groupSummaries'] as
    Record<string, Record<string, Array<{ kind: string; value: string; label?: string }>>> | undefined
  const groupOptions     = (el['groups'] as Array<{
    column:       string
    label:        string
    collapsible?: true
    collapsed?:   true
    date?:        true
    scopable?:    true
  }> | undefined) ?? []
  // Active group's registered metadata (if any). Falls back to a synth
  // for the bare-column form so the heading row still has a label.
  const activeGroupMeta  = defaultGroup
    ? (groupOptions.find(g => g.column === defaultGroup) ?? {
        column:       defaultGroup,
        label:        (() => {
          const col = columns.find(c => c['name'] === defaultGroup)
          return col ? String(col['label'] ?? defaultGroup) : defaultGroup
        })(),
      })
    : undefined
  const groupColumnLabel = activeGroupMeta?.label
  // Heading text becomes a real `<a href>` when the active group opts in
  // via `.scopable()`. Synthesized bare-column groups can't be scopable
  // (no builder call ran).
  const groupHeadingScopable = activeGroupMeta !== undefined
    && (activeGroupMeta as { scopable?: true }).scopable === true

  // Auto-refresh: re-visit current URL on a timer so sort/filter/pagination
  // state survives. Pause while the document is hidden — background tabs
  // shouldn't keep hammering the server.
  useEffect(() => {
    if (!pollInterval || pollInterval <= 0) return
    if (typeof document === 'undefined') return
    let timerId: ReturnType<typeof setInterval> | undefined
    const tick = () => navigate(window.location.pathname + window.location.search)
    const start = () => {
      if (timerId === undefined) timerId = setInterval(tick, pollInterval * 1000)
    }
    const stop = () => {
      if (timerId !== undefined) {
        clearInterval(timerId)
        timerId = undefined
      }
    }
    if (document.visibilityState === 'visible') start()
    const onVis = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      stop()
    }
  }, [pollInterval, navigate])

  // Group actions by placement. `inline` defaults to header so it shows up
  // somewhere visible — explicit placements always win.
  const placementOf = (a: ElementMeta): string => String(a['placement'] ?? 'inline')
  const headerActions = actionLike.filter(a => { const p = placementOf(a); return p === 'header' || p === 'inline' })
  const bulkActions   = actionLike.filter(a => placementOf(a) === 'bulk')
  const rowActions    = actionLike.filter(a => placementOf(a) === 'row')

  const rawRows     = (el['rows'] as unknown[] | undefined) ?? []
  const total       = (el['total'] as number | undefined) ?? rawRows.length
  const search      = el['search'] as string | undefined
  const currentSort = el['currentSort'] as { column: string; direction: 'asc' | 'desc' } | undefined
  const currentPage = (el['currentPage'] as number | undefined) ?? 1
  const perPage     = el['perPage'] as number | undefined
  const searchable  = Boolean(el['searchable'])
  const currentPath = (el['currentPath'] as string | undefined) ?? ''

  // `Column.toggleable()` user-visibility map. Persisted per-table at
  // `pilotiq.table.<currentPath>.columns.<name>` ('1' = hidden,
  // '0' = visible). On first paint, fall back to `meta.toggleable.initiallyHidden`.
  // SSR returns the meta default — the localStorage hydrate happens
  // inside the effect so server + first client render match.
  const columnsVisibilityKey = (name: string): string =>
    `pilotiq.table.${currentPath}.columns.${name}`
  const initialHidden = (): Set<string> => {
    const out = new Set<string>()
    for (const col of toggleableColumns) {
      const cfg = col['toggleable'] as { initiallyHidden?: boolean } | undefined
      if (cfg?.initiallyHidden) out.add(String(col['name']))
    }
    return out
  }
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(initialHidden)
  useEffect(() => {
    if (toggleableColumns.length === 0) return
    const next = new Set<string>()
    for (const col of toggleableColumns) {
      const name = String(col['name'])
      const cfg  = col['toggleable'] as { initiallyHidden?: boolean } | undefined
      if (readStoredFlag(columnsVisibilityKey(name), Boolean(cfg?.initiallyHidden))) {
        next.add(name)
      }
    }
    setHiddenColumns(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, toggleableColumns.length])
  const toggleColumnHidden = (name: string, nextHidden: boolean): void => {
    setHiddenColumns(prev => {
      const next = new Set(prev)
      if (nextHidden) next.add(name)
      else            next.delete(name)
      writeStoredFlag(columnsVisibilityKey(name), nextHidden)
      return next
    })
  }
  // Filtered column list used by every render path (header, body cells,
  // group + footer summaries, empty-state colSpan). Non-toggleable
  // columns always survive.
  const visibleColumns = columns.filter(c => !hiddenColumns.has(String(c['name'])))

  // Tier-3 — when the table opts into `Table.queryStringIdentifier(...)`,
  // every URL key (search / sort / page / perPage / group / filter names)
  // gets prefixed with `${id}_` so multiple tables on one page don't
  // collide on `?search=` etc. Bare keys still apply when unset.
  const queryPrefix = typeof el['queryStringIdentifier'] === 'string'
    ? el['queryStringIdentifier'] as string
    : undefined

  // Reorderable rows — grip column + HTML5 DnD wiring. Rows live in
  // local state during a drag so the optimistic reorder happens
  // immediately; on POST failure we roll back to the server's order.
  const reorderableColumn = typeof el['reorderableColumn'] === 'string' ? el['reorderableColumn'] as string : undefined
  const reorderUrl        = typeof el['reorderUrl']        === 'string' ? el['reorderUrl']        as string : undefined
  const [reorderRowsLocal, setReorderRowsLocal] = useState<unknown[] | null>(null)
  const rows = reorderRowsLocal ?? rawRows
  const { notify } = useToast()

  // Read the explicit `?group=` value out of the URL so sort/pagination
  // links preserve "None" overrides (`?group=`). Server render: no URL,
  // so we fall back to `defaultGroup` from the meta — which is already
  // the reconciled active column.
  const urlGroup: string | undefined = typeof window === 'undefined'
    ? undefined
    : (() => {
        const sp = new URLSearchParams(window.location.search)
        const k = prefixK(queryPrefix, 'group')
        return sp.has(k) ? sp.get(k)! : undefined
      })()

  // Collapsible groups — per-group fold state. Keyed by `_groupValue`
  // (the raw column value, NOT the resolved title) so rows that share a
  // group key fold together. Persisted in localStorage at
  // `pilotiq.table.<currentPath>.groups.<column>.<value>`. Default-
  // collapsed groups derive their initial state from `meta.collapsed`.
  const groupCollapsible = activeGroupMeta?.collapsible === true
  const groupDefaultCollapsed = activeGroupMeta?.collapsed === true
  const groupStorageKey = (groupValue: string): string =>
    `pilotiq.table.${currentPath}.groups.${defaultGroup ?? ''}.${groupValue}`
  // Lazy-init from localStorage on mount; SSR returns the meta default.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!groupCollapsible || !defaultGroup) return
    // Walk the rendered rows once on mount, picking up persisted state.
    const next: Record<string, boolean> = {}
    const seen = new Set<string>()
    for (const row of rows) {
      const v = String((row as Record<string, unknown>)['_groupValue'] ?? '')
      if (seen.has(v)) continue
      seen.add(v)
      next[v] = readStoredFlag(groupStorageKey(v), groupDefaultCollapsed)
    }
    setCollapsedGroups(next)
    // Re-run if the active group changes — different values, different
    // localStorage namespace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultGroup, groupCollapsible, groupDefaultCollapsed, currentPath])
  const toggleGroupCollapsed = (groupValue: string): void => {
    setCollapsedGroups(prev => {
      const nextOpen = !prev[groupValue]
      const next = { ...prev, [groupValue]: nextOpen }
      writeStoredFlag(groupStorageKey(groupValue), nextOpen)
      return next
    })
  }
  const state: TableUrlState = {
    ...(search       !== undefined ? { search }      : {}),
    ...(currentSort  !== undefined ? { sort: currentSort } : {}),
    page: currentPage,
    ...(urlGroup     !== undefined ? { group: urlGroup }
        : defaultGroup !== undefined ? { group: defaultGroup }
        : {}),
    ...(activeGroupKey !== undefined ? { groupKey: activeGroupKey } : {}),
  }

  // Snapshot active filter values for sort/pagination href construction.
  // Filter form submits already carry these (selects are inside the
  // form); `<a href>` links don't, so we re-emit them here.
  const activeFilters: Record<string, string> = {}
  for (const f of filters) {
    const v = f['value']
    if (typeof v === 'string' && v !== '') activeFilters[String(f['name'])] = v
  }

  // Drill-in / drill-out URL builders for the group heading link and the
  // active-key chip's clear button. Drill-in sets `?<prefix>groupKey=v`
  // and resets `page`; drill-out clears it. Both round-trip foreign
  // params (other tables' state) through `buildTableQuery`.
  const buildGroupKeyHref = (value: string): string => buildTableQuery(
    state, { groupKey: value, page: 1 }, currentPath, activeFilters, queryPrefix,
  )
  const drillOutHref = (): string => buildTableQuery(
    state, { groupKey: '', page: 1 }, currentPath, activeFilters, queryPrefix,
  )

  // Track which row ids are currently checked. Keyed by id (string), not
  // by index, so pagination and re-renders don't drop selection state.
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const visibleIds = rows.map((row, i) => rowId(row, i))
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
  const someChecked = selected.size > 0

  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    setSelected(prev => {
      if (visibleIds.every(id => prev.has(id))) {
        const next = new Set(prev)
        for (const id of visibleIds) next.delete(id)
        return next
      }
      const next = new Set(prev)
      for (const id of visibleIds) next.add(id)
      return next
    })
  }


  if (columns.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No columns configured for this table.
      </div>
    )
  }

  const isCardsLayout = el['contentLayout'] === 'cards'
  const cardsPerRow   = el['cardsPerRow'] as Record<string, number> | undefined
  // Responsive fallback: table at/above the breakpoint, one card per row
  // below it. Distinct from `isCardsLayout` (cards everywhere) — they're
  // mutually exclusive in practice (cards mode wins if both somehow set).
  const stackBp        = !isCardsLayout
    ? (el['stackOnMobile'] as 'sm' | 'md' | 'lg' | undefined)
    : undefined
  const isStackOnMobile = stackBp !== undefined

  const totalPages = perPage && perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : 1
  const showPagination = totalPages > 1
  const hasFilters     = filters.length > 0
  // Filter layout positions (Filament v5). `'modal'` (default) keeps the
  // toolbar Filters button + popover. The three inline modes lay every
  // filter widget out as a wrapping strip in the matching slot. The
  // collapsible variant adds a toolbar toggle + per-table-path persisted
  // open state.
  const filtersLayout = (el['filtersLayout'] as
    | 'above-content' | 'above-content-collapsible' | 'below-content'
    | undefined) ?? 'modal'
  const filtersInModal = filtersLayout === 'modal'
  const filtersAbove   = filtersLayout === 'above-content'
                       || filtersLayout === 'above-content-collapsible'
  const filtersBelow   = filtersLayout === 'below-content'
  const filtersCollapsible = filtersLayout === 'above-content-collapsible'
  const filtersStripStorageKey = `pilotiq.table.${currentPath}.filters.open`
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => {
    if (!filtersCollapsible) return true
    // Default to OPEN when filters are active (URL carried filter values
    // in) so the user can see what's filtering — same UX cue as the
    // active-filters pill row.
    return readStoredFlag(filtersStripStorageKey, Object.keys(activeFilters).length > 0)
  })
  const toggleFiltersOpen = (): void => {
    setFiltersOpen(prev => {
      const next = !prev
      writeStoredFlag(filtersStripStorageKey, next)
      return next
    })
  }
  // Show the "Group by" dropdown when 2+ groups are registered, or 1
  // group with rich metadata (label/collapsible/etc.). A single bare
  // `defaultGroup('col')` with no `groups([...])` registration shouldn't
  // render the picker — there's nothing to pick.
  const hasGroupPicker = groupOptions.length >= 2
    || (groupOptions.length === 1 && Boolean(
      groupOptions[0]!.collapsible
      || groupOptions[0]!.collapsed
      || groupOptions[0]!.date,
    ))
  // Cards-everywhere AND stackOnMobile need the Sort-by picker (the cards
  // have no clickable column headers). In stack mode it's mobile-only —
  // the desktop table keeps its sortable headers.
  const wantsCardSort    = isCardsLayout || isStackOnMobile
  const sortableColumns  = wantsCardSort ? columns.filter(c => Boolean(c['sortable'])) : []
  const hasSortPicker    = wantsCardSort && sortableColumns.length > 0
  // Only modal + collapsible mount a toolbar widget; the always-visible
  // strip modes don't add anything to the header bar.
  const showFiltersInToolbar = hasFilters && (filtersInModal || filtersCollapsible)
  const hasColumnsToggle = toggleableColumns.length > 0
  const showHeaderBar    = searchable || headerActions.length > 0 || showFiltersInToolbar || hasGroupPicker || hasSortPicker || hasColumnsToggle
  const hasBulkActions = bulkActions.length > 0
  const hasRowActions  = rowActions.length > 0

  // Drag-to-reorder is enabled only when the visible rows ARE the
  // canonical sort. Filters / search / non-default sort / pagination
  // beyond page 1 all break that invariant; we render the grip column
  // greyed-out instead of letting the user reorder a slice that won't
  // round-trip cleanly. `reorderableColumn` is set server-side when
  // `Table.reorderable()` opts in.
  const sortMatchesReorder =
    currentSort?.column === reorderableColumn &&
    currentSort?.direction === 'asc'
  const filtersActive = Object.keys(activeFilters).length > 0
  const searchActive  = typeof search === 'string' && search !== ''
  const reorderEnabled =
    reorderableColumn !== undefined &&
    reorderUrl        !== undefined &&
    sortMatchesReorder              &&
    !filtersActive                  &&
    !searchActive                   &&
    currentPage === 1
  const reorderColumnVisible = reorderableColumn !== undefined

  // ── Reorder via @dnd-kit ──────────────────────
  // Grip-handle drag (PointerSensor with a small activation distance so a
  // click on a cell link never starts a drag) + keyboard a11y. The optimistic
  // local reorder + POST-or-rollback mirrors the previous HTML5-DnD behavior.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  function handleReorderDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!reorderUrl || over === null || active.id === over.id) return
    const fromIdx = visibleIds.indexOf(String(active.id))
    const toIdx   = visibleIds.indexOf(String(over.id))
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return
    const reordered = arrayMove(rows.slice(), fromIdx, toIdx)
    const newIds = reordered.map((row, i) => rowId(row, i))
    const previousLocal = reorderRowsLocal
    setReorderRowsLocal(reordered)
    void (async () => {
      try {
        const res = await fetch(reorderUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body:    JSON.stringify({ ids: newIds }),
        })
        if (!res.ok) throw new Error(`Reorder failed (${res.status})`)
      } catch (err) {
        // Roll back to server order. The toast surfaces the failure;
        // next page render fetches the persisted column.
        setReorderRowsLocal(previousLocal)
        notify({
          type:  'error',
          title: 'Could not save new order',
          body:  err instanceof Error ? err.message : 'Reorder failed',
        })
      }
    })()
  }
  const totalCols = visibleColumns.length
                  + (hasBulkActions      ? 1 : 0)
                  + (hasRowActions       ? 1 : 0)
                  + (reorderColumnVisible ? 1 : 0)

  // Top-bar chrome (heading / description / striped / emptyState).
  const tableHeading     = el['heading']     as string | undefined
  const tableDescription = el['description'] as string | undefined
  const striped          = Boolean(el['striped'])
  const emptyState       = el['emptyState']  as { heading?: string; description?: string; icon?: string } | undefined
  const filteredEmptyState = el['filteredEmptyState'] as { heading?: string; description?: string; icon?: string } | undefined
  const hasFilterOrSearch = (search !== undefined && search !== '') ||
    Object.keys(activeFilters).length > 0
  // Distinct copy when a query / filter is active. Falls back to
  // `emptyState` when `filteredEmptyState` is not set, preserving the
  // pre-2026-05-04 behavior for tables that haven't opted in.
  const activeEmpty = (hasFilterOrSearch && filteredEmptyState) ? filteredEmptyState : emptyState
  const EmptyIcon = activeEmpty?.icon ? (resolveIcon(activeEmpty.icon) ?? InboxIcon) : InboxIcon

  // The card body — shared between `contentLayout('cards')` (every
  // breakpoint) and the `stackOnMobile` mobile fallback (single column,
  // inside a `<bp>:hidden` wrapper). Same `_cardChildren` content either way.
  const renderCardsBody = (forceSingleColumn: boolean): React.ReactElement => (
    <CardsLayoutBody
      rows={rows}
      visibleIds={visibleIds}
      selected={selected}
      toggleRow={toggleRow}
      hasBulkActions={hasBulkActions}
      hasRowActions={hasRowActions}
      rowActions={rowActions}
      hasRecordUrl={hasRecordUrl}
      hasRecordClasses={hasRecordClasses}
      activeEmpty={activeEmpty}
      EmptyIcon={EmptyIcon}
      hasFilterOrSearch={hasFilterOrSearch}
      defaultGroup={defaultGroup}
      groupColumnLabel={groupColumnLabel}
      groupCollapsible={groupCollapsible}
      collapsedGroups={collapsedGroups}
      toggleGroupCollapsed={toggleGroupCollapsed}
      cardsPerRow={cardsPerRow}
      navigate={navigate}
      groupHeadingScopable={groupHeadingScopable}
      buildGroupKeyHref={buildGroupKeyHref}
      forceSingleColumn={forceSingleColumn}
      renderElement={renderElement}
      renderRowActions={(id, recordObj, actions) =>
        renderRowActions(id, recordObj, actions, renderActionLike)
      }
    />
  )

  return (
    <div className="flex flex-col gap-3">
      {(tableHeading || tableDescription) && (
        <div className="flex flex-col gap-1">
          {tableHeading && <h2 className="text-lg font-semibold">{tableHeading}</h2>}
          {tableDescription && <p className="text-sm text-muted-foreground">{tableDescription}</p>}
        </div>
      )}
      {showHeaderBar && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {(searchable || showFiltersInToolbar || hasGroupPicker || hasSortPicker || hasColumnsToggle) ? (
            <div className="flex items-center gap-2">
              {searchable && (
                <form method="get" action={currentPath || undefined} className="flex items-end gap-2">
                  {/* Carry the table's own non-search slice forward via hidden
                      inputs so a native form submit (Enter) preserves sort /
                      page / filters. Other tables' params on the URL also
                      survive via the same loop. */}
                  <SearchFormHiddenInputs prefix={queryPrefix} />
                  <Input
                    type="search"
                    name={prefixK(queryPrefix, 'search')}
                    defaultValue={search ?? ''}
                    placeholder="Search…"
                    className="h-8 w-64"
                  />
                  {/* Search submits via Enter natively. Hidden submit kept
                      for screen-reader form semantics. */}
                  <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
                    Apply
                  </button>
                </form>
              )}
              {hasFilters && filtersInModal && (
                <FilterPopover filters={filters} prefix={queryPrefix} renderFormChild={renderFormChild} />
              )}
              {hasFilters && filtersCollapsible && (
                <FilterStripToggle
                  filters={filters}
                  open={filtersOpen}
                  onToggle={toggleFiltersOpen}
                />
              )}
              {hasGroupPicker && (
                <TableGroupPicker
                  options={groupOptions}
                  active={defaultGroup}
                  onChange={(value) => {
                    // value === '' → explicit "None" (clears defaultGroup);
                    // value !== '' → switch to that column.
                    const href = buildTableQuery(
                      state,
                      { page: 1, group: value },
                      currentPath,
                      activeFilters,
                      queryPrefix,
                    )
                    navigate(href)
                  }}
                />
              )}
              {hasSortPicker && (
                <span className={isStackOnMobile ? STACK_MOBILE_ONLY[stackBp!] : undefined}>
                  <SortByPicker
                    columns={sortableColumns}
                    active={currentSort}
                    onChange={(column: string, direction: 'asc' | 'desc') => {
                      const href = buildTableQuery(
                        state,
                        { sort: { column, direction }, page: 1 },
                        currentPath,
                        activeFilters,
                        queryPrefix,
                      )
                      navigate(href)
                    }}
                  />
                </span>
              )}
              {toggleableColumns.length > 0 && (
                <ColumnsToggleDropdown
                  columns={toggleableColumns}
                  hidden={hiddenColumns}
                  onToggle={toggleColumnHidden}
                />
              )}
            </div>
          ) : <span />}
          {headerActions.length > 0 && (
            <div className="flex items-center gap-2">
              {headerActions.map((a, i) => renderActionLike(a, i))}
            </div>
          )}
        </div>
      )}
      {hasFilters && filtersInModal && <ActiveFiltersBar filters={filters} prefix={queryPrefix} />}
      {hasFilters && filtersAbove && filtersOpen && (
        <FilterStrip filters={filters} prefix={queryPrefix} renderFormChild={renderFormChild} />
      )}
      {activeGroupKey !== undefined && (
        <ActiveGroupKeyChip
          label={groupColumnLabel ?? defaultGroup ?? ''}
          value={activeGroupKey}
          displayValue={(() => {
            // Prefer a row-resolved `_groupTitle` (server stamped via
            // `getTitleFromRecordUsing`) so the chip reads the same as
            // a banded heading. Falls back to the raw bucket key when
            // no row matched — empty drilled-in pages still show what
            // they're drilled into.
            for (const r of rows) {
              const obj = r as Record<string, unknown>
              if (String(obj['_groupValue'] ?? '') !== activeGroupKey) continue
              const t = obj['_groupTitle']
              if (typeof t === 'string' && t !== '') return t
              break
            }
            return activeGroupKey
          })()}
          clearHref={drillOutHref()}
          navigate={navigate}
        />
      )}
      {hasBulkActions && someChecked && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            {bulkActions.map((a, i) =>
              renderActionLike(a, i, { ids: Array.from(selected) }),
            )}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>
      )}
      {isCardsLayout ? (
        renderCardsBody(false)
      ) : (
      <>
      {isStackOnMobile && (
        <div className={STACK_MOBILE_ONLY[stackBp!]}>
          {renderCardsBody(true)}
        </div>
      )}
      <div className={`rounded-xl border bg-card overflow-hidden${isStackOnMobile ? ` ${STACK_TABLE_VISIBLE[stackBp!]}` : ''}`}>
        <ReorderProvider
          enabled={reorderColumnVisible}
          ids={visibleIds}
          sensors={sensors}
          onDragEnd={handleReorderDragEnd}
        >
        <DataTable>
          <TableHeader className="bg-muted">
            <TableRow>
              {reorderColumnVisible && (
                <TableHead className="w-9 px-2" aria-label="Reorder" />
              )}
              {hasBulkActions && (
                <TableHead className="w-9 px-3">
                  <Checkbox
                    aria-label="Select all rows"
                    checked={allChecked}
                    onCheckedChange={() => toggleAll()}
                  />
                </TableHead>
              )}
              {visibleColumns.map((col, i) => {
                const name     = String(col['name'] ?? '')
                const label    = String(col['label'] ?? name)
                const sortable = Boolean(col['sortable'])
                const isActive = currentSort?.column === name

                const respClass = colResponsiveClass(col)
                if (!sortable) {
                  return (
                    <TableHead key={i} className={respClass || undefined}>
                      {label}
                    </TableHead>
                  )
                }
                const next = nextSortDir(currentSort, name)
                const href = buildTableQuery(state, { sort: next, page: 1 }, currentPath, activeFilters, queryPrefix)
                return (
                  <TableHead key={i} className={respClass || undefined}>
                    <a href={href} className="group -mx-1 inline-flex items-center gap-1.5 rounded px-1 hover:text-foreground">
                      {label}
                      <SortIcon direction={isActive ? currentSort!.direction : undefined} />
                    </a>
                  </TableHead>
                )
              })}
              {hasRowActions && (
                <TableHead className="w-px text-right text-xs uppercase tracking-wider">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalCols} className="py-12 text-center">
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
                </TableCell>
              </TableRow>
            ) : rows.map((row, ri) => {
              const id = visibleIds[ri]!
              const recordObj = row as Record<string, unknown>
              const isSelected = selected.has(id)
              const stripedClass = striped && ri % 2 === 1 ? 'bg-muted/30' : ''
              // Group banding — emit a heading row whenever `_groupValue`
              // differs from the previous row. The first row in any group
              // gets the heading; rows within keep their normal chrome.
              const groupValue = defaultGroup
                ? String(recordObj['_groupValue'] ?? '')
                : undefined
              const groupTitle = defaultGroup
                ? (recordObj['_groupTitle'] as string | undefined)
                : undefined
              const groupDescription = defaultGroup
                ? (recordObj['_groupDescription'] as string | undefined)
                : undefined
              const prevGroupValue = defaultGroup && ri > 0
                ? String(((rows[ri - 1] as Record<string, unknown>)['_groupValue'] ?? ''))
                : undefined
              const showGroupHeader =
                defaultGroup !== undefined && groupValue !== prevGroupValue
              // Hide data rows whose group is collapsed. The heading row
              // for that group still renders (so the user can re-expand).
              const isInCollapsedGroup =
                groupCollapsible && groupValue !== undefined && collapsedGroups[groupValue] === true
              // Filament-style per-cell linking. Each data cell wraps
              // its content in a real `<a href>` when the column resolves
              // to a record URL — column override (`Column.recordUrl(fn)`)
              // beats inheritance from the table (`Table.recordUrl(fn)`),
              // and `Column.recordUrl(false)` opts out. Action and bulk
              // cells are never wrapped, so clicks there fire only their
              // own handlers — no event-bubbling gymnastics.
              const tableUrl = hasRecordUrl ? (recordObj['_recordUrl'] as string | undefined) : undefined
              const colUrls = (recordObj['_columnRecordUrls'] as Record<string, string> | undefined) ?? {}
              const rowHasAnyLink = tableUrl !== undefined || Object.keys(colUrls).length > 0
              const customRowClasses = hasRecordClasses
                ? (recordObj['_recordClasses'] as string | undefined) ?? ''
                : ''
              const rowClassName = [stripedClass, rowHasAnyLink ? 'cursor-pointer' : '', customRowClasses]
                .filter(Boolean)
                .join(' ')
                .trim()
              return (
                <React.Fragment key={id}>
                {showGroupHeader && (
                  <TableRow key={`group-${id}`} className="bg-muted/40 hover:bg-muted/40">
                    <TableCell
                      colSpan={totalCols}
                      className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {(() => {
                        const drillable = groupHeadingScopable
                          && groupValue !== undefined
                          && groupValue !== ''
                        const headingText = (
                          <GroupHeaderText
                            label={groupColumnLabel}
                            value={groupValue}
                            title={groupTitle}
                            description={groupDescription}
                          />
                        )
                        const headingNode = drillable
                          ? <GroupHeadingLink href={buildGroupKeyHref(groupValue!)} navigate={navigate}>{headingText}</GroupHeadingLink>
                          : headingText
                        if (groupCollapsible) {
                          return (
                            <div className="flex w-full items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center"
                                onClick={() => toggleGroupCollapsed(groupValue!)}
                                aria-expanded={!isInCollapsedGroup}
                                aria-label={isInCollapsedGroup ? 'Expand group' : 'Collapse group'}
                              >
                                <ChevronDownIcon
                                  className={[
                                    'size-4 transition-transform',
                                    isInCollapsedGroup ? '-rotate-90' : '',
                                  ].filter(Boolean).join(' ')}
                                />
                              </button>
                              {headingNode}
                            </div>
                          )
                        }
                        return headingNode
                      })()}
                    </TableCell>
                  </TableRow>
                )}
                {isInCollapsedGroup ? null : (() => {
                  // Shared cells (no grip — `SortableDataRow` adds the grip
                  // handle itself so it can attach the drag listeners). Plain
                  // tables render these directly in a `<TableRow>`.
                  const dataCells = (
                  <>
                  {hasBulkActions && (
                    <TableCell className="w-9 px-3">
                      <Checkbox
                        aria-label={`Select row ${id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(id)}
                      />
                    </TableCell>
                  )}
                  {visibleColumns.map((col, ci) => {
                    const name = String(col['name'] ?? '')
                    const value = recordObj[name]
                    const align = col['alignment'] === 'center' ? 'text-center'
                                : col['alignment'] === 'end'    ? 'text-right'
                                : 'text-left'
                    const widthStyle = col['width']
                      ? { width: String(col['width']) }
                      : undefined

                    // Inline-edit cells take priority over read-only chrome.
                    // `_cellEditable[name]` is set per row by `loadTableRecords`
                    // only when `R.canEdit(user, row)` passed; the URL was
                    // stamped by `tagCellEditUrls` immediately after.
                    const editableMap = recordObj['_cellEditable'] as Record<string, true> | undefined
                    const editUrlMap  = recordObj['_cellEditUrls'] as Record<string, string> | undefined
                    const cellDisabledMap = recordObj['_cellDisabled'] as Record<string, true> | undefined
                    const editUrl = editableMap?.[name] ? editUrlMap?.[name] : undefined
                    const EditableComp = editUrl !== undefined
                      ? pickEditableCell(String(col['columnType'] ?? 'text'))
                      : null
                    if (EditableComp && editUrl !== undefined) {
                      const cellDisabled = col['disabled'] === true || cellDisabledMap?.[name] === true
                      const cellSelectOptionsMap = recordObj['_cellSelectOptions'] as
                        Record<string, Array<{ value: string; label: string }>> | undefined
                      const rowOptions = cellSelectOptionsMap?.[name]
                      return (
                        <TableCell key={ci} className={`text-sm text-foreground ${align} p-0 ${colResponsiveClass(col)}`} style={widthStyle}>
                          <EditableComp
                            url={editUrl}
                            col={col}
                            value={value}
                            disabled={cellDisabled}
                            {...(rowOptions ? { rowOptions } : {})}
                          />
                        </TableCell>
                      )
                    }

                    const cellContent = formatCell(value, col, recordObj)
                    const colUrl = resolveColumnUrl(col, tableUrl, colUrls)
                    return (
                      <TableCell key={ci} className={`text-sm text-foreground ${align} p-0 ${colResponsiveClass(col)}`} style={widthStyle}>
                        {colUrl !== undefined
                          ? <RecordCellLink href={colUrl} navigate={navigate}>{cellContent}</RecordCellLink>
                          : <div className="px-2 py-2">{cellContent}</div>}
                      </TableCell>
                    )
                  })}
                  {hasRowActions && (
                    <TableCell className="w-px text-right">
                      {renderRowActions(id, recordObj, rowActions, renderActionLike)}
                    </TableCell>
                  )}
                  </>
                  )
                  return reorderColumnVisible ? (
                    <SortableDataRow
                      id={id}
                      disabled={!reorderEnabled}
                      reorderEnabled={reorderEnabled}
                      dataState={isSelected ? 'selected' : undefined}
                      rowClassName={rowClassName || undefined}
                    >
                      {dataCells}
                    </SortableDataRow>
                  ) : (
                    <TableRow
                      data-state={isSelected ? 'selected' : undefined}
                      className={rowClassName || undefined}
                    >
                      {dataCells}
                    </TableRow>
                  )
                })()}
                {/* Per-group summary row — emitted at the end of each
                    group band (last row in group OR last row overall),
                    aligned to the same columns as the global tfoot.
                    Suppressed when the group is collapsed since the data
                    rows themselves are hidden. */}
                {(() => {
                  if (!groupSummaries) return null
                  if (groupValue === undefined) return null
                  if (isInCollapsedGroup) return null
                  const isLastInGroup = ri === rows.length - 1
                    || String(((rows[ri + 1] as Record<string, unknown>)['_groupValue'] ?? '')) !== groupValue
                  if (!isLastInGroup) return null
                  const perCol = groupSummaries[groupValue]
                  if (!perCol || Object.keys(perCol).length === 0) return null
                  return (
                    <TableRow key={`group-summary-${id}`} className="bg-muted/20 hover:bg-muted/20">
                      {reorderColumnVisible && <TableCell />}
                      {hasBulkActions      && <TableCell />}
                      {visibleColumns.map((col, ci) => {
                        const name  = String(col['name'] ?? '')
                        const align = col['alignment'] === 'center' ? 'text-center'
                                    : col['alignment'] === 'end'    ? 'text-right'
                                    : 'text-left'
                        const items = perCol[name]
                        return (
                          <TableCell key={ci} className={`text-xs font-medium ${align} px-2 py-1.5 ${colResponsiveClass(col)}`}>
                            {items?.map((s, i) => (
                              <div key={i} className="leading-tight">
                                {s.label && <span className="text-muted-foreground">{s.label}: </span>}
                                <span>{s.value}</span>
                              </div>
                            ))}
                          </TableCell>
                        )
                      })}
                      {hasRowActions && <TableCell />}
                    </TableRow>
                  )
                })()}
                </React.Fragment>
              )
            })}
          </TableBody>
          {summaries && Object.keys(summaries).length > 0 && (
            <TableFooter>
              <TableRow>
                {reorderColumnVisible && <TableCell />}
                {hasBulkActions && <TableCell />}
                {visibleColumns.map((col, ci) => {
                  const name  = String(col['name'] ?? '')
                  const align = col['alignment'] === 'center' ? 'text-center'
                              : col['alignment'] === 'end'    ? 'text-right'
                              : 'text-left'
                  const items = summaries[name]
                  return (
                    <TableCell key={ci} className={`text-sm font-medium ${align} ${colResponsiveClass(col)}`}>
                      {items?.map((s, i) => (
                        <div key={i} className="leading-tight">
                          {s.label && <span className="text-muted-foreground">{s.label}: </span>}
                          <span>{s.value}</span>
                        </div>
                      ))}
                    </TableCell>
                  )
                })}
                {hasRowActions && <TableCell />}
              </TableRow>
            </TableFooter>
          )}
        </DataTable>
        </ReorderProvider>
      </div>
      </>
      )}
      {showPagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {currentPage} of {totalPages}{total > 0 ? ` · ${total} record${total === 1 ? '' : 's'}` : ''}
          </span>
          <div className="flex items-center gap-2">
            {currentPage > 1 && (
              <a
                href={buildTableQuery(state, { page: currentPage - 1 }, currentPath, activeFilters, queryPrefix)}
                className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
              >
                ← Previous
              </a>
            )}
            {currentPage < totalPages && (
              <a
                href={buildTableQuery(state, { page: currentPage + 1 }, currentPath, activeFilters, queryPrefix)}
                className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
      {hasFilters && filtersBelow && (
        <FilterStrip filters={filters} prefix={queryPrefix} renderFormChild={renderFormChild} />
      )}
    </div>
  )
}

