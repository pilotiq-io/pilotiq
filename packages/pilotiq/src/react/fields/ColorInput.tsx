import React, { useContext, useEffect, useRef, useState } from 'react'
import { useFieldState, FormIdContext } from '../FormStateContext.js'
import { registerPendingSuggestionApplier, type PendingSuggestionApplier } from '../PendingSuggestionApplierRegistry.js'
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

  // Cross-tree applier — color/text inputs are React-controlled (`value`,
  // not `defaultValue`), so a DOM-write to the hidden mirror wouldn't
  // reach them. FieldShell skips its generic registration for
  // fieldType === 'color'.
  const fsRef = useRef(fs)
  useEffect(() => { fsRef.current = fs }, [fs])
  const formId = useContext(FormIdContext) || undefined
  useEffect(() => {
    if (name.includes('.')) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      const raw = suggestion.suggestedValue
      const next = typeof raw === 'string' && raw ? raw : '#000000'
      const cur = fsRef.current
      if (cur.controlled) { cur.setValue(next); cur.triggerLive(next) }
      else { setLocalValue(next); cur.triggerLive(next) }
    }
    return registerPendingSuggestionApplier(formId, name, applier)
  }, [name, formId])

  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name={name} value={value} />
      <input
        type="color"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        className="h-8 w-12 cursor-pointer rounded-lg border border-input bg-transparent"
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
