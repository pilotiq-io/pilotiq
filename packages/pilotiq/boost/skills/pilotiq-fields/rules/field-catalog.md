# Field Catalog

24 built-in field types. Every field is a static `make(name)` builder; all share the `Field` base setters (see "Common setters" at the bottom).

## Text-like

```ts
TextField.make('title')
  .placeholder('e.g. My first article')
  .prefix('https://')
  .suffix('.com')
  .copyable()                            // value-side copy icon
  .password()                            // <input type="password">
  .revealable()                          // password reveal toggle
  .mask('+1 (999) 999-9999')             // input mask
  .datalist(['draft', 'review', 'final'])// browser-native datalist
  .stripCharacters(/[^\w-]/g)            // sanitize on input
  .trim()                                // trim whitespace
  .inputMode('email')                    // mobile keyboard hint
  .autocapitalize('words')

EmailField.make('email')                 // auto-attaches email() validator

NumberField.make('price')
  .min(0).max(10_000).step(0.01)

Slider.make('volume')
  .range(0, 100).step(5)
```

## Long text

```ts
Textarea.make('bio')
  .rows(5)
  .cols(80)
  .autosize()                            // grow with content
  .disableGrammarly()

MarkdownField.make('body')
  .toolbarButtons(['bold', 'italic', 'link', 'codeBlock'])
  .minHeight('20rem')

RichTextField.make('description')        // requires @pilotiq/tiptap
  .toolbarButtons([...])

CodeEditorField.make('snippet')          // requires @pilotiq/codemirror
  .language('javascript')
  .lineNumbers()
```

`RichTextField` and `CodeEditorField` ship in separate adapter packages — install `@pilotiq/tiptap` / `@pilotiq/codemirror` and register via `.plugins([tiptap(), codeEditor()])` on the panel.

## Choice

```ts
SelectField.make('status')
  .options({ draft: 'Draft', review: 'In review', published: 'Published' })
  .searchable()
  .nullable()                            // adds a clear option
  .preload()                             // fetch all options on mount (default)

// Dynamic options
SelectField.make('region')
  .options(async ({ $get }) => {
    const country = $get('country')
    return country ? regionsFor(country) : {}
  })
  .live()

// Inline create
SelectField.make('tagId')
  .options(async () => Object.fromEntries((await Tag.all()).map(t => [t.id, t.name])))
  .createOptionForm([TextField.make('name').required()])
  .createOptionUsing(async ({ name }) => {
    const tag = await Tag.create({ name })
    return tag.id                        // return the new value
  })

RadioField.make('priority')              // single-select radio stack
  .options({ low: 'Low', med: 'Medium', high: 'High' })

ToggleButtons.make('size')               // chip-style segmented (sugar over Radio)
  .options({ s: 'S', m: 'M', l: 'L', xl: 'XL' })
```

## Boolean

```ts
CheckboxField.make('agreeToTerms')       // single bool, renders as checkbox
  .required('You must agree to continue')

ToggleField.make('isPublic')             // single bool, renders as switch

CheckboxList.make('topics')              // string[] value, checkbox stack
  .options({ js: 'JavaScript', ts: 'TypeScript', rust: 'Rust' })
```

## Tags / collections

```ts
TagsInput.make('keywords')               // string[] value, JSON-encoded
  .suggestions(['design', 'code', 'process'])
  .reorderable()                         // HTML5 drag-and-drop
  .maxTags(8)
  .separator(',')

KeyValueField.make('metadata')           // Record<string, string>
  .keyLabel('Field')
  .valueLabel('Value')
```

## Date / time / color / file

```ts
DateField.make('publishedAt')
  .minDate(new Date())                   // future-only

DateTimePicker.make('eventAt')
  .seconds(false)

ColorPicker.make('brandColor')
  .palette(['#ef4444', '#10b981', '#3b82f6'])

FileUpload.make('cover')
  .accept('image/*')
  .maxSize(5 * 1024 * 1024)              // 5 MB
  .multiple()                            // string[] when on
  .imageEditor()                         // crop / rotate before upload
```

`FileUpload` requires an upload adapter wired at the panel level:

```ts
import { localUpload } from '@pilotiq/pilotiq/uploads'

adminPanel.uploads({
  adapter: localUpload({ root: 'public/uploads', urlPrefix: '/uploads' }),
})
```

S3 / R2 / custom adapters implement the same `UploadAdapter` interface.

## Array-of-rows (Repeater / Builder)

```ts
Repeater.make('items')                   // uniform rows
  .schema([
    TextField.make('label').required(),
    NumberField.make('qty').required(),
  ])
  .min(1)
  .maxItems(10)
  .reorderable()
  .cloneable()
  .collapsible()
  .itemLabel(row => row.label || 'New item')

Builder.make('content')                  // heterogeneous rows
  .blocks([
    Block.make('heading').icon('heading').schema([
      TextField.make('text').required(),
      SelectField.make('level').options({ h1: 'H1', h2: 'H2', h3: 'H3' }),
    ]),
    Block.make('paragraph').icon('text').schema([
      MarkdownField.make('body'),
    ]),
    Block.make('image').icon('image').schema([
      FileUpload.make('src').accept('image/*').required(),
      TextField.make('alt'),
    ]),
  ])
  .reorderable()
  .blockPickerColumns(2)
```

For relation-backed rows (real `hasMany` / `morph*` / M2M children instead of JSON-blob storage), see the `pilotiq-relations` skill.

## Hidden

```ts
HiddenField.make('authorId')             // always submitted, never rendered
  .default(({ user }) => user.id)
```

## Common setters

Every field inherits these from `Field`:

```ts
Field.make('name')
  .label('Display label')                // sr-only if empty
  .helperText('Shown below the input')
  .placeholder('e.g. Hello world')
  .default('initial value')              // or () => value, or (ctx) => value
  .prefix('$')                           // or .prefix({ icon: 'dollar' })
  .suffix('USD')
  .required()                            // implicit required validator
  .validate([Field.email(), Field.unique({ model: User })])
  .visible(({ user }) => user.role === 'admin')
  .hidden(rule)
  .disabled(rule)
  .columnSpan(2)                         // inside a Grid / Section.columns(n)
  .live()                                // re-resolve schema on change
  .afterStateUpdated((value, ctx) => ctx.$set('slug', slugify(value)))
  .dehydrated(false)                     // exclude from POST body
  .formatStateUsing(v => `${v} px`)      // display transform (read paths)
  .autofocus()
  .hiddenLabel()                         // visually hidden, sr-only kept
  .validationAttribute('email address')  // tunes the implicit-required text
  .extraAttributes({ 'data-cy': 'name' }) // outer wrapper attrs
  .extraInputAttributes({ autocomplete: 'off' }) // <input> attrs
  .disabledOn(['edit'])                  // page-mode sugar
  .hiddenOn(['view'])
  .visibleOn(['create', 'edit'])
  .readonly()                            // disabled + non-submittable
```

## Operation-aware shortcuts

`disabledOn` / `hiddenOn` / `visibleOn` are sugar over `disabled(ctx => ctx.mode === 'edit')` / `hidden(ctx => ctx.mode === 'view')` / `visible(ctx => ['create', 'edit'].includes(ctx.mode))`.

They resolve against page mode (`'table' | 'create' | 'edit' | 'view'`) and no-op on custom Pages (mode is unset). `readonly()` wins over `disabledOn`.

```ts
TextField.make('email')
  .disabledOn(['edit'])                  // can set on create, locked on edit
  .visibleOn(['create', 'edit'])         // never on view
```

## Conditional visibility

`.visible(rule)` / `.hidden(rule)` / `.disabled(rule)` accept `boolean | (ctx: ConditionContext) => bool | Promise<bool>`:

```ts
ConditionContext = {
  record?: unknown                       // current record on edit/view
  values?: Record<string, unknown>       // form values (only when reactive)
  user?: unknown                         // from Pilotiq.user()
  mode?: 'create' | 'edit' | 'view'
}
```

```ts
TextField.make('publishUrl')
  .visible(({ values }) => values?.status === 'published')

TextField.make('adminNotes')
  .visible(({ user }) => user.role === 'admin')

TextField.make('signature')
  .disabled(({ record }) => record?.locked === true)
```

For visibility that depends on form values to change in real-time, ALSO add `.live()` to the source field — otherwise the dependent field only re-evaluates on submit.

## Display-only transforms

`formatStateUsing(v => …)` runs on the read path (loadRecord → fill) to transform the value for display. It does NOT affect the submitted value:

```ts
NumberField.make('priceInCents')
  .formatStateUsing(v => (v / 100).toFixed(2))
  // user sees "9.99"; column stores 999
```

For two-way conversion, pair with an accessor / mutator on the underlying model (e.g. `Attribute.make({ get: c => c / 100, set: d => d * 100 })`).

## Mass-assignment + `dehydrated`

Fields submit by default. `dehydrated(false)` excludes the field from the POST body:

```ts
TextField.make('computedSlug')
  .dehydrated(false)
  .formatStateUsing(({ values }) => slugify(values?.title ?? ''))
```

Useful for derived display, server-computed values, or admin-only debug toggles. The model never receives the field; coerce + validate skip it.

## Common pitfalls

- **`SelectField.options(fn)` without `.live()` upstream** — when options depend on another field via `$get`, the source field must be `.live()` for the dependent options to re-fetch. Otherwise the options resolve once at form load.
- **`TagsInput` stores `string[]` via JSON-encoded hidden input** — if you read it directly with `parseFormBody`, decode the JSON. The framework's `coerceFormValues` already handles it.
- **`FileUpload` without an upload adapter** silently hides the drop zone via `RenderContext.hasUploadAdapter`. Wire `panel.uploads({ adapter })` to expose it.
- **`Repeater.simple(field)` is a different storage shape.** `Repeater.make().schema([TextField.make('value')])` stores `[{ value: 'a' }, { value: 'b' }]`. `Repeater.simple(TextField.make('value'))` stores `['a', 'b']` — flat array. The framework wraps/unwraps internally; the inner schema must be a single field.
- **`HiddenField` is still in the submitted body** — `dehydrated(false)` exists for the case where you want a value rendered but not submitted (typically for `formatStateUsing` display).
- **`columnSpan(n)` only works inside a layout that defines a column grid** (`Section.columns(n)` / `Grid.columns(n)`). Bare schema arrays don't grid.
