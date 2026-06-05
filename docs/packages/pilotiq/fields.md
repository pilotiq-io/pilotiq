# Fields

Every form field is a static `make(name)` builder that extends `Field`.

## Built-in fields

| Field | Renders | Notes |
|---|---|---|
| `TextField` | `<input type="text">` | `password() / revealable() / copyable() / mask() / datalist() / stripCharacters() / trim() / inputMode() / autocapitalize() / prefixAction() / suffixAction()` |
| `EmailField` | `<input type="email">` | Auto-attaches `email()` validator |
| `NumberField` | `<input type="number">` | `min() / max() / step()` |
| `Slider` | range track | `range() / step()` |
| `Textarea` | `<textarea>` | `rows() / cols() / autosize() / disableGrammarly()` |
| `MarkdownField` | textarea + preview | tabs Write / Preview |
| `RichTextField` | Tiptap editor | from `@pilotiq/tiptap` |
| `CodeEditorField` | CodeMirror 6 | from `@pilotiq/codemirror` |
| `SelectField` | shadcn Select | `options(arr | fn) / multiple() / relationship()` |
| `RadioField` | radio stack | sugar for single-select |
| `ToggleButtons` | chip-style segmented | sugar over Radio |
| `CheckboxField` | single checkbox | distinct from Toggle |
| `CheckboxList` | checkbox stack | `string[]` value |
| `ToggleField` | switch | `bool` value |
| `TagsInput` | chip multi-tag | `string[]` value, JSON-encoded |
| `KeyValueField` | key/value rows | `Record<string, string>` |
| `DateField` | calendar popover | |
| `DateTimePicker` | calendar + time | |
| `ColorPicker` | hex input + swatch | |
| `FileUpload` | drop zone | reads `RenderContext.uploadUrl` |
| `Repeater` | nested rows | array-of-subschema |
| `Builder` | heterogeneous rows | one of N block types |
| `HiddenField` | `<input type="hidden">` | always submitted |

## Common setters

Every field inherits these from `Field`:

```ts
Field.make('name')
  .label('Display label')
  .helperText('Shown below the input')
  .placeholder('e.g. Hello world')
  .default('initial value')
  .prefix('$')                       // or .prefix({ icon: 'dollar' })
  .suffix('USD')
  .required()
  .validate([rule, rule, ...])
  .visible(({ user }) => user.role === 'admin')
  .hidden(rule)
  .disabled(rule)
  .columnSpan(2)                     // when inside a Grid
  .live()                            // re-resolve on change
  .afterStateUpdated((value, ctx) => ctx.$set('slug', slugify(value)))
  .dehydrated(false)                 // don't submit
  .formatStateUsing(v => `${v} px`)  // display transform
  .autofocus()                       // browser focuses on first paint
  .hiddenLabel()                     // sr-only label (a11y kept)
  .validationAttribute('email address') // tunes the implicit-required text
  .extraAttributes({ 'data-cy': 'name' })       // outer wrapper attrs
  .extraInputAttributes({ autocomplete: 'off' }) // <input> attrs
  .disabledOn(['edit'])              // sugar over disabled(ctx)
  .hiddenOn(['view'])
  .visibleOn(['create', 'edit'])
```

### Operation-aware shortcuts

`disabledOn / hiddenOn / visibleOn` resolve against the page mode
(`'table' | 'create' | 'edit' | 'view'`). They no-op on schema-only
routes (custom Pages) where mode is unset, matching the existing
`hideFromCreate / hideFromEdit / hideFromView` behaviour. `readonly()`
still wins over `disabledOn`.

### Validation attribute

`validationAttribute('email address')` swaps the implicit-required
message from `"This field is required"` to `"The email address is
required"`. Explicit validators (`required('Custom message')`,
`email('Bad email')`) keep their argument unchanged.

### Pass-through HTML attrs

- `extraAttributes` and `extraFieldWrapperAttributes` (alias) — merged
  onto the field's outer wrapper.
- `extraInputAttributes` — spread onto the underlying `<input>` /
  `<select>` / `<textarea>`.

> [!TIP]
> Combine `live()` + `afterStateUpdated()` to wire a reactive pair
> (e.g. title → slug, country → state options). See
> [Reactive fields](./reactive).

## SelectField-specific setters

### Multiple

`multiple()` flips the field to array mode — the value is a `string[]` of
option values, rendered as removable chips on a select-style trigger with a
searchable checkbox dropdown:

```ts
SelectField.make('categories')
  .label('Categories')
  .multiple()
  .options(async () => {
    const rows = await Category.query().paginate(1, 200)
    return rows.data.map(c => ({ value: c.id, label: c.name }))
  })
```

The selected ids JSON-encode into a single hidden input (same wire shape as
`TagsInput`); the server parses them back to `string[]`. `required()` fails
on an empty selection. Stored as a JSON column unless paired with
`relationship()`.

### Relationship-backed values

`relationship(name)` binds a multi-select to an M2M relation on the parent
model instead of a column — the canonical post ↔ categories shape:

```ts
// Model
static relations = {
  categories: { type: 'belongsToMany', model: () => Category, pivotTable: 'category_post' },
}

// Resource form
SelectField.make('categories').multiple().relationship('categories').options(…)
```

- **Edit fill:** the current ids load from `parent.related('categories')`.
- **Save:** the ids are stripped from the parent payload and synced through
  the ORM's pivot accessor (`post.categories().sync(ids)`) after the parent
  save — both create and edit.

Works for `belongsToMany` / `morphToMany` / `morphedByMany` relations
(anything exposing `sync`). Self-referencing pivots work too — declare
explicit `foreignPivotKey` / `relatedPivotKey` on the relation.

v1 limits: `relationship()` requires `multiple()`; `createOptionForm()` is
single-select only; no pivot ordering. Plan: `docs/plans/select-multiple.md`.

## TextField-specific setters

```ts
TextField.make('apiKey')
  .password()                      // type="password"
  .revealable()                    // eye-icon toggle to flip password ↔ text
  .copyable('Key copied!')         // suffix click-to-copy + toast
  .mask('(999) 999-9999')          // keystroke formatter (alphabet below)
  .stripCharacters('()- ')         // remove from value before save
  .trim()                          // strip leading/trailing whitespace
  .datalist(['gmail.com', 'outlook.com']) // HTML5 native suggestions
  .inputMode('numeric')            // virtual-keyboard hint
  .autocapitalize('off')           // mobile-keyboard auto-cap behaviour
  .prefixAction(Action.make('generate').icon('plus').handler(...))
  .suffixAction(Action.make('rotate').icon('refresh').handler(...))
```

**`password()`** flips the input to `type="password"`. **`revealable()`**
mounts an eye-icon toggle in the suffix slot — only renders when paired
with `password()` (a stray `revealable()` on a non-password input is a
no-op, not an error).

**`copyable(message?)`** mounts a copy button that writes the current
input value to the clipboard via `navigator.clipboard.writeText`; the
optional message overrides the default `'Copied!'` success toast. Falls
back to `document.execCommand('copy')` on browsers without the
clipboard API.

**`mask(pattern)`** formats the value keystroke-by-keystroke against
this alphabet:

| Token | Matches |
|---|---|
| `9` | digit `0-9` |
| `a` | alpha `A-Za-z` |
| `*` | any character |
| anything else | literal — rendered verbatim |

Examples: `'(999) 999-9999'`, `'9999-9999-9999-9999'`, `'aaa-9999'`.
Pair with `stripCharacters` so the persisted column doesn't carry the
literals (`stripCharacters('()- ')` removes the four mask chars before
the value lands on the server).

**`stripCharacters(chars)`** runs server-side (the source of truth — a
tampered client can't post unstripped values) AND client-side (so what
the user sees matches what gets posted). Pass either a string of
single characters or an explicit array.

**`trim()`** strips leading and trailing whitespace from the submitted
value before validation runs (server-side authority — equivalent to
Laravel's `TrimStrings` middleware). Composes with `stripCharacters` —
trim runs first, then stripping. Empty strings remain empty; non-string
values pass through.

**`datalist(values)`** adds an HTML5 `<datalist>` next to the input.
Browsers render an autocomplete dropdown; users can still type values
not on the list. Useful for canonical-but-not-exclusive sets (countries,
departments, common email domains).

**`inputMode(mode)`** sets the HTML `inputmode` attribute — drives the
virtual-keyboard layout on mobile. Modes: `'none' | 'text' | 'numeric'
| 'tel' | 'email' | 'decimal' | 'search' | 'url'`. Distinct from
`type=` — a `text` field with `inputMode('numeric')` still accepts
non-digit pastes; for strict numeric-only, use `NumberField`.

**`autocapitalize(mode)`** sets the HTML `autocapitalize` attribute.
Modes: `'off' | 'sentences' | 'words' | 'characters'`.

**`prefixAction / suffixAction`** mount a clickable `Action` button
inside the input shell. Distinct from the passive `prefix() / suffix()`
decorations (which accept a string or icon descriptor only). The Action
keeps its full chrome — `.icon() / .color() / .visible() / .modal*()`
all work, and visibility rules evaluate through the standard schema
walker the same way they do anywhere else.

## Textarea-specific setters

```ts
Textarea.make('bio')
  .rows(8)              // initial visible rows (default 4)
  .cols(60)             // HTML cols attr — explicit char-grid width
  .autosize()           // grow with content; unsets the explicit rows
  .disableGrammarly()   // suppress the Grammarly browser overlay
```

`autosize()` rides the existing `field-sizing-content` CSS utility on
the underlying `<textarea>` — the box grows with typed content until
the parent's max-height. `cols()` and `rows()` still apply when both
are set, but `autosize()` drops the explicit `rows` so the browser
sizes purely to content. `disableGrammarly()` adds
`data-gramm="false" / data-gramm_editor="false" /
data-enable-grammarly="false"` so the third-party extension skips the
field — useful for sensitive content (slug source, code snippets, DB
queries) where the overlay corrupts cursor placement.

## FileUpload-specific setters

```ts
FileUpload.make('avatar')
  .multiple()                          // accept multiple files
  .accept(['image/jpeg', 'image/png']) // MIME allowlist
  .maxSize(5 * 1024 * 1024)           // 5 MB cap
  .directory('avatars')               // sub-directory hint for the adapter
  .preview()                          // show image thumbnail after upload
  .downloadable()                     // add a download icon per file
  .openable()                         // add an open-in-tab icon per file
  .reorderable()                       // drag-to-reorder uploaded files
  .appendFiles()                       // accumulate uploads instead of replacing
  .panelLayout('grid')                // 'list' (default) | 'grid' | 'integrated'
  .preserveFilenames()                // keep the original filename on the adapter
```

### Image editor

```ts
FileUpload.make('cover')
  .imageEditor()                              // crop modal on file pick
  .imageEditorAspectRatioOptions([           // optional ratio presets
    { ratio: 16 / 9,  label: '16:9' },
    { ratio: 4 / 3,   label: '4:3' },
    { ratio: 1,       label: 'Square' },
  ])
  .automaticallyCropImagesToAspectRatio()    // auto-apply first ratio, skip modal

FileUpload.make('profile')
  .avatar()                                  // imageEditor() + circleCropper() + single
```

The crop modal opens client-side after the user selects a file. The
cropped canvas blob replaces the original before the POST reaches the
server — no unprocessed pixels ever leave the browser.

`automaticallyCropImagesToAspectRatio()` silently applies the first
ratio and uploads immediately — the modal is skipped entirely. Useful
for bulk workflows where every image should be uniformly cropped without
prompting.

The playground's global stylesheet (or your app's equivalent) must
import the crop component's CSS:

```css
@import "react-image-crop/dist/ReactCrop.css";
```

### Server-side resize

```ts
FileUpload.make('thumbnail')
  .automaticallyResize(800, 600)
```

When `automaticallyResize(width, height)` is set, the client appends
`resize_width` and `resize_height` to the upload FormData. The
`_uploads` route handler reads those values, calls `@rudderjs/image`'s
`image(file).resize(w, h).format('webp').toBuffer()`, and passes the
resized WebP buffer to the adapter instead of the original file. The
stored filename gains a `.webp` extension.

Requires `@rudderjs/image` as an optional peer dependency:

```bash
pnpm add @rudderjs/image
```

If the package is not installed, the route silently falls back to
uploading the original file unchanged — no error is thrown.
