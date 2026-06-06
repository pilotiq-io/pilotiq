import React, { useContext, useEffect, useRef, useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { useFieldState, FormIdContext } from '../FormStateContext.js'
import { registerPendingSuggestionApplier, type PendingSuggestionApplier } from '../PendingSuggestionApplierRegistry.js'
import { Calendar } from '../ui/calendar.js'
import { Input } from '../ui/input.js'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover.js'

/**
 * Part readers slice the `YYYY-MM-DDTHH:mm` wire string directly —
 * never `new Date(value)` — because parsing a bare date string applies
 * a UTC offset and can shift the rendered day near midnight. Full ISO
 * inputs (suggestion appliers may hand one over) trim cleanly since
 * the leading 16 chars share the wire shape.
 */
function datePart(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
}

function timePart(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value.slice(11, 16) : ''
}

/** Trim full-ISO strings down to the `YYYY-MM-DDTHH:mm` wire shape. */
function normalizeWire(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value.slice(0, 16) : value
}

/** Build a local-midnight Date from a `YYYY-MM-DD` part for the calendar. */
function toLocalDate(part: string): Date | undefined {
  const [y, m, d] = part.split('-').map(Number)
  if (!y || !m || !d) return undefined
  const date = new Date(y, m - 1, d)
  return isNaN(date.getTime()) ? undefined : date
}

/** Format a calendar-selected Date back into the `YYYY-MM-DD` part. */
function fromLocalDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Popover date-time picker — shadcn `Calendar` plus a time input in
 * the popover footer, with a hidden input carrying the same
 * `YYYY-MM-DDTHH:mm` wire value the old native `datetime-local` input
 * posted (the `dateTime` coerce branch and model `datetime` casts
 * depend on that shape). Same dual controlled/uncontrolled handling
 * as the other field inputs.
 */
export function DateTimeInput({
  name, defaultValue, disabled, placeholder,
}: {
  name:         string
  defaultValue: string | undefined
  disabled:     boolean
  placeholder:  string | undefined
}): React.ReactElement {
  const fs = useFieldState(name)

  const initial = defaultValue ?? ''
  const [localValue, setLocalValue] = useState<string>(initial)
  const value = fs.controlled
    ? (fs.value !== undefined && fs.value !== null && fs.value !== '' ? String(fs.value) : '')
    : localValue

  const setValue = (v: string): void => {
    if (fs.controlled) { fs.setValue(v); fs.triggerLive(v) }
    else { setLocalValue(v); fs.triggerLive(v) }
  }

  // Cross-tree applier — visible state is React-driven (hidden input +
  // popover), so a DOM-write would bypass the controller. FieldShell
  // skips its generic registration for fieldType === 'dateTime'.
  const fsRef = useRef(fs)
  useEffect(() => { fsRef.current = fs }, [fs])
  const formId = useContext(FormIdContext) || undefined
  useEffect(() => {
    if (name.includes('.')) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      const v = suggestion.suggestedValue
      const next = v == null || v === '' ? '' : normalizeWire(String(v))
      const cur = fsRef.current
      if (cur.controlled) { cur.setValue(next); cur.triggerLive(next) }
      else { setLocalValue(next); cur.triggerLive(next) }
    }
    return registerPendingSuggestionApplier(formId, name, applier)
  }, [name, formId])

  const dStr     = datePart(value)
  const tStr     = timePart(value)
  const selected = dStr ? toLocalDate(dStr) : undefined

  const onSelect = (next: Date | undefined): void => {
    // Re-clicking the selected day clears (Calendar hands back undefined).
    setValue(next ? `${fromLocalDate(next)}T${tStr || '00:00'}` : '')
  }

  const onTimeChange = (t: string): void => {
    if (!t) {
      // Time cleared: keep the date at midnight; nothing set yet → stay empty.
      setValue(dStr ? `${dStr}T00:00` : '')
      return
    }
    // Time set before a date: anchor to today.
    setValue(`${dStr || fromLocalDate(new Date())}T${t}`)
  }

  // Locale pinned — `undefined` resolves differently on server vs client
  // (Node vs browser locale) and the mismatch fails hydration.
  const display = selected
    ? `${selected.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}${tStr ? `, ${tStr}` : ''}`
    : (placeholder ?? 'Pick date & time')

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              id={name}
              disabled={disabled}
              className={`flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              <span>{display}</span>
              <CalendarIcon className="size-4 opacity-60" />
            </button>
          }
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={selected} onSelect={onSelect} initialFocus />
          <div className="border-t p-3">
            <Input
              type="time"
              value={tStr}
              onChange={(e) => onTimeChange(e.target.value)}
              disabled={disabled}
              aria-label="Time"
            />
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
