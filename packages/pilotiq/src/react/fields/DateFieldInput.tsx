import React, { useContext, useEffect, useRef, useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { useFieldState, FormIdContext } from '../FormStateContext.js'
import { registerPendingSuggestionApplier, type PendingSuggestionApplier } from '../PendingSuggestionApplierRegistry.js'
import { Calendar } from '../ui/calendar.js'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover.js'

export function DateFieldInput({
  name, defaultValue, disabled, placeholder,
}: {
  name:         string
  defaultValue: string | undefined
  disabled:     boolean
  placeholder:  string | undefined
}): React.ReactElement {
  const fs = useFieldState(name)
  const initial = defaultValue ? new Date(defaultValue) : undefined
  const [localDate, setLocalDate] = useState<Date | undefined>(
    initial && !isNaN(initial.getTime()) ? initial : undefined,
  )
  let date: Date | undefined
  if (fs.controlled) {
    const ctxStr = fs.value !== undefined && fs.value !== null && fs.value !== '' ? String(fs.value) : ''
    if (ctxStr) {
      const parsed = new Date(ctxStr)
      date = isNaN(parsed.getTime()) ? undefined : parsed
    }
  } else {
    date = localDate
  }
  // Cross-tree applier — visible state is React-driven (hidden input +
  // popover button), so FieldShell's generic DOM-write applier would
  // leave the button label stale. FieldShell skips its registration
  // for fieldType === 'date'.
  const fsRef = useRef(fs)
  useEffect(() => { fsRef.current = fs }, [fs])
  const formId = useContext(FormIdContext) || undefined
  useEffect(() => {
    if (name.includes('.')) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      const v = suggestion.suggestedValue
      const next = v == null || v === '' ? '' : String(v).slice(0, 10)
      const cur = fsRef.current
      if (cur.controlled) {
        cur.setValue(next)
        cur.triggerLive(next)
      } else {
        const parsed = next ? new Date(next) : undefined
        setLocalDate(parsed && !isNaN(parsed.getTime()) ? parsed : undefined)
        cur.triggerLive(next)
      }
    }
    return registerPendingSuggestionApplier(formId, name, applier)
  }, [name, formId])

  const onSelect = (next: Date | undefined): void => {
    const iso = next ? next.toISOString().slice(0, 10) : ''
    if (fs.controlled) {
      fs.setValue(iso)
      fs.triggerLive(iso)
    } else {
      setLocalDate(next)
      fs.triggerLive(iso)
    }
  }
  const formatted = date ? date.toISOString().slice(0, 10) : ''
  // Locale pinned — `undefined` resolves differently on server vs client
  // (Node vs browser locale) and the mismatch fails hydration.
  const display   = date
    ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : (placeholder ?? 'Pick a date')

  return (
    <>
      <input type="hidden" name={name} value={formatted} />
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              id={name}
              disabled={disabled}
              className={`flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${
                date ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              <span>{display}</span>
              <CalendarIcon className="size-4 opacity-60" />
            </button>
          }
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={onSelect} initialFocus />
        </PopoverContent>
      </Popover>
    </>
  )
}
