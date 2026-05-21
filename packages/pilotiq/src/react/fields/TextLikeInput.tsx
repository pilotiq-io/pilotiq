import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import { useFieldState } from '../FormStateContext.js'
import { useCollabRoom } from '../CollabRoomContext.js'
import { getCollabTextRenderer, type CollabTextRenderer } from '../CollabTextRendererRegistry.js'
import { useRowCoords } from '../RowCoordsContext.js'
import { parseRowFieldPath } from '../formStateHelpers.js'
import { Input } from '../ui/input.js'
import { Textarea } from '../ui/textarea.js'

/**
 * Bridge between controlled (FormStateProvider) and uncontrolled
 * (defaultValue) modes for text-style inputs. When inside a form with
 * `live()` fields, the input is bound to the context's values map and
 * fires the live trigger on change/blur according to the field's `live`
 * config. Outside a controlled form, falls back to plain `defaultValue`.
 *
 * **Collab branch — Tiptap-backed `Y.XmlFragment`.** When a
 * `<RecordCollabRoom>` is mounted up-tree AND `@pilotiq/tiptap`'s
 * `registerTiptap()` registered a collab text renderer, the input
 * mounts the Tiptap-backed editor against a `Y.XmlFragment` keyed by
 * either the bare field name (top-level) or
 * `${arrayName}.${rowId}.${fieldName}` (Repeater / Builder row leaves
 * via `useRowCoords()`). Selections anchor to `Y.RelativePosition` via
 * y-prosemirror, so cursors survive both mid-word remote edits and
 * concurrent inserts. Masked fields fall through to the legacy
 * whole-string LWW path (mask + character-level CRDT is incompatible
 * — peers would see raw keystrokes desynced from the rendered mask).
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
  const room = useCollabRoom()
  const collabRenderer = getCollabTextRenderer()
  const rowCoords = useRowCoords()
  const liveCfg = el['live']
  const liveOpts = (typeof liveCfg === 'object' && liveCfg !== null
    ? liveCfg as { onBlur?: boolean; debounce?: number }
    : {})
  const onBlurMode = liveOpts.onBlur === true
  const mask = applyMask ?? identity

  // Masking is mutually exclusive with character-level CRDT (peers would
  // see raw keystrokes diverged from the local mask render); masked
  // fields fall through to LWW. We read the mask from the field meta
  // directly — `applyMask` is a `useCallback`-wrapped fn that's *always*
  // defined (identity when no mask), so its truthiness can't gate the
  // branch.
  const hasMask = typeof el['mask'] === 'string'

  // Collab branch — Tiptap-backed plain-text editor. Top-level fields
  // use the bare `name` as the fragment-key; Repeater / Builder row
  // leaves compose `${arrayName}.${rowId}.${fieldName}` from
  // `useRowCoords()` so the Y.XmlFragment survives row reorders (keyed
  // by the stable rowId, not the array index). The hidden FormData
  // input keeps the original dotted path so submission lands on the
  // server at the right slot.
  //
  // Dotted paths that don't match a row shape (no rowCoords OR
  // `parseRowFieldPath` returns null — nested row arrays, malformed
  // names) skip the collab path and fall through to the controlled /
  // uncontrolled branches below.
  const fieldCollab = el['collab'] as boolean | undefined
  // Auto-upgrade to the Tiptap-backed editor whenever the field has AI
  // agents attached, even outside collab — the inline-diff chip widget
  // (red strikethrough on the current value + green chip with the suggested
  // text + ✓/✕) needs a real ProseMirror surface to render. The renderer
  // handles `useCollabRoom() === null` cleanly (mounts the editor without
  // the Yjs Collaboration extension), so this widening doesn't force a
  // collab room.
  //
  // `field.ai([…])` from `@pilotiq-pro/ai` lands on `FieldMeta.aiActions`
  // as a resolved `PilotiqAgentMeta[]`. Read the array; non-empty means
  // "this field has AI surfaces wired".
  const aiActions = el['aiActions']
  const hasAi = Array.isArray(aiActions) && aiActions.length > 0
  const fragmentKey: string | null = (() => {
    if (!name.includes('.')) return name
    if (!rowCoords) return null
    const parsed = parseRowFieldPath(name)
    if (!parsed) return null
    if (parsed.arrayName !== rowCoords.arrayName) return null
    if (parsed.index     !== rowCoords.rowIndex)  return null
    return `${rowCoords.arrayName}.${rowCoords.rowId}.${parsed.fieldName}`
  })()
  if (
    (room || hasAi) &&
    collabRenderer &&
    fieldCollab !== false &&
    !hasMask &&
    fragmentKey !== null
  ) {
    return (
      <CollabTextField
        Renderer={collabRenderer}
        fragmentKey={fragmentKey}
        hiddenInputName={name}
        multiline={multiline}
        defaultValue={stringValue(common['defaultValue'])}
        {...(common['placeholder'] !== undefined ? { placeholder: String(common['placeholder']) } : {})}
        disabled={Boolean(common['disabled'])}
        triggerLive={fs.triggerLive}
        setValue={fs.setValue}
        controlled={fs.controlled}
        onBlurMode={onBlurMode}
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
 * Wrapper around the registered Tiptap-backed collab editor.
 * Owns the local text mirror so the hidden `<input>` always carries the
 * editor's current value for FormData submission. When `FormStateProvider`
 * is mounted up-tree, also mirrors every update into the values map via
 * `fs.setValue` so `$get/$set` computations and any Y.Map LWW path (kept
 * for non-text consumers) stay in sync.
 *
 * No IME / cursor-preservation gymnastics in here — the underlying Tiptap
 * editor handles composition natively and y-prosemirror anchors selections
 * to `Yjs.RelativePosition`, so the cursor survives concurrent + mid-word
 * remote edits without any client-side bookkeeping.
 *
 * `fragmentKey` and `hiddenInputName` diverge for row-text leaves (Phase
 * 1 of collab-row-text-tiptap-backed.md): the renderer's Y.XmlFragment is
 * keyed by `${arrayName}.${rowId}.${fieldName}` so it survives row
 * reorders, while the hidden FormData input keeps the dotted path
 * (`items.0.title`) so submission lands at the right server-side slot.
 * For top-level fields the two are identical.
 */
function CollabTextField({
  Renderer, fragmentKey, hiddenInputName, multiline, defaultValue, placeholder, disabled,
  triggerLive, setValue, controlled, onBlurMode,
}: {
  Renderer:        CollabTextRenderer
  fragmentKey:     string
  hiddenInputName: string
  multiline:       boolean
  defaultValue:    string
  placeholder?:    string
  disabled:        boolean
  triggerLive:     (valueOverride?: unknown) => void
  setValue:        (v: unknown) => void
  controlled:      boolean
  onBlurMode:      boolean
}): React.ReactElement {
  const [text, setText] = useState<string>(defaultValue)
  const textRef = useRef(text)
  useEffect(() => { textRef.current = text }, [text])

  const handleChange = useCallback((next: string): void => {
    setText(next)
    if (controlled) setValue(next)
    if (!onBlurMode) triggerLive(next)
  }, [controlled, onBlurMode, setValue, triggerLive])

  const handleBlur = useCallback((): void => {
    if (onBlurMode) triggerLive(textRef.current)
  }, [onBlurMode, triggerLive])

  // Match the visual chrome of `<Input>` / `<Textarea>` so the editor reads
  // as a drop-in replacement. The adapter forwards this class to its
  // contenteditable wrapper; `whitespace-nowrap` on the single-line variant
  // keeps the editor from wrapping into a second line if a stray paragraph
  // split somehow makes it through.
  //
  // `overflow-x-clip` (not `auto`) on the single-line variant matters for
  // `CollaborationCaret` presence labels: per the CSS overflow spec, setting
  // either axis to a non-visible / non-clip value (`auto` / `scroll` /
  // `hidden`) forces the other axis to compute as `auto` too — so
  // `overflow-x-auto` would clip the caret's user-name label, which renders
  // `-1.4em` above the line. `clip` is the one non-visible value that does
  // NOT force the other axis, so `overflow-y` stays `visible` and the label
  // escapes the chrome upward as designed. Trade-off: long text gets clipped
  // on the right rather than horizontally scrollable (native `<input>`
  // semantics) — acceptable for plain-text fields, where typing past the
  // visible width is rare and the caret presence label is the higher-value
  // affordance.
  const className = multiline
    ? 'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm whitespace-pre-wrap break-words'
    : 'flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm whitespace-nowrap overflow-x-clip'

  return (
    <>
      <input type="hidden" name={hiddenInputName} value={text} />
      <Renderer
        name={hiddenInputName}
        {...(fragmentKey !== hiddenInputName ? { fragmentKey } : {})}
        multiline={multiline}
        defaultValue={defaultValue}
        {...(placeholder !== undefined ? { placeholder } : {})}
        disabled={disabled}
        onChange={handleChange}
        onBlur={handleBlur}
        className={className}
      />
    </>
  )
}

function identity(v: string): string { return v }

function stringValue(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  return String(v)
}
