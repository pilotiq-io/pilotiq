import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import type { FieldRendererProps } from '@pilotiq/pilotiq/react'
import type { BlockMeta } from '../Block.js'
import { BlockNodeExtension } from '../extensions/BlockNodeExtension.js'
import { SlashCommandExtension } from '../extensions/SlashCommandExtension.js'
import { DragHandleExtension } from '../extensions/DragHandleExtension.js'
import { FloatingToolbar } from './FloatingToolbar.js'

/**
 * The pilotiq field renderer for `RichTextField`. Registered globally via
 * `registerTiptap()`; pilotiq's `SchemaRenderer` looks it up by `fieldType:
 * 'richtext'` and mounts it inline inside the form.
 *
 * Wiring:
 *   - StarterKit + Link + Placeholder (basic text + history + link mark)
 *   - BlockNodeExtension (custom-block storage + React NodeView)
 *   - SlashCommandExtension (`/` opens menu, items derived from `blocks`)
 *   - DragHandleExtension (hover gutter handle)
 *
 * Form integration: a hidden `<input type="hidden" name={field}>` carries
 * the editor's JSON output (stringified). The form lifecycle's
 * `coerceFormValues('richtext')` JSON.parses it before save.
 */
export function TiptapEditor(props: FieldRendererProps) {
  // useEditor + ProseMirror touch the DOM during construction — render a
  // static placeholder during SSR so Vike's first paint doesn't crash.
  // Hydration mounts the real editor on the client.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    const initialContent = parseInitialContent(props.defaultValue)
    return (
      <div className="flex flex-col gap-1">
        <input type="hidden" name={props.name} value={JSON.stringify(initialContent ?? null)} />
        <div className="prose prose-sm max-w-none min-h-[180px] rounded-md border border-input bg-transparent px-10 py-3 text-sm text-muted-foreground">
          {props.placeholder ?? 'Start writing…'}
        </div>
      </div>
    )
  }

  return <ClientEditor {...props} />
}

function ClientEditor(props: FieldRendererProps) {
  const { el, name, defaultValue, placeholder, disabled } = props

  const blocks         = (el['blocks']       as BlockMeta[] | undefined) ?? []
  const slashEnabled   = (el['slashCommand'] as boolean    | undefined) ?? true
  const toolbarProfile = (el['toolbar']      as string     | undefined) ?? 'default'

  // Parse default value into Tiptap JSON. Stored values can be:
  //   - object (already-parsed JSON from SSR record-fill)
  //   - string (JSON-encoded — fallback for older data)
  //   - undefined / null (empty editor)
  const initialContent = parseInitialContent(defaultValue)
  const [serialized,  setSerialized]  = useState(() => JSON.stringify(initialContent ?? null))
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      // StarterKit 3 ships Link by default; configure it through the kit
      // rather than adding a duplicate Link extension (caused a "Duplicate
      // extension names" warning).
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
      }),
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing…' }),
      // BlockNodeExtension carries the block registry on its options —
      // NodeViews mount in a separate React tree and can't see context.
      BlockNodeExtension.configure({ blocks }),
      ...(slashEnabled ? [SlashCommandExtension.configure({ blocks })] : []),
      DragHandleExtension,
    ],
    content: initialContent ?? '',
    onUpdate: ({ editor: ed }) => {
      // Debounce serialization — every keystroke fires onUpdate.
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        setSerialized(JSON.stringify(ed.getJSON()))
      }, 250)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[180px] rounded-md border border-input bg-transparent px-10 py-3 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
      },
    },
  })

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  return (
    <div className="relative flex flex-col gap-1">
      <input type="hidden" name={name} value={serialized} />
      <EditorContent editor={editor} />
      {editor && toolbarProfile !== 'none' && <FloatingToolbar editor={editor} />}
    </div>
  )
}

function parseInitialContent(raw: unknown): object | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw === 'object') return raw as object
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return undefined }
  }
  return undefined
}
