import React, { useRef, useState } from 'react'
import { UploadIcon, XIcon, FileIcon, Loader2Icon } from 'lucide-react'
import { useFieldState } from '../FormStateContext.js'
import { useToast } from '../Toaster.js'
import { Button } from '../ui/button.js'

/**
 * File upload UI. On file pick → POST multipart to `uploadUrl` →
 * stash returned URL in form state. Single-file shows the URL +
 * preview thumb (when image). Multi-file accumulates a list.
 *
 * No DnD upload, no chunked uploads, no client-side image processing
 * — v1 is "pick a file, send it, store the URL." Adapters do the work.
 */
export function FileUploadInput({
  name, defaultValue, disabled, accept, maxSize, multiple, preview, directory, uploadUrl,
}: {
  name:         string
  defaultValue: unknown
  disabled:     boolean
  accept:       string[] | undefined
  maxSize:      number | undefined
  multiple:     boolean
  preview:      boolean
  directory:    string | undefined
  uploadUrl:    string | undefined
}): React.ReactElement {
  const fs   = useFieldState(name)
  const { notify } = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)

  const toUrls = (v: unknown): string[] => {
    if (v === undefined || v === null || v === '') return []
    if (Array.isArray(v)) return v.map(String)
    if (typeof v === 'string') {
      // JSON-array string from a previous round-trip
      if (v.startsWith('[')) {
        try {
          const arr = JSON.parse(v)
          if (Array.isArray(arr)) return arr.map(String)
        } catch { /* fall through */ }
      }
      return [v]
    }
    return []
  }

  const [localUrls, setLocalUrls] = useState<string[]>(toUrls(defaultValue))
  const urls = fs.controlled ? toUrls(fs.value) : localUrls
  const [busy, setBusy] = useState(false)

  const setUrls = (next: string[]): void => {
    if (fs.controlled) {
      fs.setValue(multiple ? next : (next[0] ?? null))
      fs.triggerLive()
    } else {
      setLocalUrls(next)
    }
  }

  const onPick = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return
    if (!uploadUrl) {
      notify({ type: 'error', title: 'Upload URL missing', body: 'Pilotiq panel has no upload route configured.' })
      return
    }
    setBusy(true)
    const next = multiple ? [...urls] : []
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        if (directory) fd.append('directory', directory)
        if (accept)    fd.append('accept', accept.join(','))
        if (maxSize !== undefined) fd.append('maxSize', String(maxSize))
        fd.append('fieldName', name)
        const res = await fetch(uploadUrl, {
          method:  'POST',
          body:    fd,
          headers: { Accept: 'application/json' },
        })
        const json = await res.json().catch(() => ({})) as { ok?: boolean; url?: string; error?: string }
        if (!res.ok || !json.ok || !json.url) {
          notify({ type: 'error', title: 'Upload failed', body: json.error ?? `HTTP ${res.status}` })
          continue
        }
        next.push(json.url)
        if (!multiple) break
      }
      setUrls(next)
    } finally {
      setBusy(false)
      // Reset the input so the user can re-pick the same file (browsers
      // suppress onChange when the value hasn't changed).
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeAt = (i: number): void => {
    const next = urls.filter((_, idx) => idx !== i)
    setUrls(next)
  }

  // Hidden input for form-post fallback. Multi-file mode encodes as JSON
  // so the server's coerceFormValues fileUpload branch can decode.
  const hiddenValue = multiple ? JSON.stringify(urls) : (urls[0] ?? '')

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={hiddenValue} readOnly />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
        >
          {busy ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <UploadIcon className="size-4" />
          )}
          {multiple ? 'Choose files' : 'Choose file'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept ? accept.join(',') : undefined}
          multiple={multiple}
          onChange={(e) => { void onPick(e.target.files) }}
        />
        {maxSize !== undefined && (
          <span className="text-xs text-muted-foreground">
            Max {Math.round(maxSize / 1024)} KB
          </span>
        )}
      </div>

      {urls.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {urls.map((url, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5 text-sm">
              {preview && isImage(url)
                ? <img src={url} alt="" className="size-8 rounded object-cover" />
                : <FileIcon className="size-4 text-muted-foreground" />
              }
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate hover:underline"
              >
                {fileNameFrom(url)}
              </a>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeAt(i)}
                disabled={disabled}
                aria-label="Remove file"
              >
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function isImage(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)
}

function fileNameFrom(url: string): string {
  try {
    const u = new URL(url, 'http://_')
    const p = u.pathname.split('/').filter(Boolean).pop()
    return p ?? url
  } catch {
    return url.split('/').filter(Boolean).pop() ?? url
  }
}
