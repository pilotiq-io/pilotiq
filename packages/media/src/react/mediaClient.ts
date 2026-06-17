/**
 * Thin client for the `_media` routes (see `routes.ts`). Pure + client-safe —
 * just `fetch`/`XMLHttpRequest` wrappers the `MediaLibrary` widget calls. The
 * `apiBase` is the panel-relative `_media` root (e.g. `/admin/_media`).
 */
import type { MediaRecord } from '../types.js'

export type MediaScope = 'shared' | 'private'

export interface ListParams {
  parentId?: string | null
  scope?:    MediaScope
  search?:   string
  sort?:     'name' | 'createdAt' | 'updatedAt' | 'size'
  dir?:      'ASC' | 'DESC'
  page?:     number
  perPage?:  number
}

export interface ListResult {
  data:     MediaRecord[]
  total:    number
  page:     number
  perPage:  number
  lastPage: number
}

/** Derive the `_media` API base from the current page URL. The library page
 *  lives at `${panelBase}/${slug}`; the routes live at `${panelBase}/_media`,
 *  so we strip the trailing page slug. (Cluster-prefixed mounts are a
 *  follow-up; v1 mounts the page at the panel root.) */
export function deriveApiBase(slug = 'media'): string {
  if (typeof window === 'undefined') return ''
  const path = window.location.pathname.replace(/\/+$/, '')
  const suffix = `/${slug}`
  const base = path.endsWith(suffix) ? path.slice(0, -suffix.length) : path
  return `${base}/_media`
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const body = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok || body['ok'] === false) {
    throw new Error(typeof body['error'] === 'string' ? body['error'] : `Request failed (${res.status})`)
  }
  return body
}

const json = (apiBase: string, path: string, body: unknown) =>
  fetch(`${apiBase}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(body),
  }).then(readJson)

/** List one folder's children. */
export async function listMedia(apiBase: string, params: ListParams = {}): Promise<ListResult> {
  const q = new URLSearchParams()
  q.set('parentId', params.parentId ?? 'root')
  if (params.scope)   q.set('scope', params.scope)
  if (params.search)  q.set('search', params.search)
  if (params.sort)    q.set('sort', params.sort)
  if (params.dir)     q.set('dir', params.dir)
  if (params.page)    q.set('page', String(params.page))
  if (params.perPage) q.set('perPage', String(params.perPage))
  const body = await fetch(`${apiBase}?${q.toString()}`, { headers: { Accept: 'application/json' } }).then(readJson)
  return {
    data:     Array.isArray(body['data']) ? (body['data'] as MediaRecord[]) : [],
    total:    Number(body['total'] ?? 0),
    page:     Number(body['page'] ?? 1),
    perPage:  Number(body['perPage'] ?? 50),
    lastPage: Number(body['lastPage'] ?? 1),
  }
}

/** Create a folder. */
export async function createFolder(
  apiBase:  string,
  name:     string,
  parentId: string | null,
  scope:    MediaScope = 'shared',
): Promise<MediaRecord> {
  return (await json(apiBase, '/folder', { name, parentId, scope }))['media'] as MediaRecord
}

export async function renameMedia(apiBase: string, id: string, name: string): Promise<MediaRecord> {
  return (await json(apiBase, `/${encodeURIComponent(id)}/rename`, { name }))['media'] as MediaRecord
}

export async function moveMedia(apiBase: string, id: string, parentId: string | null): Promise<MediaRecord> {
  return (await json(apiBase, `/${encodeURIComponent(id)}/move`, { parentId }))['media'] as MediaRecord
}

export async function deleteMedia(apiBase: string, id: string): Promise<void> {
  await json(apiBase, `/${encodeURIComponent(id)}/delete`, {})
}

/**
 * Upload one file via `XMLHttpRequest` so we can report progress (0..1). The
 * server runs the conversion pipeline and returns the created `MediaRecord`.
 */
export function uploadMedia(
  apiBase:    string,
  file:       File,
  opts:       { parentId?: string | null; scope?: MediaScope; library?: string; onProgress?: (fraction: number) => void } = {},
): Promise<MediaRecord> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    if (opts.parentId) form.append('parentId', opts.parentId)
    if (opts.scope)    form.append('scope', opts.scope)
    if (opts.library)  form.append('library', opts.library)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${apiBase}/upload`)
    xhr.setRequestHeader('Accept', 'application/json')
    if (opts.onProgress) {
      xhr.upload.onprogress = e => { if (e.lengthComputable) opts.onProgress!(e.loaded / e.total) }
    }
    xhr.onload = () => {
      let body: Record<string, unknown> = {}
      try { body = JSON.parse(xhr.responseText) as Record<string, unknown> } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body['ok'] !== false) {
        resolve(body['media'] as MediaRecord)
      } else {
        reject(new Error(typeof body['error'] === 'string' ? body['error'] : `Upload failed (${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.send(form)
  })
}
