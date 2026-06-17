// Client entry (`@pilotiq/media/widgets`) — the React surface the host
// registers with `registerWidgetComponents` from `@pilotiq/pilotiq/widgets`.
// Pulls in `react`, so it lives behind its own subpath (never imported by the
// client-safe-but-react-free main entry).

export { MediaLibrary } from './react/MediaLibrary.js'
export type { MediaLibraryProps } from './react/MediaLibrary.js'

// Built-in preview renderers (image / video / audio / pdf / text / fallback).
// Call once from the host's client entry (e.g. `pages/+Layout.tsx`) alongside
// `registerWidgetComponents({ MediaLibrary })`; idempotent.
export { registerBuiltinMediaPreviews } from './preview/builtins.js'

// Registers the `MediaField` form-field renderer (`fieldType: 'media'`). Call
// once from the host's client entry; without it `MediaField` renders nothing.
export { registerMediaField } from './react/register.js'
export { MediaFieldInput } from './react/MediaFieldInput.js'
