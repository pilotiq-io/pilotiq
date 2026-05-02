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
```

> [!TIP]
> Combine `live()` + `afterStateUpdated()` to wire a reactive pair
> (e.g. title → slug, country → state options). See
> [Reactive fields](./reactive).
