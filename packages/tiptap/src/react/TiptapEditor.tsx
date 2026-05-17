import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details'
import { Grid, GridColumn } from '../extensions/GridExtension.js'
import { Popover } from '@base-ui/react/popover'
import type {
  FieldRendererProps,
  CollabRoom,
  CollabExtensionFactory,
} from '@pilotiq/pilotiq/react'
import { useCollabRoom, getCollabExtensions, onProviderSynced } from '@pilotiq/pilotiq/react'
import { useAiSuggestionBridge } from './useAiSuggestionBridge.js'
import type { BlockMeta } from '../Block.js'
import type { ToolbarGroups, RichTextStorage, ColorSwatch } from '../RichTextField.js'
import { BlockNodeExtension } from '../extensions/BlockNodeExtension.js'
import {
  SlashCommandExtension,
  type SlashState,
} from '../extensions/SlashCommandExtension.js'
import { DragHandleExtension } from '../extensions/DragHandleExtension.js'
import { MergeTagExtension } from '../extensions/MergeTagExtension.js'
import { LeadMarkExtension, SmallMarkExtension } from '../extensions/TextSizeMarks.js'
import { AiSuggestionExtension } from '../extensions/AiSuggestionExtension.js'
import {
  MentionExtension,
  type MentionState,
} from '../extensions/MentionExtension.js'
import type { MentionProviderMeta } from '../MentionProvider.js'
import { SlashMenu, type SlashKeyHandlerRef } from './SlashMenu.js'
import { MentionMenu, type MentionKeyHandlerRef } from './MentionMenu.js'
import { FloatingToolbar } from './FloatingToolbar.js'
import { TableFloatingToolbar } from './TableFloatingToolbar.js'
import { Toolbar, AttachFilesDialog, useEditorTick } from './Toolbar.js'
import { BlockSidePanel } from './BlockSidePanel.js'

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
      <div className="flex flex-col">
        <input type="hidden" name={props.name} value={initialValue} />
        <div className="prose prose-sm max-w-none min-h-[180px] rounded-md border border-input bg-transparent px-10 py-3 text-sm text-muted-foreground">
          {props.placeholder ?? 'Start writing…'}
        </div>
      </div>
    )
  }

  return <CollabAwareTiptap {...props} />
}

/**
 * Bridges pilotiq's open-core `CollabRoomContext` + `CollabExtensionFactory`
 * registry into the Tiptap renderer. When `@pilotiq-pro/collab` is wired
 * AND a `<RecordCollabRoom>` is mounted up-tree, the room flips non-null;
 * keying `ClientEditor` on that toggle remounts the editor cleanly so the
 * `Collaboration` extension can install (Tiptap can't swap it at runtime).
 *
 * No-op shell when collab isn't installed — `room` stays `null`,
 * `getCollabExtensions()` returns `null`, and `ClientEditor` runs its
 * plain Tiptap path with the same shape as before.
 */
function CollabAwareTiptap(props: FieldRendererProps) {
  const room    = useCollabRoom()
  const factory = getCollabExtensions()
  // Per-field opt-out — `RichTextField.collab(false)` stamps `meta.collab`
  // explicitly false, overriding the panel-wide auto-on default. Useful for
  // fields that should stay device-local (private notes, draft scratch
  // space, etc.) inside an otherwise collab-on form.
  const fieldCollab  = props.el['collab'] as boolean | undefined
  const collabActive = !!(room && factory) && fieldCollab !== false
  return (
    <ClientEditor
      key={collabActive ? 'collab' : 'local'}
      {...props}
      room={collabActive ? room : null}
      factory={collabActive ? factory : null}
      collabActive={collabActive}
    />
  )
}

interface ClientEditorProps extends FieldRendererProps {
  /** Active record room, or `null` when no `<RecordCollabRoom>` is mounted. */
  room:         CollabRoom | null
  /** Registered collab extension factory, or `null` when no plugin registered. */
  factory:      CollabExtensionFactory | null
  /** Convenience flag — `true` iff both `room` AND `factory` are non-null. */
  collabActive: boolean
}

function ClientEditor(props: ClientEditorProps) {
  const { el, name, defaultValue, placeholder, disabled, room, factory, collabActive } = props

  const blocks            = (el['blocks']           as BlockMeta[]     | undefined) ?? []
  const slashEnabled      = (el['slashCommand']     as boolean         | undefined) ?? true
  const toolbarGroups     = (el['toolbarGroups']    as ToolbarGroups   | null | undefined) ?? null
  const floatingEnabled   = (el['floatingToolbar']  as boolean         | undefined) ?? true
  const storage           = (el['storage']          as RichTextStorage | undefined) ?? 'json'
  const textColors        = (el['textColors']       as ColorSwatch[]   | undefined) ?? []
  const customTextColors  = (el['customTextColors'] as boolean         | undefined) ?? false
  const highlightColors   = (el['highlightColors']  as ColorSwatch[]   | undefined) ?? []
  const resizableImages   = (el['resizableImages']  as boolean         | undefined) ?? false
  const uploadUrl         = (el['uploadUrl']        as string          | undefined)
  const acceptedFileTypes = (el['fileAttachmentsAcceptedFileTypes'] as string[] | undefined)
  const maxAttachmentSize = (el['fileAttachmentsMaxSize']            as number   | undefined)
  const attachmentDir     = (el['fileAttachmentsDirectory']          as string   | undefined)
  const attachmentVis     = (el['fileAttachmentsVisibility']         as ('public' | 'private') | undefined)
  const mergeTags         = (el['mergeTags']        as string[]              | undefined) ?? []
  const mentionProviders  = (el['mentions']         as MentionProviderMeta[] | undefined) ?? []
  const mentionsUrl       = (el['mentionsUrl']      as string                | undefined)

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

  // Mention popover state — symmetrical to slash, with its own dismiss latch
  // so Escape closes the mention popup without affecting slash.
  const [rawMentionState,  setRawMentionState]  = useState<MentionState | null>(null)
  const [mentionDismissed, setMentionDismissed] = useState(false)
  const mentionState  = mentionDismissed ? null : rawMentionState
  const mentionKeyRef = useRef<((event: KeyboardEvent) => boolean) | null>(null)

  // Lifted upload-dialog state — the toolbar's `attachFiles` button and the
  // slash menu's "Image" entry both flip this flag. Single source of truth
  // keeps the dialog mounted in one place (inside `Toolbar`) regardless of
  // which trigger fired.
  const [attachOpen, setAttachOpen] = useState(false)

  const handleMentionStateChange = useCallback((s: MentionState | null) => {
    if (s === null) setMentionDismissed(false)
    setRawMentionState(s)
  }, [])

  // Custom-block side panel — opens when a block's NodeView fires its
  // Edit button. The NodeView lives in a separate React tree and reaches
  // us via `BlockNodeExtension.options.onEdit` (set during configure()
  // below). Stores `pos` + `blockType` at open-time; `BlockSidePanel`
  // tracks the position forward through transactions and writes attrs
  // back via setNodeMarkup. Closing nullifies the slot — re-opening
  // remounts the panel fresh, including a re-snapshot of `blockData`.
  const [selectedBlock, setSelectedBlock] = useState<{ pos: number; blockType: string } | null>(null)
  const handleEditBlock = useCallback((pos: number) => {
    // We resolve `blockType` here against the current doc so a stale
    // pos (e.g. the block was just deleted before the click landed)
    // produces a no-op rather than an empty panel.
    setSelectedBlock((prev) => {
      // Read from the editor lazily — the editor ref isn't stable yet
      // on the very first render where this callback is created, so
      // defer the lookup to call time.
      const ed = editorRef.current
      if (!ed) return prev
      const node = (ed.state.doc as unknown as { nodeAt: (p: number) => { type: { name: string }; attrs: Record<string, unknown> } | null }).nodeAt(pos)
      if (!node || node.type.name !== 'pilotiqBlock') return prev
      return { pos, blockType: String(node.attrs['blockType'] ?? '') }
    })
  }, [])
  const closeBlockPanel = useCallback(() => { setSelectedBlock(null) }, [])

  // editorRef gives the onEdit callback access to the editor instance
  // without re-creating the callback on every render (which would force
  // the extension config to re-evaluate, triggering a full editor reset).
  const editorRef = useRef<Editor | null>(null)

  // Resolve the collab-attached extensions once per editor build.
  // `Collaboration` is constructed eagerly here (during `useEditor`'s
  // first call); the keyed remount above guarantees we never swap it.
  const collabExtensions = useMemo(() => {
    if (!collabActive || !room || !factory) return [] as unknown[]
    return factory({
      ydoc:      room.ydoc,
      provider:  room.provider,
      fieldName: name,
      ...(room.user ? { user: room.user } : {}),
    })
    // Intentionally deps-stable across renders within the same collab
    // mount — the keyed wrapper above remounts us when collab toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabActive])

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      // StarterKit 3.22+ ships Link AND Underline; configure through the
      // kit rather than re-adding (else "Duplicate extension names" warns).
      // `Collaboration` brings its own Yjs-backed history — disable
      // StarterKit's local `undoRedo` extension when collab is active
      // (renamed from `history` in Tiptap v3.x; passing `history: false`
      // silently no-ops and produces a runtime "not compatible with
      // @tiptap/extension-undo-redo" warning).
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
        ...(collabActive ? { undoRedo: false } : {}),
      }),
      Subscript,
      Superscript,
      LeadMarkExtension,
      SmallMarkExtension,
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
      Image.configure({
        // Inline images break under prose's `figure` margin reset; the
        // editor uses block images by default, matching the read-side
        // renderer's `<img>` output.
        inline: false,
        // Most upload adapters return URLs — base64 inflates the doc and
        // re-uploads on every save. Opt back in only if your adapter
        // explicitly stores data URLs.
        allowBase64: false,
        resize: resizableImages
          ? { enabled: true, alwaysPreserveAspectRatio: true }
          : false,
      }),
      // Tables — the four nodes ship from one peer (`@tiptap/extension-table`).
      // `resizable: true` mounts the built-in column-resize NodeView so users
      // can drag column dividers; `lastColumnResizable: false` keeps the
      // right-edge handle from creating an unbounded growth target when the
      // table sits inside a constrained-width form.
      Table.configure({ resizable: true, lastColumnResizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      // Collapsible `<details>` blocks. `persist: true` round-trips the
      // open/closed state through the document attrs so SSR + reload pick up
      // the same state the author left it in. The default summary text on
      // insert ("Title") gives the user something to overwrite.
      Details.configure({ persist: true, HTMLAttributes: { class: 'details' } }),
      DetailsSummary,
      DetailsContent,
      // Multi-column grid blocks (`grid` + `gridColumn`). Custom node pair —
      // Tiptap doesn't ship a first-party grid extension. Schema constrains
      // grids to 2 or 3 columns; consumer owns the CSS for `pilotiq-grid` /
      // `pilotiq-grid-cols-N`.
      Grid,
      GridColumn,
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing…' }),
      // BlockNodeExtension carries the block registry on its options —
      // NodeViews mount in a separate React tree and can't see context.
      // `onEdit` is the bridge back to the host editor's tree where the
      // side panel lives; the NodeView's Edit button calls it with its
      // own `getPos()`.
      BlockNodeExtension.configure({ blocks, onEdit: handleEditBlock }),
      ...(slashEnabled ? [SlashCommandExtension.configure({
        blocks,
        mergeTags,
        onStateChange: handleStateChange,
        hasUpload:     Boolean(uploadUrl),
        onInsertImage: () => setAttachOpen(true),
      })] : []),
      // MergeTagExtension provides the `mergeTag` node type even when no tags
      // are configured — the slash menu is the gate for *inserting* them, but
      // the schema needs to know about the node either way (otherwise loading
      // an existing doc that contains one throws a parse error).
      MergeTagExtension,
      ...(mentionProviders.length > 0 ? [MentionExtension.configure({
        providers:     mentionProviders,
        onStateChange: handleMentionStateChange,
        ...(mentionsUrl ? { mentionsUrl } : {}),
        fieldName:     name,
      })] : [MentionExtension]),
      DragHandleExtension,
      // AI suggestions — always-on extension that tracks suggested edits as
      // inline strikethrough + Approve/Reject chip widgets. Idle until the
      // host calls `editor.commands.addAiSuggestion(...)`.
      AiSuggestionExtension,
      // Realtime-collab extensions (Yjs `Collaboration` + cursor) — empty
      // when no `<RecordCollabRoom>` is mounted up-tree, or when no plugin
      // registered a factory via `registerCollabExtensions`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(collabExtensions as any[]),
    ],
    // Collaboration takes ownership of the document — `content` would race
    // the Y.XmlFragment sync. Seed instead via the post-`synced` effect
    // below so existing DB content lands once and only once. The non-collab
    // branch also gates on `isTiptapShapedContent` so leftover content from
    // a previous editor (e.g. Lexical's `{ root: {...} }`) doesn't crash
    // the schema-strict node parser on first paint.
    content: collabActive
      ? ''
      : (initialContent !== undefined && isTiptapShapedContent(initialContent) ? initialContent : ''),
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

  // Mirror keyboard handling for the mention popover. Capture-phase listener
  // anchored to `document` for the same reason the slash menu uses it —
  // Base UI's focus manager can briefly steal focus to its popup.
  const mentionOpen = mentionState !== null
  useEffect(() => {
    if (!mentionOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMentionDismissed(true)
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter') {
        const handled = mentionKeyRef.current?.(e) ?? false
        if (handled) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [mentionOpen])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // Mirror the editor instance into a ref so callbacks captured during
  // `useEditor`'s extension config (notably the BlockNode `onEdit`
  // bridge) can reach the live editor without re-creating themselves
  // every render. Re-creation would force the editor to rebuild from
  // scratch on every keystroke.
  useEffect(() => { editorRef.current = editor ?? null }, [editor])

  // First-load seed when collab is active. Collaboration starts the
  // editor empty regardless of `defaultValue`; once the WebsocketProvider
  // syncs the room state from the server we check whether the field's
  // Y.XmlFragment was ever written. Empty + we have an initial value =
  // first session for this record — push the DB content into the ydoc
  // exactly once. Non-empty = the room already has authoritative state;
  // don't overwrite.
  useEffect(() => {
    if (!editor || !collabActive || !room) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = room.provider as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ydoc     = room.ydoc as any
    if (!provider || !ydoc) return

    const trySeed = () => {
      try {
        const fragment = ydoc.getXmlFragment(name)
        if (
          fragment &&
          fragment.length === 0 &&
          initialContent !== undefined &&
          initialContent !== null &&
          initialContent !== '' &&
          isTiptapShapedContent(initialContent)
        ) {
          // setContent dispatches a Tiptap transaction; the bound
          // y-prosemirror binding (inside Collaboration) mirrors it
          // into the fragment so every peer sees the seeded state.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor.commands.setContent(initialContent as any)
        }
      } catch { /* ignore — seed is best-effort */ }
    }

    return onProviderSynced(provider, trySeed)
    // `initialContent` resolves once per mount (parsed from defaultValue
    // at the top of this body). The keyed remount above guarantees we
    // get a fresh closure per collab session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, collabActive, room, name])

  // Cross-package suggestion bridge — sync the host's
  // `<PendingSuggestionsContext>` queue with the editor's `AiSuggestion`
  // extension. No-op when no provider is mounted (default no-op context).
  useAiSuggestionBridge(editor ?? null, name)

  // Re-render the toolbar when the selection / marks change so active-state
  // booleans stay fresh.
  const tick = useEditorTick(editor)

  return (
    <div className="relative flex flex-col">
      <input type="hidden" name={name} value={serialized} />
      {editor && toolbarGroups && toolbarGroups.length > 0 && (
        <Toolbar
          editor={editor}
          groups={toolbarGroups}
          tick={tick}
          textColors={textColors}
          customTextColors={customTextColors}
          highlightColors={highlightColors}
          onAttachOpenChange={setAttachOpen}
        />
      )}
      {/* Single mount for the attach-files dialog — toolbar's `attachFiles`
          button and slash menu's "Image" entry both flip `attachOpen`.
          Mounted at the editor level (not the toolbar) so it stays available
          when the toolbar is hidden via `.toolbar(false)`. */}
      {editor && (
        <AttachFilesDialog
          open={attachOpen}
          onOpenChange={setAttachOpen}
          editor={editor}
          fieldName={name}
          {...(uploadUrl !== undefined ? { uploadUrl } : {})}
          {...(acceptedFileTypes !== undefined ? { acceptedFileTypes } : {})}
          {...(maxAttachmentSize !== undefined ? { maxFileSize: maxAttachmentSize } : {})}
          {...(attachmentDir !== undefined ? { directory: attachmentDir } : {})}
          {...(attachmentVis !== undefined ? { visibility: attachmentVis } : {})}
        />
      )}
      <EditorContent editor={editor} />
      {editor && floatingEnabled && <FloatingToolbar editor={editor} />}
      {editor && <TableFloatingToolbar editor={editor} />}
      <SlashPopover state={slashState} keyHandlerRef={slashKeyRef} />
      <MentionPopover state={mentionState} keyHandlerRef={mentionKeyRef} />
      {editor && selectedBlock && (
        <BlockSidePanel
          key={`${selectedBlock.pos}:${selectedBlock.blockType}`}
          editor={editor}
          initialPos={selectedBlock.pos}
          blockType={selectedBlock.blockType}
          blocks={blocks}
          onClose={closeBlockPanel}
        />
      )}
    </div>
  )
}

/**
 * Cursor-anchored popover for the mention menu. Same Floating-UI / virtual-
 * element pattern as the slash popover — a `clientRect` lambda from the
 * Suggestion plugin powers a `getBoundingClientRect`-only anchor object.
 */
function MentionPopover({
  state,
  keyHandlerRef,
}: {
  state:         MentionState | null
  keyHandlerRef: MentionKeyHandlerRef
}) {
  const open = state !== null

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
          positionMethod="fixed"
          side="bottom"
          align="start"
          sideOffset={6}
          className="isolate z-50"
        >
          <Popover.Popup
            initialFocus={false}
            finalFocus={false}
            tabIndex={-1}
            className="origin-(--transform-origin) rounded-md border bg-popover text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            {state && (
              <MentionMenu
                trigger={state.trigger}
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

/**
 * Loose shape check — returns `true` only when the value looks like a Tiptap
 * (ProseMirror JSON) document: either an HTML string or an object that opens
 * with `{ type: 'doc' }` at the top level. Used by the collab seed effect to
 * skip leftover content from previous editors (notably Lexical's
 * `{ root: {...} }` envelope) without crashing Tiptap's strict node parser.
 *
 * The conservative posture: if we can't recognise the shape we don't seed.
 * Worst case the user sees an empty editor on the first collab session and
 * types fresh — better than the editor showing nothing because a parse threw.
 */
function isTiptapShapedContent(raw: unknown): boolean {
  if (typeof raw === 'string') return true            // HTML or raw text — Tiptap parses both.
  if (raw === null || typeof raw !== 'object') return false
  const obj = raw as { type?: unknown; content?: unknown; root?: unknown }
  if (obj.root !== undefined) return false            // Lexical state envelope — never Tiptap.
  return obj.type === 'doc'                           // ProseMirror JSON always opens with `type:'doc'`.
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
