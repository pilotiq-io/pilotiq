---
"@pilotiq/pilotiq": minor
---

Add a `media` coerce branch to the form pipeline (#208)

`coerceFormValues` now handles `fieldType: 'media'` (used by `@pilotiq/media`'s new `MediaField`): the JSON-encoded media reference posted via the field's hidden input is parsed back into a real object (single) or array (multiple) so a `'json'`-cast column persists it; empty / unparseable values coerce to `null`. Mirrors the existing `richtext` / `keyValue` branches — no impact on panels that don't use the media field.
