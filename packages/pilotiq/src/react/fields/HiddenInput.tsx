import React from 'react'
import { useFieldState } from '../FormStateContext.js'

/**
 * Pure passthrough — renders a single hidden input. The value is
 * either bound to the form-state context (controlled mode, when the
 * form has live fields) or the meta's defaultValue (uncontrolled).
 */
export function HiddenInput({
  name, defaultValue,
}: { name: string; defaultValue: unknown }): React.ReactElement {
  const fs = useFieldState(name)
  const stringify = (v: unknown): string =>
    v === undefined || v === null ? '' : String(v)
  const value = fs.controlled ? stringify(fs.value) : stringify(defaultValue)
  return <input type="hidden" name={name} value={value} readOnly />
}
