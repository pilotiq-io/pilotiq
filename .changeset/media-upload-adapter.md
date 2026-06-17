---
"@pilotiq/media": minor
---

Media `mediaUpload()` UploadAdapter for core FileUpload (#216)

`@pilotiq/media/server` now exports `mediaUpload({ library? })`, a core `UploadAdapter` that targets the media library as its storage backend. Registered via `Pilotiq.uploads({ adapter: mediaUpload() })`, every `FileUpload` field runs through the same persist + image-conversion pipeline as the `_media/upload` route and creates a `Media` row — so field uploads show up in the library browser with thumbnails and round-trip with previews. The field stores the returned public `url`; the result's `meta` carries the row's `id`, `mime`, `size`, and image `width`/`height`.

Uploads are stored as `shared` records; the library owns its on-disk layout (a unique per-upload directory), so the adapter does not honor the `directory`/`preserveFilenames` hints. User-scoped (`private`) uploads stay on the `_media/upload` route.
