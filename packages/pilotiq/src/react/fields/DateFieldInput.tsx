import React, { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { useFieldState } from '../FormStateContext.js'
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
  const onSelect = (next: Date | undefined): void => {
    if (fs.controlled) {
      fs.setValue(next ? next.toISOString().slice(0, 10) : '')
      fs.triggerLive()
    } else {
      setLocalDate(next)
    }
  }
  const formatted = date ? date.toISOString().slice(0, 10) : ''
  const display   = date
    ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
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
              className={`flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${
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
