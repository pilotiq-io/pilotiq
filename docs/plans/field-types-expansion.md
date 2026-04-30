---
name: Field Types Expansion
description: Plan #6 — Checkbox / CheckboxList / Radio / Hidden / KeyValue / ColorPicker / Slider / FileUpload / DateTimePicker + cross-field plumbing (prefix, suffix, helperText, dehydrated, formatStateUsing)
type: plan
---

# Field Types Expansion

Plan #6 from `admin-gap-audit.md`. Today's `fields/` folder ships the
eight inputs that show up on a typical CRUD form (text, textarea,
email, number, select, toggle, date, slug). That's enough for the
"label / status / created_at" demo resource and not a single thing
beyond it. Every real admin needs Checkbox + Radio + Hidden + at least
one of {FileUpload, KeyValue, ColorPicker, Slider} on the first
non-trivial form.

This plan adds the missing nine field types and the five cross-field
config bits that mature admin frameworks expose on every input
(`prefix / suffix / helperText / dehydrated / formatStateUsing`). It
deliberately defers Repeater / Builder / TagsInput / MarkdownEditor /
CodeEditor — those each need their own planning cycle and aren't on
the day-1 critical path.

## Status

| Step | Status | Notes |
|---|---|---|
| 1. Cross-field plumbing — prefix / suffix / helperText / default / dehydrated / formatStateUsing | ✅ DONE | All on `Field` base; `coerceFormValues` skips dehydrated-false fields before any switch runs |
| 2. `Hidden` field | ✅ DONE | Trivial, no UI; renders bare hidden input outside FieldShell |
| 3. `Checkbox` (single) | ✅ DONE | Distinct from `Toggle`; coercion shares the toggle branch |
| 4. `Radio` | ✅ DONE | Reuses `OptionsResolver`; `inline()` opt-in for horizontal layout |
| 5. `CheckboxList` | ✅ DONE | Array-valued; `columns(n)` for grid layout; coercion handles single-string and array body shapes |
| 6. `DateTimePicker` | ✅ DONE | Subclass of `DateField`; `withTime()` toggle on `DateField` for in-place upgrade |
| 7. `KeyValue` | ✅ DONE | JSON-string in hidden input; coercion JSON-parses + filters empty rows |
| 8. `ColorPicker` | ✅ DONE | Native `<input type="color">` + text mirror |
| 9. `Slider` | ✅ DONE | Numeric (joins NumberField's coerce branch); min/max/step on meta |
| 10. `FileUpload` | ✅ DONE | UploadAdapter contract + `localUpload` adapter + `POST {base}/_uploads` route + drop-zone-style picker UI |
| 11. Playground demo | ✅ DONE | `playground-pilotiq/app/Pilotiq/pages/FieldTypesDemo.ts` exercises every new type at `/new-admin/field-types-demo`; pinned `formId('field-types-demo')` |

**Tests at completion:** 593/593 → 698/698 (+105). Build clean.

Estimated effort: **~3 days** (matches the audit estimate). Steps 1-9
are mechanical once #1 lands; step 10 (FileUpload) is the long pole
and could split out into a focused #6.5 if scope creeps.

**Prereqs:**
- Plan #5 reactive-fields ✅ DONE — `Radio`, `CheckboxList`,
  `Slider` all benefit from `live()` + `afterStateUpdated`. Resolver-form
  options on Radio / CheckboxList reuse `OptionsResolver` from `SelectField`.
- Plan #10 authorization ✅ DONE — no extra wiring needed; new fields
  inherit the existing route-level `canCreate / canEdit` checks.

**Companion memories:**
- `feedback_pilotiq_live_forms_pin_formid.md` — the playground demo
  page must pin `formId('field-types-demo')` because we'll opt several
  fields into `live()` for the dependent-options story.
- `project_pilotiq_orm_wiring.md` — `KeyValue` and `FileUpload` payloads
  go through `Resource.model` like every other field; we don't add any
  per-type ORM hooks. The `ModelLike` shim doesn't grow.

## Why we want it

Three concrete forms today fail to express their actual schema with the
existing eight types. From the playground:

1. **Article tags & categories.** A many-to-many checkbox list of
   categories → today, the only option is a multi-select dropdown via
   custom HTML. We want `CheckboxList`.
2. **User role assignment.** Single-choice from a known list → today,
   `SelectField` works but conventionally Radio is the right input
   for ≤5 options because all options stay visible.
3. **Theme accent color.** A color → today, `TextField` with a hex
   placeholder, no preview, no native picker. We want `ColorPicker`.

Beyond the missing types, the cross-field plumbing closes the gap on
everyday polish:

- `prefix("$")` / `suffix(".com")` for currency and domain inputs.
- `helperText("Lowercase, hyphens only")` so the rule is visible
  without firing a validator first.
- `dehydrated(false)` for fields that exist on the form for
  display/conditional logic but should NOT round-trip on save (very
  common for "computed" rows).
- `formatStateUsing(fn)` for display transforms that don't need a
  full custom renderer.

These five live on `Field.ts` so every subclass inherits them. They
unblock a long tail of small-but-annoying user requests without adding
new field types.

## API

### Cross-field plumbing — added to `Field`

```ts
class Field /* abstract */ {
  // …existing methods…

  prefix(content: string | { icon: string }): this
  suffix(content: string | { icon: string }): this
  helperText(text: string): this

  /**
   * Skip this field when serializing the form on submit.
   * Default `true` (dehydrated). Setting `false` keeps the field
   * visible/interactive but the value is dropped from the POST body.
   * Used for purely-display fields, computed fields, or step-of-wizard
   * scratch state.
   */
  dehydrated(value?: boolean): this

  /**
   * Display-time transform. Receives the resolved value and the row /
   * record context, returns a string. Plain serialization helper for
   * users who don't need a full renderer.
   *
   * Note: parallels `Column.formatStateUsing` from Plan #2 (column-types)
   * — same shape so the muscle memory transfers.
   */
  formatStateUsing(fn: (value: unknown, ctx: { record?: unknown }) => string): this
}
```

`FieldMeta` gains optional fields for each: `prefix?: string | { icon }`,
`suffix?`, `helperText?`. `dehydrated` is consumed server-side only —
not serialized; the field never appears in `body[name]` because
`coerceFormValues` skips dehydrated fields. `formatStateUsing` runs on
`buildMeta` and stashes the result on `FieldMeta.formattedValue`,
mirroring how columns put per-row results on `row._formatted[name]`.

### New field types

```ts
import {
  Hidden,
  Checkbox,
  Radio,
  CheckboxList,
  DateTimePicker,
  KeyValue,
  ColorPicker,
  Slider,
  FileUpload,
} from '@pilotiq/pilotiq/fields'
```

#### `Hidden`

```ts
Hidden.make('source').default('admin-import')
```

Renders `<input type="hidden">` only. No label, no chrome. `fieldType:
'hidden'`. Useful for `<form>` round-trips of values not user-editable
(e.g. CSRF, source attribution, `_formId` discriminators are already
handled by `Form` itself — Hidden is for app-level state).

#### `Checkbox` (single)

```ts
Checkbox.make('agreed_to_terms').label('I agree to the terms')
```

Distinct from `ToggleField`. UI is a square checkbox plus right-side
label (vs Toggle's pill switch). `fieldType: 'checkbox'`. Server
coerces the body value via the same true/false rules as
`ToggleField`'s `coerceFormValues` branch — we extend that branch to
match either fieldType.

#### `Radio`

```ts
Radio.make('plan')
  .options([
    { value: 'free',  label: 'Free' },
    { value: 'pro',   label: 'Pro' },
    { value: 'team',  label: 'Team' },
  ])
  .default('free')
```

Single-choice. Same `OptionsResolver` as `SelectField` — see "Sharing
the OptionsResolver" below.

```ts
Radio.make('country')
  .options(({ user }) => loadCountriesFor(user))   // dependent on user
  .live()
```

`fieldType: 'radio'`. Renders as a vertical stack of `<label><input
type="radio">…</label>`. Variant `.inline()` for horizontal layout.

#### `CheckboxList`

```ts
CheckboxList.make('categories')
  .options([
    { value: 'news',     label: 'News' },
    { value: 'guides',   label: 'Guides' },
    { value: 'tutorial', label: 'Tutorials' },
  ])
  .columns(2)   // optional grid layout
```

Multi-choice. Value is `string[]`. `fieldType: 'checkboxList'`.

Coercion: form bodies arrive as `categories[]=news&categories[]=guides`
(or as a single string when only one is checked, depending on the
client serializer). `coerceFormValues` adds a branch that normalizes
to `string[]`:

```ts
case 'checkboxList': {
  if (raw === undefined || raw === null) out[name] = []
  else if (Array.isArray(raw))           out[name] = raw.map(String)
  else                                    out[name] = [String(raw)]
  break
}
```

`afterStateUpdated`, `live()`, `options(fn)` all work the same as
`Radio` / `SelectField`.

#### `DateTimePicker`

```ts
DateTimePicker.make('publishedAt')
```

Sugar over `DateField` — same fieldType, opt-in flag `withTime()`. Or:

```ts
DateField.make('publishedAt').withTime()
```

Either spelling is fine; we ship `DateTimePicker.make()` as the
ergonomic alias for users who want the intent obvious. Coercion
parses `YYYY-MM-DDTHH:mm` (the value `<input type="datetime-local">`
posts) when the time flag is set.

#### `KeyValue`

```ts
KeyValue.make('metadata')
  .keyLabel('Header')
  .valueLabel('Value')
  .addLabel('Add header')
  .reorderable()
```

Edits a flat `Record<string, string>`. Server-canonical shape:

```ts
{ "X-Source": "admin", "X-Trace": "abc123" }
```

Client renders a list of `[key | value | × ]` rows plus an "Add"
button. On submit, encoded as `metadata[key1]=val1&metadata[key2]=val2`
— `coerceFormValues` rebuilds the object via a new branch that walks
`body` looking for `${name}[…]` keys and assembles them.

`live()` works; each row's blur fires a re-resolve. `afterStateUpdated`
receives the assembled object as `value`.

Out-of-scope for v1: nested values, type coercion (everything's a
string), validation per row, drag-to-reorder (we ship a simple
up/down arrow set behind `.reorderable()` but no DnD).

#### `ColorPicker`

```ts
ColorPicker.make('accent')
  .default('#d97757')
```

Renders an `<input type="color">` plus a text input mirror so users
can paste hex codes. `fieldType: 'color'`. Stores as `#rrggbb`. Add
`.swatches([...])` later if demand surfaces; v1 is just the picker.

#### `Slider`

```ts
Slider.make('discount_percent')
  .min(0)
  .max(50)
  .step(5)
  .default(0)
  .showValue()    // render the current value next to the slider
```

Numeric — coercion goes through the same `number` branch as
`NumberField`. UI is the shadcn `Slider` primitive (already in
`react/ui/`) plus an optional value label. Step is required (defaults
to 1). `fieldType: 'slider'`.

#### `FileUpload`

The biggest type by a wide margin. v1 scope:

```ts
FileUpload.make('cover_image')
  .accept(['image/png', 'image/jpeg', 'image/webp'])
  .maxSize(5 * 1024 * 1024)
  .multiple(false)
  .preview()        // render thumbnail when value is an image URL
  .directory('articles/covers')
```

Stores the resolved upload's URL string (`https://…/articles/covers/abc.png`).
Multi-file mode (`.multiple()`) stores `string[]`. `fieldType: 'fileUpload'`.

The actual upload mechanism is a separate POST endpoint handled by
the new `@pilotiq/pilotiq/uploads` plugin (see "FileUpload scope"
below). The field metadata carries:

```ts
{
  fieldType: 'fileUpload',
  uploadUrl: '/admin/_uploads',
  accept:    ['image/png', …],
  maxSize:   5_242_880,
  multiple:  false,
  preview:   true,
}
```

Client UI: drop zone + "Choose file" button; on file pick it POSTs to
`uploadUrl` and receives `{ ok: true, url: '…' }` → stashes the URL
into the form state map (controlled when `live()`-adjacent). On submit,
the value is the URL string(s).

### `Field.default(value)` setter

Three of the new types (`Hidden`, `Radio`, `Slider`, `Checkbox`,
`ColorPicker`) ship a `.default(value)` setter and we promote it to
the `Field` base. Today defaults flow only via `Form.fillFromRecord`
on edit; for create-mode without a record, the only way to seed a
value is awkward. `Field.default(value)` is read by `buildMeta` and
emits `defaultValue` on the meta:

```ts
Hidden.make('source').default('admin')
Slider.make('rating').default(3)
```

Existing fields (`TextField`, etc.) inherit the setter for free. The
existing renderer reads `el['defaultValue']` already, so the client
side is a no-op.

### Sharing the `OptionsResolver`

`SelectField`, `Radio`, `CheckboxList` all want
`options(SelectOption[] | OptionsResolver)`. Today `OptionsResolver` is
exported from `SelectField.ts`; we'll move it to
`fields/optionsResolver.ts` and re-export from each. The resolver
signature is unchanged (`{ $get, $set, record, user, values }`). All
three field types await + serialize the result the same way in
`toMeta` — extract the shared logic into a helper:

```ts
// fields/optionsResolver.ts
export async function resolveOptions(
  source: SelectOption[] | OptionsResolver,
  ctx:    RenderContext | undefined,
  fieldName: string,
): Promise<SelectOption[]> {
  if (Array.isArray(source)) return source
  try { return await source(buildOptionsCtx(ctx)) }
  catch (err) {
    console.warn(`[pilotiq] options() resolver for "${fieldName}" threw:`, err)
    return []
  }
}
```

`SelectField.toMeta` becomes a one-liner; `Radio.toMeta` /
`CheckboxList.toMeta` reuse the same.

## Coercion changes

`coerceFormValues` in `dispatchForm.ts` adds branches:

```ts
case 'checkbox':
case 'toggle': /* unchanged true/false branch */
case 'checkboxList': /* see above */
case 'fileUpload': /* string or string[] depending on multiple */
case 'keyValue':   /* assemble nested keys */
case 'slider':     /* same as 'number' */
case 'color':      /* string passthrough; null on empty */
case 'hidden':     /* string passthrough */
```

Each branch is a few lines. Test coverage drives correctness — see
"Test plan" below.

`dehydrated(false)` short-circuits before the switch:

```ts
walkFields(elements, field => {
  if (field.isDehydrated() === false) {
    delete out[field.name]
    return
  }
  // …existing switch…
})
```

This is the only structural change to the function.

## Renderer changes

`SchemaRenderer.tsx`'s `renderField` switch grows nine new cases.
Each case is ~20-30 lines. Plan: extract per-fieldtype components into
`react/fields/` (one file per type) so the switch in
`SchemaRenderer` shrinks back to a thin dispatcher. Today's switch
already inlines all eight built-ins, which is becoming unwieldy at
~150 lines — splitting them out is overdue.

```
react/fields/
  CheckboxInput.tsx
  CheckboxListInput.tsx
  ColorInput.tsx
  FileUploadInput.tsx
  HiddenInput.tsx
  KeyValueInput.tsx
  RadioInput.tsx
  SliderInput.tsx
  // existing eight, extracted as part of this plan:
  TextLikeInput.tsx        // already exists inline
  SelectFieldInput.tsx
  ToggleFieldInput.tsx
  DateFieldInput.tsx
```

Each component reads `useFieldState(name)` (Plan #5) when it's
inside a `FormStateProvider`, falls back to `defaultValue` when
outside. Same pattern as today's `TextLikeInput` / `SelectFieldInput`.

`SchemaRenderer`'s switch becomes:

```ts
switch (fieldType) {
  case 'text':         return <TextLikeInput …/>
  case 'textarea':     return <TextLikeInput multiline …/>
  case 'email':        return <TextLikeInput type="email" …/>
  case 'number':       return <TextLikeInput type="number" …/>
  case 'select':       return <SelectFieldInput …/>
  case 'toggle':       return <ToggleFieldInput …/>
  case 'date':         return <DateFieldInput …/>
  case 'slug':         return <TextLikeInput …/>
  case 'hidden':       return <HiddenInput …/>
  case 'checkbox':     return <CheckboxInput …/>
  case 'radio':        return <RadioInput …/>
  case 'checkboxList': return <CheckboxListInput …/>
  case 'color':        return <ColorInput …/>
  case 'slider':       return <SliderInput …/>
  case 'keyValue':     return <KeyValueInput …/>
  case 'fileUpload':   return <FileUploadInput …/>
  default: /* registry path / fall through */
}
```

The cross-field plumbing (`prefix`, `suffix`, `helperText`) is
rendered by a shared wrapper around every field — `<FieldShell>`.
Today's wrapper is the inline `<div className="flex flex-col gap-1.5">`
+ `labelEl`. We hoist that into `<FieldShell el={el}>{input}</FieldShell>`
and render prefix/suffix/helperText inside it. Saves duplication
across the 16 input components.

## FileUpload scope

FileUpload is the long pole. v1 ships with:

1. **Storage adapter contract.** A small interface:
   ```ts
   interface UploadAdapter {
     put(req: { file: File, directory?: string }): Promise<{ url: string }>
   }
   ```
   Apps register an adapter via `Pilotiq.uploads({ adapter })`. Out-of-the-box
   we provide:
   - `localUpload({ root: 'public/uploads', urlPrefix: '/uploads' })`
     — writes to disk, mirrors a static-served directory.
   - `mediaUpload()` — stub that calls into `@pilotiq/media` when present.
     Real `@pilotiq/media` integration lands in a follow-up because the
     new pilotiq doesn't currently link the media package (media still
     imports from `@pilotiq/panels`).
2. **POST `/admin/_uploads` route.** Multipart-aware. Validates
   `accept` + `maxSize` from the request's `fieldName` against the
   field's stored config (we look up the field via `_formId` +
   field name). Calls `adapter.put()`, returns `{ ok, url }`.
3. **Client UI.** Drop zone + file picker + thumbnail preview.
   Posts directly to `_uploads` on file pick, populates the form
   state map with the returned URL.

What's **out of scope** for v1:

- `@pilotiq/media` integration (deferred until media migrates off
  `@pilotiq/panels`).
- Image cropping / resizing client-side.
- Chunked uploads / resumable uploads.
- Direct-to-S3 presigned uploads (the adapter interface allows this
  later — we just don't ship one).
- Server-side image conversion (panels has it; we'll port that in
  a media plan, not here).

If the FileUpload step balloons, split it into `field-types-expansion-fileupload.md`
and ship #6 with the other eight types first. Decision point at the
end of step 9.

## Failure modes

| Scenario | UI response | Notes |
|---|---|---|
| `Radio.options(fn)` throws | Field renders with empty options + console.warn | Same as `SelectField` today |
| `CheckboxList` value posts as single string | Coerced to `[singleValue]` | Browsers do this when only one box is checked |
| `FileUpload` exceeds maxSize | 422 from `_uploads` route; client surfaces inline error | No retry; user picks a smaller file |
| `FileUpload` accept-mismatch | 422; same path | |
| `KeyValue` empty rows | Filtered out before coerce returns | Don't pollute the saved record with `{ "": "" }` |
| `dehydrated(false)` field has a validator | Validator never fires (the value isn't in the body) | Documented; users opting out of dehydration shouldn't validate |
| `Slider` step omitted | Defaults to 1 | Don't 500 on misconfiguration; warn at meta-build time |
| `Hidden` field with `live()` | Allowed but useless — the browser never fires change/blur on hidden inputs | We don't add a runtime warning; user can figure it out |

## Out of scope

- **`Repeater` / `Builder`** — array-of-subschema fields. Big enough
  for their own plan; need reactive layout interop and conditional
  visibility for nested rows.
- **`TagsInput`** — overlaps with `CheckboxList` for known sets and
  with a free-form text input otherwise. Defer until users ask
  specifically for the typeahead-with-create flow.
- **`MarkdownEditor` / `CodeEditor`** — Monaco / CodeMirror are heavy
  client deps. Tiptap covers the rich-text use case already. Skip.
- **`ToggleButtons`** — segmented-control sugar over `Radio`. Three
  lines after Radio lands; punt to a one-day micro-plan.
- **Inline label layout (`inlineLabel()`)** — UX axis orthogonal to
  field types; pair with the schema-layouts plan (#8).
- **`unique()` validator with DB check** — orthogonal to field types;
  belongs in a validation plan if/when it surfaces.
- **`autofocus()`** — trivial but per-field; lands in the polish PR
  after #6 ships, not blocking.
- **Field-level authorization** (`Field.visible(({ user }) => …)`) —
  Plan #10 deferred this; revisit independently.
- **Real `@pilotiq/media` integration for FileUpload** — gated on
  media migrating off `@pilotiq/panels`. Stub adapter ships in #6;
  full integration is its own plan.

## Test plan

| Area | Tests |
|---|---|
| `Field.prefix / suffix / helperText` | stored; emitted on meta only when set; icon-form vs string-form |
| `Field.dehydrated(false)` | meta unchanged; `coerceFormValues` drops the field; passes through validators (none fire) |
| `Field.formatStateUsing(fn)` | `formattedValue` populated on meta; receives `(value, { record })` |
| `Field.default(value)` | emits `defaultValue` on meta; `Form.fillFromRecord` overrides when record has the key |
| `Hidden` | renders nothing visible; round-trips value through coercion |
| `Checkbox` | true/false coercion; meta carries `fieldType:'checkbox'` distinct from toggle |
| `Radio` static options | same shape as `SelectField`; default selection works |
| `Radio` resolver options | reuses `OptionsResolver`; throws → empty + warn |
| `Radio.live()` + `afterStateUpdated` | re-resolves on change; `$set` mutations land |
| `CheckboxList` static options | array value; coercion handles single + array body shapes |
| `CheckboxList` resolver options | same pattern as Radio |
| `CheckboxList.live()` | re-resolves on every check toggle |
| `DateTimePicker` | `withTime()` flag emits `dateTime` mode; coerces `YYYY-MM-DDTHH:mm` correctly |
| `KeyValue` | round-trips `{k:v,…}` shape; empty rows filtered; `live()` triggers re-resolve on row blur |
| `ColorPicker` | hex string passthrough; empty → null |
| `Slider` | numeric coercion; min/max/step on meta; default works |
| `FileUpload` upload route | POST `/admin/_uploads` accepts multipart; rejects oversize / wrong accept; calls adapter; returns `{ok, url}` |
| `FileUpload.localUpload` adapter | writes to disk; URL prefix correct; directory routing works |
| `FileUpload` field meta | `accept`, `maxSize`, `multiple`, `preview`, `uploadUrl` emitted |
| `OptionsResolver` shared helper | called identically from Select / Radio / CheckboxList |

Target: ~50 new tests, bringing the suite to ~643. (We're at 593 from
Plan #5.)

## Rollout

1. Cross-field plumbing on `Field.ts` (prefix / suffix / helperText /
   dehydrated / formatStateUsing / default). `coerceFormValues` learns
   to skip dehydrated fields. Existing field tests stay green.
2. Extract `OptionsResolver` + `resolveOptions` helper into
   `fields/optionsResolver.ts`. `SelectField` rewires onto it as a
   no-op refactor; tests stay green.
3. Extract per-fieldtype renderer components from
   `SchemaRenderer.tsx` into `react/fields/`. Introduce
   `<FieldShell>`. `SchemaRenderer`'s switch dispatches to the
   extracted components. No behavior change.
4. Ship `Hidden` + `Checkbox` + `Radio` (no resolver yet) — small
   types, exercise the new component layout.
5. Ship `CheckboxList` + `Slider` + `ColorPicker` + `DateTimePicker`.
6. Ship `KeyValue`. Adds `body[name][key]=value` parsing to
   `coerceFormValues`.
7. Ship `FileUpload` field + upload adapter contract +
   `localUpload` adapter + `_uploads` route. If this step takes more
   than ~1 day of effort budget, split out as #6.5 and ship #6 with
   the other eight types.
8. Wire `Radio` / `CheckboxList` to the shared `OptionsResolver` and
   add resolver-form tests.
9. Playground demo: one new page exercising every type. Pin
   `formId('field-types-demo')` per
   `feedback_pilotiq_live_forms_pin_formid.md`.
10. Update `CLAUDE.md` field-list line + memory notes.

Steps 1-3 are pure refactors and ship as their own PR. Steps 4-9 are
the meat and ship as a single PR (the public API additions only stop
being internal-test-only once the renderer plumbing lands). Step 7
splits if needed; otherwise keeps with the bundle.

**Single-PR-vs-split decision.** Unlike Plan #5 (where server and
client had to ship together because the client crashes without the
endpoints), here every individual type is independently useful — but
shipping nine fields in nine PRs is unnecessary churn. Bundle them.
The exception is FileUpload, which is the only type with a server
side beyond `coerceFormValues`. If FileUpload slips, ship the rest
without it.
