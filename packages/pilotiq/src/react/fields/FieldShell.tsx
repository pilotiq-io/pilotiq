import React, { useContext, useEffect, useRef } from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import { getIcon } from '../../icons/registry.js'
import { usePendingSuggestions, usePendingSuggestionsForField, type PendingSuggestion } from '../PendingSuggestionsContext.js'
import { getPendingSuggestionOverlay } from '../PendingSuggestionOverlayRegistry.js'
import { registerPendingSuggestionApplier, type PendingSuggestionApplier } from '../PendingSuggestionApplierRegistry.js'
import { FormIdContext, useFieldState } from '../FormStateContext.js'
import { getFieldPresenceComponent } from '../FieldPresenceRegistry.js'
import { getFieldFocusReporter } from '../FieldFocusReporterRegistry.js'
import { useCollabRoom } from '../CollabRoomContext.js'
import { getCollabTextRenderer } from '../CollabTextRendererRegistry.js'
import { getMarkdownEditor } from '../MarkdownEditorRegistry.js'

/**
 * Field types whose visible state is driven by React (not by a matching
 * `[name]` DOM input). Each registers its own applier inside the field
 * renderer; FieldShell skips its generic DOM-write applier for these so
 * the field-owned applier stays last-write-wins in the registry. Keep in
 * sync with the per-field `useEffect(registerPendingSuggestionApplier…)`
 * blocks under `react/fields/`.
 */
const SELF_APPLIER_FIELD_TYPES = new Set<string>([
  'select',
  'toggle',
  'slider',
  'color',
  'keyValue',
  'fileUpload',
  'tagsInput',
  'dateTime',
  'radio',
  'checkboxList',
])

/**
 * Shared chrome around every field input — label + required asterisk +
 * helper text + prefix/suffix decoration. The actual input component
 * is passed as `children`. Keeps `renderField` in `SchemaRenderer.tsx`
 * lean: dispatcher above, layout here.
 *
 * Decoration: `prefix` / `suffix` may be a plain string or an icon
 * descriptor (`{ icon: 'name' }` / `{ icon: { class } }`). Strings
 * render inside a muted-foreground span; icons resolve via the
 * registry. When neither prefix nor suffix is present the input
 * renders without any extra wrapper to preserve the legacy DOM.
 */
export interface FieldShellProps {
  el:        ElementMeta
  name:      string
  label:     string
  required:  boolean
  children:  React.ReactNode
  /** Optional ReactNode rendered to the left of the input, after the
   *  passive `prefix` decoration (when set). Used by `TextField`'s
   *  `prefixAction()` / mask / datalist / etc. — composes with the
   *  passive `prefix` slot rather than replacing it. */
  before?:   React.ReactNode
  /** Right-of-input counterpart. Used by `revealable() / copyable() /
   *  suffixAction()`. Renders after the passive `suffix` decoration. */
  after?:    React.ReactNode
  /** Optional ReactNode rendered inline next to the label — used by
   *  plugins that register via `registerFieldLabelSlot()`. */
  labelSlot?: React.ReactNode
}

export function FieldShell({ el, name, label, required, children, before, after, labelSlot }: FieldShellProps): React.ReactElement {
  const prefix     = el['prefix']     as string | { icon: string } | undefined
  const suffix     = el['suffix']     as string | { icon: string } | undefined
  const helperText = el['helperText'] as string | undefined
  const inline     = el['inlineLabel'] === true
  const hiddenLabel = el['hiddenLabel'] === true
  const wrapperAttrs = pickWrapperAttrs(el)

  // Pending-suggestion overlay (Plan 6/7). RichText fields render the diff
  // inline inside the editor instead — they opt out via the hidden marker
  // below. Other field types pick up the slot whenever a plugin (e.g.
  // `@pilotiq-pro/ai`) has registered a renderer AND there's a matching
  // suggestion in the queue.
  const fieldType = el['fieldType'] as string | undefined
  // `isTiptapMounted` widens "richtext only" to every field whose visible
  // surface is actually a Tiptap editor — covers MarkdownField (always
  // Tiptap via `MarkdownEditor`) and TextField / TextareaField when a
  // collab room is active (uses `CollabTextRenderer` via @pilotiq/tiptap).
  // For these the editor renders inline-diff Approve/Reject chips and owns
  // its own applier through `useAiSuggestionBridge` — FieldShell hides the
  // legacy overlay AND skips registering its DOM-write applier so the
  // bridge's applier stays last-write-wins.
  const collabRoom = useCollabRoom()
  const hasCollabTextRenderer = getCollabTextRenderer() !== null
  const hasMarkdownEditor = getMarkdownEditor() !== null
  const isTextLikeCollab =
    (fieldType === 'text' || fieldType === 'textarea') &&
    collabRoom !== null && hasCollabTextRenderer
  const isMarkdownTiptap = fieldType === 'markdown' && hasMarkdownEditor
  const isRichText = fieldType === 'richtext' || isMarkdownTiptap || isTextLikeCollab
  // Field types that drive their visible state from React (not from a
  // matching `[name]` DOM input) register their own applier — see
  // `SelectFieldInput` for the canonical example. FieldShell's generic
  // DOM-write applier would silently no-op on these, and (since parent
  // effects run AFTER children) would overwrite the field-owned applier
  // in the registry. Skip registration here so the field-owned applier
  // stays the winner.
  const ownsApplier = fieldType !== undefined && SELF_APPLIER_FIELD_TYPES.has(fieldType)
  const { list: pending, dismiss } = usePendingSuggestionsForField(name)
  const { approve } = usePendingSuggestions()
  const Overlay = isRichText ? null : getPendingSuggestionOverlay()
  const overlaySuggestion = pending[0] ?? null
  // Approve routes through the cross-tree applier registry (Phase 8.5)
  // so field types that own their visible state (Select / Toggle / Slider /
  // Color / etc.) get their registered applier — not the overlay's
  // hardcoded `field.setValue` + DOM-write fallback, which would silently
  // miss the React state of those custom components. Reject just dismisses
  // and restores focus to the input so the user can keep typing without
  // a stray click.
  const onReject = (): void => {
    dismiss(overlaySuggestion!.id)
    if (typeof document === 'undefined') return
    queueMicrotask(() => {
      const el = document.getElementsByName(name)[0]
      if (el instanceof HTMLElement) el.focus()
    })
  }
  const overlayNode = Overlay && overlaySuggestion ? (
    <Overlay
      suggestion={overlaySuggestion}
      onApprove={() => approve(overlaySuggestion.id)}
      onReject={onReject}
      {...(fieldType !== undefined ? { fieldType } : {})}
      el={el}
    />
  ) : null

  // Cross-tree applier registration (Phase 8.5). Lets aggregate consumers
  // (e.g. a chat-sidebar pending-pill living outside the form's React
  // tree) reach this field's mutator via
  // `PendingSuggestionApplierRegistry`. Skipped for richtext — the
  // Tiptap bridge registers its own editor-command applier. Skipped for
  // dotted-path fields (Repeater inner rows) since `useFieldState` is
  // a no-op for them; pill-driven approve falls back to `dismiss` which
  // is the right semantics (pill cannot reach into row state).
  const fieldState = useFieldState(name)
  const fieldStateRef = useRef(fieldState)
  useEffect(() => { fieldStateRef.current = fieldState }, [fieldState])
  const formId = useContext(FormIdContext) || undefined
  useEffect(() => {
    if (isRichText) return
    if (ownsApplier) return
    if (name.includes('.')) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      const fs = fieldStateRef.current
      if (fs.controlled) {
        fs.setValue(suggestion.suggestedValue)
      } else {
        applyToUncontrolledInputs(name, suggestion.suggestedValue)
      }
    }
    return registerPendingSuggestionApplier(formId, name, applier)
  }, [isRichText, ownsApplier, name, formId])

  const labelClass = hiddenLabel
    ? 'sr-only'
    : 'text-sm font-medium leading-none'
  // Phase F4 — presence chip + focus reporter slots. The chip mounts
  // alongside the label so remote-focus indicators don't shift the
  // input geometry; the focus reporter sits on the outer wrapper using
  // capture-phase listeners so any inner-input focus event flows
  // through. Both slots are gated on `meta.collab !== false` (Q3 from
  // the F-plan — opted-out fields are fully invisible to the collab
  // layer) AND on the field having a stable top-level name (dotted-path
  // Repeater rows skip presence in v1 — Phase F.5).
  const collabOptedOut = (el as { collab?: boolean })['collab'] === false
  const dottedName     = name.includes('.')
  const presenceSlotEligible = !collabOptedOut && !dottedName
  const PresenceChip = presenceSlotEligible ? getFieldPresenceComponent() : null
  const focusReporter = presenceSlotEligible ? getFieldFocusReporter() : null

  const labelEl = label !== '' ? (
    <label htmlFor={name} className={labelClass}>
      {label}{required && <span className="text-destructive ml-0.5">*</span>}
      {labelSlot}
      {PresenceChip && <PresenceChip fieldName={name} formId={formId ?? ''} />}
    </label>
  ) : null

  const hasDecoration = !!(prefix || suffix || before || after)
  const input = hasDecoration
    ? (
      <div className="flex items-center gap-2">
        {before}
        {prefix && <Decoration content={prefix} side="prefix" />}
        <div className="flex-1 min-w-0">{children}</div>
        {suffix && <Decoration content={suffix} side="suffix" />}
        {after}
      </div>
    )
    : children

  // When a suggestion is pending we hide the real input visually but
  // keep it in the DOM — both so the applier's DOM-write fallback can
  // resolve `[name="…"]` and so the input doesn't unmount + lose its
  // typed value. The wrapper div is rendered unconditionally (just
  // toggling a class) — switching between bare input and wrapped input
  // would unmount the uncontrolled `<input>`, resetting its value to
  // `defaultValue` and silently undoing the approved write right after
  // the overlay closes.
  const inputBlock = (
    <>
      <div className={overlayNode !== null ? 'hidden' : 'contents'} aria-hidden={overlayNode !== null}>
        {input}
      </div>
      {overlayNode}
    </>
  )

  // Capture-phase focus / blur dispatch — runs even when the inner
  // input is wrapped in custom NodeViews (Select / Date / Slider). One
  // wrapper-level handler covers every controlled input in the tree.
  const onFocusCapture = focusReporter
    ? () => focusReporter.onFocus({ fieldName: name, formId: formId ?? '' })
    : undefined
  const onBlurCapture = focusReporter
    ? () => focusReporter.onBlur({ fieldName: name, formId: formId ?? '' })
    : undefined

  if (inline) {
    return (
      <div
        className="flex items-baseline gap-3"
        {...wrapperAttrs}
        {...(onFocusCapture ? { onFocusCapture } : {})}
        {...(onBlurCapture  ? { onBlurCapture  } : {})}
      >
        {labelEl && <div className="min-w-32 pt-2">{labelEl}</div>}
        <div className="min-w-0 flex-1">
          {inputBlock}
          {helperText && (
            <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-1.5"
      {...wrapperAttrs}
      {...(onFocusCapture ? { onFocusCapture } : {})}
      {...(onBlurCapture  ? { onBlurCapture  } : {})}
    >
      {labelEl}
      {inputBlock}
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  )
}

/**
 * Best-effort DOM apply for forms without a `<FormStateProvider>` (i.e.
 * forms whose fields aren't `live()`). Walks every `[name="…"]` input,
 * uses React's internal value-setter (`Object.getOwnPropertyDescriptor`)
 * so the change is visible to `onChange` handlers + uncontrolled
 * `defaultValue` paths. Coercion is intentionally minimal — `String()`
 * for primitives, `JSON.stringify` for objects/arrays.
 *
 * Used by FieldShell's pending-suggestion applier and exposed for
 * plugins that need the same fallback.
 */
function applyToUncontrolledInputs(fieldName: string, value: unknown): void {
  if (typeof document === 'undefined') return
  const stringValue = typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : safeStringify(value)

  const elements = document.getElementsByName(fieldName)
  for (const el of Array.from(elements)) {
    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox') {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set
        setter?.call(el, Boolean(value))
      } else {
        setNativeValue(HTMLInputElement.prototype, el, stringValue)
      }
    } else if (el instanceof HTMLTextAreaElement) {
      setNativeValue(HTMLTextAreaElement.prototype, el, stringValue)
    } else if (el instanceof HTMLSelectElement) {
      setNativeValue(HTMLSelectElement.prototype, el, stringValue)
    } else {
      continue
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
}

function setNativeValue(proto: object, el: HTMLElement, value: string): void {
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  desc?.set?.call(el, value)
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  try { return JSON.stringify(value) ?? '' }
  catch { return '' }
}

/**
 * Merge `extraAttributes` (Filament-parity short name) and
 * `extraFieldWrapperAttributes` (verbose alias) into one record. Latter
 * wins on key collisions so callers who set both can override.
 */
function pickWrapperAttrs(el: ElementMeta): Record<string, string | number | boolean> {
  const a = el['extraAttributes']             as Record<string, string | number | boolean> | undefined
  const b = el['extraFieldWrapperAttributes'] as Record<string, string | number | boolean> | undefined
  if (!a && !b) return {}
  return { ...(a ?? {}), ...(b ?? {}) }
}

function Decoration({ content, side }: {
  content: string | { icon: string }
  side:    'prefix' | 'suffix'
}): React.ReactElement {
  if (typeof content === 'string') {
    return (
      <span className="text-sm text-muted-foreground shrink-0" data-side={side}>
        {content}
      </span>
    )
  }
  return <DecorationIcon name={content.icon} />
}

function DecorationIcon({ name }: { name: string }): React.ReactElement | null {
  const Icon = getIcon(name) as React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }> | undefined
  if (!Icon) return null
  return <Icon className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
}
