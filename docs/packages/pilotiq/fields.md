# Fields

Every form field is a static `make(name)` builder that extends `Field`.

## Built-in fields

| Field | Renders | Notes |
|---|---|---|
| `TextField` | `<input type="text">` | `prefix() / suffix() / mask()` |
| `EmailField` | `<input type="email">` | Auto-attaches `email()` validator |
| `NumberField` | `<input type="number">` | `min() / max() / step()` |
| `Slider` | range track | `range() / step()` |
| `Textarea` | `<textarea>` | `rows()` |
| `MarkdownField` | textarea + preview | tabs Write / Preview |
| `RichTextField` | Tiptap editor | from `@pilotiq/tiptap` |
| `CodeEditorField` | CodeMirror 6 | from `@pilotiq/codemirror` |
| `SelectField` | shadcn Select | `options(arr | fn)` |
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
