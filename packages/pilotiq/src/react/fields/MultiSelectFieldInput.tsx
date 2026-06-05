import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react'
import { useFieldState, FormIdContext } from '../FormStateContext.js'
import { registerPendingSuggestionApplier, type PendingSuggestionApplier } from '../PendingSuggestionApplierRegistry.js'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js'
import { Input } from '../ui/input.js'
import { cn } from '../utils.js'

/**
 * Multi-select renderer for `SelectField.multiple()`. Value is `string[]`
 * (option values). The trigger is styled like `SelectTrigger` and shows
 * the selected options as removable chips; clicking opens a Popover with
 * a filter input + a checkbox-style option list.
 *
 * Wire format mirrors `TagsInput` — the selected ids serialize as a
 * JSON-encoded array in a single hidden input; the server's
 * `coerceFormValues` `select` branch parses them back into `string[]`.
 */
export function MultiSelectFieldInput({
  name, defaultValue, disabled, placeholder, options, fieldLabel,
}: {
  name:         string
  defaultValue: unknown
  disabled:     boolean
  placeholder:  string | undefined
  options:      Array<{ value: string; label: string; disabled?: boolean }>
  fieldLabel?:  string
}): React.ReactElement {
  const fs = useFieldState(name)

  const initial = useMemo<string[]>(() => toArray(defaultValue), [])
  const [localValues, setLocalValues] = useState<string[]>(initial)
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')

  const selected = fs.controlled ? toArray(fs.value) : localValues

  const setSelected = (next: string[]): void => {
    if (fs.controlled) { fs.setValue(next); fs.triggerLive(next) }
    else                { setLocalValues(next); fs.triggerLive(next) }
  }

  const toggle = (value: string): void => {
    setSelected(selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value])
  }

  // Cross-tree applier — selection lives in React state; the hidden
  // input is a write-only JSON mirror, so the generic DOM-write applier
  // wouldn't update the visible chips. FieldShell skips its generic
  // registration for fieldType === 'select' (see SelectFieldInput).
  const fsRef = useRef(fs)
  useEffect(() => { fsRef.current = fs }, [fs])
  const formId = useContext(FormIdContext) || undefined
  useEffect(() => {
    if (name.includes('.')) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      const next = toArray(suggestion.suggestedValue)
      const cur = fsRef.current
      if (cur.controlled) { cur.setValue(next); cur.triggerLive(next) }
      else { setLocalValues(next); cur.triggerLive(next) }
    }
    return registerPendingSuggestionApplier(formId, name, applier)
  }, [name, formId])

  const byValue = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of options) m.set(o.value, o.label)
    return m
  }, [options])

  const needle = query.trim().toLowerCase()
  const visibleOptions = needle
    ? options.filter(o => o.label.toLowerCase().includes(needle))
    : options

  return (
    <>
      <input type="hidden" name={name} value={JSON.stringify(selected)} />
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery('') }}>
        <PopoverTrigger
          disabled={disabled}
          aria-label={fieldLabel ?? name}
          className={cn(
            'border-input focus-visible:border-ring focus-visible:ring-ring/50 flex w-full min-h-8 items-center justify-between gap-2 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
          )}
          id={name}
        >
          <span className="flex flex-1 flex-wrap items-center gap-1 min-w-0 text-left">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder ?? 'Select…'}</span>
            ) : selected.map(value => (
              <span
                key={value}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
              >
                {byValue.get(value) ?? value}
                {!disabled && (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${byValue.get(value) ?? value}`}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggle(value) }}
                  >
                    <XIcon className="size-3" />
                  </span>
                )}
              </span>
            ))}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--anchor-width) min-w-56 p-1.5">
          {options.length > 7 && (
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="mb-1.5 h-7 text-sm"
              autoFocus
            />
          )}
          <div className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
            {visibleOptions.length === 0 && (
              <span className="px-2 py-1.5 text-sm text-muted-foreground">No options match.</span>
            )}
            {visibleOptions.map(o => {
              const checked = selected.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={o.disabled}
                  onClick={() => toggle(o.value)}
                  className={cn(
                    'flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  <span className={cn('flex size-4 items-center justify-center', !checked && 'opacity-0')}>
                    <CheckIcon className="size-4" />
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}

/** Normalize array | JSON-string | scalar | nullish into `string[]`. */
function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v))
  if (typeof value === 'string') {
    if (value === '') return []
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(v => String(v)) : [value]
    } catch {
      return [value]
    }
  }
  if (value === undefined || value === null) return []
  return [String(value)]
}
