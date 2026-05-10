import React, { useContext, useEffect, useRef, useState } from 'react'
import { useFieldState, FormIdContext } from '../FormStateContext.js'
import { registerPendingSuggestionApplier, type PendingSuggestionApplier } from '../PendingSuggestionApplierRegistry.js'

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
  options:      Array<{ value: string; label: string; disabled?: boolean }>
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

  // Cross-tree applier — the visible radios live under a
  // `${name}__radio`-named group (separate from the `[name]` hidden
  // mirror), and they're React-controlled via `checked={value === o.value}`.
  // FieldShell skips its generic registration for fieldType === 'radio'.
  const fsRef = useRef(fs)
  useEffect(() => { fsRef.current = fs }, [fs])
  const formId = useContext(FormIdContext) || undefined
  useEffect(() => {
    if (name.includes('.')) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      const v = suggestion.suggestedValue
      const next = v == null ? '' : String(v)
      const cur = fsRef.current
      if (cur.controlled) { cur.setValue(next); cur.triggerLive(next) }
      else { setLocalValue(next); cur.triggerLive(next) }
    }
    return registerPendingSuggestionApplier(formId, name, applier)
  }, [name, formId])

  const layout = inline ? 'flex flex-row flex-wrap gap-4' : 'flex flex-col gap-2'
  return (
    <div role="radiogroup" className={layout}>
      <input type="hidden" name={name} value={value} />
      {options.map((o) => {
        const id = `${name}-${o.value}`
        const checked = value === o.value
        const optDisabled = disabled || Boolean(o.disabled)
        return (
          <label
            key={o.value}
            htmlFor={id}
            className={
              'flex items-center gap-2 text-sm ' +
              (optDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')
            }
          >
            <input
              type="radio"
              id={id}
              name={`${name}__radio`}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              disabled={optDisabled}
              className="size-4 accent-primary"
            />
            <span>{o.label}</span>
          </label>
        )
      })}
    </div>
  )
}
