import React, { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import {
  BoldIcon, ItalicIcon, StrikethroughIcon, LinkIcon,
  HeadingIcon, ListIcon, ListOrderedIcon, QuoteIcon,
  CodeIcon, PaperclipIcon, Loader2Icon,
} from 'lucide-react'
import { useFieldState } from '../FormStateContext.js'
import { useToast } from '../Toaster.js'
import { Button } from '../ui/button.js'
import { computeDelta, preserveCursor } from './textDelta.js'

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
  const { notify } = useToast()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  // Phase F.6 — IME composition gate. Set between `compositionstart` /
  // `compositionend`; the textarea's onChange skips `applyDelta` while
  // composing so intermediate chars don't emit ops. Lives at the
  // component scope so the onChange and composition handlers share it.
  const isComposingRef = useRef<boolean>(false)

  const initial = useMemo(() => stringValue(defaultValue), [])
  const [localValue, setLocalValue] = useState<string>(initial)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [busy, setBusy] = useState(false)

  // Phase F.6 — when a `<RecordCollabRoom>` is mounted and the field has
  // a `TextBinding`, the textarea is bound to a `Y.Text` and edits emit
  // `TextDelta`s. Mirrors the architecture in `TextLikeInput.tsx` but
  // wired in-line because MarkdownInput has its own toolbar + Preview
  // tab that also need to flow through the binding.
  const binding = fs.textBinding
  const [boundValue, setBoundValue] = useState<string>(() => binding?.read() ?? initial)
  const boundValueRef = useRef<string>(boundValue)
  useEffect(() => { boundValueRef.current = boundValue }, [boundValue])

  // On binding swap: read current Y.Text state. If non-empty, lift it
  // into local + form-map state. If empty (no peer has typed yet), leave
  // the SSR-default-derived `boundValue` showing — first edit will
  // emit a replace-from-empty delta that atomically populates Y.Text.
  // No client-side seed: Y.Text isn't safe to seed under concurrent
  // first-mounters (see @pilotiq-pro/collab `formCollabBinding.ts`).
  useEffect(() => {
    if (!binding) return
    const next = binding.read()
    if (next.length > 0) {
      setBoundValue(next)
      boundValueRef.current = next
      fs.setValue(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding])

  // Subscribe to remote changes. Local-echoes are filtered by the
  // `next === prev` guard. Cursor preserved via the same heuristic
  // used in `TextLikeInput.BoundTextInput`.
  useEffect(() => {
    if (!binding) return
    return binding.observe((next) => {
      const prev = boundValueRef.current
      if (next === prev) return
      const ta = textareaRef.current
      const cursor = ta?.selectionStart ?? next.length
      const restored = preserveCursor(prev, next, cursor)
      setBoundValue(next)
      boundValueRef.current = next
      fs.setValue(next)
      requestAnimationFrame(() => {
        if (!ta) return
        if (document.activeElement !== ta) return
        try { ta.setSelectionRange(restored, restored) } catch { /* defensive */ }
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding])

  const value = binding
    ? boundValue
    : (fs.controlled ? stringValue(fs.value) : localValue)

  const setValue = (next: string): void => {
    if (binding) {
      // Compute against current Y.Text contents (not the local ref) so:
      //  - first edit against empty Y.Text → `insert@0 <whole>` atomic
      //    populate (no separate seed op needed);
      //  - after a remote-applied update or server-resolve replace, the
      //    delta reflects the actual current shared state, not stale
      //    local bookkeeping.
      const before = binding.read()
      if (next !== before) {
        const delta = computeDelta(before, next)
        // Pre-stamp `boundValueRef.current = next` BEFORE `applyDelta`.
        // Y.Text's `observe` fires synchronously inside `applyDelta` for
        // our own write; without this the observer would see
        // `prev=before, next=after` and run `preserveCursor` — designed
        // for *remote* edits — which clobbers the user's caret on local
        // typing (scrambled output on mid-string inserts). With
        // `boundValueRef` already at `next`, the observer's
        // `next === prev` short-circuit fires and the cursor is left
        // alone for local echoes. Mirror of the same fix in
        // `BoundTextInput.commitDelta`.
        boundValueRef.current = next
        if (delta) binding.applyDelta(delta)
        setBoundValue(next)
      }
      fs.setValue(next)
      fs.triggerLive(next)
      return
    }
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
                onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  // Phase F.6 — when the binding is active and the user
                  // is mid-IME, paint locally and hold the delta until
                  // compositionend so we never emit ops for the
                  // intermediate composing chars.
                  if (binding && isComposingRef.current) {
                    setBoundValue(e.target.value)
                    return
                  }
                  setValue(e.target.value)
                },
                ...(binding ? {
                  onCompositionStart: () => { isComposingRef.current = true },
                  onCompositionEnd:   (e: React.CompositionEvent<HTMLTextAreaElement>) => {
                    isComposingRef.current = false
                    setValue(e.currentTarget.value)
                  },
                } : {}),
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

function stringValue(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  return String(v)
}
