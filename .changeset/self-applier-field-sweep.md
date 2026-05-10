---
'@pilotiq/pilotiq': patch
---

fix(core): register field-owned AI appliers on every React-driven input

Same hidden-input bug as `SelectField`, swept across nine more field
types. Each of these renders a `<input type="hidden" name={name}>`
mirror for native form submit but drives the visible widget from React
state — `FieldShell`'s generic applier writes to the hidden input and
dispatches `change`, but the widget has no listener wired to it, so AI
Review-mode Approve (and any other `PendingSuggestionApplierRegistry`
caller) silently no-ops.

Fixed by registering a field-owned applier inside each component and
adding the field's `fieldType` to the central
`SELF_APPLIER_FIELD_TYPES` set in `FieldShell.tsx` (single source of
truth — `FieldShell` skips its generic registration so the field's
applier stays last-write-wins):

- `ToggleFieldInput` — `'toggle'`; coerces to boolean
- `SliderInput` — `'slider'`; coerces to number (clamps to `min` on NaN)
- `ColorInput` — `'color'`; falls back to `#000000` for null/empty
- `KeyValueInput` — `'keyValue'`; rebuilds rows from the suggestion
  object (preserves existing row IDs by index for input-focus stability)
- `FileUploadInput` — `'fileUpload'`; routes through `toUrls()`;
  honors `multiple` (single-file persists `urls[0] ?? null`)
- `TagsInput` — `'tagsInput'`; routes through the existing `toArray()`
  parser (tolerates `string[]`, JSON-encoded, single string)
- `DateTimeInput` — `'dateTime'`; coerces null/empty to `''`
- `RadioInput` — `'radio'`; coerces null to `''`
- `CheckboxListInput` — `'checkboxList'`; routes through the local
  `toArray()` (also fixes a pre-existing latent corruption: per-option
  hidden mirrors share the `[name]` attribute, so the generic applier
  would have stamped every one with the same stringified value
  instead of replacing the array)

All appliers follow the canonical `SelectFieldInput` shape:
`useRef(fs)` to hold latest field-state across re-registrations,
dotted-path skip (Repeater rows are inaccessible from outside the
form's React tree), and a controlled/uncontrolled split that mirrors
each component's existing `setValue` path.

After this sweep, AI Review-mode Approve correctly updates the visible
widget on every Filament-parity field type. Custom field renderers
that drive their state from React still need to follow the same
pattern — register inside the component, add `fieldType` to the
shared set.
