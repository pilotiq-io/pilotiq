import React, { useContext, useId, useMemo, useState } from 'react'
import { PlusIcon } from 'lucide-react'
import type { ElementMeta } from '../../schema/Element.js'
import { Button } from '../ui/button.js'
import { SchemaRenderer, dispatchHandlerAction } from '../SchemaRenderer.js'
import { FormIdContext, useFormState } from '../FormStateContext.js'
import { findFieldMeta } from '../formStateHelpers.js'
import { useNavigate } from '../navigate.js'
import { useToast } from '../Toaster.js'
import type { RowButtonsMeta } from '../../fields/RowButton.js'
import {
  RowChromeIconButton,
  ReorderGrip,
  CollapseChevron,
  resolveRowChrome,
  DEFAULT_MOVE_UP,
  DEFAULT_MOVE_DOWN,
  DEFAULT_CLONE,
  DEFAULT_DELETE,
} from './rowChromeButton.js'

/**
 * Pure reorder helper — used by both the HTML5 DnD path and the
 * Up/Down button path. `insertBeforeIdx` is the boundary the dragged
 * row should land at (range `0..rows.length`); after removing the
 * source we adjust by -1 when the source sat below the target so the
 * caller never has to think about post-removal index shifts.
 *
 * No-ops when the move would leave the array unchanged.
 */
export function reorderRows<T>(rows: T[], fromIdx: number, insertBeforeIdx: number): T[] {
  if (fromIdx < 0 || fromIdx >= rows.length) return rows
  if (insertBeforeIdx < 0 || insertBeforeIdx > rows.length) return rows
  if (fromIdx === insertBeforeIdx || fromIdx + 1 === insertBeforeIdx) return rows
  const next  = rows.slice()
  const moved = next.splice(fromIdx, 1)[0] as T
  const target = insertBeforeIdx > fromIdx ? insertBeforeIdx - 1 : insertBeforeIdx
  next.splice(target, 0, moved)
  return next
}

/** Tailwind v4 default breakpoints. Hardcoded so the renderer doesn't need
 * to read the consumer's tailwind config. */
const RESPONSIVE_GRID_BREAKPOINTS: Array<{ key: 'sm' | 'md' | 'lg' | 'xl' | '2xl'; min: string }> = [
  { key: 'sm',  min: '40rem' },
  { key: 'md',  min: '48rem' },
  { key: 'lg',  min: '64rem' },
  { key: 'xl',  min: '80rem' },
  { key: '2xl', min: '96rem' },
]

/**
 * Compute the grid container's className / style / scoped-CSS block from
 * a `meta.grid` value. Shared between Repeater and Builder so both render
 * responsive grids identically.
 *
 * - `meta.grid` undefined → `{ hasGrid: false }` and the caller falls back
 *   to a vertical flex stack.
 * - Number form (`grid(2)`) → inline `gridTemplateColumns: repeat(N, …)`.
 * - Object form (`grid({ default: 1, md: 2 })`) → a fresh `<style>` block
 *   keyed off `scopeId` + a matching className on the container; default
 *   columns drive the base rule, each declared breakpoint adds a media
 *   query override.
 *
 * `scopeId` should be a stable per-field identifier (we use `useId()` from
 * React — already isolated to this render's component instance).
 */
export function buildGridContainer(
  grid: number | Record<string, number | undefined> | undefined,
  scopeId: string,
): {
  hasGrid:    boolean
  className:  string
  style:      React.CSSProperties | undefined
  styleBlock: React.ReactElement | null
} {
  if (grid === undefined) {
    return { hasGrid: false, className: 'flex flex-col gap-3', style: undefined, styleBlock: null }
  }
  if (typeof grid === 'number') {
    return {
      hasGrid: true,
      className: 'grid gap-3',
      style: { gridTemplateColumns: `repeat(${grid}, minmax(0, 1fr))` },
      styleBlock: null,
    }
  }
  const cls = `pq-grid-${scopeId.replace(/:/g, '')}`
  const baseCols = typeof grid['default'] === 'number' ? grid['default'] : 1
  const rules: string[] = [
    `.${cls} { display: grid; gap: 0.75rem; grid-template-columns: repeat(${baseCols}, minmax(0, 1fr)); }`,
  ]
  for (const bp of RESPONSIVE_GRID_BREAKPOINTS) {
    const cols = grid[bp.key]
    if (typeof cols !== 'number') continue
    rules.push(`@media (min-width: ${bp.min}) { .${cls} { grid-template-columns: repeat(${cols}, minmax(0, 1fr)); } }`)
  }
  return {
    hasGrid: true,
    className: cls,
    style: undefined,
    styleBlock: <style>{rules.join('\n')}</style>,
  }
}

interface RowState {
  id:            string
  children:      ElementMeta[]
  itemLabel?:    string
  hidden?:       boolean
  extraActions?: ElementMeta[]
}

/**
 * Repeater renderer (Plan #14).
 *
 * Rows are managed as local React state with stable `id` keys so
 * uncontrolled inner inputs preserve their typed values across
 * add/remove/reorder operations. Each row's resolved children meta is
 * deep-cloned with a row-scoped prefix on every Field's `name` so
 * submitted form bodies are flat-keyed (`items.0.product`, etc.) — the
 * server's `coerceFormValues` re-groups them into an array.
 *
 * Reorder: native HTML5 drag-and-drop on each row, with a 2px drop
 * indicator showing where the row will land. Up/Down buttons are kept
 * as a keyboard fallback. Both paths route through `reorderRows()` so
 * behavior is identical. Collapsed state persists per-row to
 * `localStorage` under `pilotiq.repeater.<formId>.<fieldName>.<rowId>`
 * when collapsible.
 *
 * Inner-field reactivity: this component does NOT integrate with
 * `FormStateProvider` for nested-path live updates; that surgery is
 * tracked separately. Repeaters with `live()` inner fields render
 * today but the `live` trigger doesn't roundtrip.
 */
export function RepeaterInput({
  el,
  name,
  disabled,
}: {
  el:       ElementMeta
  name:     string
  disabled: boolean
}): React.ReactElement {
  // The parent <form>'s id, scoped via context. Falls back to the field
  // name when no Form is in scope (defensive — Repeaters always render
  // inside a Form on real pages, but Storybook / unit tests can mount
  // them bare).
  const formIdFromCtx = useContext(FormIdContext)
  const formId        = formIdFromCtx || `repeater-${name}`
  const meta             = el as RepeaterMetaShape
  const minItems         = typeof meta.minItems === 'number' ? meta.minItems : undefined
  const maxItems         = typeof meta.maxItems === 'number' ? meta.maxItems : undefined
  const collapsible      = Boolean(meta.collapsible)
  const defaultCollapsed = Boolean(meta.defaultCollapsed)
  const accordion        = Boolean(meta.accordion)
  const reorderable      = Boolean(meta.reorderable)
  const cloneable        = Boolean(meta.cloneable)
  const simple           = Boolean(meta.simple)
  const buttons          = meta.buttons
  // Customizer wins over the legacy `addActionLabel`. Default 'Add' is the
  // final fallback; documented in `RepeaterField.addActionLabel`.
  const addLabel         = buttons?.add?.label
    ?? (typeof meta.addActionLabel === 'string' ? meta.addActionLabel : 'Add')
  const columns          = typeof meta.columns === 'number' && meta.columns > 1 ? meta.columns : 1
  // Row-grid mode: scalar `grid: N` or responsive object `grid: { default, md, … }`
  // lays rows in an n-column grid. Distinct from `columns` which grids the inner
  // schema *inside* a row. We suppress the drop indicator in grid mode (a horizontal
  // accent line reads wrong across grid cells); button reorder still works.
  const gridScopeId      = useId()
  const gridContainer    = useMemo(
    () => buildGridContainer(
      meta.grid as number | Record<string, number | undefined> | undefined,
      gridScopeId,
    ),
    [meta.grid, gridScopeId],
  )
  // Table mode renders rows as `<tr>` and inner fields as `<td>`. Mutually
  // exclusive with `simple` and `grid` (the field setters arbitrate).
  // Collapsible / accordion are meaningless on `<tr>` rows so we ignore
  // those flags in this path.
  const tableColumns     = meta.table?.columns
  const tableMode        = Array.isArray(tableColumns) && tableColumns.length > 0

  const initialRows: RowState[] = useMemo(
    () => (meta.rows ?? []).map(r => ({
      id:        r.id,
      children:  r.children,
      ...(r.itemLabel !== undefined ? { itemLabel: r.itemLabel } : {}),
      ...(r.hidden ? { hidden: true } : {}),
      ...(r.extraActions && r.extraActions.length > 0 ? { extraActions: r.extraActions } : {}),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [rows, setRows] = useState<RowState[]>(initialRows)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    accordion ? {} : initSeedCollapsed(initialRows, formId, name, defaultCollapsed, collapsible),
  )
  // Accordion mode replaces the per-row collapsed map with a single open
  // row id (or `null` for "all collapsed"). Persisted under a single
  // `…accordion` storage key so reload + form swap restore the open row.
  // Initial value: respect `defaultCollapsed` (start with everything
  // collapsed when the author opted in), otherwise open the first
  // visible row — Filament's posture, and matches the implicit user
  // mental model that an accordion always shows *something*.
  const [accordionOpenId, setAccordionOpenId] = useState<string | null>(() => {
    if (!accordion) return null
    const stored = readAccordionFromStorage(formId, name)
    if (stored !== undefined) {
      // Storage may hold a stale id from before a row was deleted; if so,
      // fall through to the default.
      if (stored === '' || initialRows.some(r => r.id === stored)) return stored === '' ? null : stored
    }
    if (defaultCollapsed) return null
    const firstVisible = initialRows.find(r => !r.hidden)
    return firstVisible?.id ?? null
  })

  const atMin = minItems !== undefined && rows.length <= minItems
  const atMax = maxItems !== undefined && rows.length >= maxItems

  const addRow = (): void => {
    if (atMax) return
    const newRow: RowState = {
      id:       generateRowId(),
      children: meta.template ?? [],
    }
    setRows(prev => [...prev, newRow])
    if (accordion) {
      // New row should be the only one open — the user just asked for it.
      setAccordionOpenId(newRow.id)
      writeAccordionToStorage(formId, name, newRow.id)
      return
    }
    if (collapsible && defaultCollapsed) {
      setCollapsed(prev => ({ ...prev, [newRow.id]: true }))
      writeCollapsedToStorage(formId, name, newRow.id, true)
    }
  }

  const removeRow = (id: string): void => {
    if (atMin) return
    setRows(prev => prev.filter(r => r.id !== id))
    if (accordion) {
      if (accordionOpenId === id) {
        setAccordionOpenId(null)
        writeAccordionToStorage(formId, name, null)
      }
      return
    }
    setCollapsed(prev => {
      const { [id]: _drop, ...rest } = prev
      return rest
    })
    deleteCollapsedFromStorage(formId, name, id)
  }

  const cloneRow = (id: string): void => {
    if (atMax) return
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx < 0) return prev
      const source = prev[idx]!
      const clone: RowState = {
        id:       generateRowId(),
        children: source.children,
        ...(source.itemLabel !== undefined ? { itemLabel: source.itemLabel } : {}),
      }
      const next = prev.slice()
      next.splice(idx + 1, 0, clone)
      return next
    })
  }

  const moveRow = (id: string, dir: -1 | 1): void => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx < 0) return prev
      // Skip past hidden neighbours so reorder operates between visible
      // rows. Hidden rows hold their absolute slot — the visible row hops
      // over them.
      if (dir === -1) {
        let target = idx - 1
        while (target >= 0 && prev[target]?.hidden) target--
        if (target < 0) return prev
        return reorderRows(prev, idx, target)
      }
      let target = idx + 1
      while (target < prev.length && prev[target]?.hidden) target++
      if (target >= prev.length) return prev
      return reorderRows(prev, idx, target + 1)
    })
  }

  // ── DnD state ───────────────────────────────────────────
  // dragId  — the row being dragged, or null when no drag is active.
  // dropAt  — the boundary slot the cursor is currently over
  //           (range 0..rows.length); null when not over a valid drop target.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  // Generic on `HTMLElement` so the same handlers wire onto a `<div>`
  // row (card / grid layouts) AND a `<tr>` row (table layout). Concrete
  // refinement happens at the consumer's prop boundary.
  const onRowDragStart = (id: string) => (e: React.DragEvent<HTMLElement>): void => {
    if (!reorderable || disabled) return
    setDragId(id)
    // dataTransfer needs *something* to register the drag in Firefox.
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', id) } catch { /* IE quirk; ignore */ }
  }

  const onRowDragOver = (idx: number) => (e: React.DragEvent<HTMLElement>): void => {
    if (!reorderable || disabled || dragId === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    // Drop above this row when cursor is in its top half, below when in its bottom half.
    const rect      = e.currentTarget.getBoundingClientRect()
    const aboveHalf = e.clientY < rect.top + rect.height / 2
    setDropAt(aboveHalf ? idx : idx + 1)
  }

  const onRowDrop = (e: React.DragEvent<HTMLElement>): void => {
    if (!reorderable || disabled || dragId === null || dropAt === null) {
      setDragId(null); setDropAt(null); return
    }
    e.preventDefault()
    setRows(prev => {
      const fromIdx = prev.findIndex(r => r.id === dragId)
      if (fromIdx < 0) return prev
      return reorderRows(prev, fromIdx, dropAt)
    })
    setDragId(null); setDropAt(null)
  }

  const onRowDragEnd = (): void => {
    setDragId(null); setDropAt(null)
  }

  // ── Inner-field live re-resolve (Plan #14 v1.1) ─────────────
  // Inner Repeater inputs are uncontrolled (so reorder/clone preserves
  // typed values). To make `Field.live()` work on them, we delegate
  // change/blur events at the container level: the dotted-path field
  // name on `target.name` is enough to find the field meta and decide
  // whether to fire. `triggerLive` then snapshots the form's full
  // FormData and POSTs to the partial-resolve endpoint — see
  // FormStateContext.
  //
  // React-controlled primitives that update via callbacks (Switch /
  // Slider / Base UI Select / etc.) don't bubble native input events
  // here. Each of those renderers calls `fs.triggerLive(value)`
  // explicitly to compensate (Plan #14 v1.2). Native inputs
  // (text/number/email/textarea/range/date/checkbox/radio) keep
  // bubbling through this delegate as before.
  const formState = useFormState()
  const fireLive = (name: string, value: string, eventKind: 'change' | 'blur'): void => {
    if (!formState) return
    if (!name.includes('.')) return  // top-level fields handle their own live trigger
    const fieldMeta = findFieldMeta(formState.formMeta, name)
    const liveCfg   = fieldMeta?.['live']
    if (!liveCfg) return
    const onBlurMode = typeof liveCfg === 'object' && liveCfg !== null
      && (liveCfg as { onBlur?: boolean }).onBlur === true
    if (eventKind === 'change' && onBlurMode) return
    if (eventKind === 'blur'   && !onBlurMode) return
    formState.triggerLive(name, value)
  }
  const onContainerChange = (e: React.ChangeEvent<HTMLDivElement>): void => {
    const t = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    if (!t.name) return
    fireLive(t.name, t.value, 'change')
  }
  const onContainerBlur = (e: React.FocusEvent<HTMLDivElement>): void => {
    const t = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    if (!t.name) return
    fireLive(t.name, t.value, 'blur')
  }

  const toggleCollapsed = (id: string): void => {
    if (accordion) {
      // Click the open row to collapse all; click any other row to swap.
      // No "two rows open" state is reachable.
      const next = accordionOpenId === id ? null : id
      setAccordionOpenId(next)
      writeAccordionToStorage(formId, name, next)
      return
    }
    setCollapsed(prev => {
      const nextValue = !prev[id]
      writeCollapsedToStorage(formId, name, id, nextValue)
      return { ...prev, [id]: nextValue }
    })
  }

  // Visibility computed each render — hidden rows still occupy slots in
  // `rows` (so values round-trip + reorder-around math stays simple), but
  // they don't count for the user-facing empty state, drop indicator, or
  // first/last-visible disable on Up/Down buttons.
  const hasVisibleRow = rows.some(r => !r.hidden)
  const firstVisibleIdx = rows.findIndex(r => !r.hidden)
  const lastVisibleIdx  = (() => {
    for (let i = rows.length - 1; i >= 0; i--) if (!rows[i]?.hidden) return i
    return -1
  })()

  if (tableMode && tableColumns) {
    // Table mode renders rows as `<tr>` with the inner schema's fields
    // as `<td>` cells. The reorder grip + extraActions + clone + delete
    // strip lives in a final actions column (only mounted when any of
    // those are configured). Hidden rows render with `display:none` on
    // `<tr>` so values still round-trip on submit. Drop indicator is
    // suppressed — a horizontal accent across `<td>` cells looks broken;
    // button reorder + drag itself still move rows.
    // Actions cell is always present in v1 — delete is implicit on every
    // Repeater row, and reorder/clone/extraActions land here too. When
    // every action happens to be disabled (e.g. atMin && no reorderable
    // && no clone), the cell still renders for column-count consistency.
    return (
      <RepeaterTableLayout
        rows={rows}
        name={name}
        formId={formId}
        disabled={disabled}
        columns={tableColumns}
        addLabel={addLabel}
        buttons={buttons}
        atMin={atMin}
        atMax={atMax}
        reorderable={reorderable}
        cloneable={cloneable}
        firstVisibleIdx={firstVisibleIdx}
        lastVisibleIdx={lastVisibleIdx}
        hasVisibleRow={hasVisibleRow}
        dragId={dragId}
        onAdd={addRow}
        onMoveUp={(id) => moveRow(id, -1)}
        onMoveDown={(id) => moveRow(id, 1)}
        onClone={cloneRow}
        onRemove={removeRow}
        onContainerChange={onContainerChange}
        onContainerBlur={onContainerBlur}
        onRowDragStart={onRowDragStart}
        onRowDragOver={onRowDragOver}
        onRowDrop={onRowDrop}
        onRowDragEnd={onRowDragEnd}
      />
    )
  }

  // In grid mode the rows themselves are grid items — wrap them in a
  // CSS grid; otherwise stack vertically. The empty state and Add
  // button are rendered as siblings so they don't get pulled into the
  // grid (Add stays at the natural bottom; empty state spans full).
  return (
    <div
      className="flex flex-col gap-3"
      onChange={onContainerChange}
      onBlur={onContainerBlur}
    >
      {!hasVisibleRow && (
        <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No items yet. Click {addLabel} to start.
        </div>
      )}

      {gridContainer.styleBlock}
      <div
        className={gridContainer.className}
        style={gridContainer.style}
      >
      {rows.map((row, i) => (
        <React.Fragment key={row.id}>
          {!row.hidden && dropAt === i && !gridContainer.hasGrid && <DropIndicator />}
          <RepeaterRow
            row={row}
            index={i}
            isFirstVisible={i === firstVisibleIdx}
            isLastVisible={i === lastVisibleIdx}
            name={name}
            disabled={disabled}
            collapsible={collapsible}
            isCollapsed={collapsible && (
              accordion
                ? accordionOpenId !== row.id
                : (collapsed[row.id] ?? false)
            )}
            reorderable={reorderable}
            cloneable={cloneable}
            simple={simple}
            atMin={atMin}
            atMax={atMax}
            columns={columns}
            buttons={buttons}
            isDragging={dragId === row.id}
            rowPath={`${name}.${i}`}
            onMoveUp={() => moveRow(row.id, -1)}
            onMoveDown={() => moveRow(row.id, 1)}
            onClone={() => cloneRow(row.id)}
            onRemove={() => removeRow(row.id)}
            onToggleCollapse={() => toggleCollapsed(row.id)}
            onDragStart={onRowDragStart(row.id)}
            onDragOver={onRowDragOver(i)}
            onDrop={onRowDrop}
            onDragEnd={onRowDragEnd}
          />
        </React.Fragment>
      ))}
      {dropAt === rows.length && !gridContainer.hasGrid && <DropIndicator />}
      </div>

      <AddRowButton
        label={addLabel}
        buttons={buttons}
        disabled={disabled || atMax}
        onClick={addRow}
      />
    </div>
  )
}

/**
 * Bottom Add button — outline shadcn `<Button>`. Reads the customizer
 * (`addAction(RowButton.make()…)`) for icon + tooltip overrides; label
 * is already pre-resolved upstream so the legacy `addActionLabel()` setter
 * keeps working. Color override is intentionally ignored on the Add
 * button to preserve the outline-button visual identity (icon-color
 * tweaks would clash with the shadcn variant); use `Action.color()` on
 * a custom header action if you need a different chrome there.
 */
function AddRowButton({
  label,
  buttons,
  disabled,
  onClick,
}: {
  label:    string
  buttons:  RowButtonsMeta | undefined
  disabled: boolean
  onClick:  () => void
}): React.ReactElement {
  const { Icon, tooltip } = resolveRowChrome(
    { Icon: PlusIcon, label, tooltip: '', colorClass: '' },
    buttons?.add,
  )
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={tooltip || undefined}
      className="self-start"
    >
      <Icon className="size-4" />
      {label}
    </Button>
  )
}

function RepeaterRow({
  row, index, isFirstVisible, isLastVisible, name, disabled,
  collapsible, isCollapsed, reorderable, cloneable, simple, atMin, atMax, columns,
  buttons,
  isDragging,
  rowPath,
  onMoveUp, onMoveDown, onClone, onRemove, onToggleCollapse,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  row:               RowState
  index:             number
  isFirstVisible:    boolean
  isLastVisible:     boolean
  name:              string
  disabled:          boolean
  collapsible:       boolean
  isCollapsed:       boolean
  reorderable:       boolean
  cloneable:         boolean
  simple:            boolean
  atMin:             boolean
  atMax:             boolean
  columns:           number
  buttons:           RowButtonsMeta | undefined
  isDragging:        boolean
  rowPath:           string
  onMoveUp:          () => void
  onMoveDown:        () => void
  onClone:           () => void
  onRemove:          () => void
  onToggleCollapse:  () => void
  onDragStart:       (e: React.DragEvent<HTMLElement>) => void
  onDragOver:        (e: React.DragEvent<HTMLElement>) => void
  onDrop:            (e: React.DragEvent<HTMLElement>) => void
  onDragEnd:         (e: React.DragEvent<HTMLElement>) => void
}): React.ReactElement {
  const prefix     = `${name}.${index}`
  const namespaced = useMemo(
    () => row.children.map(c => prefixFieldNames(c, prefix)),
    [row.children, prefix],
  )
  const headerLabel = row.itemLabel ?? `Item ${index + 1}`

  // Hidden rows: render only the inputs (and __id) inside a display:none
  // wrapper so their values round-trip through FormData on submit. No
  // chrome, no drag wiring, no labels — `itemHidden` is purely UX.
  if (row.hidden) {
    return (
      <div style={{ display: 'none' }} data-pilotiq-repeater-row="hidden">
        <input type="hidden" name={`${prefix}.__id`} value={row.id} readOnly />
        <SchemaRenderer elements={namespaced} />
      </div>
    )
  }

  // Native HTML5 DnD only fires `dragstart` from elements with `draggable=true`.
  // We attach it at the row container so the grip handle (and the empty
  // header gutter, for forgiving aim) both initiate a drag. The handle's
  // visual cursor + aria-label tell users where the affordance lives.
  const dragProps = reorderable && !disabled
    ? {
        draggable:     true as const,
        onDragStart,
        onDragOver,
        onDrop,
        onDragEnd,
      }
    : {}

  // Simple-mode: flatten the row to one input + inline action strip — no
  // header, no border, no collapse (a single field has nothing to collapse).
  // Reorder + delete still work; clone + extraActions are intentionally
  // dropped since there's no "row identity" worth duplicating in the flat
  // shape, and per-row buttons read cluttered next to a one-input row.
  // FieldShell renders a label by default — for simple rows we want flush
  // inputs (Filament's posture too), so we suppress the inner label by
  // wrapping in a class that hides the FieldShell's label slot.
  if (simple) {
    return (
      <div
        className={`flex items-center gap-2 transition-opacity ${isDragging ? 'opacity-50' : ''}`}
        data-pilotiq-repeater-row="simple"
        {...dragProps}
      >
        <input type="hidden" name={`${prefix}.__id`} value={row.id} readOnly />
        {reorderable && <ReorderGrip disabled={disabled} buttons={buttons} />}
        <div className="flex-1 [&_label]:sr-only">
          <SchemaRenderer elements={namespaced} />
        </div>
        {reorderable && (
          <>
            <RowChromeIconButton
              defaults={DEFAULT_MOVE_UP}
              override={buttons?.moveUp}
              disabled={disabled || isFirstVisible}
              onClick={onMoveUp}
            />
            <RowChromeIconButton
              defaults={DEFAULT_MOVE_DOWN}
              override={buttons?.moveDown}
              disabled={disabled || isLastVisible}
              onClick={onMoveDown}
            />
          </>
        )}
        <RowChromeIconButton
          defaults={DEFAULT_DELETE}
          override={buttons?.delete}
          disabled={disabled || atMin}
          onClick={onRemove}
        />
      </div>
    )
  }

  return (
    <div
      className={`rounded-md border bg-card transition-opacity ${isDragging ? 'opacity-50' : ''}`}
      data-pilotiq-repeater-row=""
      {...dragProps}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {reorderable && <ReorderGrip disabled={disabled} buttons={buttons} />}
        {collapsible && (
          <CollapseChevron
            isCollapsed={isCollapsed}
            disabled={disabled}
            buttons={buttons}
            onToggle={onToggleCollapse}
          />
        )}
        <span className="flex-1 truncate text-sm font-medium">{headerLabel}</span>
        <input type="hidden" name={`${prefix}.__id`} value={row.id} readOnly />
        {reorderable && (
          <>
            <RowChromeIconButton
              defaults={DEFAULT_MOVE_UP}
              override={buttons?.moveUp}
              disabled={disabled || isFirstVisible}
              onClick={onMoveUp}
            />
            <RowChromeIconButton
              defaults={DEFAULT_MOVE_DOWN}
              override={buttons?.moveDown}
              disabled={disabled || isLastVisible}
              onClick={onMoveDown}
            />
          </>
        )}
        {row.extraActions && row.extraActions.length > 0 && (
          <ExtraActionStrip
            actions={row.extraActions}
            rowPath={rowPath}
            disabled={disabled}
          />
        )}
        {cloneable && (
          <RowChromeIconButton
            defaults={DEFAULT_CLONE}
            override={buttons?.clone}
            disabled={disabled || atMax}
            onClick={onClone}
          />
        )}
        <RowChromeIconButton
          defaults={DEFAULT_DELETE}
          override={buttons?.delete}
          disabled={disabled || atMin}
          onClick={onRemove}
        />
      </div>

      {/* Body — kept mounted (display:none on collapse) so uncontrolled
          input values persist across collapse toggles. */}
      <div
        className="p-3"
        style={isCollapsed ? { display: 'none' } : undefined}
      >
        {columns > 1
          ? (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              <SchemaRenderer elements={namespaced} />
            </div>
          )
          : <SchemaRenderer elements={namespaced} />}
      </div>
    </div>
  )
}

/**
 * Per-row extraItemActions strip. Each button dispatches its handler
 * action by snapshotting the parent `<form>` (so the server's
 * `coerceFormValues` sees the row's submitted fields), then POSTs to the
 * action's `dispatchUrl` with `_rowPath="<fieldName>.<index>"` in the
 * body — the server uses that path to navigate into the field's row
 * array and stamp `ctx.row = { index, id, values, fieldName }` on the
 * handler context.
 *
 * v1 — handler-style only. `href` / `method` / modal-form actions inside
 * `extraItemActions` are accepted by the type system but render here as
 * no-op buttons (they have neither a `dispatchUrl` nor a row-aware fetch
 * branch). Filament parity for those modes can land in a follow-up.
 *
 * Disabled actions render greyed out + skip dispatch (matches the
 * `meta.disabled` stamp from `resolveExtraItemActions`).
 */
export function ExtraActionStrip({
  actions, rowPath, disabled,
}: {
  actions:  ElementMeta[]
  rowPath:  string
  disabled: boolean
}): React.ReactElement {
  const navigate = useNavigate()
  const { notify } = useToast()

  const onClick = (action: ElementMeta) => async (e: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
    if (disabled || action['disabled']) return
    const dispatchUrl = action['dispatchUrl'] as string | undefined
    if (!dispatchUrl) return
    const form = e.currentTarget.closest('form')
    const snapshot = form ? new FormData(form) : new FormData()
    await dispatchHandlerAction(
      dispatchUrl,
      [],
      navigate,
      notify,
      { _rowPath: rowPath },
      snapshot,
    )
  }

  return (
    <>
      {actions.map((a, i) => {
        const label    = String(a['label'] ?? a['name'] ?? '')
        const tooltip  = (a['tooltip'] as string | undefined) ?? label
        const isDisabled = disabled || Boolean(a['disabled'])
        const destructive = Boolean(a['destructive'])
        return (
          <button
            key={i}
            type="button"
            onClick={onClick(a)}
            disabled={isDisabled}
            aria-label={label}
            title={tooltip}
            data-action-name={a['name']}
            className={`text-muted-foreground hover:text-foreground disabled:opacity-30 ${destructive ? 'hover:text-destructive' : ''}`.trim()}
          >
            <span className="text-xs font-medium">{label}</span>
          </button>
        )
      })}
    </>
  )
}

/**
 * 2px-tall horizontal accent line rendered between rows when the user
 * drags a row over a valid drop boundary. Uses `pointer-events: none`
 * so the underlying row's `dragover` keeps firing — without this, the
 * indicator would steal events and the drop slot would flicker.
 */
function DropIndicator(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none h-0.5 rounded-full bg-primary"
    />
  )
}

/**
 * Table-mode layout. Renders rows as `<tr>` and inner schema fields as
 * `<td>` cells, with the supplied column headers in `<thead>`.
 *
 * Cells call `prefixFieldNames` to emit row-scoped flat dotted names
 * (`items.0.name`, etc.) — same wire shape as the card layout, so
 * `coerceFormValues` re-groups identically. The first inner FieldShell
 * label is suppressed via a parent `[&_label]:sr-only` since the
 * column header carries the labelling.
 *
 * The actions column hosts grip / Up / Down / clone / extraActions /
 * delete affordances. We render it unconditionally so column count
 * stays stable across rows even when individual buttons disable.
 */
function RepeaterTableLayout({
  rows, name, formId: _formId, disabled, columns, addLabel, buttons, atMin, atMax,
  reorderable, cloneable,
  firstVisibleIdx, lastVisibleIdx, hasVisibleRow,
  dragId,
  onAdd, onMoveUp, onMoveDown, onClone, onRemove,
  onContainerChange, onContainerBlur,
  onRowDragStart, onRowDragOver, onRowDrop, onRowDragEnd,
}: {
  rows:              RowState[]
  name:              string
  formId:            string
  disabled:          boolean
  columns:           TableColumnShape[]
  addLabel:          string
  buttons:           RowButtonsMeta | undefined
  atMin:             boolean
  atMax:             boolean
  reorderable:       boolean
  cloneable:         boolean
  firstVisibleIdx:   number
  lastVisibleIdx:    number
  hasVisibleRow:     boolean
  dragId:            string | null
  onAdd:             () => void
  onMoveUp:          (id: string) => void
  onMoveDown:        (id: string) => void
  onClone:           (id: string) => void
  onRemove:          (id: string) => void
  onContainerChange: (e: React.ChangeEvent<HTMLDivElement>) => void
  onContainerBlur:   (e: React.FocusEvent<HTMLDivElement>) => void
  onRowDragStart:    (id: string) => (e: React.DragEvent<HTMLElement>) => void
  onRowDragOver:     (idx: number) => (e: React.DragEvent<HTMLElement>) => void
  onRowDrop:         (e: React.DragEvent<HTMLElement>) => void
  onRowDragEnd:      (e: React.DragEvent<HTMLElement>) => void
}): React.ReactElement {
  // The container div carries the change/blur delegates so live() events
  // bubble identically to the card path. `[&_label]:sr-only` hides the
  // FieldShell label across every cell (column header carries it).
  return (
    <div
      className="flex flex-col gap-3"
      onChange={onContainerChange}
      onBlur={onContainerBlur}
    >
      {!hasVisibleRow && (
        <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No items yet. Click {addLabel} to start.
        </div>
      )}

      {hasVisibleRow && (
        <div className="overflow-x-auto rounded-md border [&_label]:sr-only">
          <table className="w-full border-collapse text-sm">
            <colgroup>
              {columns.map((c, i) => (
                <col key={i} style={c.width ? { width: c.width } : undefined} />
              ))}
              <col />
            </colgroup>
            <thead className="bg-muted/40">
              <tr>
                {columns.map((c, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={`px-3 py-2 text-xs font-medium text-muted-foreground ${alignClass(c.alignment)}`}
                  >
                    {c.label}
                    {c.required && <span className="ml-0.5 text-destructive">*</span>}
                  </th>
                ))}
                <th scope="col" className="w-px" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <RepeaterTableRow
                  key={row.id}
                  row={row}
                  index={i}
                  name={name}
                  disabled={disabled}
                  columns={columns}
                  reorderable={reorderable}
                  cloneable={cloneable}
                  buttons={buttons}
                  isFirstVisible={i === firstVisibleIdx}
                  isLastVisible={i === lastVisibleIdx}
                  atMin={atMin}
                  atMax={atMax}
                  isDragging={dragId === row.id}
                  rowPath={`${name}.${i}`}
                  onMoveUp={() => onMoveUp(row.id)}
                  onMoveDown={() => onMoveDown(row.id)}
                  onClone={() => onClone(row.id)}
                  onRemove={() => onRemove(row.id)}
                  onDragStart={onRowDragStart(row.id)}
                  onDragOver={onRowDragOver(i)}
                  onDrop={onRowDrop}
                  onDragEnd={onRowDragEnd}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddRowButton
        label={addLabel}
        buttons={buttons}
        disabled={disabled || atMax}
        onClick={onAdd}
      />
    </div>
  )
}

function alignClass(a: 'left' | 'center' | 'right' | undefined): string {
  if (a === 'right')  return 'text-right'
  if (a === 'center') return 'text-center'
  return 'text-left'
}

function RepeaterTableRow({
  row, index, name, disabled, columns, reorderable, cloneable, buttons,
  isFirstVisible, isLastVisible, atMin, atMax, isDragging, rowPath,
  onMoveUp, onMoveDown, onClone, onRemove,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  row:             RowState
  index:           number
  name:            string
  disabled:        boolean
  columns:         TableColumnShape[]
  reorderable:     boolean
  cloneable:       boolean
  buttons:         RowButtonsMeta | undefined
  isFirstVisible:  boolean
  isLastVisible:   boolean
  atMin:           boolean
  atMax:           boolean
  isDragging:      boolean
  rowPath:         string
  onMoveUp:        () => void
  onMoveDown:      () => void
  onClone:         () => void
  onRemove:        () => void
  onDragStart:     (e: React.DragEvent<HTMLElement>) => void
  onDragOver:      (e: React.DragEvent<HTMLElement>) => void
  onDrop:          (e: React.DragEvent<HTMLElement>) => void
  onDragEnd:       (e: React.DragEvent<HTMLElement>) => void
}): React.ReactElement {
  const prefix     = `${name}.${index}`
  const namespaced = useMemo(
    () => row.children.map(c => prefixFieldNames(c, prefix)),
    [row.children, prefix],
  )

  if (row.hidden) {
    // Render the hidden envelope as a single full-span cell so column
    // count stays valid; `display:none` ensures the row is invisible but
    // still in the form's submit. Using `<tr style="display:none">`
    // would warn under React strict-mode in Firefox; the wrapping cell
    // keeps the markup HTML-valid.
    return (
      <tr style={{ display: 'none' }} data-pilotiq-repeater-row="hidden">
        <td colSpan={columns.length + 1}>
          <input type="hidden" name={`${prefix}.__id`} value={row.id} readOnly />
          <SchemaRenderer elements={namespaced} />
        </td>
      </tr>
    )
  }

  // Pair each column header (in order) with the corresponding inner
  // field meta. Extra fields beyond the column count fall through the
  // last cell as stacked items — a misconfiguration but better than
  // dropping them silently.
  const fieldsPerCell: ElementMeta[][] = columns.map((_c, i) =>
    i === columns.length - 1 ? namespaced.slice(i) : namespaced.slice(i, i + 1),
  )

  const dragProps = reorderable && !disabled
    ? {
        draggable: true as const,
        onDragStart,
        onDragOver,
        onDrop,
        onDragEnd,
      }
    : {}

  return (
    <tr
      className={`border-t align-top ${isDragging ? 'opacity-50' : ''}`}
      data-pilotiq-repeater-row=""
      {...dragProps}
    >
      <input type="hidden" name={`${prefix}.__id`} value={row.id} readOnly />
      {columns.map((c, i) => (
        <td key={i} className={`px-3 py-2 ${alignClass(c.alignment)}`}>
          <SchemaRenderer elements={fieldsPerCell[i] ?? []} />
        </td>
      ))}
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          {reorderable && (
            <>
              <ReorderGrip disabled={disabled} buttons={buttons} />
              <RowChromeIconButton
                defaults={DEFAULT_MOVE_UP}
                override={buttons?.moveUp}
                disabled={disabled || isFirstVisible}
                onClick={onMoveUp}
              />
              <RowChromeIconButton
                defaults={DEFAULT_MOVE_DOWN}
                override={buttons?.moveDown}
                disabled={disabled || isLastVisible}
                onClick={onMoveDown}
              />
            </>
          )}
          {row.extraActions && row.extraActions.length > 0 && (
            <ExtraActionStrip
              actions={row.extraActions}
              rowPath={rowPath}
              disabled={disabled}
            />
          )}
          {cloneable && (
            <RowChromeIconButton
              defaults={DEFAULT_CLONE}
              override={buttons?.clone}
              disabled={disabled || atMax}
              onClick={onClone}
            />
          )}
          <RowChromeIconButton
            defaults={DEFAULT_DELETE}
            override={buttons?.delete}
            disabled={disabled || atMin}
            onClick={onRemove}
          />
        </div>
      </td>
    </tr>
  )
}

interface RepeaterMetaShape {
  rows?:             Array<{ id: string; children: ElementMeta[]; itemLabel?: string; hidden?: boolean; extraActions?: ElementMeta[] }>
  template?:         ElementMeta[]
  columns?:          number
  minItems?:         number
  maxItems?:         number
  defaultItems?:     number
  reorderable?:      boolean
  collapsible?:      boolean
  defaultCollapsed?: boolean
  accordion?:        boolean
  cloneable?:        boolean
  addActionLabel?:   string
  simple?:           boolean
  grid?:             number
  table?:            { columns: TableColumnShape[] }
  buttons?:          RowButtonsMeta
}

interface TableColumnShape {
  label:      string
  alignment?: 'left' | 'center' | 'right'
  width?:     string
  required?:  boolean
}

/**
 * Recursively prefix every Field meta's `name` with a row-scoped path.
 * Inner Repeaters get their own per-row prefixing so nested Repeater
 * row inputs land at `items.0.modifiers.1.name`.
 */
function prefixFieldNames(el: ElementMeta, prefix: string): ElementMeta {
  if (el.type === 'field' && typeof el['name'] === 'string') {
    const innerName = el['name']
    const newName   = `${prefix}.${innerName}`
    if (el['fieldType'] === 'repeater') {
      const m = el as ElementMeta & RepeaterMetaShape
      const rows = m.rows ?? []
      const tpl  = m.template ?? []
      return {
        ...el,
        name:     newName,
        rows:     rows.map(r => ({
          ...r,
          children: r.children.map(c => prefixFieldNames(c, `${newName}.${rows.indexOf(r)}`)),
        })),
        template: tpl.map(c => prefixFieldNames(c, `${newName}.0`)),
      }
    }
    return { ...el, name: newName }
  }
  if (Array.isArray(el.children)) {
    return {
      ...el,
      children: (el.children as ElementMeta[]).map(c => prefixFieldNames(c, prefix)),
    }
  }
  return el
}

let _rowSeqFallback = 0
function generateRowId(): string {
  type CryptoLike = { randomUUID?: () => string }
  const c = (globalThis as { crypto?: CryptoLike }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `row-${Date.now()}-${++_rowSeqFallback}`
}

function collapsedStorageKey(formId: string, name: string, rowId: string): string {
  return `pilotiq.repeater.${formId}.${name}.${rowId}`
}

function initSeedCollapsed(
  rows:         RowState[],
  formId:       string,
  name:         string,
  defaultValue: boolean,
  collapsible:  boolean,
): Record<string, boolean> {
  if (!collapsible) return {}
  const out: Record<string, boolean> = {}
  for (const row of rows) {
    out[row.id] = readCollapsedFromStorage(formId, name, row.id, defaultValue)
  }
  return out
}

function readCollapsedFromStorage(
  formId:       string,
  name:         string,
  rowId:        string,
  defaultValue: boolean,
): boolean {
  if (typeof window === 'undefined') return defaultValue
  try {
    const raw = window.localStorage.getItem(collapsedStorageKey(formId, name, rowId))
    if (raw === null) return defaultValue
    return raw === 'true'
  } catch { return defaultValue }
}

function writeCollapsedToStorage(
  formId: string,
  name:   string,
  rowId:  string,
  value:  boolean,
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(collapsedStorageKey(formId, name, rowId), String(value))
  } catch { /* quota exceeded — fall back to in-memory only */ }
}

function deleteCollapsedFromStorage(formId: string, name: string, rowId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(collapsedStorageKey(formId, name, rowId))
  } catch { /* ignore */ }
}

function accordionStorageKey(formId: string, name: string): string {
  return `pilotiq.repeater.${formId}.${name}.accordion`
}

/**
 * Read the persisted accordion-open row id. Returns `undefined` when no
 * value is stored (so the caller can fall back to the default-open
 * heuristic). Returns `''` when the user explicitly closed every row —
 * the caller maps that to `null` openId.
 */
function readAccordionFromStorage(formId: string, name: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(accordionStorageKey(formId, name))
    return raw === null ? undefined : raw
  } catch { return undefined }
}

function writeAccordionToStorage(formId: string, name: string, openId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(accordionStorageKey(formId, name), openId ?? '')
  } catch { /* quota exceeded — fall back to in-memory only */ }
}

