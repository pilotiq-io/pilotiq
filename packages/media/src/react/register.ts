'use client'

/**
 * Client-side registration for the `MediaField` renderer. Call once from the
 * host's client entry (e.g. `pages/+Layout.tsx`), alongside
 * `registerWidgetComponents({ MediaLibrary })`:
 *
 * ```ts
 * import { registerMediaField } from '@pilotiq/media/widgets'
 * registerMediaField()
 * ```
 *
 * Without this call, `MediaField` form fields render as nothing — pilotiq's
 * SchemaRenderer can't find a renderer for the `'media'` fieldType. Idempotent.
 */
import { registerFieldRenderer } from '@pilotiq/pilotiq/react'
import { MediaFieldInput } from './MediaFieldInput.js'

export function registerMediaField(): void {
  registerFieldRenderer('media', MediaFieldInput)
}
