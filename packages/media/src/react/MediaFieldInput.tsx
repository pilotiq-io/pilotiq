'use client'

/**
 * Renderer for `MediaField` (`fieldType: 'media'`). Registered via
 * `registerMediaField()` (`@pilotiq/media/widgets`). Two ways to set the value
 * in one field — upload new file(s) inline, or open the library browser and
 * pick existing item(s) — both yielding a stable {@link MediaRef}.
 *
 * The committed value rides to the server through a single hidden input as
 * JSON: an object (single) or array (multiple). Core's `'media'` coerce branch
 * parses it back; the resource column needs a `'json'` cast to persist it.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react'
import type { FieldRendererProps } from '@pilotiq/pilotiq/react'
import type { MediaRecord, MediaRef } from '../types.js'
import { categorize, toMediaRef } from '../types.js'
import { deriveApiBase, uploadMedia } from './mediaClient.js'
import { MediaLibrary } from './MediaLibrary.js'

interface ActiveUpload { id: string; name: string; progress: number; error?: string }

/** Normalize a stored field value (object / array / JSON string) → MediaRef[]. */
function toRefs(value: unknown): MediaRef[] {
  if (value === undefined || value === null || value === '') return []
  if (typeof value === 'string') {
    try { return toRefs(JSON.parse(value)) } catch { return [] }
  }
  if (Array.isArray(value)) {
    return value.filter((v): v is MediaRef => !!v && typeof v === 'object' && 'id' in v)
  }
  if (typeof value === 'object' && 'id' in (value as object)) return [value as MediaRef]
  return []
}

/** Preview image src for a ref: prefer a `thumb` conversion, else the original. */
function thumbFor(ref: MediaRef): string | null {
  if (!(ref.mime ?? '').startsWith('image/')) return null
  const thumb = ref.conversions?.find(c => c.name === 'thumb' && c.url)
  return thumb?.url ?? ref.url ?? null
}

export function MediaFieldInput({ el, name, defaultValue, disabled }: FieldRendererProps): React.ReactElement {
  const multiple    = el['multiple'] === true
  const showPreview = el['preview'] !== false
  const accept      = Array.isArray(el['accept']) ? (el['accept'] as string[]) : undefined
  const library     = typeof el['library'] === 'string' ? (el['library'] as string) : undefined
  const metaApiBase = typeof el['apiBase'] === 'string' ? (el['apiBase'] as string) : undefined
  const apiBase = useMemo(() => metaApiBase ?? deriveApiBase('media'), [metaApiBase])

  const [refs, setRefs] = useState<MediaRef[]>(() => toRefs(defaultValue))
  const [uploads, setUploads] = useState<ActiveUpload[]>([])
  const [browsing, setBrowsing] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const hiddenValue = multiple
    ? JSON.stringify(refs)
    : (refs[0] ? JSON.stringify(refs[0]) : '')

  // Append (multiple) or replace (single) — shared by upload + browse.
  const addRefs = useCallback((incoming: MediaRef[]) => {
    if (incoming.length === 0) return
    setRefs(prev => {
      if (!multiple) return [incoming[0]!]
      const seen = new Set(prev.map(r => r.id))
      return [...prev, ...incoming.filter(r => !seen.has(r.id))]
    })
  }, [multiple])

  const removeAt = useCallback((i: number) => {
    setRefs(prev => prev.filter((_, idx) => idx !== i))
  }, [])

  // ── Inline upload ──────────────────────────────────────────────────────────
  const runUploads = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    const list = multiple ? files : files.slice(0, 1)
    const queued: ActiveUpload[] = list.map((f, i) => ({ id: `${f.name}-${i}-${f.size}`, name: f.name, progress: 0 }))
    setUploads(u => [...u, ...queued])
    const done: MediaRef[] = []
    await Promise.all(list.map(async (file, i) => {
      const q = queued[i]!
      try {
        const rec = await uploadMedia(apiBase, file, {
          ...(library ? { library } : {}),
          onProgress: p => setUploads(prev => prev.map(x => x.id === q.id ? { ...x, progress: p } : x)),
        })
        done.push(toMediaRef(rec))
      } catch (err) {
        setUploads(prev => prev.map(x => x.id === q.id ? { ...x, error: err instanceof Error ? err.message : 'Failed' } : x))
      }
    }))
    addRefs(done)
    // Clear succeeded rows after a beat; keep errors visible.
    setTimeout(() => setUploads(prev => prev.filter(x => x.error)), 1200)
  }, [apiBase, library, multiple, addRefs])

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    void runUploads(files)
  }, [runUploads])

  const onSelectFromLibrary = useCallback((records: MediaRecord[]) => {
    addRefs(records.filter(r => r.type === 'file').map(toMediaRef))
    setBrowsing(false)
  }, [addRefs])

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={hiddenValue} readOnly />

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
          className="h-8 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
        >
          {multiple ? 'Upload files' : 'Upload file'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setBrowsing(true)}
          className="h-8 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
        >
          Browse library
        </button>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept={accept ? accept.join(',') : undefined}
          multiple={multiple}
          onChange={onPick}
        />
      </div>

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="space-y-1.5 rounded-md border bg-muted/30 px-3 py-2">
          {uploads.map(u => (
            <div key={u.id} className="flex items-center gap-3 text-xs">
              <span className="w-40 truncate text-muted-foreground">{u.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${u.error ? 'bg-destructive' : 'bg-primary'} transition-all`}
                  style={{ width: `${u.error ? 100 : Math.round(u.progress * 100)}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-muted-foreground">
                {u.error ? u.error : `${Math.round(u.progress * 100)}%`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Selected media */}
      {refs.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {refs.map((ref, i) => {
            const thumb = showPreview ? thumbFor(ref) : null
            return (
              <li key={`${ref.id}-${i}`} className="group relative flex flex-col items-center gap-1">
                <div className="flex size-20 items-center justify-center overflow-hidden rounded-md border bg-muted">
                  {thumb
                    ? <img src={thumb} alt={ref.alt ?? ref.name} className="size-full object-cover" />
                    : <FileGlyph category={categorize(ref.mime)} />}
                </div>
                <span className="w-20 truncate text-center text-xs text-muted-foreground">{ref.name}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm hover:text-destructive"
                    aria-label={`Remove ${ref.name}`}
                  >
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Library browser dialog */}
      {browsing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setBrowsing(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Select media</h2>
              <button
                type="button"
                onClick={() => setBrowsing(false)}
                className="h-7 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <MediaLibrary
                mode="select"
                multiple={multiple}
                apiBase={apiBase}
                onSelect={onSelectFromLibrary}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Minimal file glyph for non-previewable refs (mirrors MediaLibrary's). */
function FileGlyph({ category }: { category: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-muted-foreground">
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
      <span className="text-[10px] uppercase">{category}</span>
    </div>
  )
}
