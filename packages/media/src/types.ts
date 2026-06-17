/**
 * Core shapes for the media library. Runtime-agnostic — these types are
 * shared by the server (persistence, routes) and the client (browser UI,
 * picker field), so this module must stay free of Node-only imports.
 */

/** A persisted media record — a file or a folder, in one parent-id tree. */
export interface MediaRecord {
  id:          string
  name:        string
  type:        'file' | 'folder'
  mime:        string | null
  size:        number | null
  /** Storage disk the file lives on (see `@rudderjs/storage`). */
  disk:        string
  /** Directory within the disk. */
  directory:   string
  /** Stored filename (the on-disk key). */
  filename:    string
  width:       number | null
  height:      number | null
  /** Focal point (0..1) for art-directed cropping. */
  focalX:      number | null
  focalY:      number | null
  /** Generated responsive/format conversions. */
  conversions: ConversionInfo[]
  /** Alt text for accessibility. */
  alt:         string | null
  /** Arbitrary extra metadata. */
  meta:        Record<string, unknown>
  /** Parent folder id, or `null` at the library root. */
  parentId:    string | null
  /** Visibility scope — `shared` library vs a user's `private` space. */
  scope:       'shared' | 'private'
  userId:      string | null
  createdAt:   Date | string
  updatedAt:   Date | string
  /**
   * Public URL for the stored file, resolved through the record's disk
   * (`Storage.disk(disk).url(key)`). Computed server-side at read time —
   * absent on folders. Optional so the wire type stays usable by callers
   * (browser UI / picker field) that build URLs themselves.
   */
  url?:        string
}

/** A generated conversion, persisted in the `conversions` column. */
export interface ConversionInfo {
  name:     string
  filename: string
  width:    number
  height:   number
  size:     number
  format:   string
  /** Public URL for this conversion, resolved through the record's disk.
   *  Computed server-side at read time (not persisted) so the browser can
   *  use e.g. a `thumb` conversion for grid tiles. */
  url?:     string
}

/**
 * A conversion spec — what to generate on upload. Maps onto
 * `@rudderjs/image`'s `ConversionSpec`.
 */
export interface MediaConversion {
  name:     string
  width:    number
  height?:  number
  crop?:    boolean
  format?:  'webp' | 'jpeg' | 'png' | 'avif'
  quality?: number
}

/** Per-library configuration. */
export interface MediaConfig {
  /** Storage disk for media files. Default: `'public'`. */
  disk?:          string
  /** Base directory within the disk. Default: `'media'`. */
  directory?:     string
  /** Max upload size in bytes. */
  maxUploadSize?: number
  /** Default conversions generated for every image upload. */
  conversions?:   MediaConversion[]
  /** Accepted MIME patterns (mirrors the HTML `accept` attribute). */
  acceptedMimes?: string[]
}

/** MIME-type categories used to pick a preview renderer. */
export type FileCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'document'    // doc / docx
  | 'spreadsheet' // xls / xlsx / csv
  | 'text'        // txt / md / json / xml / code
  | 'archive'     // zip / tar / gz
  | 'other'

/** Map a MIME type to a preview category. */
export function categorize(mime: string | null): FileCategory {
  if (!mime) return 'other'
  const m = mime.toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m === 'application/pdf') return 'pdf'
  if (m.includes('wordprocessingml') || m.includes('msword')) return 'document'
  if (m.includes('spreadsheetml') || m.includes('csv') || m.includes('ms-excel')) return 'spreadsheet'
  if (m.startsWith('text/') || m === 'application/json' || m === 'application/xml') return 'text'
  if (m.includes('zip') || m.includes('tar') || m.includes('gzip') || m.includes('rar')) return 'archive'
  return 'other'
}
