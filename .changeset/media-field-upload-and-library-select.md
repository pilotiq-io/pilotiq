---
"@pilotiq/media": minor
---

`MediaField` — a media-library form field with upload + library-select (#208)

A new `fieldType: 'media'` form field, the media-aware counterpart to core's `FileUpload`. One field, two ways to set a value:

- **Upload new file(s) inline** — runs the `@pilotiq/media` upload pipeline (server generates conversions / dimensions), with per-file progress.
- **Pick from the library** — opens the browser in a new `select` mode (single → picks immediately; multiple → toggle tiles, confirm via footer).

`MediaField.make(name).label(…).multiple().accept(['image/*']).library('photos')` stores a stable `MediaRef` (single) or `MediaRef[]` (`multiple()`) — id + url + alt + responsive `conversions` — NOT a raw URL, so the selection round-trips onto the field on edit (preview thumbnail included) without a re-fetch. The column needs a `'json'` cast.

Register the renderer once from your client entry: `import { registerMediaField } from '@pilotiq/media/widgets'; registerMediaField()`.

The `MediaLibrary` browser gained a `mode: 'select'` (with `multiple` / `onSelect` / `apiBase`) so it can be embedded in the picker dialog; `'manage'` (the standalone library page) stays the default. New exports: `MediaField` / `MediaPicker`, the `MediaRef` type + `toMediaRef(record)`, and `registerMediaField` / `MediaFieldInput`.
