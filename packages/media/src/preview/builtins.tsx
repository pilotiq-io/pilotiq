/**
 * Built-in media-preview renderers. Each is registered against a
 * `FileCategory` by `registerBuiltinMediaPreviews()`; categories without a
 * dedicated renderer (document / spreadsheet / archive) fall through to the
 * `other` fallback via `resolveMediaPreview`.
 *
 * Apps override any of these by registering their own renderer for the same
 * category — `registerMediaPreview('pdf', MyPdfViewer)`.
 */
import React, { useEffect, useState } from 'react'
import type { MediaPreviewProps } from './registry.js'
import { registerMediaPreviews } from './registry.js'

function ImagePreview({ url, name }: MediaPreviewProps) {
  return <img src={url} alt={name} className="max-h-[70vh] max-w-full rounded-lg object-contain shadow" />
}

function VideoPreview({ url }: MediaPreviewProps) {
  return <video src={url} controls className="max-h-[70vh] max-w-full rounded-lg shadow" />
}

function AudioPreview({ url }: MediaPreviewProps) {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
        <svg className="h-10 w-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
      <audio src={url} controls className="w-80" />
    </div>
  )
}

function PdfPreview({ url, name }: MediaPreviewProps) {
  return <iframe src={url} className="h-[75vh] w-full rounded-lg border" title={name} />
}

function TextPreview({ url, mime }: MediaPreviewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    fetch(url)
      .then(r => r.text())
      .then(t => { if (live) setContent(t) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [url])

  if (failed) return <p className="text-sm text-muted-foreground">Failed to load file.</p>
  if (content === null) return <div className="h-64 w-96 animate-pulse rounded bg-muted/30" />

  let display = content
  if (mime === 'application/json') {
    try { display = JSON.stringify(JSON.parse(content), null, 2) } catch { /* show raw */ }
  }

  return (
    <pre className="max-h-[70vh] w-full max-w-2xl overflow-auto rounded-lg bg-muted p-4 font-mono text-xs whitespace-pre-wrap">
      {display}
    </pre>
  )
}

function FallbackPreview({ name }: MediaPreviewProps) {
  return (
    <div className="space-y-3 text-center text-muted-foreground">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-muted">
        <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      </div>
      <p className="max-w-xs truncate text-sm">{name}</p>
      <p className="text-xs">No preview available for this file type.</p>
    </div>
  )
}

let registered = false

/** Register the built-in renderers. Idempotent — safe to call from every
 *  client entry (`+Layout.tsx`) without double-registering. App overrides
 *  registered AFTER this call win (last registration per category). */
export function registerBuiltinMediaPreviews(): void {
  if (registered) return
  registered = true
  registerMediaPreviews({
    image: ImagePreview,
    video: VideoPreview,
    audio: AudioPreview,
    pdf:   PdfPreview,
    text:  TextPreview,
    other: FallbackPreview,
  })
}
