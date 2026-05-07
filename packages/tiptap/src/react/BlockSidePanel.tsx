import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  FormFields,
  parseFormDataToNested,
  clampPanelWidth as clampPanelWidthShared,
  useResizableWidth,
} from '@pilotiq/pilotiq/react'
import type { BlockMeta } from '../Block.js'

const PANEL_WIDTH_STORAGE_KEY = 'pilotiq.tiptap.sidePanel.width'
const PANEL_WIDTH_DEFAULT     = 320
const PANEL_WIDTH_MIN         = 240
const PANEL_WIDTH_MAX         = 600

// Keys that point at any tabbable / interactive element inside the panel.
// Same intent as Filament's focus-trap helper but kept inline — small one-off.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Floating right-docked side panel for editing a custom block's schema
 * fields. Mounted by `TiptapEditor` once the user clicks the Edit button
 * on a `pilotiqBlock` NodeView; reads/writes flow through ProseMirror
 * directly (no form submit, no roundtrip).
 *
 * Why a sibling of the NodeView and not the NodeView itself:
 *   - NodeViews mount in a separate React tree (Tiptap quirk), so they
 *     can't reach pilotiq's `FormFields` renderer or any provider on
 *     the host page (Theme, Toaster, etc.). Hosting the panel here in
 *     the host's tree gives us the full pilotiq field surface for free.
 *
 * Reads: each field's `defaultValue` is overridden from the block's
 * stored `blockData`. Inputs are uncontrolled (outside `FormStateProvider`,
 * pilotiq's renderers fall back to `defaultValue` automatically).
 *
 * Writes: container-level event delegation on the form element. Every
 * change snapshots the entire form via `new FormData(formEl)` →
 * `parseFormDataToNested` (rebuilds nested arrays/objects from
 * dotted-path inputs like `myrep.0.title`) → `coerceBlockValues`
 * (per-fieldType JSON parse / boolean / number coerce so nested-shape
 * fields round-trip in their canonical wire form). The result is
 * dispatched through `state.tr.setNodeMarkup` on the tracked position.
 * The position is kept fresh by mapping it through every editor
 * transaction so live edits elsewhere in the document don't desync.
 *
 * V2 (2026-05-04 cont'd): nested-shape fields now round-trip cleanly:
 * Repeater (array of subschema rows), Builder (heterogeneous block
 * rows), TagsInput / KeyValue / FileUpload (JSON-encoded hidden
 * inputs), Markdown (plain textarea), and the standard primitives
 * (text / textarea / select / toggle / checkbox / radio / date /
 * datetime / number / slider / color / toggleButtons / checkboxList).
 */
export interface BlockSidePanelProps {
  editor:    Editor
  /** Position at open time. Tracked + remapped on every transaction. */
  initialPos: number
  /** Block type at open time — guards against the user clicking Edit on
   *  one block, then someone else's edit replacing it with a different
   *  block at the same position. */
  blockType: string
  blocks:    BlockMeta[]
  onClose:   () => void
}

export function BlockSidePanel({
  editor,
  initialPos,
  blockType,
  blocks,
  onClose,
}: BlockSidePanelProps): React.ReactElement | null {
  const meta = blocks.find((b) => b.name === blockType)

  // Live-tracked position of the block we're editing. Starts at the
  // open-time position; every editor transaction maps it forward so the
  // panel keeps writing to the same node even as the user types text
  // elsewhere in the document.
  const [pos, setPos] = useState<number | null>(initialPos)
  const posRef = useRef<number | null>(initialPos)

  // Prefilled values seed the form's `defaultValue`s. We re-read once
  // when the panel opens (and on hard re-mount via key prop); ongoing
  // edits don't snapshot the doc — the form's uncontrolled inputs hold
  // their own state until the user closes the panel.
  const initialValuesRef = useRef<Record<string, unknown>>(
    pos !== null ? readBlockData(editor, pos) : {},
  )

  const asideRef = useRef<HTMLElement | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)

  // Width memory — survives panel close/reopen and full reload via
  // localStorage. The shared `useResizableWidth` hook from
  // `@pilotiq/pilotiq/react` handles the localStorage round-trip + drag
  // pipeline; we just bind it to this panel's per-key bounds.
  const { width, onResizeStart } = useResizableWidth({
    storageKey:   PANEL_WIDTH_STORAGE_KEY,
    min:          PANEL_WIDTH_MIN,
    max:          PANEL_WIDTH_MAX,
    defaultWidth: PANEL_WIDTH_DEFAULT,
    edge:         'left',
  })

  // Save focus on mount, focus the first focusable inside the panel,
  // restore previous focus on unmount. Mount-only effect — re-mounting
  // the panel for a different block (key={pos:blockType}) re-runs this.
  useEffect(() => {
    const previouslyFocused = (typeof document !== 'undefined'
      ? document.activeElement
      : null) as HTMLElement | null
    const aside = asideRef.current
    if (aside) {
      const first = aside.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      first?.focus()
    }
    return () => {
      // Try/catch — the previously focused element may have been removed
      // (e.g. an editor selection refresh nuked the surrounding NodeView).
      try { previouslyFocused?.focus?.() } catch { /* noop */ }
    }
  }, [])

  // ESC closes; Tab / Shift+Tab cycles within the panel. Bubble-phase
  // listener — slash and mention menus' capture-phase ESC handlers fire
  // first and stopPropagation, so ESC inside an open slash menu only
  // closes the menu. ESC anywhere else (panel inputs, editor) closes
  // the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.key !== 'Tab') return
      const aside = asideRef.current
      if (!aside) return
      const active = document.activeElement as Node | null
      if (!active || !aside.contains(active)) return
      const focusables = Array.from(
        aside.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled'))
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last  = focusables[focusables.length - 1]!
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (pos === null) return
    const handler = ({ transaction }: { transaction: { mapping: { map: (p: number) => number } } }): void => {
      const current = posRef.current
      if (current === null) return
      const mapped = transaction.mapping.map(current)
      // The block was deleted — close the panel.
      const nodeNow = nodeAt(editor, mapped)
      if (!nodeNow || nodeNow.type.name !== 'pilotiqBlock' || String(nodeNow.attrs['blockType'] ?? '') !== blockType) {
        posRef.current = null
        setPos(null)
        onClose()
        return
      }
      posRef.current = mapped
      setPos(mapped)
    }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor, blockType, pos, onClose])

  const writeBack = useCallback((nextValues: Record<string, unknown>): void => {
    const at = posRef.current
    if (at === null) return
    // ProseMirror's `setNodeMarkup` lives on the transaction, not the
    // ChainedCommands surface — go through `tr` directly. Pass `null`
    // for the node-type arg to keep the existing type, just swap attrs.
    const view = (editor as unknown as { view: { dispatch: (tr: unknown) => void } }).view
    const state = (editor as unknown as { state: { tr: { setNodeMarkup: (p: number, t: null, a: Record<string, unknown>) => unknown } } }).state
    const tr = state.tr.setNodeMarkup(at, null, { blockType, blockData: nextValues })
    view.dispatch(tr)
  }, [editor, blockType])

  const handleChange = useCallback((): void => {
    const formEl = formRef.current
    if (!formEl || !meta) return
    // Snapshot the full form: nested arrays / objects materialize from
    // dotted-path names (`items.0.title`), JSON-encoded hidden inputs
    // (TagsInput / KeyValue / FileUpload-multi) sit as JSON strings,
    // toggle / checkbox hidden inputs sit as `'true' | 'false'`. The
    // coerce pass below normalizes those to canonical shapes.
    const raw = parseFormDataToNested(new FormData(formEl))
    const coerced = coerceBlockValues(raw, meta.schema)
    writeBack(coerced)
  }, [meta, writeBack])

  if (!meta || pos === null) return null

  return (
    <aside
      ref={asideRef}
      role="dialog"
      aria-label={`Edit ${meta.label}`}
      style={{ width }}
      className="absolute top-0 left-full ml-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border bg-background shadow-lg z-30"
    >
      {/* Left-edge resize handle. Thin strip, hover-highlighted, full
          height of the panel; mousedown starts a drag tracked at
          document level so leaving the strip doesn't end the drag. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        onPointerDown={onResizeStart}
        className="absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-border/80"
      />
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {meta.icon && <span aria-hidden="true">{meta.icon}</span>}
          <span className="text-sm font-medium truncate">{meta.label}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ×
        </button>
      </header>
      <form
        ref={formRef}
        onInput={handleChange}
        onChange={handleChange}
        onSubmit={(e) => { e.preventDefault() }}
        className="flex flex-col gap-3 px-3 py-3"
      >
        <FormFields
          elements={meta.schema}
          values={initialValuesRef.current}
        />
      </form>
    </aside>
  )
}

/**
 * Clamp + sanitize a candidate panel width against this panel's bounds
 * (`[PANEL_WIDTH_MIN, PANEL_WIDTH_MAX]`, default `PANEL_WIDTH_DEFAULT`).
 * Thin wrapper around the shared `clampPanelWidth` helper from
 * `@pilotiq/pilotiq/react` — kept exported with the panel-specific
 * defaults baked in so existing tests + downstream callers don't have
 * to plumb the bounds themselves.
 */
export function clampPanelWidth(value: unknown): number {
  return clampPanelWidthShared(value, {
    min:          PANEL_WIDTH_MIN,
    max:          PANEL_WIDTH_MAX,
    defaultWidth: PANEL_WIDTH_DEFAULT,
  })
}

/**
 * Per-fieldType coerce of a nested values map (built by
 * `parseFormDataToNested`) against the block's schema. Mirrors the
 * server-side `coerceFormValues` at a small subset suitable for the
 * side panel — we only run on top-level block fields plus the immediate
 * children of any Repeater rows / Builder rows.data, which is all the
 * V2 surface needs.
 *
 * Non-coerce passthrough for: text, textarea, select, radio, date,
 * dateTime, email, color, toggleButtons, slug, hidden. (Their wire shape
 * is already a plain string / array of strings.)
 *
 * Coerce branches:
 * - `toggle` / `checkbox`: 'true' / 'false' string → boolean.
 * - `number` / `slider`: parse to Number, null on empty, raw string
 *   passthrough on NaN (so a half-typed value isn't lost).
 * - `tagsInput`: JSON-encoded string → string[].
 * - `checkboxList`: JSON-encoded string OR array → string[].
 * - `keyValue`: JSON-encoded string → Record<string, unknown>.
 * - `fileUpload`: single → URL string passthrough; multiple →
 *   JSON-encoded string → string[].
 * - `repeater`: each row in the array gets recursive coerce against
 *   the field's `template` (the inner field schema definition).
 * - `builder`: each row's `data` gets recursive coerce against the
 *   block matching `row.type` from `field.blocks[]`. Unknown block
 *   types pass through verbatim — the renderer shows a placeholder
 *   and the data round-trips intact across config rollbacks.
 *
 * Exported for unit tests. Pure — no React, no DOM, no editor.
 */
export function coerceBlockValues(
  raw:    Record<string, unknown>,
  schema: ReadonlyArray<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw }
  for (const field of schema) {
    const name = String(field['name'] ?? '')
    if (!name) continue
    const ft = String(field['fieldType'] ?? 'text')
    const value = out[name]
    out[name] = coerceField(value, ft, field)
  }
  return out
}

function coerceField(
  value: unknown,
  ft:    string,
  field: Record<string, unknown>,
): unknown {
  switch (ft) {
    case 'toggle':
    case 'checkbox':
      return value === 'true' || value === true
    case 'number':
    case 'slider':
      return coerceNumber(value)
    case 'tagsInput':
      return parseJsonArray(value)
    case 'checkboxList':
      return parseJsonArray(value)
    case 'keyValue':
      return parseJsonObject(value)
    case 'fileUpload': {
      const multiple = Boolean(field['multiple'])
      if (multiple) return parseJsonArray(value)
      return typeof value === 'string' ? value : ''
    }
    case 'repeater': {
      if (!Array.isArray(value)) return []
      const template = (field['template'] as ReadonlyArray<Record<string, unknown>> | undefined) ?? []
      return value.map((row) => {
        if (!row || typeof row !== 'object') return {}
        return coerceBlockValues(row as Record<string, unknown>, template)
      })
    }
    case 'builder': {
      if (!Array.isArray(value)) return []
      const blockMetas = (field['blocks'] as ReadonlyArray<Record<string, unknown>> | undefined) ?? []
      return value.map((row) => {
        if (!row || typeof row !== 'object') return { type: '', data: {} }
        const r = row as Record<string, unknown>
        const type = String(r['type'] ?? '')
        const data = (r['data'] as Record<string, unknown> | undefined) ?? {}
        const block = blockMetas.find((b) => String(b['name'] ?? '') === type)
        if (!block) return { type, data }
        const tpl = (block['template'] as ReadonlyArray<Record<string, unknown>> | undefined) ?? []
        return { type, data: coerceBlockValues(data, tpl) }
      })
    }
    default:
      return value === undefined ? '' : value
  }
}

function coerceNumber(value: unknown): unknown {
  if (value === '' || value === null || value === undefined) return null
  if (typeof value === 'number') return value
  const raw = String(value)
  if (raw === '') return null
  const n = Number(raw)
  return Number.isNaN(n) ? raw : n
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || value === '') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string' || value === '') return {}
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch { /* fall through */ }
  return {}
}

/**
 * Read the resolved field value for a given input event target. Kept
 * for back-compat — V1 used this in the per-event handler. V2 reads
 * the entire form via `FormData` instead, but this helper still maps
 * cleanly onto a single-input read for testing and is exported.
 *
 * String passthrough for the common case; explicit coercion for
 * booleans and numerics so the round-trip into the node attrs preserves
 * shape.
 */
export function readBlockFieldValue(
  target:    { type?: string; value: string; checked?: boolean },
  fieldMeta: { fieldType?: unknown },
): unknown {
  const ft = String(fieldMeta.fieldType ?? 'text')
  if (ft === 'toggle' || ft === 'checkbox') {
    return target.checked === true
  }
  if (ft === 'number' || ft === 'slider') {
    const raw = target.value
    if (raw === '') return null
    const n = Number(raw)
    return Number.isNaN(n) ? raw : n
  }
  return target.value
}

interface PMNode {
  type:  { name: string }
  attrs: Record<string, unknown>
}

function readBlockData(editor: Editor, pos: number): Record<string, unknown> {
  const node = nodeAt(editor, pos)
  if (!node) return {}
  return (node.attrs['blockData'] as Record<string, unknown> | null) ?? {}
}

function nodeAt(editor: Editor, pos: number): PMNode | null {
  try {
    return (editor.state.doc as unknown as { nodeAt: (p: number) => PMNode | null }).nodeAt(pos)
  } catch {
    return null
  }
}
