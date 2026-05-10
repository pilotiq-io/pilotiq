import React, { useContext, useEffect, useRef, useState } from 'react'
import { useFieldState, FormIdContext } from '../FormStateContext.js'
import { registerPendingSuggestionApplier, type PendingSuggestionApplier } from '../PendingSuggestionApplierRegistry.js'
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
  options:      Array<{ value: string; label: string; disabled?: boolean }>
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
    if (fs.controlled) { fs.setValue(next); fs.triggerLive(next) }
    else { setLocalValue(next); fs.triggerLive(next) }
  }

  // Cross-tree applier — the visible checkboxes are React-controlled
  // (Base UI `<Checkbox checked={…}>`); the per-option hidden mirrors
  // share the `[name]` attribute, so FieldShell's generic applier would
  // overwrite every one of them with the suggestion's stringified value
  // instead of replacing the array. FieldShell skips its generic
  // registration for fieldType === 'checkboxList'.
  const fsRef = useRef(fs)
  useEffect(() => { fsRef.current = fs }, [fs])
  const formId = useContext(FormIdContext) || undefined
  useEffect(() => {
    if (name.includes('.')) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      const next = toArray(suggestion.suggestedValue)
      const cur = fsRef.current
      if (cur.controlled) { cur.setValue(next); cur.triggerLive(next) }
      else { setLocalValue(next); cur.triggerLive(next) }
    }
    return registerPendingSuggestionApplier(formId, name, applier)
  }, [name, formId])

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
        // Per-option disabled (from `disableOptionsWhenSelectedInSiblingRepeaterItems`)
        // greys out unchecked taken values but keeps already-checked ones
        // editable so the user can uncheck their own pick — otherwise a row
        // would be stuck holding a value it can't release.
        const optDisabled = disabled || (Boolean(o.disabled) && !checked)
        return (
          <label
            key={o.value}
            htmlFor={id}
            className={
              'flex items-center gap-2 text-sm ' +
              (optDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')
            }
          >
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={(c: boolean) => onToggle(o.value, c)}
              disabled={optDisabled}
            />
            <span>{o.label}</span>
          </label>
        )
      })}
    </div>
  )
}
