import React, { useContext, useEffect, useRef, useState } from 'react'
import { PlusIcon } from 'lucide-react'
import type { ElementMeta } from '../../schema/Element.js'
import { useFieldState, FormIdContext } from '../FormStateContext.js'
import { registerPendingSuggestionApplier, type PendingSuggestionApplier } from '../PendingSuggestionApplierRegistry.js'
import { useToast } from '../Toaster.js'
import { renderFormChild } from '../SchemaRenderer.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.js'
import { Button } from '../ui/button.js'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select.js'

interface CreateOptionMeta {
  formId: string
  schema: ElementMeta[]
  url?:   string
}

interface NewOption { value: string; label: string }

export function SelectFieldInput({
  name, defaultValue, disabled, required, placeholder, options,
  fieldLabel, createOption,
}: {
  name:         string
  defaultValue: string | undefined
  disabled:     boolean
  required:     boolean
  placeholder:  string | undefined
  options:      Array<{ value: string; label: string; disabled?: boolean }>
  fieldLabel?:  string
  createOption?: CreateOptionMeta
}): React.ReactElement {
  const fs = useFieldState(name)
  // Always-controlled. Initialize to '' (not undefined) so Base UI's Select
  // doesn't see the value flip from undefined → string when the user picks
  // an option (warns: "changing the uncontrolled value state to controlled").
  const [localValue, setLocalValue] = useState<string>(defaultValue ?? '')
  const value = fs.controlled
    ? (fs.value !== undefined && fs.value !== null ? String(fs.value) : '')
    : localValue
  // Locally-appended options from inline create. Survives until the next
  // server-canonical re-resolve (live() roundtrip or full submit) — when
  // that lands, the canonical `options(fn)` resolver wins. Until then, the
  // newly-created option is part of the visible option list and round-trips
  // through submit via the hidden input below.
  const [extraOptions, setExtraOptions] = useState<NewOption[]>([])
  const allOptions = extraOptions.length > 0
    ? [...options, ...extraOptions]
    : options
  // Base UI Select's onValueChange is a callback (no native bubbling
  // change event). Inner-Repeater rows need the explicit triggerLive
  // in both paths to fire `live()` re-resolve. Pass the new value as
  // `valueOverride` so dotted-path inner fields hit the right slot.
  const onValueChange = (v: string | null): void => {
    const next = v ?? ''
    if (fs.controlled) { fs.setValue(next); fs.triggerLive(next) }
    else { setLocalValue(next); fs.triggerLive(next) }
  }

  const onCreated = (option: NewOption): void => {
    setExtraOptions(prev => [...prev, option])
    if (fs.controlled) { fs.setValue(option.value); fs.triggerLive(option.value) }
    else { setLocalValue(option.value); fs.triggerLive(option.value) }
  }

  // Cross-tree applier registration. FieldShell's generic applier writes
  // to the matching `[name]` input via the React prototype-descriptor
  // setter — but Base UI Select isn't driven by the hidden `<input>` in
  // this component, it's driven by `value`/`localValue` React state. So
  // a DOM write moves the hidden input but leaves the visible select
  // unchanged. Register a Select-aware applier that writes to local
  // state instead. FieldShell skips the generic registration for
  // fieldType === 'select' so this one stays the winner.
  const fsRef = useRef(fs)
  useEffect(() => { fsRef.current = fs }, [fs])
  const formId = useContext(FormIdContext) || undefined
  useEffect(() => {
    if (name.includes('.')) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      const next = suggestion.suggestedValue == null ? '' : String(suggestion.suggestedValue)
      const cur = fsRef.current
      if (cur.controlled) { cur.setValue(next); cur.triggerLive(next) }
      else { setLocalValue(next); cur.triggerLive(next) }
    }
    return registerPendingSuggestionApplier(formId, name, applier)
  }, [name, formId])

  const showCreateTrigger = createOption !== undefined
    && typeof createOption.url === 'string'
    && createOption.url.length > 0

  const select = (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as string)}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger className="w-full" id={name}>
        <SelectValue placeholder={placeholder ?? 'Select…'} />
      </SelectTrigger>
      <SelectContent>
        {allOptions.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={(o as { disabled?: boolean }).disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <>
      <input type="hidden" name={name} value={value} />
      {showCreateTrigger ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">{select}</div>
          <CreateOptionTrigger
            url={createOption!.url!}
            schema={createOption!.schema}
            fieldLabel={fieldLabel ?? name}
            onCreated={onCreated}
          />
        </div>
      ) : select}
    </>
  )
}

/**
 * "+" icon-button next to the Select trigger that opens a Dialog hosting
 * the resolved `createOption.schema` as a controlled mini-form. Submit
 * POSTs `{ values }` JSON to the stamped url; on success appends + selects
 * the returned option.
 */
function CreateOptionTrigger({
  url, schema, fieldLabel, onCreated,
}: {
  url:        string
  schema:     ElementMeta[]
  fieldLabel: string
  onCreated:  (option: NewOption) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { notify } = useToast()

  const reset = (): void => {
    setErrors({})
    setServerError(null)
    setSubmitting(false)
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setSubmitting(true)
    setServerError(null)
    setErrors({})

    const fd = new FormData(e.currentTarget)
    const values = formDataToValues(fd)

    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify({ values }),
      })
      const data = await res.json().catch(() => ({})) as {
        ok?:     boolean
        option?: NewOption
        errors?: Record<string, string[]>
        error?:  string
      }
      if (res.status === 422) {
        setErrors(data.errors ?? {})
        setSubmitting(false)
        return
      }
      if (!res.ok || !data.ok || !data.option) {
        setServerError(String(data.error ?? `Request failed (${res.status})`))
        setSubmitting(false)
        return
      }
      onCreated(data.option)
      setOpen(false)
      reset()
      notify({ type: 'success', title: `${fieldLabel} created` })
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Submit failed')
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Create ${fieldLabel}`}
        onClick={() => { reset(); setOpen(true) }}
      >
        <PlusIcon className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); setOpen(o) }}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{`Create ${fieldLabel}`}</DialogTitle>
              <DialogDescription className="sr-only">
                {`Create a new ${fieldLabel} option to select.`}
              </DialogDescription>
            </DialogHeader>
            {schema.length > 0 && (
              <div className="flex flex-col gap-3 py-2">
                {schema.map((child, i) => renderFormChild(child, i, {}, errors))}
              </div>
            )}
            {serverError && (
              <p className="py-2 text-sm text-destructive">{serverError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Working…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Convert a FormData snapshot into the `{ name: value }` shape the
 * `formCreateOptionData` builder expects for `coerceFormValues`.
 *
 * - Skips `_formId` / `_method` framework keys (a FormStateProvider above
 *   us could conceivably emit them, though our modal renders bare).
 * - Repeated keys (multi-select / checkbox-list) accumulate into arrays.
 * - File entries collapse to '' — createOption forms that accept files
 *   already pre-resolve uploads to URL strings via FileUploadField's
 *   hidden input, so the File slot is ignored.
 */
function formDataToValues(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, raw] of fd.entries()) {
    if (k === '_formId' || k === '_method') continue
    const v = typeof raw === 'string' ? raw : ''
    if (k in out) {
      const prev = out[k]
      if (Array.isArray(prev)) prev.push(v)
      else out[k] = [prev, v]
    } else {
      out[k] = v
    }
  }
  return out
}
