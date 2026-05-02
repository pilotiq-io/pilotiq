import React, { useState } from 'react'
import { useFieldState } from '../FormStateContext.js'

/**
 * Single-choice field rendered as a horizontal row of pill-shaped
 * buttons styled like a segmented control. Submits via a hidden input
 * carrying the active value (form submission contract identical to
 * `RadioInput`).
 *
 * Controlled when inside a `FormStateProvider`, uncontrolled otherwise.
 */
export function ToggleButtonsInput({
  name, defaultValue, disabled, options,
}: {
  name:         string
  defaultValue: string | undefined
  disabled:     boolean
  options:      Array<{ value: string; label: string; disabled?: boolean }>
}): React.ReactElement {
  const fs = useFieldState(name)
  const [localValue, setLocalValue] = useState<string>(defaultValue ?? '')
  const value = fs.controlled
    ? (fs.value !== undefined && fs.value !== null ? String(fs.value) : '')
    : localValue
  const onPick = (next: string): void => {
    if (disabled) return
    if (fs.controlled) { fs.setValue(next); fs.triggerLive(next) }
    else { setLocalValue(next); fs.triggerLive(next) }
  }
  return (
    <div role="radiogroup" className="inline-flex flex-wrap rounded-md border border-input bg-background overflow-hidden">
      <input type="hidden" name={name} value={value} />
      {options.map((o, i) => {
        const active = value === o.value
        const optDisabled = disabled || Boolean(o.disabled)
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={optDisabled}
            data-state={active ? 'on' : 'off'}
            onClick={() => { if (!optDisabled) onPick(o.value) }}
            className={
              'px-3 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring ' +
              (i > 0 ? 'border-l border-input ' : '') +
              (active
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 '
                : 'bg-transparent hover:bg-accent hover:text-accent-foreground ') +
              (optDisabled ? 'opacity-50 cursor-not-allowed ' : 'cursor-pointer ')
            }
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
