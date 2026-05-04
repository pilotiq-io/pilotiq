import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { FormFields } from '@pilotiq/pilotiq/react'
import type { BlockMeta } from '../Block.js'

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
 * Writes: container-level event delegation on the form element. Each
 * `change` / `input` reads the changed input by `name`, coerces by
 * field-type, splices into a values map, and runs `setNodeMarkup` on
 * the tracked position. The position is kept fresh by mapping it
 * through every editor transaction so live edits elsewhere in the
 * document don't desync the panel.
 *
 * V1 scope: flat schemas (Text / Textarea / Select / Toggle / Checkbox
 * / Radio / Date / Number / Email / Color / Slider / DateTime / TagsInput
 * / KeyValue). Repeater / Builder / FileUpload / Markdown / RichText
 * inputs render but their value bindings are deferred — those types
 * need a `FormStateProvider` round-trip and aren't wired here yet.
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

  // Mirror the current values map so onInput delegates can splice
  // without re-reading the entire form on every keystroke.
  const valuesRef = useRef<Record<string, unknown>>({ ...initialValuesRef.current })

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

  const handleChange = useCallback((event: React.FormEvent<HTMLFormElement>): void => {
    const target = event.target as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)
    if (!target || !target.name) return
    if (!meta) return
    const fieldMeta = meta.schema.find((f) => f.name === target.name)
    if (!fieldMeta) return
    const value = readBlockFieldValue(target, fieldMeta)
    valuesRef.current = { ...valuesRef.current, [target.name]: value }
    writeBack(valuesRef.current)
  }, [meta, writeBack])

  if (!meta || pos === null) return null

  return (
    <aside
      role="dialog"
      aria-label={`Edit ${meta.label}`}
      className="absolute top-0 left-full ml-4 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border bg-background shadow-lg z-30"
    >
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
 * Read the resolved field value for a given input event target. String
 * passthrough for the common case; explicit coercion for booleans and
 * numerics so the round-trip into the node attrs preserves shape.
 *
 * V1 trade-off: TagsInput / KeyValue / FileUpload / Repeater / Builder
 * use richer wire shapes (JSON-encoded arrays, dotted-path child names,
 * etc.) and aren't covered here — the field still renders, but writes
 * land as raw strings until the panel grows a `FormStateProvider`-backed
 * read path.
 *
 * Exported for unit tests; prefer using the panel itself.
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
