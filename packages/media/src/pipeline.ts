/**
 * Pure, runtime-agnostic helpers for the `_media` upload + CRUD pipeline.
 *
 * Everything here is side-effect-free and free of Node-only imports (only
 * `import type` from `@rudderjs/image`), so it's safe to load on both the
 * server (where the route handlers run) and the client (the module is pulled
 * into the panel-module graph via `routes.ts` ← `plugin.ts`). The Node-only
 * orchestration — Storage writes, image conversions, model persistence — lives
 * in `store.ts`, which composes these helpers.
 *
 * Keeping the decision logic here (validation, scope auth, key/filename
 * building, conversion + record mapping, query parsing) makes it unit-testable
 * without a database or a storage disk.
 */
import type { ConversionResult } from '@rudderjs/image'
import type { ConversionInfo, MediaRecord } from './types.js'
import type { MediaLibrary } from './registry.js'

/** Visibility scope of a `_media` request — the `shared` library vs a user's
 *  `private` space. `userId` is the resolved current user's id (duck-typed off
 *  `pilotiq.resolveUser(req)`), or `null` when nobody is authenticated. */
export interface MediaAuth {
  scope:  'shared' | 'private'
  userId: string | null
}

/** Parsed + clamped list-query parameters for `GET _media`. */
export interface ListQuery {
  parentId: string | null
  scope:    'shared' | 'private'
  search:   string
  sort:     'name' | 'createdAt' | 'updatedAt' | 'size'
  dir:      'ASC' | 'DESC'
  page:     number
  perPage:  number
}

/** The raw column bag read off a `Media` model instance — decouples the pure
 *  `toRecord` mapper from `@rudderjs/orm` so it stays unit-testable. */
export interface MediaAttrs {
  id:          unknown
  name:        unknown
  type:        unknown
  mime:        unknown
  size:        unknown
  disk:        unknown
  directory:   unknown
  filename:    unknown
  width:       unknown
  height:      unknown
  focalX:      unknown
  focalY:      unknown
  conversions: unknown
  alt:         unknown
  meta:        unknown
  parentId:    unknown
  scope:       unknown
  userId:      unknown
  createdAt:   unknown
  updatedAt:   unknown
}

/** Is this MIME type an image (so we probe dimensions + run conversions)? */
export function isImageMime(mime: string | null | undefined): boolean {
  return typeof mime === 'string' && mime.toLowerCase().startsWith('image/')
}

/**
 * Match one `accept` pattern against a file, mirroring the HTML `accept`
 * attribute (and pilotiq core's `acceptMatches` in `routes/helpers.ts`): an
 * exact MIME (`image/png`), a MIME wildcard (`image/*`), the catch-alls
 * (`*` / `*​/*`), or a file extension (`.png`).
 */
export function acceptMatches(pattern: string, file: File): boolean {
  const p = pattern.toLowerCase()
  if (p === '*' || p === '*/*') return true
  if (p.startsWith('.')) return file.name.toLowerCase().endsWith(p)
  const type = file.type.toLowerCase()
  if (p.endsWith('/*')) return type.startsWith(p.slice(0, -1)) // 'image/' prefix
  return type === p
}

/** Outcome of {@link validateUpload}. */
export type UploadValidation =
  | { ok: true }
  | { ok: false; status: number; error: string }

/**
 * Re-check the library's `accept` + `maxUploadSize` rules server-side. The
 * field/client also enforces these, but a tampered client must not be able to
 * bypass them — same posture as pilotiq core's `_uploads` handler. Returns a
 * `422` rejection or `{ ok: true }`.
 */
export function validateUpload(file: File, library: MediaLibrary): UploadValidation {
  const accept = library.accept ?? []
  if (accept.length > 0 && !accept.some(p => acceptMatches(p, file))) {
    return { ok: false, status: 422, error: `File type "${file.type || 'unknown'}" not allowed` }
  }
  if (typeof library.maxUploadSize === 'number' && file.size > library.maxUploadSize) {
    return { ok: false, status: 422, error: `File exceeds ${library.maxUploadSize} bytes` }
  }
  return { ok: true }
}

/** Join a directory + filename into a storage key, tolerating an empty/`'/'`
 *  directory and stray slashes. */
export function buildStorageKey(directory: string, filename: string): string {
  const dir = directory.replace(/^\/+|\/+$/g, '')
  return dir ? `${dir}/${filename}` : filename
}

/** ASCII-slug a filename stem for use in a storage key (keeps the extension
 *  separate). Collapses runs of non-alphanumerics to a single dash. */
export function slugifyStem(stem: string): string {
  const s = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'file'
}

/** Split a filename into `{ stem, ext }` (ext includes the leading dot, or
 *  `''` when there's none). Dotfiles (`.env`) keep their leading dot in the
 *  stem and report no extension. */
export function splitFilename(name: string): { stem: string; ext: string } {
  const base = name.replace(/^.*[/\\]/, '') // strip any path the client sent
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return { stem: base, ext: '' }
  return { stem: base.slice(0, dot), ext: base.slice(dot).toLowerCase() }
}

/**
 * A unique per-upload directory token (`<slug>-<uuid>`). Each upload gets its
 * own subdirectory under the library directory so the original file AND its
 * image conversions (which `generateToStorage` names by spec — `thumb.webp`,
 * `preview.webp` — with no uniqueness of their own) can never collide with a
 * different upload's. Uses Web Crypto `randomUUID` (a global in Node ≥19 and
 * the browser) to stay Node-import-free.
 */
export function makeUploadToken(originalName: string): string {
  const { stem } = splitFilename(originalName)
  return `${slugifyStem(stem)}-${globalThis.crypto.randomUUID()}`
}

/** ASCII-safe filename (`<slug><ext>`) for the original file inside its unique
 *  upload directory — no uniqueness needed (the directory provides it). */
export function safeFilename(originalName: string): string {
  const { stem, ext } = splitFilename(originalName)
  return `${slugifyStem(stem)}${ext}`
}

/** Map `@rudderjs/image`'s `ConversionResult[]` into the persisted
 *  `ConversionInfo[]` shape (the generator returns the stored `path`; we keep
 *  it under `filename` for URL building / cleanup on delete). */
export function mapConversions(results: ConversionResult[]): ConversionInfo[] {
  return results.map(r => ({
    name:     r.name,
    filename: r.path,
    width:    r.width,
    height:   r.height,
    size:     r.size,
    format:   r.format,
  }))
}

/**
 * Is `record` reachable by the request's auth scope? Shared records are
 * visible to everyone; a private record only to its owner. Used as the IDOR
 * guard on every single-record op (get / rename / move / delete).
 */
export function isAccessible(
  record: Pick<MediaRecord, 'scope' | 'userId'>,
  auth:   MediaAuth,
): boolean {
  if (record.scope === 'shared') return true
  return auth.userId !== null && record.userId === auth.userId
}

const SORT_COLUMNS = new Set(['name', 'createdAt', 'updatedAt', 'size'])

/** Parse + clamp the `GET _media` query string into a {@link ListQuery}.
 *  Folders sort first regardless (handled in the store); this only resolves
 *  the column + direction + page window. */
export function parseListQuery(query: Record<string, unknown> | undefined): ListQuery {
  const q = query ?? {}
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')

  const parentIdRaw = str(q['parentId'])
  const parentId = parentIdRaw === '' || parentIdRaw === 'root' ? null : parentIdRaw

  const scope: 'shared' | 'private' = str(q['scope']) === 'private' ? 'private' : 'shared'

  const sortRaw = str(q['sort'])
  const sort = (SORT_COLUMNS.has(sortRaw) ? sortRaw : 'name') as ListQuery['sort']
  const dir: 'ASC' | 'DESC' = str(q['dir']).toUpperCase() === 'DESC' ? 'DESC' : 'ASC'

  const pageNum = Number(str(q['page']) || q['page'])
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1

  const perRaw = Number(str(q['perPage']) || q['perPage'])
  const perPage = Number.isFinite(perRaw) && perRaw >= 1 ? Math.min(Math.floor(perRaw), 100) : 50

  return { parentId, scope, search: str(q['search']).slice(0, 200), sort, dir, page, perPage }
}

/** Parse a `json`-cast column that may arrive either revived (array/object) or
 *  as the serialized JSON string the native cast emits right after `create`. */
function parseJsonColumn(v: unknown): unknown {
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return undefined }
}

/** Coerce a raw model-instance column bag into the wire {@link MediaRecord}.
 *  Pure — `url` (which needs the disk) is attached by the store afterwards. */
export function toRecord(a: MediaAttrs): MediaRecord {
  const numOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const strOrNull = (v: unknown): string | null =>
    typeof v === 'string' && v.length > 0 ? v : null

  // `conversions` / `meta` are `json`-cast: on the instance returned straight
  // from `Model.create` they can still be the serialized string (the cast
  // revives on read, but the create-return path may not have re-read yet), so
  // parse defensively before shape-checking.
  const conversions = parseJsonColumn(a.conversions)
  const meta = parseJsonColumn(a.meta)

  return {
    id:          String(a.id ?? ''),
    name:        typeof a.name === 'string' ? a.name : '',
    type:        a.type === 'folder' ? 'folder' : 'file',
    mime:        strOrNull(a.mime),
    size:        numOrNull(a.size),
    disk:        typeof a.disk === 'string' ? a.disk : 'public',
    directory:   typeof a.directory === 'string' ? a.directory : '',
    filename:    typeof a.filename === 'string' ? a.filename : '',
    width:       numOrNull(a.width),
    height:      numOrNull(a.height),
    focalX:      numOrNull(a.focalX),
    focalY:      numOrNull(a.focalY),
    conversions: Array.isArray(conversions) ? (conversions as ConversionInfo[]) : [],
    alt:         strOrNull(a.alt),
    meta:        meta && typeof meta === 'object' && !Array.isArray(meta)
                   ? (meta as Record<string, unknown>)
                   : {},
    parentId:    strOrNull(a.parentId),
    scope:       a.scope === 'private' ? 'private' : 'shared',
    userId:      strOrNull(a.userId),
    createdAt:   typeof a.createdAt === 'string' ? a.createdAt : '',
    updatedAt:   typeof a.updatedAt === 'string' ? a.updatedAt : '',
  }
}
