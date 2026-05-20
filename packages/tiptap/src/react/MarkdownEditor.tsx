import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
// The `tiptap-markdown` chain (incl. CJS-only `markdown-it-task-lists`) is
// pre-bundled into `dist/markdownExtension.js` at @pilotiq/tiptap build
// time; importing the wrapper instead of `tiptap-markdown` directly
// keeps the CJS interop on our side of the dist boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { Markdown } from '../markdownExtension.js'
import {
  useCollabRoom,
  getCollabExtensions,
  onProviderSynced,
  type MarkdownEditorProps,
} from '@pilotiq/pilotiq/react'
import { AiSuggestionExtension } from '../extensions/AiSuggestionExtension.js'
import { useAiSuggestionBridge } from './useAiSuggestionBridge.js'

// Inline lucide.dev SVGs — same posture as `toolbarButtons.tsx` so this
// package doesn't pull `lucide-react` as a peer dep. Keep stroke / size
// consistent with the rich-text toolbar.
const ICON_PROPS = {
  width: 14, height: 14, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': 'true' as const,
}
const Spinner = (
  <svg {...ICON_PROPS} className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)
const SvgIcons: Record<string, React.ReactElement> = {
  bold: (
    <svg {...ICON_PROPS} strokeWidth={2.25}>
      <path d="M6 12h9a4 4 0 0 1 0 8H6Z" />
      <path d="M6 4h7a4 4 0 0 1 0 8H6Z" />
    </svg>
  ),
  italic: (
    <svg {...ICON_PROPS}>
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  ),
  strike: (
    <svg {...ICON_PROPS}>
      <path d="M16 4H9a3 3 0 0 0-2.83 4" />
      <path d="M14 12a4 4 0 0 1 0 8H6" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  ),
  link: (
    <svg {...ICON_PROPS}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71" />
    </svg>
  ),
  heading: <span className="text-xs font-semibold leading-none">H2</span>,
  bulletList: (
    <svg {...ICON_PROPS}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  ),
  orderedList: (
    <svg {...ICON_PROPS}>
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </svg>
  ),
  blockquote: (
    <svg {...ICON_PROPS}>
      <path d="M3 21c3 0 7-1 7-8V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3" />
      <path d="M15 21c3 0 7-1 7-8V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3" />
    </svg>
  ),
  codeBlock: (
    <svg {...ICON_PROPS}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  attachFiles: (
    <svg {...ICON_PROPS}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  ),
  pencil: (
    <svg {...ICON_PROPS}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  source: (
    <svg {...ICON_PROPS}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  ),
  eye: (
    <svg {...ICON_PROPS}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
}

/**
 * Plug-in WYSIWYG markdown editor registered with pilotiq core's
 * `registerMarkdownEditor()`. Replaces the legacy textarea + manual-toolbar
 * UI with a real rich editor; serializes to markdown on every change via
 * `tiptap-markdown` so the wire format stays a plain markdown string under
 * the field name.
 *
 * Collab-aware: when a `<RecordCollabRoom>` is mounted up-tree AND
 * `registerCollabExtensions()` ran (both shipped by `@pilotiq-pro/collab`),
 * the editor binds to the room's shared `Y.XmlFragment` via Tiptap's
 * `Collaboration` extension. Every peer mounts the same editor against the
 * same fragment; markdown serialization runs locally per peer so only the
 * ProseMirror tree crosses the wire.
 *
 * Tabs (top-right):
 *   - **Editor** (default) — WYSIWYG.
 *   - **Source** — raw markdown textarea; on switch back to Editor the editor
 *     parses the textarea contents (round-trips through tiptap-markdown).
 *   - **Preview** — read-only render of the current markdown via the editor's
 *     own HTML output. Same view a user would see on the public site if the
 *     resource ships a read-side renderer.
 *
 * Single-source-of-truth posture: the editor's `onUpdate` is the canonical
 * write path. Source-tab edits flow back through the editor on tab-switch
 * (no dual state, no drift between source and editor doc).
 */
export function MarkdownEditor({
  name,
  defaultValue,
  placeholder,
  disabled = false,
  onChange,
  onBlur,
  toolbarButtons,
  minHeight,
  maxHeight,
  fileAttachmentsDirectory,
  fileAttachmentsVisibility,
  uploadUrl,
}: MarkdownEditorProps): React.ReactElement | null {
  const room    = useCollabRoom()
  const factory = getCollabExtensions()
  const collabActive = !!(room && factory)

  const [tab, setTab] = useState<'editor' | 'source' | 'preview'>('editor')
  const [sourceDraft, setSourceDraft] = useState<string>(defaultValue)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Collab extension factory output. Built once per editor mount (the
  // factory closes over the room's ydoc + provider + field name); keyed
  // remount below ensures we never swap it underneath the running editor.
  const collabExtensions = useMemo<AnyExtension[]>(() => {
    if (!collabActive || !room || !factory) return []
    return factory({
      ydoc:      room.ydoc,
      provider:  room.provider,
      fieldName: name,
      ...(room.user ? { user: room.user } : {}),
    }) as AnyExtension[]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabActive])

  const editor = useEditor(
    {
      // Tiptap v3 SSR guard. With `immediatelyRender: true` (default)
      // `useEditor` touches the DOM during construction; under Vike's
      // `onRenderHtml` that throws "SSR has been detected, please set
      // `immediatelyRender` explicitly to `false` to avoid hydration
      // mismatches." Deferring until the first React effect lets SSR
      // produce an empty shell + hydration mount the live editor.
      immediatelyRender: false,
      editable: !disabled,
      extensions: [
        StarterKit.configure({
          link: { openOnClick: false, autolink: true },
          // Collaboration brings its own Yjs-backed history — disable
          // StarterKit's local undoRedo when collab is active (else Tiptap
          // logs a "not compatible with @tiptap/extension-undo-redo" warning).
          ...(collabActive ? { undoRedo: false } : {}),
        }),
        // Markdown round-trip — parses `content` (when non-collab) and
        // exposes `editor.storage.markdown.getMarkdown()`. We pass `html:
        // false` because the wire format is markdown only.
        Markdown.configure({
          html:        false,
          tightLists:  true,
          breaks:      false,
          linkify:     true,
          transformPastedText: true,
          transformCopiedText: true,
        }),
        Image.configure({ inline: false, allowBase64: false }),
        Placeholder.configure({ placeholder: placeholder ?? 'Write in markdown…' }),
        // AI suggestions — always-on extension that tracks suggested edits as
        // inline strikethrough + Approve/Reject chip widgets. Idle until the
        // host calls `editor.commands.addAiSuggestion(...)` via the bridge below.
        // Matches the `TiptapEditor` wiring so suggestion mode works uniformly
        // across RichTextField / MarkdownField / TextField+TextareaField.
        AiSuggestionExtension,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(collabExtensions as any[]),
      ],
      // Collab takes ownership of the document — passing `content` would
      // race the Y.XmlFragment sync. Seed after first connect (effect below).
      content: collabActive ? '' : defaultValue,
      onUpdate({ editor }) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const storage = (editor.storage as any).markdown
        const md = typeof storage?.getMarkdown === 'function' ? storage.getMarkdown() : ''
        onChange(md)
      },
      onBlur() { onBlur?.() },
    },
    // Re-mount when collab toggles. Other props (name, placeholder) are
    // stable per mount — the field renderer doesn't swap them at runtime.
    [collabActive],
  )

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled && tab === 'editor')
  }, [editor, disabled, tab])

  // Cross-package suggestion bridge — sync the host's
  // `<PendingSuggestionsContext>` queue with the editor's `AiSuggestion`
  // extension. No-op when no provider is mounted (default no-op context).
  useAiSuggestionBridge(editor ?? null, name)

  // First-load seed for collab. Collaboration starts the editor empty
  // regardless of `content`; once the provider syncs from the server we
  // check whether the field's `Y.XmlFragment` was ever written. Empty +
  // we have an initial value = first session for this record. Mirrors
  // the rich-text TiptapEditor seed path and the CollabTextRenderer seed.
  const [hasSeeded, setHasSeeded] = useState(false)
  useEffect(() => {
    if (!editor || !collabActive || !room || hasSeeded) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ydoc     = room.ydoc as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = room.provider as any
    if (!ydoc || !provider) return

    const trySeed = (): void => {
      try {
        const fragment = ydoc.getXmlFragment(name)
        if (fragment && fragment.length === 0 && defaultValue) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cmd = (editor.commands as any).setContent
          if (cmd) cmd(defaultValue)
        }
        setHasSeeded(true)
      } catch {
        setHasSeeded(true)
      }
    }

    return onProviderSynced(provider, trySeed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, collabActive, room])

  // Source-tab → Editor: parse the textarea back into the editor (this also
  // emits onChange via the editor's onUpdate). One-way during the same flip.
  const enterEditorTab = (): void => {
    if (tab === 'source' && editor) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(editor.commands as any).setContent(sourceDraft)
      } catch { /* ignore parse errors */ }
    }
    setTab('editor')
  }

  const enterSourceTab = (): void => {
    if (editor) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storage = (editor.storage as any).markdown
      const md = typeof storage?.getMarkdown === 'function' ? storage.getMarkdown() : ''
      setSourceDraft(md)
    }
    setTab('source')
  }

  const enterPreviewTab = (): void => {
    setTab('preview')
  }

  // Live preview HTML is the editor's own HTML output — same renderer that
  // produced what the user sees in the Editor tab. Read-only.
  const previewHtml = useMemo<string>(() => {
    if (tab !== 'preview' || !editor) return ''
    try {
      return editor.getHTML()
    } catch {
      return ''
    }
  }, [tab, editor])

  const uploadAndInsert = async (file: File): Promise<void> => {
    if (!uploadUrl || !editor) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (fileAttachmentsDirectory)  fd.append('directory',  fileAttachmentsDirectory)
      if (fileAttachmentsVisibility) fd.append('visibility', fileAttachmentsVisibility)
      fd.append('fieldName', name)
      const res = await fetch(uploadUrl, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
      const data = await res.json().catch(() => ({} as { ok?: boolean; url?: string; error?: string }))
      if (!res.ok || !data.ok || !data.url) return
      const isImage = file.type.startsWith('image/')
      if (isImage) {
        editor.chain().focus().setImage({ src: data.url, alt: file.name }).run()
      } else {
        editor.chain().focus().insertContent(`[${file.name}](${data.url})`).run()
      }
    } finally {
      setUploading(false)
    }
  }

  const onAttachClick = (): void => {
    const el = fileInputRef.current
    if (el) el.click()
  }

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (file) void uploadAndInsert(file)
    e.target.value = ''
  }

  // Toolbar item resolution. The pilotiq-side ids map onto Tiptap commands.
  // attachFiles is gated on a configured uploadUrl (server strips it server-
  // side when no adapter is registered, but defensive double-gate here too).
  const allow = useMemo(() => new Set(toolbarButtons), [toolbarButtons])
  const canAttach = allow.has('attachFiles') && !!uploadUrl

  const exec = (id: string): void => {
    if (!editor) return
    const c = editor.chain().focus()
    switch (id) {
      case 'bold':        c.toggleBold().run();         break
      case 'italic':      c.toggleItalic().run();       break
      case 'strike':      c.toggleStrike().run();       break
      case 'link': {
        const prev = editor.getAttributes('link').href as string | undefined
        const url = window.prompt('URL', prev ?? '') ?? ''
        if (url === '')      c.unsetLink().run()
        else                 c.extendMarkRange('link').setLink({ href: url }).run()
        break
      }
      case 'heading':     c.toggleHeading({ level: 2 }).run(); break
      case 'bulletList':  c.toggleBulletList().run();   break
      case 'orderedList': c.toggleOrderedList().run();  break
      case 'blockquote':  c.toggleBlockquote().run();   break
      case 'codeBlock':   c.toggleCodeBlock().run();    break
      case 'attachFiles': onAttachClick();              break
      default:            /* unknown id — skip */       break
    }
  }

  const isActive = (id: string): boolean => {
    if (!editor) return false
    switch (id) {
      case 'bold':        return editor.isActive('bold')
      case 'italic':      return editor.isActive('italic')
      case 'strike':      return editor.isActive('strike')
      case 'link':        return editor.isActive('link')
      case 'heading':     return editor.isActive('heading', { level: 2 })
      case 'bulletList':  return editor.isActive('bulletList')
      case 'orderedList': return editor.isActive('orderedList')
      case 'blockquote':  return editor.isActive('blockquote')
      case 'codeBlock':   return editor.isActive('codeBlock')
      default:            return false
    }
  }

  const labels: Record<string, string> = {
    bold:        'Bold (⌘B)',
    italic:      'Italic (⌘I)',
    strike:      'Strikethrough',
    link:        'Link (⌘K)',
    heading:     'Heading',
    bulletList:  'Bulleted list',
    orderedList: 'Numbered list',
    blockquote:  'Quote',
    codeBlock:   'Code block',
    attachFiles: 'Attach file',
  }

  const wrapperStyle: React.CSSProperties = {}
  if (minHeight) wrapperStyle.minHeight = minHeight
  if (maxHeight) wrapperStyle.maxHeight = maxHeight

  return (
    <div className="flex flex-col rounded-md border bg-background">
      {canAttach && (
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onFilePicked}
        />
      )}
      <div className="flex items-center justify-between border-b px-2 py-1 gap-2">
        <div className="flex items-center gap-0.5">
          <TabButton active={tab === 'editor'}  onClick={enterEditorTab}>
            {SvgIcons['pencil']} Editor
          </TabButton>
          <TabButton active={tab === 'source'}  onClick={enterSourceTab}>
            {SvgIcons['source']} Source
          </TabButton>
          <TabButton active={tab === 'preview'} onClick={enterPreviewTab}>
            {SvgIcons['eye']} Preview
          </TabButton>
        </div>
        {tab === 'editor' && toolbarButtons.length > 0 && (
          <div className="flex items-center gap-0.5">
            {toolbarButtons.map((b: string) => {
              if (b === 'attachFiles' && !canAttach) return null
              const icon = SvgIcons[b]
              if (!icon) return null
              const isAttach = b === 'attachFiles'
              const active = isActive(b)
              return (
                <button
                  key={b}
                  type="button"
                  className={[
                    'inline-flex size-7 items-center justify-center rounded text-foreground transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent hover:text-accent-foreground',
                    'disabled:opacity-50',
                  ].join(' ')}
                  onClick={() => exec(b)}
                  disabled={disabled || (isAttach && uploading)}
                  title={labels[b] ?? b}
                  aria-label={labels[b] ?? b}
                  aria-pressed={active}
                >
                  {isAttach && uploading ? Spinner : icon}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {tab === 'editor' && (
        <div
          className="prose prose-sm dark:prose-invert max-w-none px-3 py-2 [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[6rem]"
          style={wrapperStyle}
        >
          <EditorContent editor={editor} />
        </div>
      )}

      {tab === 'source' && (
        <textarea
          className="w-full resize-y bg-transparent px-3 py-2 text-sm font-mono leading-relaxed outline-none disabled:opacity-50"
          style={wrapperStyle}
          value={sourceDraft}
          onChange={(e) => setSourceDraft(e.target.value)}
          {...(placeholder !== undefined ? { placeholder } : {})}
          disabled={disabled}
          aria-label={`${name} (markdown source)`}
        />
      )}

      {tab === 'preview' && (
        <div
          className="prose prose-sm dark:prose-invert max-w-none px-3 py-2"
          style={wrapperStyle}
          dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-muted-foreground italic">Nothing to preview</p>' }}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      className={[
        'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:text-foreground',
      ].join(' ')}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
