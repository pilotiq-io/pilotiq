---
"@pilotiq/pilotiq": minor
---

FileUpload: `metaColumn()` escape hatch — writes meta to a separate database column

`.metaFields([...]).metaColumn('col')` now splits the stored value into two columns:
the primary column holds just the bare URL (or `string[]` for multi), and the
companion column holds only the meta object (or an array of them for multi).

The wire format between server and browser remains `{ url, ...meta }` in both
directions — the split/merge is transparent to the renderer.

Model setup: declare `static casts = { col: 'json' }` for the meta column.
For multi-file mode, also declare `static casts = { field: 'json' }` if the
ORM requires it to persist `string[]`.
