import React, { useContext, useEffect, useRef, useState } from 'react'
import { useFieldState, FormIdContext } from '../FormStateContext.js'
import { registerPendingSuggestionApplier, type PendingSuggestionApplier } from '../PendingSuggestionApplierRegistry.js'
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

  // Cross-tree applier — the visible `<input type="datetime-local">` is
  // React-controlled (`value`, not `defaultValue`), so a DOM-write to
  // it bypasses the controller. FieldShell skips its generic
  // registration for fieldType === 'dateTime'.
  const fsRef = useRef(fs)
  useEffect(() => { fsRef.current = fs }, [fs])
  const formId = useContext(FormIdContext) || undefined
  useEffect(() => {
    if (name.includes('.')) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      const v = suggestion.suggestedValue
      const next = v == null || v === '' ? '' : String(v)
      const cur = fsRef.current
      if (cur.controlled) { cur.setValue(next); cur.triggerLive(next) }
      else { setLocalValue(next); cur.triggerLive(next) }
    }
    return registerPendingSuggestionApplier(formId, name, applier)
  }, [name, formId])

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
