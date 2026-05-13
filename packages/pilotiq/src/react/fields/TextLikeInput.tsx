import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import type { TextBinding } from '../FormCollabBindingRegistry.js'
import { useFieldState } from '../FormStateContext.js'
import { Input } from '../ui/input.js'
import { Textarea } from '../ui/textarea.js'
import { computeDelta, preserveCursor } from './textDelta.js'

/**
 * Bridge between controlled (FormStateProvider) and uncontrolled
 * (defaultValue) modes for text-style inputs. When inside a form with
 * `live()` fields, the input is bound to the context's values map and
 * fires the live trigger on change/blur according to the field's `live`
 * config. Outside a controlled form, falls back to plain `defaultValue`.
 *
 * **Phase F.6 — character-level CRDT branch.** When a `<RecordCollabRoom>`
 * is mounted up-tree AND `@pilotiq-pro/collab`'s binding registered a
 * `TextBinding` for this field (text-shaped fieldType + `.collab() !== false`),
 * the input takes the `BoundTextInput` path: edits emit `TextDelta`s to
 * the binding's `Y.Text`, remote changes flow back via `observe`, and
 * cursor position survives both. The legacy whole-string LWW path
 * still runs for non-text fields, non-collab forms, and masked inputs
 * (mask + character-level CRDT is incompatible — peers would see raw
 * keystrokes desynced from the rendered mask).
 */
export function TextLikeInput({
  el, name, common, type, extraProps, multiline, applyMask,
}: {
  el:         ElementMeta
  name:       string
  common:     Record<string, unknown>
  type:       string
  extraProps: Record<string, unknown>
  multiline:  boolean
  /** Optional keystroke formatter — `TextField.mask(pattern)`. When
   *  set, every change runs the value through this fn before it lands
   *  in state / the DOM. Defaults to identity. */
  applyMask?: (value: string) => string
}): React.ReactElement {
  const fs = useFieldState(name)
  const liveCfg = el['live']
  const liveOpts = (typeof liveCfg === 'object' && liveCfg !== null
    ? liveCfg as { onBlur?: boolean; debounce?: number }
    : {})
  const onBlurMode = liveOpts.onBlur === true
  const mask = applyMask ?? identity

  // Phase F.6 — character-level CRDT path. Masking is mutually exclusive
  // with character-level CRDT (peers would see raw keystrokes diverged
  // from the local mask render); masked fields fall through to LWW.
  // We read the mask from the field meta directly — `applyMask` is a
  // `useCallback`-wrapped fn that's *always* defined (identity when no
  // mask), so its truthiness can't gate the branch.
  const hasMask = typeof el['mask'] === 'string'
  if (fs.textBinding && !hasMask) {
    return (
      <BoundTextInput
        binding={fs.textBinding}
        name={name}
        triggerLive={fs.triggerLive}
        onBlurMode={onBlurMode}
        common={common}
        extraProps={extraProps}
        type={type}
        multiline={multiline}
      />
    )
  }

  if (fs.controlled) {
    const ctxValue = fs.value !== undefined && fs.value !== null ? String(fs.value) : ''
    const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      const formatted = mask(e.target.value)
      fs.setValue(formatted)
      if (!onBlurMode) fs.triggerLive()
    }
    const onBlur = (): void => {
      if (onBlurMode) fs.triggerLive()
    }
    const props = {
      ...common,
      ...extraProps,
      defaultValue: undefined,
      value:        ctxValue,
      onChange,
      onBlur,
    }
    if (multiline) return <Textarea {...(props as React.ComponentProps<typeof Textarea>)} />
    return <Input {...(props as React.ComponentProps<typeof Input>)} type={type} />
  }

  // Uncontrolled path with mask: wire onInput so the user sees the
  // formatted value as they type. Without `applyMask`, fall through to
  // the legacy bare-defaultValue render so the DOM stays unchanged.
  if (applyMask) {
    const onInput = (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      const target = e.currentTarget
      target.value = mask(target.value)
    }
    if (multiline) return <Textarea {...(common as React.ComponentProps<typeof Textarea>)} {...extraProps} onInput={onInput} />
    return <Input {...(common as React.ComponentProps<typeof Input>)} type={type} {...extraProps} onInput={onInput} />
  }

  if (multiline) return <Textarea {...(common as React.ComponentProps<typeof Textarea>)} {...extraProps} />
  return <Input {...(common as React.ComponentProps<typeof Input>)} type={type} {...extraProps} />
}

/**
 * Phase F.6 — CRDT-bound text input. Owns its own controlled state
 * because the binding's `Y.Text` is the source of truth (not the
 * form's `values` map). Mirrors every committed value back into the
 * form context via `fs.setValue` so submission / live re-resolve see
 * the latest string.
 *
 * Lifecycle:
 *   - Mount: seed local state from `binding.read()`; mirror it into
 *     the form's `values` map.
 *   - Local edit: compute a `TextDelta` (insert / delete / replace)
 *     from the before/after strings and `applyDelta` to the binding.
 *     Eagerly update local state in the same React render so the
 *     controlled input doesn't lag the keystroke.
 *   - Remote edit: `binding.observe` fires with the post-change
 *     string; we replace local state and best-effort preserve the
 *     local cursor via `preserveCursor`. The local-echo of our own
 *     `applyDelta` is collapsed by the value-equality check.
 *   - IME composition: `applyDelta` is deferred to `compositionend`
 *     so the binding never sees intermediate composing chars (which
 *     would emit one delta per keystroke and confuse downstream
 *     observers).
 */
function BoundTextInput({
  binding, name, triggerLive, onBlurMode, common, extraProps, type, multiline,
}: {
  binding:     TextBinding
  name:        string
  triggerLive: (valueOverride?: unknown) => void
  onBlurMode:  boolean
  common:      Record<string, unknown>
  extraProps:  Record<string, unknown>
  type:        string
  multiline:   boolean
}): React.ReactElement {
  const fs = useFieldState(name)
  // SSR-rendered default. Captured once at mount; used as display
  // fallback while the room's `Y.Text` is still empty (the seed race
  // for Y.Text isn't safe across concurrent first-mounters, so no peer
  // populates it client-side — see `@pilotiq-pro/collab` for the
  // rationale). First user edit emits a replace-from-empty delta that
  // atomically lifts the displayed value into the CRDT.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fallback    = useMemo(() => stringValue(fs.value), [])
  const [value, setValueLocal] = useState<string>(() => binding.read() || fallback)
  const valueRef    = useRef<string>(value)
  const isComposing = useRef<boolean>(false)
  const inputRef    = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => { valueRef.current = value }, [value])

  // Stable ref to the form-mirror writer so the observer effect below
  // doesn't tear down on every render (fs.setValue is a fresh arrow on
  // every useFieldState call).
  const mirrorRef = useRef<(v: string) => void>(() => {})
  useEffect(() => {
    mirrorRef.current = (v: string): void => { fs.setValue(v) }
  })

  // On mount / binding swap: read the binding's current state. If
  // non-empty (i.e. someone else has already typed), display it and
  // mirror into the form values map. If empty, leave the fallback
  // showing — no client-side seed (see file-header comment).
  useEffect(() => {
    const initial = binding.read()
    if (initial.length > 0) {
      setValueLocal(initial)
      valueRef.current = initial
      mirrorRef.current(initial)
    }
  }, [binding])

  // Subscribe to text-CRDT changes. Yjs fires this for BOTH local and
  // remote transactions — local echoes are collapsed by the
  // `next === prev` guard.
  useEffect(() => {
    const unsubscribe = binding.observe((next) => {
      const prev = valueRef.current
      if (next === prev) return
      const el = inputRef.current
      const cursor = el?.selectionStart ?? next.length
      const restored = preserveCursor(prev, next, cursor)
      setValueLocal(next)
      valueRef.current = next
      mirrorRef.current(next)
      // Defer cursor restore until after React commits. Only reapply
      // when the input is still focused — yanking the selection on a
      // blurred field would steal focus across the page.
      requestAnimationFrame(() => {
        if (!el) return
        if (document.activeElement !== el) return
        try { el.setSelectionRange(restored, restored) } catch { /* setSelectionRange unsupported on some input types — defensive */ }
      })
    })
    return unsubscribe
  }, [binding])

  const commitDelta = useCallback((after: string): void => {
    // Compute the delta against the binding's *current* Y.Text contents
    // — not the renderer's `before` ref. The two can diverge in three
    // cases that all converge correctly under this approach:
    //   1. First edit when Y.Text is empty: delta = `insert@0 <whole>`,
    //      which atomically lifts the displayed fallback into the CRDT
    //      without a separate seed op.
    //   2. After a remote-applied update: Y.Text holds the peer's value;
    //      computing against it avoids "ghost" deltas that re-emit ops
    //      against a stale local ref.
    //   3. After a server-resolve `triggerLive` replace: same as (2).
    const before = binding.read()
    if (after === before) return
    const delta = computeDelta(before, after)
    if (!delta) return
    binding.applyDelta(delta)
    // Eager local + form-map update so the controlled input doesn't
    // wait on the observer echo to render the new keystroke. Observer
    // will fire with the same string and short-circuit via the equality
    // check above.
    setValueLocal(after)
    valueRef.current = after
    mirrorRef.current(after)
    if (!onBlurMode) triggerLive(after)
  }, [binding, onBlurMode, triggerLive])

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    if (isComposing.current) {
      // IME mid-composition — paint locally, hold the delta until commit.
      setValueLocal(e.target.value)
      return
    }
    commitDelta(e.target.value)
  }

  const onCompositionStart = (): void => { isComposing.current = true }
  const onCompositionEnd   = (e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    isComposing.current = false
    commitDelta(e.currentTarget.value)
  }

  const onBlur = (): void => {
    if (onBlurMode) triggerLive(valueRef.current)
  }

  const setRef = (el: HTMLInputElement | HTMLTextAreaElement | null): void => {
    inputRef.current = el
  }

  const props = {
    ...common,
    ...extraProps,
    defaultValue: undefined,
    value,
    onChange,
    onBlur,
    onCompositionStart,
    onCompositionEnd,
    ref: setRef,
  }

  if (multiline) return <Textarea {...(props as React.ComponentProps<typeof Textarea>)} />
  return <Input {...(props as React.ComponentProps<typeof Input>)} type={type} />
}

function identity(v: string): string { return v }

function stringValue(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  return String(v)
}
