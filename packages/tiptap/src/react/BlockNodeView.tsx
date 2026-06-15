import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { FormFields, parseFormDataToNested, CollabRoomContext } from '@pilotiq/pilotiq/react'
import type { BlockMeta } from '../Block.js'
import { coerceBlockValues, parseBlockData, serializeBlockData } from './blockValues.js'

/**
 * React NodeView for the `pilotiqBlock` ProseMirror node. Reads the block
 * type from `node.attrs.blockType`, looks up its `BlockMeta` in
 * `BlockNodeExtension.options.blocks`, and renders a compact summary card.
 *
 * Editing is **inline** (accordion): clicking the card (or the Edit chevron)
 * expands a panel below the summary that hosts the block's `Block.schema([…])`
 * as a real pilotiq form via `<FormFields>`. Edits write straight back onto
 * the node with `updateAttributes({ blockData })` on every change — the
 * NodeView already owns the node, so there's no host bridge / side panel /
 * position-remapping to thread through.
 *
 * The form is rendered in a `contentEditable={false}` region and every input
 * event is stopped from bubbling into ProseMirror, so the editor never treats
 * the form inputs as document content or hijacks their focus/selection.
 *
 * Reads: each field's `defaultValue` is overridden from the block's stored
 * `blockData`, snapshotted once per expand into `initialValuesRef`. Inputs are
 * uncontrolled (outside a `FormStateProvider`, pilotiq's renderers fall back to
 * `defaultValue`), so write-back transactions re-rendering the NodeView never
 * reset the user's in-progress typing.
 *
 * Writes: container-level `onInput` / `onChange` delegation. Every change
 * snapshots the whole form via `new FormData(formEl)` → `parseFormDataToNested`
 * (rebuilds nested arrays/objects from dotted-path inputs like `items.0.title`)
 * → `coerceBlockValues` (per-fieldType JSON parse / boolean / number coerce).
 */
export function BlockNodeView(props: NodeViewProps) {
  const { editor, node, deleteNode, updateAttributes } = props
  const blockType = String(node.attrs['blockType'] ?? '')
  // `blockData` is a JSON string on the node (collab-safe — see blockValues.ts);
  // parse it to an object for rendering. Tolerates the legacy object form.
  const blockData = parseBlockData(node.attrs['blockData'])
  const editable  = editor.isEditable

  // Tiptap mounts NodeViews in a separate React tree, so we can't read the
  // block registry through context. Pull it off the extension's options
  // instead — set by RichTextField via BlockNodeExtension.configure({ blocks }).
  const blockExt = editor.extensionManager.extensions.find((e) => e.name === 'pilotiqBlock')
  const blocks   = (blockExt?.options['blocks'] as BlockMeta[] | undefined) ?? []
  const meta     = blocks.find((b) => b.name === blockType)

  const [expanded, setExpanded] = useState(false)
  // Seeds the form's `defaultValue`s. Re-snapshotted from the live node each
  // time the panel opens; not updated mid-edit (uncontrolled inputs hold their
  // own state while open).
  const initialValuesRef = useRef<Record<string, unknown>>(blockData)
  const formRef          = useRef<HTMLFormElement | null>(null)

  // Self-heal: a block with no `blockType` is malformed — almost always
  // means a stale node from a prior buggy insert. Delete it on mount so
  // the editor doesn't get stuck in an unrecoverable state.
  useEffect(() => {
    if (blockType === '') deleteNode()
  }, [blockType, deleteNode])

  if (!meta) {
    if (blockType === '') return null
    return (
      <NodeViewWrapper className="my-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        Unknown block type: <code>{blockType}</code>
      </NodeViewWrapper>
    )
  }

  const summary = meta.schema
    .map((f) => {
      const v = blockData[f.name]
      return typeof v === 'string' && v ? v : ''
    })
    .filter(Boolean)
    .join(' · ') || meta.label

  const toggleExpanded = (): void => {
    if (!editable) return
    setExpanded((prev) => {
      const next = !prev
      if (next) {
        initialValuesRef.current = parseBlockData(node.attrs['blockData'])
      }
      return next
    })
  }

  const handleChange = (): void => {
    const formEl = formRef.current
    if (!formEl) return
    const raw     = parseFormDataToNested(new FormData(formEl))
    const coerced = coerceBlockValues(raw, meta.schema)
    // Write back as a JSON string so the attr round-trips under collab (#96).
    updateAttributes({ blockData: serializeBlockData(coerced) })
  }

  return (
    <NodeViewWrapper className="pilotiq-block my-3 rounded-lg border bg-muted/30">
      <div className="flex items-start justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={toggleExpanded}
          disabled={!editable}
          className="flex min-w-0 items-center gap-2 text-left text-sm disabled:cursor-default"
        >
          {meta.icon && <span aria-hidden="true">{meta.icon}</span>}
          <span className="font-medium">{meta.label}</span>
          <span className="line-clamp-1 text-xs text-muted-foreground">{summary}</span>
        </button>
        {editable && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleExpanded}
              aria-expanded={expanded}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? 'Done' : 'Edit'}
              <svg
                viewBox="0 0 24 24"
                className={'size-3.5 transition-transform ' + (expanded ? 'rotate-180' : '')}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => deleteNode()}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {expanded && editable && (
        // contentEditable=false + event guards keep ProseMirror from treating
        // the form inputs as document content or stealing their focus/caret.
        <div
          contentEditable={false}
          className="border-t px-3 py-3"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
          onPaste={(e) => e.stopPropagation()}
          onDrop={(e) => e.stopPropagation()}
        >
          {/*
           * Force these inputs to render as PLAIN (local) fields, never
           * collab-bound. The accordion edits this node's `blockData` attr,
           * not the surrounding record's collab document — but a text field
           * rendered inside a `<RecordCollabRoom>` otherwise mounts its own
           * `Y.XmlFragment` (via TextLikeInput → CollabTextRenderer). Under
           * collab that nested collab mount fires the host editor's
           * `_forceRerender`, which rebuilds the doc from Yjs and DROPS this
           * custom block (issue #96 — the block vanished the moment you
           * clicked Edit). Shadowing the room context with `null` makes
           * `useCollabRoom()` return null for the form, so every field falls
           * through to its plain controlled/uncontrolled input.
           */}
          <CollabRoomContext.Provider value={null}>
            <form
              ref={formRef}
              onInput={handleChange}
              onChange={handleChange}
              onSubmit={(e) => e.preventDefault()}
              className="flex flex-col gap-3"
            >
              <FormFields elements={meta.schema} values={initialValuesRef.current} />
            </form>
          </CollabRoomContext.Provider>
        </div>
      )}
    </NodeViewWrapper>
  )
}
