import React, { useState } from 'react'
import { useFieldState } from '../FormStateContext.js'
import { Slider } from '../ui/slider.js'

/**
 * Numeric slider. Value persisted as a number (coerced via the
 * shared 'number' branch in `coerceFormValues`). When `showValue`
 * is true, renders the current value to the right of the track.
 */
export function SliderInput({
  name, defaultValue, disabled, min, max, step, showValue,
}: {
  name:         string
  defaultValue: unknown
  disabled:     boolean
  min:          number
  max:          number
  step:         number
  showValue:    boolean
}): React.ReactElement {
  const fs = useFieldState(name)

  const toNumber = (v: unknown): number => {
    const n = Number(v)
    return Number.isFinite(n) ? n : min
  }

  const [localValue, setLocalValue] = useState<number>(toNumber(defaultValue))
  const value = fs.controlled ? toNumber(fs.value) : localValue

  // Base UI Slider's onValueChange callback does NOT dispatch a native
  // bubbling change event, so RepeaterInput's container-level delegate
  // can't pick up inner-row live() triggers. Call triggerLive explicitly
  // in BOTH paths (no-op outside FormStateProvider / when field has no
  // `live` config). Value passed as `valueOverride` so dotted-path
  // inner-Repeater fields pass through correctly.
  const onChange = (next: number | readonly number[]): void => {
    const v = Array.isArray(next) ? Number(next[0]) : Number(next)
    if (fs.controlled) { fs.setValue(v); fs.triggerLive(v) }
    else { setLocalValue(v); fs.triggerLive(v) }
  }

  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name={name} value={String(value)} />
      <div className="flex-1">
        <Slider
          value={value}
          onValueChange={onChange}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
        />
      </div>
      {showValue && (
        <span className="text-sm tabular-nums text-muted-foreground w-10 text-right">
          {value}
        </span>
      )}
    </div>
  )
}
