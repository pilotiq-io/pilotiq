# Schema reference

Short reference for plugin authors and anyone extending `@pilotiq/pilotiq`. Covers the Element contract, the specialized Field/Action subtypes, container elements, validators, and the resolver plugin extension point.

For the high-level architecture and rationale, see [`docs/plans/phase-1-schema-foundation.md`](../../plans/phase-1-schema-foundation.md).

---

## The `Element` contract

Every primitive in a pilotiq schema tree extends one abstract base:

```ts
abstract class Element {
  protected _children?: Element[]
  abstract getType(): string
  abstract toMeta(): Record<string, unknown>
  getChildren(): Element[] | undefined
}
```

- `getType()` is the discriminator string the client renderer switches on.
- `toMeta()` returns this element's own JSON-safe state — **not** its children. The resolver attaches resolved children as `meta.children`.
- `_children` (optional) holds nested Elements for container types. Leaves leave it `undefined`.

A minimal custom display element:

```ts
import { Element } from '@pilotiq/pilotiq'

export class Stat extends Element {
  private constructor(private label: string, private value: string | number) { super() }
  static make(label: string, value: string | number) { return new Stat(label, value) }

  getType() { return 'stat' }
  toMeta() { return { type: 'stat', label: this.label, value: this.value } }
}
```

---

## Fields

`Field` extends `Element` and adds form-input semantics: a `name`, a label, required/readonly/placeholder flags, visibility flags, conditional callbacks, and validators.

```ts
TextField.make('email')
  .label('Email address')
  .required()
  .placeholder('you@example.com')
  .hideFromTable()
  .showWhen(record => record.subscribed)
  .validate([email(), maxLength(120)])
```

### Visibility

Per-mode flags drop the field from a render context entirely:

```ts
.hideFromTable()
.hideFromCreate()
.hideFromEdit()
.hideFromView()
```

Conditional callbacks evaluate against the current record (when one is present — no-op in `create` mode):

```ts
.showWhen(record => boolean)   // hide if returns false
.hideWhen(record => boolean)   // hide if returns true
.disabledWhen(record => boolean)
```

### `FieldMeta` shape

```ts
interface FieldMeta extends ElementMeta {
  type:         'field'
  fieldType:    'text' | 'textarea' | 'email' | 'number' | 'select' | 'toggle' | 'date' | 'slug'
  name:         string
  label:        string
  required:     boolean
  disabled:     boolean
  placeholder?: string
  rules?:       SerializedRule[]
  // subtypes append their own keys (e.g. maxLength, options, min/max/step)
}
```

Top-level `type` is always `'field'`; the client switches on `fieldType` to pick an input. This avoids clashing with the `'text'` discriminator used by the `Text` display element.

---

## Validation

A `Validator` is a plain function with an optional serialized descriptor:

```ts
type Validator = (value: unknown, ctx?: ValidatorContext) => string | null
                 & { serialized?: SerializedRule }

interface ValidatorContext { values?: Record<string, unknown>; record?: unknown }
interface SerializedRule    { rule: string; message?: string; [k: string]: unknown }
```

Return a string error message when invalid, or `null` to pass. The `serialized` descriptor (if present) is mirrored to the client via `FieldMeta.rules` so the browser can run the same rule for live UX before submit.

### Built-in helpers

```ts
required(message?)
email(message?)
minLength(n, message?)
maxLength(n, message?)
min(n, message?)
max(n, message?)
pattern(regex, message?)
```

All seven follow "skip empty values, fail otherwise" — combine with `required()` for "must be filled AND must be valid":

```ts
EmailField.make('email').required().validate(email())
```

### Custom validators

`makeValidator(fn, serialized?)` is the only thing you need:

```ts
import { makeValidator } from '@pilotiq/pilotiq'

const profanityFree = makeValidator(
  value => {
    if (typeof value !== 'string') return null
    return /badword/.test(value) ? 'Watch your language' : null
  },
  { rule: 'profanityFree', message: 'Watch your language' }, // optional
)

TextField.make('comment').validate(profanityFree)
```

Omit the `serialized` argument to keep the validator server-only.

### Running validators

Per field:

```ts
field.runValidators(value, { values, record })  // → string[]
```

Across an entire Element tree:

```ts
import { validateSchema, isValid } from '@pilotiq/pilotiq'

const errors = validateSchema(form.schema, submittedValues, currentRecord)
if (!isValid(errors)) { /* errors is { fieldName: string[] } */ }
```

`validateSchema()` walks every Element (including containers' children), runs each Field's validators, and returns a `{ name → errors[] }` map. Fields that pass are omitted from the map.

The `.required()` flag implicitly contributes a `required` check (and serialized rule) — it doesn't double-fire when an explicit `required()` validator is also added.

---

## Actions

Single class, `placement` discriminates the four placements panels-era pilotiq used. Phase 2.6 added link/form modes for actions tied to URLs:

```ts
Action.make('publish').label('Publish')
  .placement('inline')   // 'inline' | 'bulk' | 'row' | 'header'
  .icon('Send')
  .destructive(false)
  .confirm({ title: 'Publish article?', message: 'This goes public immediately.' })
  .handler(async ctx => { /* … */ })

// Link-style — renders <a href={url}>
Action.make('edit').label('Edit').href(`${basePath}/articles/${id}/edit`)

// Form-style — renders <form method="post" action={url}><button type="submit">
Action.make('delete').label('Delete')
  .destructive()
  .method('post')
  .action(`${basePath}/articles/${id}/delete`)
  .confirm('Delete this article?')
```

`href` and `method` are mutually exclusive; setting one clears the other. Confirmation prompts attach to `<form onSubmit>` after hydration and call `window.confirm(message)`. PUT/PATCH/DELETE methods spoof via a hidden `_method` input on the form.

The handler-based dispatch (`.handler(fn)`) is reserved for in-page action triggers in a later phase — the link/form modes cover Edit / Delete / publish-style flows that just hit a URL.

---

## `Form` — submit lifecycle as an Element

`Form` extends `Element`. Children are heterogeneous (Fields + Sections + Actions); the lifecycle methods own validation, mutation, save, and redirect. Handlers stay server-side; `toMeta()` only emits what the client needs to render the `<form>`.

```ts
Form.make()
  .schema([
    TextField.make('title').required(),
    TextareaField.make('body'),
    Action.make('save').label('Save'),
  ])
  .validate(passwordsMatch)               // form-level validators (run after field-level)
  .mutateData(d => ({ ...d, slug: slugify(d.title) }))
  .beforeSave(async (data, ctx) => { /* hooks */ })
  .save(async (data, ctx) => prisma.article.create({ data }))
  .afterSave(async (record, ctx) => { /* hooks */ })
  .redirectAfterSave(rec => `/admin/articles/${rec.id}/edit`)
  .loadRecord(async (id) => prisma.article.findUnique({ where: { id } }))
  .fillFromRecord(record => ({ ...record }))   // optional — defaults to spread
```

### Lifecycle order

```
validateSchema(form.children, body)    // walks every Field, runs validators
  → form-level validators              // for cross-field rules; errors land under `_form`
  → mutateData(data, ctx)
  → beforeSave(data, ctx)
  → save(data, ctx) → record           // user-implemented persistence
  → afterSave(record, ctx)
  → redirectAfterSave(record, ctx) → url
```

`dispatchFormSubmit(form, body, ctx)` runs this end-to-end and returns either `{ ok: false, errors }` (validation failure) or `{ ok: true, record, redirect }` (success). The route handler decides what to do with the result — typically re-render with errors / 422 or redirect 303.

### Render-time state

Three setters seed the next render after a load or a failed submit:

```ts
form.withValues(values)   // pre-fill inputs (edit mode, or after error)
form.withErrors(errors)   // shown next to each Field; `_form` becomes a top-of-form banner
form.action(url)          // form's POST URL; framework auto-sets to current route
```

### `FormMeta` shape

```ts
interface FormMeta extends ElementMeta {
  type:    'form'
  formId:  string                                // auto-generated; multi-form pages use this
  method:  'get' | 'post' | 'put' | 'patch' | 'delete'
  action?: string
  values?: Record<string, unknown>
  errors?: { [fieldName: string]: string[]; _form?: string[] }
}
```

### Multi-form pages

Each `Form` instance carries an auto-generated `formId`. The renderer emits a hidden `<input name="_formId" value={id}>`; on submit the route handler uses `selectForm(forms, body._formId)` to pick the right form. Single-form pages don't need to think about it.

---

## `Table` — query lifecycle as an Element

`Table` mirrors `Form`'s pattern: a container Element that owns its lifecycle. Children are typically `Column[]` plus header / row / bulk Actions.

```ts
Table.make()
  .columns([
    Column.make('title').sortable().searchable(),
    Column.make('status'),
    Column.make('createdAt'),
  ])
  .defaultSort('createdAt', 'desc')
  .paginate(10)
  .records(async (ctx) => {
    const where = ctx.search ? { title: { contains: ctx.search } } : undefined
    const orderBy = ctx.sort ? { [ctx.sort.column]: ctx.sort.direction } : undefined
    return {
      rows:  await prisma.article.findMany({ where, orderBy, take: ctx.perPage, skip: (ctx.page - 1) * ctx.perPage }),
      total: await prisma.article.count({ where }),
    }
  })
```

### `records(fn)` contract

`records()` receives a `TableContext` and returns either `{ rows, total }` or a bare row array (treated as `{ rows, total: rows.length }`). The framework parses URL query params into the context:

```ts
interface TableContext {
  search?: string
  sort?:   { column: string; direction: 'asc' | 'desc' }
  page?:   number
  perPage?: number
}
```

`loadTableRecords(elements, queryParams)` walks the Element tree, runs every Table's `records()` in parallel, and seeds the table's render-time state. `parseTableQuery({ sort: 'col[:dir]', search, page, perPage })` normalizes URL params (sort defaults to `'asc'`, `page` floors to ≥ 1, non-positive `perPage` is dropped).

### `TableMeta` shape

```ts
interface TableMeta extends ElementMeta {
  type:        'table'
  searchable:  boolean                           // any column searchable
  defaultSort?: { column: string; direction: 'asc' | 'desc' }
  perPage?:    number

  // Render-time state (set by loadTableRecords):
  rows?:        unknown[]
  total?:       number
  currentSort?: { column: string; direction: 'asc' | 'desc' }
  search?:      string
  currentPage?: number
}
```

### `Column`

```ts
Column.make('title')
  .label('Article title')   // defaults to capitalized name
  .sortable()
  .searchable()
```

`Column.toMeta()` emits `{ type: 'column', name, label, sortable, searchable }`. Columns are children of `Table`; standalone they don't render.

---

## Container elements

A container is any Element that populates `_children`. Built-in containers:

| Container | Set children with    | Notes                                              |
| --------- | -------------------- | -------------------------------------------------- |
| `Card`    | `.schema(elements)`  | Title + description optional                       |
| `Section` | `.schema(elements)`  | `.columns(1\|2\|3)`, `.collapsible()`              |
| `Tabs`    | `.tabs([Tab, ...])`  | Each `Tab` has its own `.schema(elements)`        |
| `Tab`     | `.schema(elements)`  | Children of one tab                                |
| `Grid`    | `.schema(elements)`  | Multi-column layout                                |

Children are heterogeneous — Fields, display elements, Actions, even nested containers all fit. The resolver recurses through `_children` automatically and writes them to `meta.children`.

To make your own container, store children in `_children`:

```ts
export class Disclosure extends Element {
  private constructor(private title: string) { super() }
  static make(title: string) { return new Disclosure(title) }

  schema(els: Element[]) { this._children = els; return this }

  getType() { return 'disclosure' }
  toMeta() { return { type: 'disclosure', title: this.title } }
}
```

---

## Plugin extension point: `registerResolver`

The default resolver calls `el.toMeta()`, recurses into `_children`, and attaches them as `meta.children`. Plugins (and `@pilotiq-pro/*` packages) can override that for a specific element type:

```ts
import { registerResolver, type ElementResolver } from '@pilotiq/pilotiq'

const myResolver: ElementResolver = async (el, ctx, recurse) => {
  // 1. compute extra data from `el` and `ctx` (server-side only)
  const records = await db.fetch(/* … */)

  // 2. recurse children if you have a container
  const children = await recurse(el.getChildren() ?? [])

  // 3. return meta — must include `type`
  return { type: el.getType(), records, children }
}

registerResolver('my-custom-type', myResolver)
```

The resolver runs at `resolveSchema()` time on the server. Use it to:

- Inject server-computed data (DB lookups, computed permissions, AI suggestions).
- Reshape children before serialization.
- Replace the default `toMeta()` output entirely.

`Field` visibility (`hideFromTable` / `showWhen` / etc.) is filtered **before** custom resolvers run — plugins can't accidentally resurrect a hidden field. Visibility logic stays in one place.

### The resolver pipeline

1. `resolveSchema(definition, ctx)` — entry point. `definition` is `Element[]` or `(ctx) => Element[]`.
2. For each Element in the tree:
   - If it's a `Field` and hidden in this `RenderContext`, drop it.
   - If a custom resolver is registered for `el.getType()`, call that.
   - Otherwise: call `el.toMeta()`, recurse children via `getChildren()`, attach as `meta.children`.
3. Children resolve in parallel via `Promise.all`.

`RenderContext` is `{ mode?: 'table'|'create'|'edit'|'view', record?, ...arbitrary }`. The arbitrary keys propagate untouched — plugins can read whatever the panel passed in.

---

## Where each thing lives

```
src/
├── schema/
│   ├── Element.ts           ← abstract base + ElementMeta
│   ├── resolveSchema.ts     ← resolver + registerResolver + RenderContext
│   ├── Text.ts, Heading.ts, Alert.ts, Divider.ts   ← display leaves
│   └── Card.ts, Section.ts, Tabs.ts, Grid.ts       ← containers
├── fields/
│   ├── Field.ts             ← base Field, visibility, validators, FieldMeta
│   ├── TextField.ts, EmailField.ts, …              ← 8 concrete subclasses
│   └── resolveField.ts      ← per-field resolver (used by Resource until 1.6)
├── actions/
│   └── Action.ts            ← single class, placement-discriminated
└── validation/
    ├── Validator.ts         ← Validator type + makeValidator
    ├── rules.ts             ← required, email, minLength, ...
    └── runValidators.ts     ← validateSchema tree walker
```
