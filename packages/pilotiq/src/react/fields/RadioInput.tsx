import React, { useState } from 'react'
import { useFieldState } from '../FormStateContext.js'

/**
 * Single-choice field rendered as a vertical (or `inline:true` horizontal)
 * stack of `<input type="radio">` rows. Controlled when inside a
 * `FormStateProvider`, uncontrolled otherwise.
 */
export function RadioInput({
  name, defaultValue, disabled, options, inline,
}: {
  name:         string
  defaultValue: string | undefined
  disabled:     boolean
  options:      Array<{ value: string; label: string }>
  inline:       boolean
}): React.ReactElement {
  const fs = useFieldState(name)
  const [localValue, setLocalValue] = useState<string>(defaultValue ?? '')
  const value = fs.controlled
    ? (fs.value !== undefined && fs.value !== null ? String(fs.value) : '')
    : localValue
  const onChange = (next: string): void => {
    if (fs.controlled) { fs.setValue(next); fs.triggerLive(next) }
    else { setLocalValue(next); fs.triggerLive(next) }
  }
  const layout = inline ? 'flex flex-row flex-wrap gap-4' : 'flex flex-col gap-2'
  return (
    <div role="radiogroup" className={layout}>
      <input type="hidden" name={name} value={value} />
      {options.map((o) => {
        const id = `${name}-${o.value}`
        const checked = value === o.value
        return (
          <label
            key={o.value}
            htmlFor={id}
            className="flex items-center gap-2 cursor-pointer text-sm"
          >
            <input
              type="radio"
              id={id}
              name={`${name}__radio`}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              disabled={disabled}
              className="size-4 accent-primary"
            />
            <span>{o.label}</span>
          </label>
        )
      })}
    </div>
  )
}
