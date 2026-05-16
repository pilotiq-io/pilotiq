import React, { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import type { MarkdownEditor as MarkdownEditorComponent } from '../MarkdownEditorRegistry.js'
import {
  BoldIcon, ItalicIcon, StrikethroughIcon, LinkIcon,
  HeadingIcon, ListIcon, ListOrderedIcon, QuoteIcon,
  CodeIcon, PaperclipIcon, Loader2Icon,
} from 'lucide-react'
import { useFieldState } from '../FormStateContext.js'
import { useCollabRoom } from '../CollabRoomContext.js'
import { getCollabTextRenderer, type CollabTextRenderer } from '../CollabTextRendererRegistry.js'
import { getMarkdownEditor } from '../MarkdownEditorRegistry.js'
import { useRowCoords } from '../RowCoordsContext.js'
import { parseRowFieldPath } from '../formStateHelpers.js'
import { useToast } from '../Toaster.js'
import { Button } from '../ui/button.js'

type ToolbarButton =
  | 'bold' | 'italic' | 'strike' | 'link'
  | 'heading' | 'bulletList' | 'orderedList' | 'blockquote'
  | 'codeBlock' | 'attachFiles'

/**
 * Plain-markdown editor. Stores the raw string under `name`. Renders a
 * tab switcher (Write / Preview), a configurable formatting toolbar, and
 * a `<textarea>`. The Preview tab parses the current value via `marked`
 * and mounts the result in a `prose`-styled container.
 *
 * `attachFiles` is special-cased — when present in the toolbar AND
 * `uploadUrl` is set, the toolbar button + paste-image handler upload
 * the file and splice an `![alt](returnedUrl)` reference at the cursor.
 * The server's `MarkdownField.toMeta()` strips the button from the
 * toolbar list when no `UploadAdapter` is registered, so we never see
 * an `attachFiles` entry without a working upload route.
 */
export function MarkdownInput({
  name, defaultValue, disabled, placeholder,
  toolbarButtons, minHeight, maxHeight,
  fileAttachmentsDirectory, fileAttachmentsVisibility,
  uploadUrl,
}: {
  name:                       string
  defaultValue:               unknown
  disabled:                   boolean
  placeholder:                string | undefined
  toolbarButtons:             ToolbarButton[]
  minHeight:                  string | undefined
  maxHeight:                  string | undefined
  fileAttachmentsDirectory:   string | undefined
  fileAttachmentsVisibility:  string | undefined
  uploadUrl:                  string | undefined
}): React.ReactElement {
  const fs = useFieldState(name)
  const room = useCollabRoom()
  const collabRenderer = getCollabTextRenderer()
  const markdownEditor = getMarkdownEditor()
  const rowCoords = useRowCoords()

  // Plug-supplied WYSIWYG markdown editor (typically `@pilotiq/tiptap`'s
  // Tiptap + tiptap-markdown integration). When registered, it replaces
  // BOTH the legacy non-collab textarea path AND the prior collab plain-text
  // path with a single rich editor that handles WYSIWYG editing, markdown
  // serialization, and collab binding (via its own `useCollabRoom()` read)
  // internally. Repeater/Builder row leaves still bypass it — dotted-path
  // field names don't have a stable Y.XmlFragment key today; see
  // `MarkdownCollabInput` below for the prior row-aware path that stays as
  // the fallback inside Repeater/Builder rows.
  const isRowLeaf = name.includes('.')
  if (markdownEditor && !isRowLeaf) {
    return (
      <MarkdownEditorHost
        Editor={markdownEditor}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        {...(placeholder !== undefined ? { placeholder } : {})}
        toolbarButtons={toolbarButtons}
        {...(minHeight !== undefined ? { minHeight } : {})}
        {...(maxHeight !== undefined ? { maxHeight } : {})}
        {...(fileAttachmentsDirectory !== undefined ? { fileAttachmentsDirectory } : {})}
        {...(fileAttachmentsVisibility !== undefined ? { fileAttachmentsVisibility } : {})}
        {...(uploadUrl !== undefined ? { uploadUrl } : {})}
      />
    )
  }

  // Tiptap-backed plain-text editor for markdown source when collab is on.
  // Same architectural fix as `TextLikeInput`'s `CollabTextField`:
  // y-prosemirror's `RelativePosition` cursor anchoring against a
  // `Y.XmlFragment` replaces whole-string LWW. Row leaves get the
  // composite-key transform via `useRowCoords()` + `parseRowFieldPath`
  // (same shape as TextLikeInput) so the fragment survives row reorders.
  //
  // Tradeoff: the markdown toolbar + Cmd-shortcuts + paste-image upload
  // all operate on a `<textarea>`'s DOM selection — they don't have a
  // way to reach into the Tiptap editor's selection without exposing the
  // editor instance, which would widen the renderer seam. Those features
  // are write-mode-only on the native path; collab users type markdown
  // syntax directly (`**bold**`, `## heading`). The preview tab keeps
  // working since `MarkdownCollabInput` maintains a local mirror.
  const fragmentKey: string | null = (() => {
    if (!name.includes('.')) return name
    if (!rowCoords) return null
    const parsed = parseRowFieldPath(name)
    if (!parsed) return null
    if (parsed.arrayName !== rowCoords.arrayName) return null
    if (parsed.index     !== rowCoords.rowIndex)  return null
    return `${rowCoords.arrayName}.${rowCoords.rowId}.${parsed.fieldName}`
  })()
  if (room && collabRenderer && fragmentKey !== null) {
    return (
      <MarkdownCollabInput
        Renderer={collabRenderer}
        fragmentKey={fragmentKey}
        hiddenInputName={name}
        defaultValue={defaultValue}
        disabled={disabled}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(minHeight !== undefined ? { minHeight } : {})}
        {...(maxHeight !== undefined ? { maxHeight } : {})}
      />
    )
  }

  const { notify } = useToast()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const initial = useMemo(() => stringValue(defaultValue), [])
  const [localValue, setLocalValue] = useState<string>(initial)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [busy, setBusy] = useState(false)

  const value = fs.controlled ? stringValue(fs.value) : localValue

  const setValue = (next: string): void => {
    if (fs.controlled) { fs.setValue(next); fs.triggerLive(next) }
    else                { setLocalValue(next); fs.triggerLive(next) }
  }

  const previewHtml = useMemo(
    () => tab === 'preview' ? marked.parse(value, { gfm: true, breaks: false, async: false }) as string : '',
    [tab, value],
  )

  /** Splice text around the current selection in the textarea. */
  const transform = (fn: (sel: string, before: string, after: string) => {
    next: string
    cursor: { start: number; end: number }
  }): void => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end   = ta.selectionEnd
    const sel   = ta.value.slice(start, end)
    const before = ta.value.slice(0, start)
    const after  = ta.value.slice(end)
    const { next, cursor } = fn(sel, before, after)
    setValue(next)
    // Defer cursor restore until React has flushed the new value.
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(cursor.start, cursor.end)
    })
  }

  const wrapSelection = (open: string, close: string = open, placeholderText = ''): void => {
    transform((sel, before, after) => {
      const text = sel || placeholderText
      const next = `${before}${open}${text}${close}${after}`
      const start = before.length + open.length
      const end   = start + text.length
      return { next, cursor: { start, end } }
    })
  }

  const prefixLine = (prefix: string): void => {
    transform((sel, before, after) => {
      // Find the start of the line containing selection start.
      const lineStart = before.lastIndexOf('\n') + 1
      const head = before.slice(0, lineStart)
      const lineHead = before.slice(lineStart)
      const next = `${head}${prefix}${lineHead}${sel}${after}`
      const newPos = before.length + prefix.length
      return { next, cursor: { start: newPos, end: newPos + sel.length } }
    })
  }

  const insertOrderedList = (): void => {
    transform((sel, before, after) => {
      const lines = (sel || 'List item').split('\n')
      const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join('\n')
      const next = `${before}${numbered}${after}`
      return { next, cursor: { start: before.length, end: before.length + numbered.length } }
    })
  }

  const insertLink = (): void => {
    const url = window.prompt('URL') ?? ''
    if (!url) return
    transform((sel, before, after) => {
      const text = sel || 'link text'
      const md = `[${text}](${url})`
      return { next: `${before}${md}${after}`, cursor: { start: before.length + 1, end: before.length + 1 + text.length } }
    })
  }

  const insertCodeBlock = (): void => {
    transform((sel, before, after) => {
      const fence = '```'
      const body  = sel || 'code'
      const md    = `${fence}\n${body}\n${fence}`
      const start = before.length + fence.length + 1
      const end   = start + body.length
      return { next: `${before}${md}${after}`, cursor: { start, end } }
    })
  }

  const uploadAndInsert = async (file: File): Promise<void> => {
    if (!uploadUrl) {
      notify({ type: 'error', title: 'Upload URL missing', body: 'Pilotiq panel has no upload route configured.' })
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (fileAttachmentsDirectory)  fd.append('directory',  fileAttachmentsDirectory)
      if (fileAttachmentsVisibility) fd.append('visibility', fileAttachmentsVisibility)
      fd.append('fieldName', name)
      const res = await fetch(uploadUrl, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
      const data = await res.json().catch(() => ({} as { ok?: boolean; url?: string; error?: string }))
      if (!res.ok || !data.ok || !data.url) {
        notify({ type: 'error', title: 'Upload failed', body: data.error ?? `Status ${res.status}` })
        return
      }
      const isImage = file.type.startsWith('image/')
      transform((sel, before, after) => {
        const alt = sel || file.name
        const md = isImage ? `![${alt}](${data.url})` : `[${alt}](${data.url})`
        return { next: `${before}${md}${after}`, cursor: { start: before.length + md.length, end: before.length + md.length } }
      })
    } catch (err) {
      notify({ type: 'error', title: 'Upload failed', body: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  const onAttachClick = (): void => {
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) void uploadAndInsert(file)
    }
    input.click()
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    if (!toolbarButtons.includes('attachFiles') || !uploadUrl) return
    const items = Array.from(e.clipboardData?.items ?? [])
    const fileItem = items.find(it => it.kind === 'file' && it.type.startsWith('image/'))
    if (!fileItem) return
    const file = fileItem.getAsFile()
    if (!file) return
    e.preventDefault()
    void uploadAndInsert(file)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const meta = e.metaKey || e.ctrlKey
    if (!meta) return
    const key = e.key.toLowerCase()
    if (key === 'b') { e.preventDefault(); wrapSelection('**', '**', 'bold text') }
    else if (key === 'i') { e.preventDefault(); wrapSelection('*', '*', 'italic text') }
    else if (key === 'k') { e.preventDefault(); insertLink() }
  }

  const buttonHandler: Record<ToolbarButton, () => void> = {
    bold:        () => wrapSelection('**', '**', 'bold text'),
    italic:      () => wrapSelection('*', '*', 'italic text'),
    strike:      () => wrapSelection('~~', '~~', 'strikethrough'),
    link:        insertLink,
    heading:     () => prefixLine('## '),
    bulletList:  () => prefixLine('- '),
    orderedList: insertOrderedList,
    blockquote:  () => prefixLine('> '),
    codeBlock:   insertCodeBlock,
    attachFiles: onAttachClick,
  }

  const buttonIcon: Record<ToolbarButton, React.ComponentType<{ className?: string }>> = {
    bold:        BoldIcon,
    italic:      ItalicIcon,
    strike:      StrikethroughIcon,
    link:        LinkIcon,
    heading:     HeadingIcon,
    bulletList:  ListIcon,
    orderedList: ListOrderedIcon,
    blockquote:  QuoteIcon,
    codeBlock:   CodeIcon,
    attachFiles: PaperclipIcon,
  }

  const buttonLabel: Record<ToolbarButton, string> = {
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

  const taStyle: React.CSSProperties = {}
  if (minHeight) taStyle.minHeight = minHeight
  if (maxHeight) taStyle.maxHeight = maxHeight

  return (
    <div className="flex flex-col rounded-md border bg-background">
      <div className="flex items-center justify-between border-b px-2 py-1 gap-2">
        <div className="flex items-center gap-0.5">
          <TabButton active={tab === 'write'} onClick={() => setTab('write')}>Write</TabButton>
          <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>Preview</TabButton>
        </div>
        {tab === 'write' && toolbarButtons.length > 0 && (
          <div className="flex items-center gap-0.5">
            {toolbarButtons.map((b) => {
              const Icon = buttonIcon[b]
              const isAttach = b === 'attachFiles'
              return (
                <Button
                  key={b}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-7 p-0"
                  onClick={buttonHandler[b]}
                  disabled={disabled || (isAttach && busy)}
                  title={buttonLabel[b]}
                  aria-label={buttonLabel[b]}
                >
                  {isAttach && busy
                    ? <Loader2Icon className="size-4 animate-spin" />
                    : <Icon className="size-4" />}
                </Button>
              )
            })}
          </div>
        )}
      </div>

      {tab === 'write' ? (
        <textarea
          ref={textareaRef}
          name={name}
          id={name}
          className="w-full resize-y bg-transparent px-3 py-2 text-sm font-mono leading-relaxed outline-none disabled:opacity-50"
          style={taStyle}
          placeholder={placeholder}
          disabled={disabled}
          {...(fs.controlled
            ? {
                value,
                onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value),
              }
            : { defaultValue: initial, onChange: (e) => setLocalValue(e.target.value) })}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
        />
      ) : (
        <>
          <input type="hidden" name={name} value={value} readOnly />
          <div
            className="prose prose-sm dark:prose-invert max-w-none px-3 py-2"
            style={taStyle}
            dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-muted-foreground italic">Nothing to preview</p>' }}
          />
        </>
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
        'px-3 py-1 text-xs font-medium rounded transition-colors',
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

/**
 * Phase B follow-up — collab-aware markdown editor. Mounts the registered
 * Tiptap-backed plain-text renderer for the Write pane and reuses the
 * existing `marked` pipeline for Preview. No toolbar, no Cmd-shortcuts, no
 * paste-image upload — those features depend on textarea-DOM splicing that
 * doesn't translate to Tiptap's selection model. The cursor-bug fix is the
 * load-bearing change; markdown-syntax authors keep typing as before.
 */
function MarkdownCollabInput({
  Renderer, fragmentKey, hiddenInputName, defaultValue, disabled, placeholder, minHeight, maxHeight,
}: {
  Renderer:        CollabTextRenderer
  fragmentKey:     string
  hiddenInputName: string
  defaultValue:    unknown
  disabled:        boolean
  placeholder?:    string
  minHeight?:      string
  maxHeight?:      string
}): React.ReactElement {
  const fs = useFieldState(hiddenInputName)
  const initial = useMemo(() => stringValue(defaultValue), [])
  const [text, setText] = useState<string>(initial)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const textRef = useRef(text)
  useEffect(() => { textRef.current = text }, [text])

  const handleChange = (next: string): void => {
    setText(next)
    if (fs.controlled) fs.setValue(next)
    fs.triggerLive(next)
  }
  const handleBlur = (): void => { /* fire-and-forget — live trigger already ran on change */ }

  const previewHtml = useMemo(
    () => tab === 'preview' ? marked.parse(text, { gfm: true, breaks: false, async: false }) as string : '',
    [tab, text],
  )

  const wrapperStyle: React.CSSProperties = {}
  if (minHeight) wrapperStyle.minHeight = minHeight
  if (maxHeight) wrapperStyle.maxHeight = maxHeight

  return (
    <div className="flex flex-col rounded-md border bg-background">
      <div className="flex items-center border-b px-2 py-1">
        <TabButton active={tab === 'write'}   onClick={() => setTab('write')}>Write</TabButton>
        <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>Preview</TabButton>
      </div>
      {tab === 'write' ? (
        <div style={wrapperStyle} className="overflow-auto">
          <input type="hidden" name={hiddenInputName} value={text} />
          <Renderer
            name={fragmentKey}
            multiline={true}
            defaultValue={initial}
            {...(placeholder !== undefined ? { placeholder } : {})}
            disabled={disabled}
            onChange={handleChange}
            onBlur={handleBlur}
            className="w-full bg-transparent px-3 py-2 text-sm font-mono leading-relaxed outline-none disabled:opacity-50 whitespace-pre-wrap break-words"
          />
        </div>
      ) : (
        <>
          <input type="hidden" name={hiddenInputName} value={text} readOnly />
          <div
            className="prose prose-sm dark:prose-invert max-w-none px-3 py-2"
            style={wrapperStyle}
            dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-muted-foreground italic">Nothing to preview</p>' }}
          />
        </>
      )}
    </div>
  )
}

function stringValue(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  return String(v)
}

/**
 * Bridges the registered adapter editor (`@pilotiq/tiptap`'s `MarkdownEditor`)
 * to pilotiq's form-state + form-submit wire shape. The adapter owns the
 * editor surface (WYSIWYG, toolbar, paste-image, optional source / preview
 * tabs) and its own collab binding via `useCollabRoom()`; this host just
 * threads form-state updates and writes the current markdown to a hidden
 * input so submit picks it up unchanged.
 */
function MarkdownEditorHost({
  Editor, name, defaultValue, disabled, placeholder,
  toolbarButtons, minHeight, maxHeight,
  fileAttachmentsDirectory, fileAttachmentsVisibility, uploadUrl,
}: {
  Editor:                     MarkdownEditorComponent
  name:                       string
  defaultValue:               unknown
  disabled:                   boolean
  placeholder?:               string
  toolbarButtons:             ReadonlyArray<string>
  minHeight?:                 string
  maxHeight?:                 string
  fileAttachmentsDirectory?:  string
  fileAttachmentsVisibility?: string
  uploadUrl?:                 string
}): React.ReactElement {
  const fs = useFieldState(name)
  const initial = useMemo(() => stringValue(defaultValue), [])
  const [text, setText] = useState<string>(initial)

  const handleChange = (next: string): void => {
    setText(next)
    if (fs.controlled) fs.setValue(next)
    fs.triggerLive(next)
  }
  const handleBlur = (): void => { /* live trigger already ran on change */ }

  return (
    <>
      <input type="hidden" name={name} value={text} readOnly />
      <Editor
        name={name}
        defaultValue={initial}
        disabled={disabled}
        {...(placeholder !== undefined ? { placeholder } : {})}
        toolbarButtons={toolbarButtons}
        {...(minHeight !== undefined ? { minHeight } : {})}
        {...(maxHeight !== undefined ? { maxHeight } : {})}
        {...(fileAttachmentsDirectory !== undefined ? { fileAttachmentsDirectory } : {})}
        {...(fileAttachmentsVisibility !== undefined ? { fileAttachmentsVisibility } : {})}
        {...(uploadUrl !== undefined ? { uploadUrl } : {})}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </>
  )
}
