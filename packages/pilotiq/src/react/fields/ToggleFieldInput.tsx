import React, { useState } from 'react'
import { useFieldState } from '../FormStateContext.js'
import { Switch } from '../ui/switch.js'

export function ToggleFieldInput({
  name, defaultChecked, disabled,
}: { name: string; defaultChecked: boolean; disabled: boolean }): React.ReactElement {
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
      <Switch
        id={name}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}
