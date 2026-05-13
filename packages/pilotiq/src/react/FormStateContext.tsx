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
import {
  collectFieldDefaults,
  findFieldMeta,
  parseFormDataToNested,
  readNestedValue,
  writeNestedValue,
} from './formStateHelpers.js'
import { runJsHandler } from './fieldJsHandler.js'
import { useToast } from './Toaster.js'
import { useCollabRoom } from './CollabRoomContext.js'
import { getFormCollabBinding, type FormCollabBinding } from './FormCollabBindingRegistry.js'

export type FieldStatus = 'idle' | 'pending'

export interface FormStateApi {
  values:        Record<string, unknown>
  setValue:      (name: string, value: unknown) => void
  /** Fire the field's `live()` re-resolve hook. Plan #14 — `valueOverride`
   *  lets uncontrolled inner-Repeater inputs pass their just-typed value
   *  through without first writing it to the controlled `values` map.
   *  When the form has a `formRef`, the latest DOM state of all
   *  uncontrolled inputs is snapshotted via FormData before posting; the
   *  override is then layered on top so the leaf carries the most recent
   *  keystroke even when the snapshot races the input's commit. */
  triggerLive:   (name: string, valueOverride?: unknown) => void
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

/**
 * Plan #14 — minimal context that lets nested renderers (e.g. RepeaterInput)
 * see the parent `<form>`'s `formId` without reaching for `useFormState`
 * (which is null on uncontrolled forms) or sniffing the DOM. `FormRenderer`
 * wraps its children in this provider; readers hit the context with
 * `useContext(FormIdContext)` and fall back to a sentinel when missing.
 */
export const FormIdContext = createContext<string>('')

/**
 * Phase F2 — returns `true` iff the named field has explicitly opted out
 * of realtime collab via `Field.collab(false)`. Sparse meta — absent =
 * inherit the panel default (collab on). Walks the form meta tree the
 * same way `findFieldMeta` does; cheap because it only runs on the
 * per-write path (already a hot path, but every check is one map
 * lookup + one boolean compare).
 */
function fieldOptsOutOfCollab(formMeta: ElementMeta, name: string): boolean {
  const meta = findFieldMeta(formMeta, name) as { collab?: boolean } | undefined
  return meta?.collab === false
}

export interface UseFieldStateResult {
  /** True when the field is inside a controlled form (live fields enabled).
   *  Renderers should fall back to their `defaultValue` path when false.
   *
   *  Plan #14 — dotted-name fields (inner Repeater rows) always return
   *  `controlled: false`. Their inputs stay uncontrolled so reorder/clone
   *  preserves typed values; the live trigger still works (snapshotting
   *  via the form's FormData at trigger time). */
  controlled:  boolean
  value:       unknown
  setValue:    (v: unknown) => void
  /** Notify the framework that this field's value has changed in a way that
   *  should trigger its `live()` hook (if configured). No-op for non-live
   *  fields and outside controlled forms. `valueOverride` lets uncontrolled
   *  inputs pass their just-typed value (for dotted-path inner Repeater
   *  fields). */
  triggerLive: (valueOverride?: unknown) => void
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
  // Dotted-path fields (inner Repeater rows) always render uncontrolled
  // — see UseFieldStateResult.controlled doc for why.
  const dotted = name.includes('.')
  return {
    controlled:  !dotted,
    value:       dotted ? undefined : ctx.values[name],
    setValue:    dotted ? () => {} : (v) => ctx.setValue(name, v),
    triggerLive: (valueOverride?: unknown) => ctx.triggerLive(name, valueOverride),
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
  /** Plan #14 — ref to the wrapping `<form>` element. When set, live
   *  triggers snapshot the form's full DOM state via `FormData` before
   *  POSTing, which captures uncontrolled inner-Repeater inputs. The
   *  controlled `values` map is overlaid on top, then any explicit
   *  `valueOverride` from `triggerLive` wins last. */
  formRef?:      React.RefObject<HTMLFormElement | null>
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
  formRef,
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
  const formId   = (formMeta as { formId?: string })['formId'] ?? ''

  // Phase F2 — collab binding. When `<RecordCollabRoom>` is mounted up-tree
  // AND `@pilotiq-pro/collab` registered a `FormCollabBinding` factory, we
  // construct a binding for this form, lift any already-synced state on
  // top of the SSR-rendered defaults, and proxy every local write through
  // it. Remote writes flow back via `subscribe`. Outside a room (or with
  // no factory registered), `bindingRef` stays null and the plain
  // local-state path runs unchanged.
  const collabRoom     = useCollabRoom()
  const bindingFactory = getFormCollabBinding()
  const bindingRef     = useRef<FormCollabBinding | null>(null)

  useEffect(() => {
    if (!collabRoom || !bindingFactory || !formId) return

    const binding = bindingFactory({ room: collabRoom, formId, initial: valuesRef.current })
    bindingRef.current = binding

    // Lift any state already in the room (subsequent joiners — first
    // mover sees an empty snapshot here and the local SSR defaults
    // stay authoritative). Shallow merge so fields the binding doesn't
    // know about (defaults the seed skipped, dotted-path Repeater rows
    // we don't sync in F2) survive.
    const synced = binding.get()
    if (Object.keys(synced).length > 0) {
      setValuesState((prev) => ({ ...prev, ...synced }))
    }

    // Subscribe to remote changes. Local writes ALSO trigger this
    // (Yjs observers fire on local transactions too) — the per-key
    // Object.is short-circuit below collapses them into no-op renders.
    const unsubscribe = binding.subscribe((snapshot) => {
      setValuesState((prev) => {
        let changed = false
        const next: Record<string, unknown> = { ...prev }
        for (const [k, v] of Object.entries(snapshot)) {
          if (!Object.is(prev[k], v)) {
            next[k] = v
            changed = true
          }
        }
        return changed ? next : prev
      })
    })

    return () => {
      unsubscribe()
      binding.destroy()
      bindingRef.current = null
    }
    // `valuesRef.current` is intentionally read once at mount — initial
    // values seed the binding; subsequent edits flow through `setValue`
    // and remote changes flow through `subscribe`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabRoom, bindingFactory, formId])

  /**
   * Tier-2 follow-up to Plan #5 — fire `Field.afterStateUpdatedJs(body)`
   * if the named field declares one. Independent of `live()`: runs
   * synchronously on every change, no debounce, no roundtrip.
   *
   * `$get / $set` proxy this provider's values map. Dotted-path names
   * (Repeater / Builder rows) read + write nested. `$state` is the
   * just-set value; `$get(thisField)` returns the same value (we
   * overlay it onto the snapshot so the handler sees a consistent
   * post-write view of the form). `$set` calls `setValuesState`
   * directly so React rerenders affected controlled inputs without
   * re-firing `live` / re-firing JS for the sibling (mirrors
   * server-side `$set` semantics — a write is not a user change).
   */
  const runFieldJs = useCallback((name: string, value: unknown): void => {
    const fieldMeta = findFieldMeta(formMetaRef.current, name)
    const body = (fieldMeta as { afterStateUpdatedJs?: string } | undefined)?.afterStateUpdatedJs
    if (!body) return

    // Snapshot the values map with the just-changed field overlaid so
    // `$get(name)` is consistent with `$state`. Cheap shallow clone —
    // only allocated when a JS handler is actually present.
    const snapshot: Record<string, unknown> = { ...valuesRef.current }
    if (name.includes('.')) writeNestedValue(snapshot, name, value)
    else snapshot[name] = value

    const $get = (n: string): unknown => {
      if (n.includes('.')) return readNestedValue(snapshot, n)
      return snapshot[n]
    }
    const $set = (n: string, v: unknown): void => {
      if (n.includes('.')) {
        setValuesState((prev) => {
          const next = { ...prev }
          writeNestedValue(next, n, v)
          return next
        })
        return
      }
      setValuesState((prev) => {
        if (Object.is(prev[n], v)) return prev
        return { ...prev, [n]: v }
      })
    }

    runJsHandler({ body, fieldName: name, state: value, $get, $set })
  }, [])

  const setValue = useCallback((name: string, value: unknown): void => {
    setValuesState((prev) => {
      if (Object.is(prev[name], value)) return prev
      return { ...prev, [name]: value }
    })
    // Phase F2 — proxy the write through the collab binding when active
    // AND the field hasn't opted out via `.collab(false)`. Dotted-path
    // names (Repeater / Builder row leaves) stay local-only in v1; their
    // syncing belongs to Phase F.5 (`Y.Array<Y.Map>` row identity).
    const binding = bindingRef.current
    if (binding && !name.includes('.') && !fieldOptsOutOfCollab(formMetaRef.current, name)) {
      binding.set(name, value)
    }
    // Fire the client-side JS hook synchronously after the state write.
    // Dotted-name fields don't go through here (their setter is a no-op
    // in `useFieldState`); they fire JS via `triggerLive` instead so we
    // never double-fire for the same change.
    runFieldJs(name, value)
  }, [runFieldJs])

  const performLivePost = useCallback(async (name: string, valueOverride?: unknown): Promise<void> => {
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
      // Plan #14 — build the values payload:
      //   1. Start from controlled values (top-level fields the user has
      //      typed into via FormStateProvider's setValue path).
      //   2. If a form ref is set, overlay FormData-derived nested values
      //      so uncontrolled inputs (including inner Repeater fields)
      //      contribute their current DOM state.
      //   3. If a valueOverride is provided, write it through to the
      //      target field's path — this wins last, so the leaf carries
      //      the just-typed value even if the snapshot races a debounce.
      let payloadValues: Record<string, unknown> = { ...valuesRef.current }
      const formEl = formRef?.current
      if (formEl) {
        const snapshot = parseFormDataToNested(new FormData(formEl))
        payloadValues = { ...payloadValues, ...snapshot }
      }
      if (valueOverride !== undefined) {
        writeNestedValue(payloadValues, name, valueOverride)
      }

      const res = await doFetch(stateUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify({ changed: name, values: payloadValues }),
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
          // Phase F2 (Q2) — derived fields propagate to peers via the
          // collab binding so every client sees the auto-`slug` / etc.
          // without each peer roundtripping the server. Skip dotted-path
          // names + fields that opted out.
          const binding = bindingRef.current
          if (binding) {
            for (const [k, v] of Object.entries(serverValues)) {
              if (k.includes('.')) continue
              if (fieldOptsOutOfCollab(data.form, k)) continue
              binding.set(k, v)
            }
          }
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
  }, [stateUrl, fetchImpl, notify, onMetaUpdate, formRef])

  const triggerLive = useCallback((name: string, valueOverride?: unknown): void => {
    // Dotted-name fields (Repeater / Builder rows) bypass the controlled
    // `setValue` path entirely — fire their JS hook here so a row-scoped
    // afterStateUpdatedJs runs even without `live()`. Top-level fields
    // already had JS dispatched via `setValue`; skip to avoid double-fire.
    if (name.includes('.') && valueOverride !== undefined) {
      runFieldJs(name, valueOverride)
    }

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
        void performLivePost(name, valueOverride)
      }, debounce)
      timers.set(name, t)
      return
    }

    void performLivePost(name, valueOverride)
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
