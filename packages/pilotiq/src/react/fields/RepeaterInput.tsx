import React, { useContext, useMemo, useState } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import type { ElementMeta } from '../../schema/Element.js'
import { Button } from '../ui/button.js'
import { SchemaRenderer } from '../SchemaRenderer.js'
import { FormIdContext } from '../FormStateContext.js'

interface RowState {
  id:        string
  children:  ElementMeta[]
  itemLabel?: string
}

/**
 * Repeater renderer (Plan #14 v1).
 *
 * Rows are managed as local React state with stable `id` keys so
 * uncontrolled inner inputs preserve their typed values across
 * add/remove/reorder operations. Each row's resolved children meta is
 * deep-cloned with a row-scoped prefix on every Field's `name` so
 * submitted form bodies are flat-keyed (`items.0.product`, etc.) — the
 * server's `coerceFormValues` re-groups them into an array.
 *
 * Reorder is keyboard-friendly via Up/Down buttons (no drag-and-drop in
 * v1). Collapsed state persists per-row to `localStorage` under
 * `pilotiq.repeater.<formId>.<fieldName>.<rowId>` when collapsible.
 *
 * Inner-field reactivity: this component does NOT integrate with
 * `FormStateProvider` for nested-path live updates; that surgery lands
 * in v1.1. Repeaters with `live()` inner fields render today but the
 * `live` trigger doesn't roundtrip.
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
      const target = idx + dir
      if (target < 0 || target >= prev.length) return prev
      const next = prev.slice()
      const tmp = next[idx]!
      next[idx] = next[target]!
      next[target] = tmp
      return next
    })
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
        <RepeaterRow
          key={row.id}
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
          onMoveUp={() => moveRow(row.id, -1)}
          onMoveDown={() => moveRow(row.id, 1)}
          onClone={() => cloneRow(row.id)}
          onRemove={() => removeRow(row.id)}
          onToggleCollapse={() => toggleCollapsed(row.id)}
        />
      ))}

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
  onMoveUp, onMoveDown, onClone, onRemove, onToggleCollapse,
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
  onMoveUp:          () => void
  onMoveDown:        () => void
  onClone:           () => void
  onRemove:          () => void
  onToggleCollapse:  () => void
}): React.ReactElement {
  const prefix     = `${name}.${index}`
  const namespaced = useMemo(
    () => row.children.map(c => prefixFieldNames(c, prefix)),
    [row.children, prefix],
  )
  const headerLabel = row.itemLabel ?? `Item ${index + 1}`

  return (
    <div className="rounded-md border bg-card" data-pilotiq-repeater-row="">
      <div className="flex items-center gap-2 border-b px-3 py-2">
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
