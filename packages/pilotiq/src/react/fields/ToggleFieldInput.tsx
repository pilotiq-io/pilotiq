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
  // Base UI Switch's onCheckedChange callback does NOT dispatch a native
  // bubbling change event, so RepeaterInput's container-level delegate
  // can't pick up inner-row live() triggers. Call triggerLive explicitly
  // in BOTH paths — the function is a no-op outside FormStateProvider
  // and when the field has no `live` config, so it's safe to fire
  // unconditionally. The value is passed as a `valueOverride` so
  // dotted-path inner-Repeater fields pass through correctly.
  const onChange = (next: boolean): void => {
    if (fs.controlled) { fs.setValue(next); fs.triggerLive(next) }
    else { setLocalChecked(next); fs.triggerLive(next) }
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
