---
"@pilotiq/pilotiq": minor
---

FileUpload: editable per-file metadata via `metaFields([...])` (#237)

`FileUpload.make('image').metaFields([TextField.make('alt')])` collects editable per-file metadata (alt text, caption, …) alongside each upload. Pass core field instances; their config (label / placeholder / options / helper text) travels to the renderer, which mounts the inputs in a row beneath every uploaded file.

- **Inline rich value.** Opting in widens the stored value from a bare URL string to a rich object in the *same* column — `{ url, …meta }` for single-file, `[{ url, … }]` for `multiple()`. Declare a `'json'` cast on the model column.
- **Back-compat.** Without `metaFields()` the field is byte-identical to before (zero cost). Legacy plain-string values still read back — coerced to `{ url }` on load.
- Coercion normalizes the JSON the client serializes (object / array / legacy string); entries without a usable `url` are dropped.

The separate-column escape hatch (`.metaColumn()`) is tracked separately. `@pilotiq/media` metadata editing follows in a second PR.
