import React, { useContext, useMemo, useState } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import type { ElementMeta } from '../../schema/Element.js'
import { Button } from '../ui/button.js'
import { SchemaRenderer } from '../SchemaRenderer.js'
import { FormIdContext } from '../FormStateContext.js'

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

interface RowState {
  id:        string
  children:  ElementMeta[]
  itemLabel?: string
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
  const reorderable      = Boolean(meta.reorderable)
  const cloneable        = Boolean(meta.cloneable)
  const addLabel         = typeof meta.addActionLabel === 'string' ? meta.addActionLabel : 'Add'
  const columns          = typeof meta.columns === 'number' && meta.columns > 1 ? meta.columns : 1

  const initialRows: RowState[] = useMemo(
    () => (meta.rows ?? []).map(r => ({
      id:        r.id,
      children:  r.children,
      ...(r.itemLabel !== undefined ? { itemLabel: r.itemLabel } : {}),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [rows, setRows] = useState<RowState[]>(initialRows)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    initSeedCollapsed(initialRows, formId, name, defaultCollapsed, collapsible),
  )

  const atMin = minItems !== undefined && rows.length <= minItems
  const atMax = maxItems !== undefined && rows.length >= maxItems

  const addRow = (): void => {
    if (atMax) return
    const newRow: RowState = {
      id:       generateRowId(),
      children: meta.template ?? [],
    }
    setRows(prev => [...prev, newRow])
    if (collapsible && defaultCollapsed) {
      setCollapsed(prev => ({ ...prev, [newRow.id]: true }))
      writeCollapsedToStorage(formId, name, newRow.id, true)
    }
  }

  const removeRow = (id: string): void => {
    if (atMin) return
    setRows(prev => prev.filter(r => r.id !== id))
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
      // dir = -1 → land before the row above (insertBeforeIdx = idx - 1)
      // dir =  1 → land after the row below (insertBeforeIdx = idx + 2)
      const insertBefore = dir === -1 ? idx - 1 : idx + 2
      return reorderRows(prev, idx, insertBefore)
    })
  }

  // ── DnD state ───────────────────────────────────────────
  // dragId  — the row being dragged, or null when no drag is active.
  // dropAt  — the boundary slot the cursor is currently over
  //           (range 0..rows.length); null when not over a valid drop target.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  const onRowDragStart = (id: string) => (e: React.DragEvent<HTMLDivElement>): void => {
    if (!reorderable || disabled) return
    setDragId(id)
    // dataTransfer needs *something* to register the drag in Firefox.
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', id) } catch { /* IE quirk; ignore */ }
  }

  const onRowDragOver = (idx: number) => (e: React.DragEvent<HTMLDivElement>): void => {
    if (!reorderable || disabled || dragId === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    // Drop above this row when cursor is in its top half, below when in its bottom half.
    const rect      = e.currentTarget.getBoundingClientRect()
    const aboveHalf = e.clientY < rect.top + rect.height / 2
    setDropAt(aboveHalf ? idx : idx + 1)
  }

  const onRowDrop = (e: React.DragEvent<HTMLDivElement>): void => {
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

  const toggleCollapsed = (id: string): void => {
    setCollapsed(prev => {
      const nextValue = !prev[id]
      writeCollapsedToStorage(formId, name, id, nextValue)
      return { ...prev, [id]: nextValue }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && (
        <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No items yet. Click {addLabel} to start.
        </div>
      )}

      {rows.map((row, i) => (
        <React.Fragment key={row.id}>
          {dropAt === i && <DropIndicator />}
          <RepeaterRow
            row={row}
            index={i}
            totalRows={rows.length}
            name={name}
            disabled={disabled}
            collapsible={collapsible}
            isCollapsed={collapsible && (collapsed[row.id] ?? false)}
            reorderable={reorderable}
            cloneable={cloneable}
            atMin={atMin}
            atMax={atMax}
            columns={columns}
            isDragging={dragId === row.id}
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
      {dropAt === rows.length && <DropIndicator />}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled || atMax}
        className="self-start"
      >
        <PlusIcon className="size-4" />
        {addLabel}
      </Button>
    </div>
  )
}

function RepeaterRow({
  row, index, totalRows, name, disabled,
  collapsible, isCollapsed, reorderable, cloneable, atMin, atMax, columns,
  isDragging,
  onMoveUp, onMoveDown, onClone, onRemove, onToggleCollapse,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  row:               RowState
  index:             number
  totalRows:         number
  name:              string
  disabled:          boolean
  collapsible:       boolean
  isCollapsed:       boolean
  reorderable:       boolean
  cloneable:         boolean
  atMin:             boolean
  atMax:             boolean
  columns:           number
  isDragging:        boolean
  onMoveUp:          () => void
  onMoveDown:        () => void
  onClone:           () => void
  onRemove:          () => void
  onToggleCollapse:  () => void
  onDragStart:       (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver:        (e: React.DragEvent<HTMLDivElement>) => void
  onDrop:            (e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd:         (e: React.DragEvent<HTMLDivElement>) => void
}): React.ReactElement {
  const prefix     = `${name}.${index}`
  const namespaced = useMemo(
    () => row.children.map(c => prefixFieldNames(c, prefix)),
    [row.children, prefix],
  )
  const headerLabel = row.itemLabel ?? `Item ${index + 1}`

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

  return (
    <div
      className={`rounded-md border bg-card transition-opacity ${isDragging ? 'opacity-50' : ''}`}
      data-pilotiq-repeater-row=""
      {...dragProps}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {reorderable && (
          <span
            aria-hidden="true"
            className={`text-muted-foreground ${disabled ? 'opacity-30' : 'cursor-grab active:cursor-grabbing'}`}
            title="Drag to reorder"
          >
            <GripVerticalIcon className="size-4" />
          </span>
        )}
        {collapsible && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!isCollapsed}
            disabled={disabled}
          >
            {isCollapsed
              ? <ChevronRightIcon className="size-4" />
              : <ChevronDownIcon  className="size-4" />}
          </button>
        )}
        <span className="flex-1 truncate text-sm font-medium">{headerLabel}</span>
        <input type="hidden" name={`${prefix}.__id`} value={row.id} readOnly />
        {reorderable && (
          <>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={disabled || index === 0}
              aria-label="Move up"
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ArrowUpIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={disabled || index === totalRows - 1}
              aria-label="Move down"
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ArrowDownIcon className="size-4" />
            </button>
          </>
        )}
        {cloneable && (
          <button
            type="button"
            onClick={onClone}
            disabled={disabled || atMax}
            aria-label="Duplicate row"
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <CopyIcon className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled || atMin}
          aria-label="Remove row"
          className="text-muted-foreground hover:text-destructive disabled:opacity-30"
        >
          <Trash2Icon className="size-4" />
        </button>
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

interface RepeaterMetaShape {
  rows?:             Array<{ id: string; children: ElementMeta[]; itemLabel?: string }>
  template?:         ElementMeta[]
  columns?:          number
  minItems?:         number
  maxItems?:         number
  defaultItems?:     number
  reorderable?:      boolean
  collapsible?:      boolean
  defaultCollapsed?: boolean
  cloneable?:        boolean
  addActionLabel?:   string
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
