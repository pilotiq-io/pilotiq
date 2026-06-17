---
"@pilotiq/media": minor
---

Media library browser UI + extensible preview registry (#215)

The `media()` plugin now mounts a browsable library at `${base}/media` (a panel route + nav entry):

- **Library browser** (`MediaLibrary` widget) — folder browsing + breadcrumbs, upload with per-file progress (click or drag-drop), a new-folder dialog, delete, and a type-aware preview modal. Talks to the `_media` routes directly; grid tiles use the `thumb` conversion. Mounted as a `Page` whose schema is a single `View` widget; register the component from your client entry with `registerWidgetComponents({ MediaLibrary })` (from `@pilotiq/media/widgets`).
- **Extensible preview registry** — keyed by `FileCategory` (`categorize(mime)`), not a hard-coded switch. `registerMediaPreview(category, Component)` adds or overrides how a type previews; built-ins ship for image / video / audio / pdf / text with an icon fallback. Call `registerBuiltinMediaPreviews()` once from the client entry.

Also: `ConversionInfo` + `MediaRecord` now carry a computed `url` (resolved through the disk) so the browser can render thumbnails directly; and `toRecord` parses string-encoded `json` columns, fixing conversions not persisting on the instance returned straight from `Model.create` (which also left conversion files orphaned on recursive delete).

Apply `media()` **after** any `.pages([...])` call, since it appends its page and `.pages()` replaces the set. Your app must also serve the storage disk's `baseUrl` (CDN / public bucket / a small streaming route) so the URLs resolve.
