import React, { useState } from 'react'
import { useFieldState } from '../FormStateContext.js'
import { Checkbox } from '../ui/checkbox.js'

/**
 * Multi-choice. Value is `string[]`. Renders as either a vertical
 * stack (columns=1, default) or a CSS grid (columns=2/3/…). On submit,
 * each checked option contributes a `name=value` body entry which the
 * server normalizes to a string[] in `coerceFormValues`.
 */
export function CheckboxListInput({
  name, defaultValue, disabled, options, columns,
}: {
  name:         string
  defaultValue: unknown
  disabled:     boolean
  options:      Array<{ value: string; label: string }>
  columns:      number
}): React.ReactElement {
  const fs = useFieldState(name)

  // Normalize the initial value: string[] passes through; null/undefined → [];
  // single string → [string]. Defensive against record shapes that store
  // checkbox lists as JSON strings.
  const toArray = (v: unknown): string[] => {
    if (v === undefined || v === null) return []
    if (Array.isArray(v)) return v.map(String)
    return [String(v)]
  }

  const [localValue, setLocalValue] = useState<string[]>(toArray(defaultValue))
  const value = fs.controlled ? toArray(fs.value) : localValue

  const onToggle = (optValue: string, checked: boolean): void => {
    const next = checked
      ? Array.from(new Set([...value, optValue]))
      : value.filter(v => v !== optValue)
    if (fs.controlled) { fs.setValue(next); fs.triggerLive() }
    else setLocalValue(next)
  }

  const layout = columns > 1
    ? `grid grid-cols-${columns} gap-2`
    : 'flex flex-col gap-2'

  return (
    <div className={layout}>
      {/* Mirror the array as repeated hidden inputs for native form submit. */}
      {value.map((v, i) => (
        <input key={`hidden-${i}`} type="hidden" name={name} value={v} />
      ))}
      {options.map((o) => {
        const id = `${name}-${o.value}`
        const checked = value.includes(o.value)
        return (
          <label
            key={o.value}
            htmlFor={id}
            className="flex items-center gap-2 cursor-pointer text-sm"
          >
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={(c: boolean) => onToggle(o.value, c)}
              disabled={disabled}
            />
            <span>{o.label}</span>
          </label>
        )
      })}
    </div>
  )
}
