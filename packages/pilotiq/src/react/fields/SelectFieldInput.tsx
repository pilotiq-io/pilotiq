import React, { useState } from 'react'
import { useFieldState } from '../FormStateContext.js'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select.js'

export function SelectFieldInput({
  name, defaultValue, disabled, required, placeholder, options,
}: {
  name:         string
  defaultValue: string | undefined
  disabled:     boolean
  required:     boolean
  placeholder:  string | undefined
  options:      Array<{ value: string; label: string }>
}): React.ReactElement {
  const fs = useFieldState(name)
  // Always-controlled. Initialize to '' (not undefined) so Base UI's Select
  // doesn't see the value flip from undefined → string when the user picks
  // an option (warns: "changing the uncontrolled value state to controlled").
  const [localValue, setLocalValue] = useState<string>(defaultValue ?? '')
  const value = fs.controlled
    ? (fs.value !== undefined && fs.value !== null ? String(fs.value) : '')
    : localValue
  // Base UI Select's onValueChange is a callback (no native bubbling
  // change event). Inner-Repeater rows need the explicit triggerLive
  // in both paths to fire `live()` re-resolve. Pass the new value as
  // `valueOverride` so dotted-path inner fields hit the right slot.
  const onValueChange = (v: string | null): void => {
    const next = v ?? ''
    if (fs.controlled) { fs.setValue(next); fs.triggerLive(next) }
    else { setLocalValue(next); fs.triggerLive(next) }
  }
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select
        value={value}
        onValueChange={(v) => onValueChange(v as string)}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger className="w-full" id={name}>
          <SelectValue placeholder={placeholder ?? 'Select…'} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
