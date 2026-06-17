---
"@pilotiq/pilotiq": minor
---

FileUpload: per-file progress, pre-upload previews, drag-and-drop, and parallel/reorderable uploads

The `FileUpload` field renderer now models its value as an ordered list of items (each uploading, done, or failed) instead of a flat URL array, which unlocks:

- **Pre-upload previews** — picked images show a local `createObjectURL` thumbnail immediately while they upload; non-image (or pre-thumbnail) files show a type-appropriate icon (image/video/audio/pdf/text/archive) chosen by MIME or extension.
- **Per-file circular progress** — uploads run over `XMLHttpRequest` so `upload.onprogress` drives a real percentage ring per file, replacing the single button-level spinner.
- **Parallel uploads + sort-while-uploading** — files upload concurrently (the crop editor still opens one modal at a time) and pending items render in the list right away, so drag-reordering works across the mixed pending + done set; the final committed order is what gets stored.
- **Drag-and-drop** — drop files onto the field to upload (dragover highlight + an empty-state dropzone), distinct from the existing reorder drag.
- **Failure state** — a failed upload stays in the list with an error label instead of vanishing.

Also fixes the server-side `_uploads` accept check, which previously did an exact MIME match and so rejected every upload for the common `accept: ['image/*']` wildcard. It now mirrors the HTML `accept` attribute: exact MIME, MIME wildcards (`image/*`), catch-alls (`*` / `*/*`), and file extensions (`.png`).
