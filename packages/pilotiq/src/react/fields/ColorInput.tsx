import React, { useState } from 'react'
import { useFieldState } from '../FormStateContext.js'
import { Input } from '../ui/input.js'

/**
 * Hex color input. Renders the native `<input type="color">` next to
 * a text mirror so users can paste literal hex codes. Both inputs
 * stay in sync via the shared value state.
 */
export function ColorInput({
  name, defaultValue, disabled,
}: {
  name:         string
  defaultValue: unknown
  disabled:     boolean
}): React.ReactElement {
  const fs = useFieldState(name)
  const initial = typeof defaultValue === 'string' && defaultValue ? defaultValue : '#000000'
  const [localValue, setLocalValue] = useState<string>(initial)

  const value = fs.controlled
    ? (typeof fs.value === 'string' && fs.value ? fs.value : '#000000')
    : localValue

  const setValue = (v: string): void => {
    if (fs.controlled) { fs.setValue(v); fs.triggerLive(v) }
    else { setLocalValue(v); fs.triggerLive(v) }
  }

  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name={name} value={value} />
      <input
        type="color"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent"
      />
      <Input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder="#rrggbb"
        className="font-mono"
        maxLength={7}
      />
    </div>
  )
}
