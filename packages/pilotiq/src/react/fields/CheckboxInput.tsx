import React, { useState } from 'react'
import { useFieldState } from '../FormStateContext.js'
import { Checkbox } from '../ui/checkbox.js'

export function CheckboxInput({
  name, defaultChecked, disabled, label,
}: {
  name:           string
  defaultChecked: boolean
  disabled:       boolean
  /** Inline label rendered next to the box. Distinct from the field-shell label. */
  label?:         string
}): React.ReactElement {
  const fs = useFieldState(name)
  const [localChecked, setLocalChecked] = useState(defaultChecked)
  const checked = fs.controlled
    ? (fs.value === true || fs.value === 'true' || fs.value === 1 || fs.value === '1')
    : localChecked
  const onChange = (next: boolean): void => {
    if (fs.controlled) { fs.setValue(next); fs.triggerLive() }
    else setLocalChecked(next)
  }
  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name={name} value={checked ? 'true' : 'false'} />
      <Checkbox
        id={name}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
      {label && (
        <label htmlFor={name} className="text-sm leading-none cursor-pointer">
          {label}
        </label>
      )}
    </div>
  )
}
