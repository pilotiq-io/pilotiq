import { useEffect, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { BlockMeta } from '../Block.js'

/**
 * Generic React NodeView for the `block` ProseMirror node. Reads the
 * block type from `node.attrs.blockType`, looks up its `BlockMeta` in
 * `BlockNodeExtension.options.blocks`, and renders an inline display/edit form.
 *
 * Two modes:
 *   - **Collapsed:** label + a one-line summary of filled fields. Click to
 *     expand. Shows a "Remove" button when expanded.
 *   - **Expanded:** stack of `<input>` / `<textarea>` / `<select>` per
 *     schema field, wired to update `node.attrs.blockData`.
 *
 * Same data model as `@pilotiq/lexical`'s `BlockNodeComponent`.
 */
export function BlockNodeView(props: NodeViewProps) {
  const { editor, node, updateAttributes, deleteNode } = props
  const blockType = String(node.attrs['blockType'] ?? '')
  const blockData = (node.attrs['blockData'] as Record<string, unknown> | undefined) ?? {}

  // Tiptap mounts NodeViews in a separate React tree, so we can't read the
  // block registry through context. Pull it off the extension's options
  // instead — set by RichTextField via BlockNodeExtension.configure({ blocks }).
  const blockExt = editor.extensionManager.extensions.find((e) => e.name === 'pilotiqBlock')
  const blocks   = (blockExt?.options['blocks'] as BlockMeta[] | undefined) ?? []
  const meta     = blocks.find((b) => b.name === blockType)

  const [expanded, setExpanded] = useState(false)

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

  const setField = (name: string, value: unknown): void => {
    updateAttributes({ blockData: { ...blockData, [name]: value } })
  }

  const summary = meta.schema
    .map((f) => {
      const v = blockData[f.name]
      return typeof v === 'string' && v ? v : ''
    })
    .filter(Boolean)
    .join(' · ') || meta.label

  return (
    <NodeViewWrapper className="pilotiq-block my-3 rounded-lg border bg-muted/30">
      <div className="flex items-start justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left text-sm"
        >
          {meta.icon && <span aria-hidden="true">{meta.icon}</span>}
          <span className="font-medium">{meta.label}</span>
          <span className="text-xs text-muted-foreground line-clamp-1">{summary}</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? 'Collapse' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={() => deleteNode()}
            className="text-xs text-destructive hover:underline"
          >
            Remove
          </button>
        </div>
      </div>
      {expanded && (
        <div className="flex flex-col gap-3 border-t px-3 py-3">
          {meta.schema.map((f) => (
            <BlockFieldInput
              key={f.name}
              meta={f}
              value={blockData[f.name]}
              onChange={(v) => setField(f.name, v)}
            />
          ))}
        </div>
      )}
    </NodeViewWrapper>
  )
}

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

interface BlockFieldInputProps {
  meta:     { name: string; label?: string; fieldType?: string; placeholder?: string; [k: string]: unknown }
  value:    unknown
  onChange: (value: unknown) => void
}

function BlockFieldInput({ meta, value, onChange }: BlockFieldInputProps) {
  const name        = String(meta.name)
  const label       = String(meta['label'] ?? name)
  const fieldType   = String(meta['fieldType'] ?? 'text')
  const placeholder = meta['placeholder'] ? String(meta['placeholder']) : undefined
  const stringValue = value !== undefined && value !== null ? String(value) : ''

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {fieldType === 'textarea' ? (
        <textarea
          value={stringValue}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={Number(meta['rows']) || 3}
          className={`${inputClass} h-auto min-h-[4.5rem]`}
        />
      ) : fieldType === 'select' ? (
        <select
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="">{placeholder ?? 'Select…'}</option>
          {((meta['options'] as Array<{ value: string; label: string }> | undefined) ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : fieldType === 'toggle' ? (
        <input
          type="checkbox"
          checked={value === true || value === 'true'}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
      ) : (
        <input
          type={fieldType === 'number' ? 'number' : fieldType === 'email' ? 'email' : fieldType === 'date' ? 'date' : 'text'}
          value={stringValue}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
    </label>
  )
}
