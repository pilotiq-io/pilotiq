---
"@pilotiq/media": minor
---

Media: editable per-file metadata — alt text + custom `meta` fields (#237)

The library browser's detail panel now edits each file's **alt text** and any **custom metadata fields** the library declares, persisted and round-tripping end-to-end.

- **`metaFields` config.** `media({ metaFields: [TextField.make('credit'), …] })` declares custom fields (core `@pilotiq/pilotiq` field instances — consistent with core `FileUpload.metaFields([...])`). Serialized to `FieldMeta` at registration and rendered in the detail panel.
- **Alt editable post-upload.** Alt text (its own column) is editable in the panel, not just at upload time.
- **`meta` json column is now live.** Previously dead weight (hardcoded `{}`, never read/edited) — custom fields write to it via the new `updateMetadata` store fn + `POST {base}/_media/:id/metadata` route.
- **`MediaRef` round-trips `meta`.** `toMediaRef` now carries the custom `meta` so a file picked through `MediaField` keeps its metadata in the form value.

Note: the library registry is keyed by library name across panels — panels sharing the default library should declare the same `metaFields`.
