import React, { useState } from 'react'
import { useFieldState } from '../FormStateContext.js'
import { Input } from '../ui/input.js'

/**
 * Native `<input type="datetime-local">` — adequate for v1. Same dual
 * controlled/uncontrolled handling as the other field inputs. Coercion
 * downstream parses the `YYYY-MM-DDTHH:mm` shape into a `Date`.
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

  return (
    <Input
      type="datetime-local"
      id={name}
      name={name}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
    />
  )
}
