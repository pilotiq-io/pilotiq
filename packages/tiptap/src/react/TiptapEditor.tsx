import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { Popover } from '@base-ui/react/popover'
import type { FieldRendererProps } from '@pilotiq/pilotiq/react'
import type { BlockMeta } from '../Block.js'
import type { ToolbarGroups, RichTextStorage, ColorSwatch } from '../RichTextField.js'
import { BlockNodeExtension } from '../extensions/BlockNodeExtension.js'
import {
  SlashCommandExtension,
  type SlashState,
} from '../extensions/SlashCommandExtension.js'
import { DragHandleExtension } from '../extensions/DragHandleExtension.js'
import { SlashMenu, type SlashKeyHandlerRef } from './SlashMenu.js'
import { FloatingToolbar } from './FloatingToolbar.js'
import { Toolbar, useEditorTick } from './Toolbar.js'

/**
 * The pilotiq field renderer for `RichTextField`. Registered globally via
 * `registerTiptap()`; pilotiq's `SchemaRenderer` looks it up by `fieldType:
 * 'richtext'` and mounts it inline inside the form.
 *
 * Wiring (Phase A):
 *   - StarterKit + Underline + Subscript + Superscript + TextAlign
 *   - Placeholder
 *   - BlockNodeExtension (custom-block storage + React NodeView)
 *   - SlashCommandExtension (`/` opens menu, items derived from `blocks`)
 *   - DragHandleExtension (hover gutter handle)
 *
 * Form integration: a hidden `<input type="hidden" name={field}>` carries
 * the editor's serialized output. Storage format depends on the field's
 * `.storage('json' | 'html')` setting — JSON parses on the server,
 * HTML is passed through.
 */
export function TiptapEditor(props: FieldRendererProps) {
  // useEditor + ProseMirror touch the DOM during construction — render a
  // static placeholder during SSR so Vike's first paint doesn't crash.
  // Hydration mounts the real editor on the client.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    const storage = (props.el['storage'] as RichTextStorage | undefined) ?? 'json'
    const initialValue = serializeForHidden(props.defaultValue, storage)
    return (
      <div className="flex flex-col gap-1">
        <input type="hidden" name={props.name} value={initialValue} />
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

  const blocks            = (el['blocks']           as BlockMeta[]     | undefined) ?? []
  const slashEnabled      = (el['slashCommand']     as boolean         | undefined) ?? true
  const toolbarGroups     = (el['toolbarGroups']    as ToolbarGroups   | null | undefined) ?? null
  const floatingEnabled   = (el['floatingToolbar']  as boolean         | undefined) ?? true
  const storage           = (el['storage']          as RichTextStorage | undefined) ?? 'json'
  const textColors        = (el['textColors']       as ColorSwatch[]   | undefined) ?? []
  const customTextColors  = (el['customTextColors'] as boolean         | undefined) ?? false
  const highlightColors   = (el['highlightColors']  as ColorSwatch[]   | undefined) ?? []

  const initialContent = parseInitialContent(defaultValue)
  const [serialized, setSerialized] = useState(() => serializeForHidden(initialContent, storage))
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Slash-menu state. `rawState` is what the extension last emitted.
  // `dismissed` is the Escape latch — while true, the popover stays hidden
  // even if the suggestion plugin keeps firing onUpdate. It clears when the
  // suggestion plugin formally exits (cursor leaves the slash range).
  const [rawState,  setRawState]  = useState<SlashState | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const slashState = dismissed ? null : rawState
  const slashKeyRef = useRef<((event: KeyboardEvent) => boolean) | null>(null)

  const handleStateChange = useCallback((s: SlashState | null) => {
    if (s === null) setDismissed(false)
    setRawState(s)
  }, [])

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      // StarterKit 3 ships Link by default; configure it through the kit
      // rather than adding a duplicate Link extension (caused a "Duplicate
      // extension names" warning).
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
      }),
      Underline,
      Subscript,
      Superscript,
      // textAlign needs to be told which node types it can target. Headings
      // + paragraphs are the standard set. Blockquote alignment is handled
      // by aligning the inner paragraph.
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      // TextStyle is a no-op mark on its own, but Color decorates it with the
      // `color` attribute so `.setColor(...)` works. Loading them as a pair
      // keeps the extension surface complete.
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing…' }),
      // BlockNodeExtension carries the block registry on its options —
      // NodeViews mount in a separate React tree and can't see context.
      BlockNodeExtension.configure({ blocks }),
      ...(slashEnabled ? [SlashCommandExtension.configure({
        blocks,
        onStateChange: handleStateChange,
      })] : []),
      DragHandleExtension,
    ],
    content: initialContent ?? '',
    onUpdate: ({ editor: ed }) => {
      // Debounce serialization — every keystroke fires onUpdate.
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const value = storage === 'html' ? ed.getHTML() : JSON.stringify(ed.getJSON())
        setSerialized(value)
      }, 250)
    },
    editorProps: {
      attributes: {
        // Drop the top border-radius when the toolbar is on so the toolbar
        // and editor body read as a single chrome.
        class: `prose prose-sm dark:prose-invert max-w-none min-h-[180px] border border-input bg-transparent px-10 py-3 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
          toolbarGroups && toolbarGroups.length > 0
            ? 'rounded-b-md border-t-0'
            : 'rounded-md'
        }`,
      },
    },
  })

  // Document-level keyboard handler for the slash menu. Capture phase so we
  // run before ProseMirror's `view.dom` keydown listener — that way Enter
  // doesn't split the paragraph and Arrows don't move the cursor while
  // navigating the menu. Listen at `document` because Base UI's focus manager
  // can briefly pull focus into the popup when it mounts.
  const open = slashState !== null
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDismissed(true)
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter') {
        const handled = slashKeyRef.current?.(e) ?? false
        if (handled) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // Re-render the toolbar when the selection / marks change so active-state
  // booleans stay fresh.
  const tick = useEditorTick(editor)

  return (
    <div className="relative flex flex-col gap-1">
      <input type="hidden" name={name} value={serialized} />
      {editor && toolbarGroups && toolbarGroups.length > 0 && (
        <Toolbar
          editor={editor}
          groups={toolbarGroups}
          tick={tick}
          textColors={textColors}
          customTextColors={customTextColors}
          highlightColors={highlightColors}
        />
      )}
      <EditorContent editor={editor} />
      {editor && floatingEnabled && <FloatingToolbar editor={editor} />}
      <SlashPopover state={slashState} keyHandlerRef={slashKeyRef} />
    </div>
  )
}

/**
 * Renders the slash menu inside a Base UI Popover anchored to the cursor's
 * client rect. Floating UI under Base UI handles scroll/resize tracking and
 * collision avoidance, so we never have to recompute position ourselves.
 */
function SlashPopover({
  state,
  keyHandlerRef,
}: {
  state:         SlashState | null
  keyHandlerRef: SlashKeyHandlerRef
}) {
  const open = state !== null

  // Virtual element built from the suggestion plugin's clientRect lambda.
  // The Positioner re-reads `getBoundingClientRect` on every layout tick,
  // and `clientRect()` returns viewport-relative coords from PM, so scroll
  // tracking is automatic.
  const anchor = useMemo(() => {
    if (!state) return null
    return {
      getBoundingClientRect: () => state.clientRect() ?? new DOMRect(0, 0, 0, 0),
    }
  }, [state])

  return (
    <Popover.Root open={open} onOpenChange={() => {}}>
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          // `fixed` makes the popup's bounding rect viewport-relative, so the
          // initial render (before Floating UI computes the anchor position)
          // doesn't sit at body (0,0) — that would trigger the browser to
          // scroll the page when the popup mounts and momentarily becomes
          // the focus target.
          positionMethod="fixed"
          side="bottom"
          align="start"
          sideOffset={6}
          className="isolate z-50"
        >
          <Popover.Popup
            // Keep focus in the editor — keyboard navigation is driven via a
            // document-level listener in TiptapEditor, never via DOM focus.
            initialFocus={false}
            finalFocus={false}
            tabIndex={-1}
            className="origin-(--transform-origin) rounded-md border bg-popover text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            {state && (
              <SlashMenu
                items={state.items}
                command={state.command}
                keyHandlerRef={keyHandlerRef}
              />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function parseInitialContent(raw: unknown): object | string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw === 'object') return raw as object
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    // Looks like JSON — try to parse. Otherwise treat as HTML and pass to
    // Tiptap (it accepts an HTML string as `content`).
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return JSON.parse(raw) } catch { return raw }
    }
    return raw
  }
  return undefined
}

function serializeForHidden(content: unknown, storage: RichTextStorage): string {
  if (content === undefined || content === null) {
    return storage === 'html' ? '' : JSON.stringify(null)
  }
  if (storage === 'html') {
    return typeof content === 'string' ? content : ''
  }
  if (typeof content === 'object') return JSON.stringify(content)
  if (typeof content === 'string') {
    // Best-effort: a stored JSON string from the server should round-trip.
    const trimmed = content.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return content
    return JSON.stringify(null)
  }
  return JSON.stringify(null)
}
