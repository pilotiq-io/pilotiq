import React, { useEffect, useRef, useState } from 'react'

import { Input } from '../ui/input.js'
import { Switch } from '../ui/switch.js'
import { Checkbox } from '../ui/checkbox.js'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select.js'
import { useToast } from '../Toaster.js'
import type { NotificationMeta } from '../../notifications/Notification.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.js'
import { Button } from '../ui/button.js'

const DEFAULT_DEBOUNCE_MS = 500

/** Shared shape consumed by all three editable-cell renderers. */
export interface EditableCellProps {
  /** PATCH endpoint stamped per row by `tagCellEditUrls`. */
  url:      string
  /** Column meta as serialized to the client. */
  col:      Record<string, unknown>
  /** Raw value from the row (pre-coerce, post-server). */
  value:    unknown
  /** Disabled = static `disabled()` OR per-row `_cellDisabled[col]`. */
  disabled: boolean
  /** Row-scoped option override stamped by `loadTableRecords` when the
   *  column is a `SelectColumn` with a per-row `.options(record => …)`
   *  resolver. Wins over `col.selectOptions`; absent when the resolver
   *  threw or the column has only static options. */
  rowOptions?: Array<{ value: string; label: string }>
}

interface PatchResultOk {
  ok:            true
  value:         unknown
  notifications: NotificationMeta[] | undefined
}
interface PatchResultErrors {
  ok:     false
  errors: Record<string, string[]>
}
interface PatchResultError {
  ok:    false
  error: string
}
type PatchResult = PatchResultOk | PatchResultErrors | PatchResultError

async function patchCell(url: string, value: unknown): Promise<PatchResult> {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body:    JSON.stringify({ value }),
  })
  let body: unknown = null
  try { body = await res.json() } catch { /* fall through */ }
  if (res.ok && body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    return {
      ok: true,
      value: b['value'],
      notifications: Array.isArray(b['notifications'])
        ? b['notifications'] as NotificationMeta[]
        : undefined,
    }
  }
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    if (b['errors']) {
      return { ok: false, errors: b['errors'] as Record<string, string[]> }
    }
    if (typeof b['error'] === 'string') {
      return { ok: false, error: b['error'] }
    }
  }
  return { ok: false, error: `Request failed (${res.status})` }
}

/** Pull the first error message out of a `{ errors: { value: [...] } }`
 * response. Also reads the reserved `_cell` key surfaced by
 * `Column.beforeStateUpdated / afterStateUpdated` halts. Falls back to
 * a generic "Couldn't save" string. */
function firstErrorMessage(result: PatchResultErrors | PatchResultError): string {
  if ('errors' in result) {
    const fieldErrs = result.errors['value']
    if (fieldErrs && fieldErrs.length > 0) return fieldErrs[0]!
    const cellErrs = result.errors['_cell']
    if (cellErrs && cellErrs.length > 0) return cellErrs[0]!
  }
  if ('error' in result) return result.error
  return "Couldn't save"
}

/** Confirm-gated wrapper. Renders a Dialog with the `confirm` message
 * before invoking `onConfirm`; cancel calls `onCancel` so the caller can
 * roll back the optimistic state. Mounts only when `open=true` so its
 * children aren't kept alive between confirm cycles. */
function ConfirmDialog({
  open, message, onConfirm, onCancel,
}: {
  open:      boolean
  message:   string
  onConfirm: () => void
  onCancel:  () => void
}): React.ReactElement | null {
  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm change</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── TextInput cell ────────────────────────────────────

export function CellTextInput(props: EditableCellProps): React.ReactElement {
  const { url, col, value, disabled } = props
  const inputType    = (col['inputType']        as string | undefined) ?? 'text'
  const placeholder  = col['inputPlaceholder']  as string | undefined
  const step         = col['inputStep']         as number | undefined
  const minVal       = col['inputMin']          as number | undefined
  const maxVal       = col['inputMax']          as number | undefined
  const debounceMs   = (col['debounceMs']       as number | undefined) ?? DEFAULT_DEBOUNCE_MS
  const confirmMsg   = col['confirm']           as string | undefined

  const [localValue, setLocalValue] = useState<string>(() =>
    value === null || value === undefined ? '' : String(value),
  )
  const committedRef = useRef<string>(localValue)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef       = useRef(0)
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null)
  const { notify } = useToast()

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const commit = async (next: string): Promise<void> => {
    if (next === committedRef.current) return
    const prev = committedRef.current
    committedRef.current = next
    const seq = ++seqRef.current
    const result = await patchCell(url, next)
    if (seq !== seqRef.current) return  // a newer commit has already fired
    if (result.ok) {
      // Success: keep the local + committed in sync. No success toast — saving
      // every keystroke would be noise.
      result.notifications?.forEach(n => notify(n))
    } else {
      committedRef.current = prev
      setLocalValue(prev)
      notify({
        type:  'error',
        title: "Couldn't save",
        body:  firstErrorMessage(result),
      })
    }
  }

  const queueCommit = (next: string): void => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (confirmMsg) {
      // Confirm-gated: don't send anything until the user accepts.
      setPendingConfirm(next)
      return
    }
    debounceRef.current = setTimeout(() => { void commit(next) }, debounceMs)
  }

  const flushOnBlur = (): void => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    if (confirmMsg) return                        // wait for the dialog
    void commit(localValue)
  }

  return (
    <div className="px-2 py-1" data-no-row-nav>
      <Input
        type={inputType}
        value={localValue}
        placeholder={placeholder}
        step={step}
        min={minVal}
        max={maxVal}
        disabled={disabled}
        onChange={(e) => { setLocalValue(e.target.value); queueCommit(e.target.value) }}
        onBlur={flushOnBlur}
        className="h-8"
      />
      <ConfirmDialog
        open={pendingConfirm !== null}
        message={confirmMsg ?? ''}
        onConfirm={() => {
          const next = pendingConfirm!
          setPendingConfirm(null)
          void commit(next)
        }}
        onCancel={() => {
          // Roll back the local state to the committed value.
          setLocalValue(committedRef.current)
          setPendingConfirm(null)
        }}
      />
    </div>
  )
}

// ─── Toggle + Checkbox cells ───────────────────────────
// Same boolean commit semantics (immediate PATCH, optimistic with
// rollback, optional confirm gate) — only the control differs.

export function CellToggle(props: EditableCellProps): React.ReactElement {
  return <CellBoolean {...props} control="switch" />
}

export function CellCheckbox(props: EditableCellProps): React.ReactElement {
  return <CellBoolean {...props} control="checkbox" />
}

function CellBoolean(props: EditableCellProps & { control: 'switch' | 'checkbox' }): React.ReactElement {
  const { url, value, disabled, col, control } = props
  const confirmMsg = col['confirm'] as string | undefined
  const [localValue, setLocalValue] = useState<boolean>(() => Boolean(value))
  const committedRef = useRef<boolean>(localValue)
  const seqRef       = useRef(0)
  const [pendingConfirm, setPendingConfirm] = useState<boolean | null>(null)
  const { notify } = useToast()

  const commit = async (next: boolean): Promise<void> => {
    const prev = committedRef.current
    committedRef.current = next
    const seq = ++seqRef.current
    const result = await patchCell(url, next)
    if (seq !== seqRef.current) return
    if (result.ok) {
      result.notifications?.forEach(n => notify(n))
    } else {
      committedRef.current = prev
      setLocalValue(prev)
      notify({
        type:  'error',
        title: "Couldn't save",
        body:  firstErrorMessage(result),
      })
    }
  }

  const onChange = (next: boolean): void => {
    setLocalValue(next)
    if (confirmMsg) { setPendingConfirm(next); return }
    void commit(next)
  }

  return (
    <div className="px-2 py-2" data-no-row-nav>
      {control === 'switch'
        ? (
          <Switch
            checked={localValue}
            disabled={disabled}
            onCheckedChange={onChange}
          />
        )
        : (
          <Checkbox
            checked={localValue}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
        )}
      <ConfirmDialog
        open={pendingConfirm !== null}
        message={confirmMsg ?? ''}
        onConfirm={() => {
          const next = pendingConfirm!
          setPendingConfirm(null)
          void commit(next)
        }}
        onCancel={() => {
          // Roll back to the committed value — flips the control back.
          setLocalValue(committedRef.current)
          setPendingConfirm(null)
        }}
      />
    </div>
  )
}

// ─── Select cell ───────────────────────────────────────

export function CellSelect(props: EditableCellProps): React.ReactElement {
  const { url, value, disabled, col, rowOptions } = props
  // Per-row resolver wins over the column's static options. Both can be
  // present: a column may set static options as a fallback that the
  // resolver overrides per row.
  const opts: Array<{ value: string; label: string }> =
    rowOptions ??
    (Array.isArray(col['selectOptions']) ? col['selectOptions'] as Array<{ value: string; label: string }> : [])
  const nullable    = col['selectNullable'] === true
  const showPlaceholderOnce = col['selectablePlaceholder'] !== false  // default true (keep showing)
  const confirmMsg  = col['confirm'] as string | undefined

  const valueAsString = (v: unknown): string =>
    v === null || v === undefined ? '' : String(v)

  const [localValue, setLocalValue] = useState<string>(() => valueAsString(value))
  const committedRef = useRef<string>(localValue)
  const seqRef       = useRef(0)
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null)
  const { notify } = useToast()

  const commit = async (next: string): Promise<void> => {
    const prev = committedRef.current
    committedRef.current = next
    const seq = ++seqRef.current
    // Empty-string value with `nullable()` becomes `null` on the wire so
    // the server-side coerce path treats it as a clear, not an option key.
    const wire: string | null = next === '' && nullable ? null : next
    const result = await patchCell(url, wire)
    if (seq !== seqRef.current) return
    if (result.ok) {
      result.notifications?.forEach(n => notify(n))
    } else {
      committedRef.current = prev
      setLocalValue(prev)
      notify({
        type:  'error',
        title: "Couldn't save",
        body:  firstErrorMessage(result),
      })
    }
  }

  const onChange = (next: string): void => {
    setLocalValue(next)
    if (confirmMsg) { setPendingConfirm(next); return }
    void commit(next)
  }

  // Hide the placeholder option once a value is set when the user opted out.
  const showPlaceholder = showPlaceholderOnce || localValue === ''
  const placeholderText = nullable ? '—' : 'Select…'

  return (
    <div className="px-2 py-1" data-no-row-nav>
      <Select
        value={localValue}
        onValueChange={(v) => onChange(typeof v === 'string' ? v : '')}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-full">
          <SelectValue placeholder={placeholderText} />
        </SelectTrigger>
        <SelectContent>
          {nullable && showPlaceholder && (
            <SelectItem value="">{placeholderText}</SelectItem>
          )}
          {opts.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ConfirmDialog
        open={pendingConfirm !== null}
        message={confirmMsg ?? ''}
        onConfirm={() => {
          const next = pendingConfirm!
          setPendingConfirm(null)
          void commit(next)
        }}
        onCancel={() => {
          setLocalValue(committedRef.current)
          setPendingConfirm(null)
        }}
      />
    </div>
  )
}

/** Discriminator for the SchemaRenderer cell switch — pick the right
 * editable-cell renderer based on `columnType`. Returns `null` when the
 * column is read-only so the caller falls through to `formatCell`. */
export function pickEditableCell(columnType: string): React.FC<EditableCellProps> | null {
  switch (columnType) {
    case 'textInput': return CellTextInput
    case 'toggle':    return CellToggle
    case 'checkbox':  return CellCheckbox
    case 'select':    return CellSelect
    default:          return null
  }
}
