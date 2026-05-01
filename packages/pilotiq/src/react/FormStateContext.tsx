import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ElementMeta } from '../schema/Element.js'
import { collectFieldDefaults, findFieldMeta } from './formStateHelpers.js'
import { useToast } from './Toaster.js'

export type FieldStatus = 'idle' | 'pending'

export interface FormStateApi {
  values:        Record<string, unknown>
  setValue:      (name: string, value: unknown) => void
  triggerLive:   (name: string) => void
  errors:        Record<string, string[]>
  /** Plan #8 — replace the errors map. Used by Wizard's step-validate
   *  flow to surface per-field errors returned from the wizard endpoint. */
  applyErrors:   (errors: Record<string, string[]>) => void
  formMeta:      ElementMeta
  inFlight:      boolean
  fieldStatus:   (name: string) => FieldStatus
}

const FormStateContext = createContext<FormStateApi | null>(null)

/** Hook for direct access to the form context. Returns `null` outside a
 *  `FormStateProvider` (e.g. an action modal, or a form without any live
 *  fields where the legacy uncontrolled path is in use). */
export function useFormState(): FormStateApi | null {
  return useContext(FormStateContext)
}

export interface UseFieldStateResult {
  /** True when the field is inside a controlled form (live fields enabled).
   *  Renderers should fall back to their `defaultValue` path when false. */
  controlled:  boolean
  value:       unknown
  setValue:    (v: unknown) => void
  /** Notify the framework that this field's value has changed in a way that
   *  should trigger its `live()` hook (if configured). No-op for non-live
   *  fields and outside controlled forms. */
  triggerLive: () => void
  /** True while a live re-resolve POST is in flight for this field. */
  pending:     boolean
  errors:      string[]
}

/** Per-field accessor. Inside a `FormStateProvider` it returns the controlled
 *  value + setter + live trigger; outside, it returns sentinels and callers
 *  should fall back to `defaultValue` (uncontrolled inputs). */
export function useFieldState(name: string): UseFieldStateResult {
  const ctx = useContext(FormStateContext)
  if (!ctx) {
    return {
      controlled:  false,
      value:       undefined,
      setValue:    () => {},
      triggerLive: () => {},
      pending:     false,
      errors:      [],
    }
  }
  return {
    controlled:  true,
    value:       ctx.values[name],
    setValue:    (v) => ctx.setValue(name, v),
    triggerLive: () => ctx.triggerLive(name),
    pending:     ctx.fieldStatus(name) === 'pending',
    errors:      ctx.errors[name] ?? [],
  }
}

/** Response shape from `POST {base}/.../_form/:formId/state`. */
interface FormStateResponse {
  ok:    boolean
  form?: ElementMeta
  dirty?: string[]
  errors?: Record<string, string[]>
  error?: string
}

export interface FormStateProviderProps {
  /** Initial form meta from the server. The provider tracks subsequent
   *  replacements after live POSTs internally. */
  initialMeta:   ElementMeta
  initialErrors: Record<string, string[]>
  children:      React.ReactNode
  /** Optional override fetch — used in tests. Defaults to the global `fetch`. */
  fetchImpl?:    typeof fetch
  /** Optional callback when the form meta is replaced after a live POST.
   *  Tests use this; production code reads from `useFormState().formMeta`. */
  onMetaUpdate?: (meta: ElementMeta) => void
}

/** Provider component for the controlled form path. Holds the values map,
 *  the current form meta (replaced wholesale on live POST), and the
 *  per-field live trigger. Mounted by `FormRenderer` when the form has a
 *  `stateUrl` set (i.e. at least one descendant field is `live()`). */
export function FormStateProvider({
  initialMeta,
  initialErrors,
  children,
  fetchImpl,
  onMetaUpdate,
}: FormStateProviderProps): React.ReactElement {
  const [formMeta, setFormMeta] = useState<ElementMeta>(initialMeta)
  const [values,   setValuesState] = useState<Record<string, unknown>>(
    () => collectFieldDefaults(initialMeta),
  )
  const [errors,   setErrors] = useState<Record<string, string[]>>(initialErrors)
  const [pendingNames, setPendingNames] = useState<Set<string>>(() => new Set())
  const [inFlight, setInFlight] = useState(false)

  const { notify } = useToast()

  // Track an incrementing in-flight id so out-of-order responses are dropped.
  // useRef (not useState) so React StrictMode dev double-invokes don't
  // produce stale closures over `inFlightId`.
  // See feedback_strict_mode_double_flash.md for the same pattern reasoning.
  const requestSeqRef = useRef(0)
  const latestSeenRef = useRef(0)

  // Per-field debounce timers. Mutating refs not state — never trigger a
  // re-render; just hold the timeout handle.
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  useEffect(() => () => {
    for (const t of debounceTimersRef.current.values()) clearTimeout(t)
    debounceTimersRef.current.clear()
  }, [])

  // Always-current values ref so debounced/blur callbacks read the latest
  // map without needing to be re-created on every keystroke.
  const valuesRef = useRef(values)
  useEffect(() => { valuesRef.current = values }, [values])

  // Resolve helper: read the current (synchronous) form meta. Used to look
  // up a field's `live` config when its trigger fires.
  const formMetaRef = useRef(formMeta)
  useEffect(() => { formMetaRef.current = formMeta }, [formMeta])

  const stateUrl = (formMeta as { stateUrl?: string })['stateUrl']

  const setValue = useCallback((name: string, value: unknown): void => {
    setValuesState((prev) => {
      if (Object.is(prev[name], value)) return prev
      return { ...prev, [name]: value }
    })
  }, [])

  const performLivePost = useCallback(async (name: string): Promise<void> => {
    if (!stateUrl) return
    const seq = ++requestSeqRef.current
    setPendingNames((prev) => {
      if (prev.has(name)) return prev
      const next = new Set(prev)
      next.add(name)
      return next
    })
    setInFlight(true)

    const doFetch = fetchImpl ?? fetch
    try {
      const res = await doFetch(stateUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify({ changed: name, values: valuesRef.current }),
      })

      // Drop stale responses — a newer request has already been issued.
      if (seq < latestSeenRef.current) return
      latestSeenRef.current = seq

      const data = await res.json().catch(() => ({})) as FormStateResponse

      if (!res.ok) {
        if (res.status === 422 && data.errors) {
          setErrors(data.errors)
        } else {
          notify({
            type: 'error',
            title: 'Form update failed',
            ...(data.error ? { body: data.error } : {}),
          })
        }
        return
      }

      if (data.form) {
        setFormMeta(data.form)
        onMetaUpdate?.(data.form)
        // Server may have $set'd sibling values — overlay them onto the
        // current values map. Keep client-typed values intact for fields
        // the server didn't touch.
        const serverValues = (data.form as { values?: Record<string, unknown> }).values
        if (serverValues) {
          setValuesState((prev) => ({ ...prev, ...serverValues }))
        }
        setErrors({})
      }
    } catch (err) {
      // Network / parse error — surface a toast but don't roll back values.
      // Next keystroke will retry naturally.
      notify({
        type:  'error',
        title: 'Form update failed',
        body:  err instanceof Error ? err.message : String(err),
      })
    } finally {
      setPendingNames((prev) => {
        if (!prev.has(name)) return prev
        const next = new Set(prev)
        next.delete(name)
        return next
      })
      // Only clear inFlight when no other field is pending.
      setPendingNames((prev) => {
        setInFlight(prev.size > 0)
        return prev
      })
    }
  }, [stateUrl, fetchImpl, notify, onMetaUpdate])

  const triggerLive = useCallback((name: string): void => {
    if (!stateUrl) return
    const fieldMeta = findFieldMeta(formMetaRef.current, name)
    const liveCfg = fieldMeta?.['live']
    if (!liveCfg) return

    const opts = typeof liveCfg === 'object' ? liveCfg as { onBlur?: boolean; debounce?: number } : {}
    const debounce = typeof opts.debounce === 'number' && opts.debounce > 0 ? opts.debounce : 0

    // Clear any pending debounce for this name; the new event resets the timer.
    const timers = debounceTimersRef.current
    const prevTimer = timers.get(name)
    if (prevTimer) clearTimeout(prevTimer)

    if (debounce > 0) {
      const t = setTimeout(() => {
        timers.delete(name)
        void performLivePost(name)
      }, debounce)
      timers.set(name, t)
      return
    }

    void performLivePost(name)
  }, [stateUrl, performLivePost])

  const fieldStatus = useCallback((name: string): FieldStatus => {
    return pendingNames.has(name) ? 'pending' : 'idle'
  }, [pendingNames])

  const applyErrors = useCallback((next: Record<string, string[]>): void => {
    setErrors(next)
  }, [])

  const api = useMemo<FormStateApi>(() => ({
    values,
    setValue,
    triggerLive,
    errors,
    applyErrors,
    formMeta,
    inFlight,
    fieldStatus,
  }), [values, setValue, triggerLive, errors, applyErrors, formMeta, inFlight, fieldStatus])

  return (
    <FormStateContext.Provider value={api}>
      {children}
    </FormStateContext.Provider>
  )
}
