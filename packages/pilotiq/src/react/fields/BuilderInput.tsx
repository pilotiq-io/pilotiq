import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
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
import { FormIdContext, useFormState } from '../FormStateContext.js'
import { findFieldMeta } from '../formStateHelpers.js'
import { useIconFor } from '../icon-context.js'
import { reorderRows, ExtraActionStrip } from './RepeaterInput.js'

interface BlockShape {
  name:      string
  label:     string
  icon?:     string
  columns?:  number
  maxItems?: number
  template:  ElementMeta[]
}

interface BuilderRowShape {
  id:            string
  type:          string
  children:      ElementMeta[]
  itemLabel?:    string
  hidden?:       boolean
  unknownType?:  boolean
  extraActions?: ElementMeta[]
}

interface BuilderMetaShape {
  rows?:                   BuilderRowShape[]
  blocks?:                 BlockShape[]
  minItems?:               number
  maxItems?:               number
  reorderable?:            boolean
  reorderableWithButtons?: boolean
  collapsible?:            boolean
  defaultCollapsed?:       boolean
  cloneable?:              boolean
  addable?:                boolean
  deletable?:              boolean
  blockNumbers?:           boolean
  itemNumbers?:            boolean
  blockIcons?:             boolean
  blockPickerColumns?:     number
  addActionLabel?:         string
  addActionAlignment?:     'start' | 'center' | 'end'
  defaultBlock?:           string
}

interface RowState {
  id:            string
  type:          string
  children:      ElementMeta[]
  itemLabel?:    string
  hidden?:       boolean
  unknownType?:  boolean
  extraActions?: ElementMeta[]
}

/**
 * Builder renderer (Plan #14 follow-up).
 *
 * Heterogeneous rows: each row's children come from one of the
 * registered blocks (picked at add-time). Per-row name prefixing emits
 * `{name}.{i}.data.{innerField}` for inner inputs, plus
 * `{name}.{i}.__id` and `{name}.{i}.type` hidden inputs so the row's
 * envelope round-trips through FormData.
 *
 * Mirrors `RepeaterInput`'s reorder / collapse / clone / inner-field
 * live-resolve plumbing — the array-row primitives (`reorderRows`)
 * are imported directly to keep the two fields' behavior aligned.
 */
export function BuilderInput({
  el,
  name,
  disabled,
}: {
  el:       ElementMeta
  name:     string
  disabled: boolean
}): React.ReactElement {
  const formIdFromCtx = useContext(FormIdContext)
  const formId        = formIdFromCtx || `builder-${name}`
  const meta             = el as BuilderMetaShape
  const blocks           = meta.blocks ?? []
  const blocksByName     = useMemo(
    () => new Map(blocks.map(b => [b.name, b])),
    [blocks],
  )
  const minItems         = typeof meta.minItems === 'number' ? meta.minItems : undefined
  const maxItems         = typeof meta.maxItems === 'number' ? meta.maxItems : undefined
  const collapsible      = Boolean(meta.collapsible)
  const defaultCollapsed = Boolean(meta.defaultCollapsed)
  const reorderable      = Boolean(meta.reorderable)
  const cloneable        = Boolean(meta.cloneable)
  const addable          = meta.addable !== false
  const deletable        = meta.deletable !== false
  const buttonsOnly      = Boolean(meta.reorderableWithButtons)
  const showNumbers      = Boolean(meta.blockNumbers || meta.itemNumbers)
  const showIcons        = meta.blockIcons !== false
  const pickerColumns    = typeof meta.blockPickerColumns === 'number' && meta.blockPickerColumns > 1
    ? meta.blockPickerColumns
    : 1
  const addLabel         = typeof meta.addActionLabel === 'string' ? meta.addActionLabel : 'Add block'
  const addAlignment     = meta.addActionAlignment ?? 'start'

  const initialRows: RowState[] = useMemo(
    () => (meta.rows ?? []).map(r => ({
      id:        r.id,
      type:      r.type,
      children:  r.children,
      ...(r.itemLabel    !== undefined ? { itemLabel: r.itemLabel } : {}),
      ...(r.hidden                     ? { hidden: true }            : {}),
      ...(r.unknownType                ? { unknownType: true }       : {}),
      ...(r.extraActions && r.extraActions.length > 0 ? { extraActions: r.extraActions } : {}),
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

  // Per-block-type cap: greys out the picker option once the cap is
  // hit. Counted across ALL rows (including hidden ones — `itemHidden`
  // is purely UX, not a data filter).
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.type, (m.get(r.type) ?? 0) + 1)
    return m
  }, [rows])

  const addRowOfType = (blockName: string): void => {
    if (atMax) return
    const block = blocksByName.get(blockName)
    if (!block) return
    const cap = block.maxItems
    if (cap !== undefined && (typeCounts.get(blockName) ?? 0) >= cap) return
    const newRow: RowState = {
      id:       generateRowId(),
      type:     block.name,
      children: block.template,
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
      // Block.maxItems applies to clones too.
      const block = blocksByName.get(source.type)
      const cap   = block?.maxItems
      if (cap !== undefined && (typeCounts.get(source.type) ?? 0) >= cap) return prev
      const clone: RowState = {
        id:       generateRowId(),
        type:     source.type,
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

  // ── DnD state (skipped when buttonsOnly) ────────────────
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const dndEnabled = reorderable && !buttonsOnly

  const onRowDragStart = (id: string) => (e: React.DragEvent<HTMLDivElement>): void => {
    if (!dndEnabled || disabled) return
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', id) } catch { /* IE quirk */ }
  }

  const onRowDragOver = (idx: number) => (e: React.DragEvent<HTMLDivElement>): void => {
    if (!dndEnabled || disabled || dragId === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect      = e.currentTarget.getBoundingClientRect()
    const aboveHalf = e.clientY < rect.top + rect.height / 2
    setDropAt(aboveHalf ? idx : idx + 1)
  }

  const onRowDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!dndEnabled || disabled || dragId === null || dropAt === null) {
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

  // ── Inner-field live re-resolve (mirrors RepeaterInput) ─
  const formState = useFormState()
  const fireLive = (n: string, value: string, eventKind: 'change' | 'blur'): void => {
    if (!formState) return
    if (!n.includes('.')) return
    const fieldMeta = findFieldMeta(formState.formMeta, n)
    const liveCfg   = fieldMeta?.['live']
    if (!liveCfg) return
    const onBlurMode = typeof liveCfg === 'object' && liveCfg !== null
      && (liveCfg as { onBlur?: boolean }).onBlur === true
    if (eventKind === 'change' && onBlurMode) return
    if (eventKind === 'blur'   && !onBlurMode) return
    formState.triggerLive(n, value)
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
    setCollapsed(prev => {
      const nextValue = !prev[id]
      writeCollapsedToStorage(formId, name, id, nextValue)
      return { ...prev, [id]: nextValue }
    })
  }

  const hasVisibleRow    = rows.some(r => !r.hidden)
  const firstVisibleIdx  = rows.findIndex(r => !r.hidden)
  const lastVisibleIdx   = (() => {
    for (let i = rows.length - 1; i >= 0; i--) if (!rows[i]?.hidden) return i
    return -1
  })()

  const addAlignClass = addAlignment === 'center'
    ? 'self-center'
    : addAlignment === 'end'
      ? 'self-end'
      : 'self-start'

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

      {rows.map((row, i) => (
        <React.Fragment key={row.id}>
          {!row.hidden && dropAt === i && <DropIndicator />}
          <BuilderRow
            row={row}
            block={blocksByName.get(row.type)}
            index={i}
            isFirstVisible={i === firstVisibleIdx}
            isLastVisible={i === lastVisibleIdx}
            name={name}
            disabled={disabled}
            collapsible={collapsible}
            isCollapsed={collapsible && (collapsed[row.id] ?? false)}
            reorderable={reorderable}
            buttonsOnly={buttonsOnly}
            cloneable={cloneable}
            deletable={deletable}
            atMin={atMin}
            atMax={atMax}
            showNumbers={showNumbers}
            showIcons={showIcons}
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
      {dropAt === rows.length && <DropIndicator />}

      {addable && blocks.length > 0 && (
        <BlockPicker
          blocks={blocks}
          typeCounts={typeCounts}
          atMax={atMax}
          disabled={disabled}
          label={addLabel}
          alignClass={addAlignClass}
          columns={pickerColumns}
          onPick={addRowOfType}
        />
      )}
    </div>
  )
}

// ─── Block picker dropdown ──────────────────────────────────

function BlockPicker({
  blocks, typeCounts, atMax, disabled, label, alignClass, columns, onPick,
}: {
  blocks:     BlockShape[]
  typeCounts: Map<string, number>
  atMax:      boolean
  disabled:   boolean
  label:      string
  alignClass: string
  columns:    number
  onPick:     (blockName: string) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const containerRef    = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape — keeps the picker UX out of the
  // way without pulling in a Popover dependency.
  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: PointerEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onDocKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown',     onDocKey)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown',     onDocKey)
    }
  }, [open])

  // Single-block shortcut — skip the dropdown entirely.
  if (blocks.length === 1) {
    const only = blocks[0]!
    const onlyAtCap = only.maxItems !== undefined && (typeCounts.get(only.name) ?? 0) >= only.maxItems
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPick(only.name)}
        disabled={disabled || atMax || onlyAtCap}
        className={alignClass}
      >
        <PlusIcon className="size-4" />
        {label}
      </Button>
    )
  }

  return (
    <div ref={containerRef} className={`relative ${alignClass}`}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(o => !o)}
        disabled={disabled || atMax}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <PlusIcon className="size-4" />
        {label}
        <ChevronDownIcon className="size-3 opacity-50" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute z-20 mt-2 min-w-[12rem] rounded-md border bg-popover p-1 shadow-md"
        >
          <div
            className={columns > 1 ? 'grid gap-1' : 'flex flex-col gap-0.5'}
            style={columns > 1 ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
          >
            {blocks.map(b => {
              const atTypeCap = b.maxItems !== undefined && (typeCounts.get(b.name) ?? 0) >= b.maxItems
              return (
                <BlockPickerItem
                  key={b.name}
                  block={b}
                  disabled={atTypeCap}
                  onPick={() => { onPick(b.name); setOpen(false) }}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function BlockPickerItem({
  block, disabled, onPick,
}: {
  block:    BlockShape
  disabled: boolean
  onPick:   () => void
}): React.ReactElement {
  const Icon = useIconFor(block.icon)
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onPick}
      disabled={disabled}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
    >
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
      <span className="truncate">{block.label}</span>
    </button>
  )
}

// ─── Row ────────────────────────────────────────────────────

function BuilderRow({
  row, block, index, isFirstVisible, isLastVisible, name, disabled,
  collapsible, isCollapsed, reorderable, buttonsOnly, cloneable, deletable,
  atMin, atMax, showNumbers, showIcons, isDragging,
  rowPath,
  onMoveUp, onMoveDown, onClone, onRemove, onToggleCollapse,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  row:               RowState
  block:             BlockShape | undefined
  index:             number
  isFirstVisible:    boolean
  isLastVisible:     boolean
  name:              string
  disabled:          boolean
  collapsible:       boolean
  isCollapsed:       boolean
  reorderable:       boolean
  buttonsOnly:       boolean
  cloneable:         boolean
  deletable:         boolean
  atMin:             boolean
  atMax:             boolean
  showNumbers:       boolean
  showIcons:         boolean
  isDragging:        boolean
  rowPath:           string
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
  // Inner inputs sit under `name.<i>.data.*` so the {type, data}
  // envelope round-trips through FormData. Hidden envelope inputs
  // (`__id` and `type`) get their own siblings at `name.<i>.__id` and
  // `name.<i>.type`.
  const dataPrefix = `${name}.${index}.data`
  const namespaced = useMemo(
    () => row.children.map(c => prefixFieldNames(c, dataPrefix)),
    [row.children, dataPrefix],
  )

  const RowIcon = useIconFor(showIcons ? block?.icon : undefined)
  const blockLabel = block?.label ?? row.type ?? 'Block'
  const numberPrefix = showNumbers ? `${index + 1}. ` : ''
  const headerLabel = row.itemLabel ?? `${numberPrefix}${blockLabel}`

  if (row.hidden) {
    return (
      <div style={{ display: 'none' }} data-pilotiq-builder-row="hidden">
        <input type="hidden" name={`${name}.${index}.__id`} value={row.id} readOnly />
        <input type="hidden" name={`${name}.${index}.type`} value={row.type} readOnly />
        <SchemaRenderer elements={namespaced} />
      </div>
    )
  }

  if (row.unknownType || !block) {
    // Stale block type — keep envelope round-tripping but show a clear
    // placeholder. Values inside `data` aren't editable here (the
    // schema is gone), but they survive submit because the server
    // passes them through verbatim.
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        <input type="hidden" name={`${name}.${index}.__id`} value={row.id} readOnly />
        <input type="hidden" name={`${name}.${index}.type`} value={row.type} readOnly />
        Unknown block type "{row.type}". Block was removed from the schema —
        save will preserve the row's data unchanged.
      </div>
    )
  }

  const dragProps = reorderable && !buttonsOnly && !disabled
    ? {
        draggable:     true as const,
        onDragStart,
        onDragOver,
        onDrop,
        onDragEnd,
      }
    : {}

  const innerColumns = block.columns && block.columns > 1 ? block.columns : 1

  return (
    <div
      className={`rounded-md border bg-card transition-opacity ${isDragging ? 'opacity-50' : ''}`}
      data-pilotiq-builder-row=""
      {...dragProps}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {reorderable && !buttonsOnly && (
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
        {RowIcon && <RowIcon className="size-4 shrink-0 text-muted-foreground" />}
        <span className="flex-1 truncate text-sm font-medium">{headerLabel}</span>
        <input type="hidden" name={`${name}.${index}.__id`} value={row.id} readOnly />
        <input type="hidden" name={`${name}.${index}.type`} value={row.type} readOnly />
        {reorderable && (
          <>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={disabled || isFirstVisible}
              aria-label="Move up"
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ArrowUpIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={disabled || isLastVisible}
              aria-label="Move down"
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ArrowDownIcon className="size-4" />
            </button>
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
        {deletable && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled || atMin}
            aria-label="Remove row"
            className="text-muted-foreground hover:text-destructive disabled:opacity-30"
          >
            <Trash2Icon className="size-4" />
          </button>
        )}
      </div>

      <div
        className="p-3"
        style={isCollapsed ? { display: 'none' } : undefined}
      >
        {innerColumns > 1
          ? (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${innerColumns}, minmax(0, 1fr))` }}
            >
              <SchemaRenderer elements={namespaced} />
            </div>
          )
          : <SchemaRenderer elements={namespaced} />}
      </div>
    </div>
  )
}

function DropIndicator(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none h-0.5 rounded-full bg-primary"
    />
  )
}

/**
 * Recursively prefix every Field meta's `name` with a row-scoped path.
 * Mirrors `RepeaterInput.prefixFieldNames` but doesn't recurse into
 * inner Repeater/Builder rows (nested array-row inside a Block isn't
 * reactive in v1 — see plan).
 */
function prefixFieldNames(el: ElementMeta, prefix: string): ElementMeta {
  if (el.type === 'field' && typeof el['name'] === 'string') {
    const innerName = el['name']
    return { ...el, name: `${prefix}.${innerName}` }
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
  return `pilotiq.builder.${formId}.${name}.${rowId}`
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
  } catch { /* quota exceeded; silent */ }
}

function deleteCollapsedFromStorage(formId: string, name: string, rowId: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(collapsedStorageKey(formId, name, rowId)) } catch { /* */ }
}
