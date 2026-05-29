/**
 * Pilotiq's upload contract. Apps register an adapter via
 * `Pilotiq.uploads({ adapter })`; the `_uploads` route hands every
 * incoming file to it. Pilotiq stays storage-agnostic — disk, S3,
 * R2, GCS, or a custom storage backend all implement the same shape.
 */
export interface UploadAdapter {
  /**
   * Persist the file. Receive `{ file, directory? }`; return the
   * URL the field should store. Throw to fail the upload — the
   * route handler converts thrown errors into a 500 + toast.
   */
  put(req: UploadRequest): Promise<UploadResult>
}

export interface UploadRequest {
  /** The browser-supplied File. Has `.name`, `.size`, `.type`, `.arrayBuffer()`. */
  file:       File
  /** Optional sub-directory hint set by `FileUpload.directory(...)`. */
  directory?: string
  /** The source field name — useful for adapter routing or audit logs. */
  fieldName:  string
  /**
   * When true, the adapter should keep the original (sanitized) filename
   * instead of generating a random key. Set by
   * `FileUpload.preserveFilenames()`. Adapters that can't honor it (e.g.
   * content-addressed stores) may ignore the hint.
   */
  preserveFilenames?: boolean
}

export interface UploadResult {
  /** The public URL the field stores in the form value. */
  url: string
  /**
   * Optional metadata to round-trip alongside the URL — file size,
   * content type, etc. Renderers that show previews may use this.
   * Not part of the form value; can be used by `afterStateUpdated`
   * hooks server-side.
   */
  meta?: Record<string, unknown>
}
