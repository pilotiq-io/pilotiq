import React, { useMemo, useState } from 'react'
import { Trash2Icon, PlusIcon, ArrowUpIcon, ArrowDownIcon } from 'lucide-react'
import { useFieldState } from '../FormStateContext.js'
import { Input } from '../ui/input.js'
import { Button } from '../ui/button.js'

type Row = { id: number; key: string; value: string }

let _rowSeq = 0
const newId = (): number => ++_rowSeq

/**
 * Edit a flat key-value map. Internally tracks an array of rows so the
 * user can re-arrange / blank out keys without losing the in-progress
 * row. On every change, serializes the rows to a JSON string in the
 * hidden input — the server's `coerceFormValues` keyValue branch parses
 * it back into a `Record<string, string>` and drops empty placeholders.
 */
export function KeyValueInput({
  name, defaultValue, disabled, keyLabel, valueLabel, addLabel, reorderable,
}: {
  name:        string
  defaultValue: unknown
  disabled:    boolean
  keyLabel:    string
  valueLabel:  string
  addLabel:    string
  reorderable: boolean
}): React.ReactElement {
  const fs = useFieldState(name)

  const initialRows = useMemo<Row[]>(() => {
    const obj = parseToObject(defaultValue)
    const entries = Object.entries(obj)
    return entries.length > 0
      ? entries.map(([k, v]) => ({ id: newId(), key: k, value: v }))
      : [{ id: newId(), key: '', value: '' }]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [localRows, setLocalRows] = useState<Row[]>(initialRows)
  const rows = fs.controlled
    ? deriveRowsFromContext(fs.value, localRows)
    : localRows

  const setRows = (next: Row[]): void => {
    const obj: Record<string, string> = {}
    for (const r of next) {
      if (r.key === '' && r.value === '') continue
      obj[r.key] = r.value
    }
    if (fs.controlled) {
      fs.setValue(obj)
      // Mirror locally so the row identity survives a re-resolve that
      // doesn't ship row IDs.
      setLocalRows(next)
    } else {
      setLocalRows(next)
    }
    fs.triggerLive(obj)
  }

  const updateRow = (id: number, patch: Partial<Row>): void => {
    setRows(rows.map(r => r.id === id ? { ...r, ...patch } : r))
  }
  const removeRow = (id: number): void => {
    const next = rows.filter(r => r.id !== id)
    setRows(next.length > 0 ? next : [{ id: newId(), key: '', value: '' }])
  }
  const addRow = (): void => {
    setRows([...rows, { id: newId(), key: '', value: '' }])
  }
  const moveRow = (id: number, dir: -1 | 1): void => {
    const idx = rows.findIndex(r => r.id === id)
    if (idx < 0) return
    const target = idx + dir
    if (target < 0 || target >= rows.length) return
    const next = rows.slice()
    const tmp = next[idx]!
    next[idx] = next[target]!
    next[target] = tmp
    setRows(next)
  }

  // Serialize for native form submit (only used outside controlled mode).
  const hiddenValue = useMemo(() => {
    const obj: Record<string, string> = {}
    for (const r of rows) {
      if (r.key === '' && r.value === '') continue
      obj[r.key] = r.value
    }
    return JSON.stringify(obj)
  }, [rows])

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={hiddenValue} readOnly />
      <div className="grid gap-2" style={{ gridTemplateColumns: reorderable ? 'auto 1fr 1fr auto' : '1fr 1fr auto' }}>
        <div className="text-xs text-muted-foreground" style={{ gridColumn: reorderable ? '2' : '1' }}>{keyLabel}</div>
        <div className="text-xs text-muted-foreground">{valueLabel}</div>
        <div />
        {rows.map((row, idx) => (
          <React.Fragment key={row.id}>
            {reorderable && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  onClick={() => moveRow(row.id, -1)}
                  disabled={disabled || idx === 0}
                  aria-label="Move up"
                >
                  <ArrowUpIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  onClick={() => moveRow(row.id, 1)}
                  disabled={disabled || idx === rows.length - 1}
                  aria-label="Move down"
                >
                  <ArrowDownIcon className="size-3.5" />
                </button>
              </div>
            )}
            <Input
              value={row.key}
              onChange={(e) => updateRow(row.id, { key: e.target.value })}
              disabled={disabled}
              placeholder={keyLabel}
            />
            <Input
              value={row.value}
              onChange={(e) => updateRow(row.id, { value: e.target.value })}
              disabled={disabled}
              placeholder={valueLabel}
            />
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => removeRow(row.id)}
              disabled={disabled}
              aria-label="Remove row"
            >
              <Trash2Icon className="size-4" />
            </button>
          </React.Fragment>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled}
        className="self-start"
      >
        <PlusIcon className="size-4" />
        {addLabel}
      </Button>
    </div>
  )
}

function parseToObject(v: unknown): Record<string, string> {
  if (v === undefined || v === null || v === '') return {}
  if (typeof v === 'string') {
    try {
      const o = JSON.parse(v)
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        const out: Record<string, string> = {}
        for (const [k, val] of Object.entries(o)) out[String(k)] = val == null ? '' : String(val)
        return out
      }
    } catch { /* fall through */ }
    return {}
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    const out: Record<string, string> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[String(k)] = val == null ? '' : String(val)
    }
    return out
  }
  return {}
}

function deriveRowsFromContext(ctxValue: unknown, fallback: Row[]): Row[] {
  // Convert the live-form-state object back into our row array. Rows from
  // `fallback` are the source of truth for IDs (so React can preserve
  // input focus); we rebuild the kv pairs from the context value but
  // re-key by index.
  const obj = parseToObject(ctxValue)
  const keys = Object.keys(obj)
  if (keys.length === 0) return fallback
  return keys.map((k, i) => {
    const fb = fallback[i]
    return { id: fb ? fb.id : newId(), key: k, value: obj[k]! }
  })
}
