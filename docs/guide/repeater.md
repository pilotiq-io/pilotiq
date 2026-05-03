# Repeater field

`Repeater.make(name).schema([...])` lets the end user add, remove,
reorder, and clone rows of an inner schema. Storage on the parent
record is a plain array of objects: `[{ field1, field2 }, …]`.

Use it for line items on an order, FAQ entries on a CMS page,
environment variables on a deployment, social-media links on a profile —
anywhere the natural shape is "0 or more of the same little form."

## Quick example

```ts
import {
  Form, Repeater, TextField, NumberField, ToggleField,
} from '@pilotiq/pilotiq'

Form.make()
  .formId('orders-edit')
  .schema([
    Repeater.make('lineItems')
      .label('Line items')
      .columns(2)
      .defaultItems(1)
      .minItems(1)
      .maxItems(50)
      .reorderable()
      .cloneable()
      .collapsible()
      .itemLabel(row => row['product'] || 'New line item')
      .addActionLabel('Add line item')
      .schema([
        TextField.make('product').required(),
        NumberField.make('quantity').default(1).required(),
        NumberField.make('unitPrice').prefix('$').required(),
        ToggleField.make('discounted'),
      ]),
  ])
```

The submitted body has shape:

```json
{
  "lineItems": [
    { "product": "Widget", "quantity": 2, "unitPrice": 9.99, "discounted": false },
    { "product": "Gear",   "quantity": 1, "unitPrice": 49,   "discounted": true  }
  ]
}
```

## API

| Method | Effect |
|---|---|
| `.schema([...])` | Inner schema — every Field type works inside; layout containers (`Section`, `Group`, `Card`, `Grid`) work too |
| `.columns(n)` | Render the inner schema in `n` grid columns |
| `.defaultItems(n)` | Initial empty rows on a fresh form (default `1`) |
| `.minItems(n)` | Server-side validator + client-side disable on Remove |
| `.maxItems(n)` | Server-side validator + client-side disable on Add / Clone |
| `.reorderable()` | Drag-and-drop via the grip handle on each row, plus ↑ / ↓ buttons as keyboard fallback |
| `.cloneable()` | Show duplicate-row button |
| `.collapsible()` | Per-row collapse chevron — body kept mounted (so values survive collapse) |
| `.collapsed()` | Default-collapsed when collapsible (typically combined with `itemLabel`) |
| `.accordion()` | One-row-open-at-a-time mode. Picking a row collapses every other row. Auto-arms `collapsible()`. Pair with `.collapsed()` to start with everything closed (default opens the first visible row). Open-row id persists per-form to `localStorage`. |
| `.grid(n)` | Lay the *rows themselves* in an n-column grid (n ≥ 2). Different from `.columns(n)`, which grids the inner schema *inside* a row. n < 2 is the off sentinel. The drag-drop indicator is suppressed in grid mode (it reads wrong across cells); ↑ / ↓ buttons + DnD itself still work. |
| `.table([{ label, alignment?, width?, required? }, …])` | Render rows as a compact HTML table — one `<tr>` per row, one `<td>` per inner field. Columns map 1:1 to `schema()` fields in declaration order. Inner-field labels render `sr-only`; clone / delete / `extraItemActions` land in a final actions cell. Pass `[]` to turn off. Mutually exclusive with `.simple()` and `.grid()`. |
| `.itemLabel(row => string)` | Header text for the collapsed row; falls back to `Item N` |
| `.itemHidden(rule)` | Per-row visibility — boolean or `(ctx) => bool \| Promise<bool>`. Hidden rows render with `display:none` so values still round-trip on submit |
| `.addActionLabel(text)` | Label for the Add button (default `'Add'`) — shorthand for `.addAction(RowButton.make().label(text))` |
| `.addAction(b)` / `.cloneAction(b)` / `.deleteAction(b)` / `.moveUpAction(b)` / `.moveDownAction(b)` / `.reorderAction(b)` / `.collapseAction(b)` | Customize the chrome of the seven built-in row buttons (label / icon / color / tooltip). See [Row-button customizers](#row-button-customizers) below. |

Inherited from `Field`: `.label() / .required() / .helperText() /
.dehydrated() / .live() / .visible() / .hidden() / .disabled()`.

## Validation

Per-row inner-field errors land at flat keys: `lineItems.0.product`,
`lineItems.0.quantity`, etc. The renderer uses the dotted key to surface
the message inline on the matching row.

`minItems` / `maxItems` violations land under the bare key
(`lineItems`) so they render as a row-level message.

## Reactive interop (Plan #5)

Inner fields support `live()` and `afterStateUpdated`:

```ts
Repeater.make('lineItems').schema([
  NumberField.make('quantity').live().afterStateUpdated((value, { $get, $set, row }) => {
    const unit = Number($get('unitPrice') ?? 0)
    $set('subtotal', Number(value) * unit)   // row-scoped — writes the same row
    console.log('row', row?.index, 'updated')
  }),
  NumberField.make('unitPrice'),
  NumberField.make('subtotal').readonly(),
])
```

- `$get(name)` / `$set(name, value)` are **row-scoped** by default —
  reading a bare name reads/writes the current row's siblings.
- Dotted paths reach across rows: `$get('lineItems.0.quantity')`,
  `$set('lineItems.0.subtotal', 0)`.
- `row.index` exposes the current row's position; `row.$get` /
  `row.$set` are explicit aliases for the row-scoped helpers.

> Live re-resolves still POST whole-form values, including the
> Repeater array.

## Layout visibility (Plan #8)

`Section.visible(({ values }) => …)` (and any layout `visible(…)` rule)
inside an inner schema sees `ctx.values` scoped to the row:

```ts
Repeater.make('faqs').schema([
  TextField.make('question'),
  TextField.make('answer'),
  SelectField.make('category').options([...]),
  Section.make('Internal notes')
    .schema([TextField.make('internalNotes')])
    .visible(({ values }) => values?.['category'] === 'technical'),
])
```

Each row evaluates the visibility predicate independently against its
own row values.

## Row-level visibility — `itemHidden` (Plan #14 v1.2)

`Repeater.itemHidden(rule)` accepts a `boolean` or a callback receiving
a row-scoped `LayoutContext`:

```ts
Repeater.make('contacts')
  .itemHidden(({ values }) => values?.['archived'] === true)
  .schema([
    TextField.make('name'),
    TextField.make('email'),
    ToggleField.make('archived'),
  ])
```

Hidden rows render with `display: none` — chrome (drag handle, action
buttons, label) doesn't render but inputs (and the `__id`) stay mounted
so values round-trip through FormData on submit. Visibility is purely
UX: hidden rows still count toward `min/maxItems`.

The predicate context carries:
- `values` — row-scoped values
- `$get` / `$set` — row-scoped (dotted paths reach across rows)
- `row.index` — current row's absolute position
- `record` / `user` — parent form's render context

Returning a `Promise<boolean>` is supported. A throwing predicate
fails-closed-as-**visible** (the row stays shown + `console.warn`) —
the inverse of layout `visible()`'s posture, because a misbehaving rule
should never silently hide data the user is editing.

> `itemHidden` is evaluated at form-render time (initial SSR and full
> re-renders after submit). Live state-update re-resolves don't
> dynamically toggle hide/show on existing rows; the user must submit
> the form to reapply visibility. Reactive `itemHidden` is tracked for
> a future revision.

Reorder skips hidden rows: pressing ↑ on the row below a hidden row
hops the visible row over the hidden one. Drag-and-drop drops only
between visible rows (hidden rows have no DOM box to target).

## Nested Repeaters

Repeaters compose. Coercion, validation, and resolve all recurse with
the right scoping:

```ts
Repeater.make('products').schema([
  TextField.make('name'),
  Repeater.make('modifiers').schema([
    TextField.make('label'),
    NumberField.make('priceDelta'),
  ]),
])
```

Submitted body:

```json
{
  "products": [
    { "name": "Burger", "modifiers": [
        { "label": "Cheese", "priceDelta": 1.5 },
        { "label": "Bacon",  "priceDelta": 2   }
      ]
    }
  ]
}
```

Inner-row validation errors: `products.0.modifiers.1.label`.

## Soft / two-sided body shapes

Both `Content-Type: application/json` and
`application/x-www-form-urlencoded` bodies are supported on the server.

- **JSON** — the SPA `fetch+JSON` path (default since
  Plan #3 / `feedback_action_dispatch_fetch_vs_303.md`). The
  `lineItems` key is already an array of objects.
- **Flat-key form-encoded** — the form-post 303 fallback path. Keys
  arrive as `lineItems.0.product=Widget&lineItems.0.quantity=2`. The
  server's `coerceFormValues` re-groups them into an array.

Trailing rows where every value is `undefined / null / ""` (only the
round-tripped `__id` is present) are trimmed before validators run, so
an "Add" + don't-type-anything sequence doesn't persist a blank row.
Rows with `0` or `false` survive — they're real values.

## Row identity

Each rendered row carries a stable `id` (server-generated on first
render; persisted client-side and round-tripped through a hidden
`__id` input). Stable ids enable:

- React key stability across reorder / clone / remove (so uncontrolled
  inputs preserve their typed values).
- Per-row collapsed-state localStorage keying:
  `pilotiq.repeater.<formId>.<fieldName>.<rowId>`.

The id is a render-time identifier — it's **not** persisted on the
saved record. If you want stable row identity across reloads, add an
`IdField` to the inner schema.

## Reactive inner fields

`Field.live()` works inside a Repeater row. The client delegates
`onChange / onBlur` events at the Repeater container level: when a
dotted-path field name is detected (e.g. `items.0.quantity`), the
provider snapshots the form's full DOM state via `FormData` and POSTs
to the partial-resolve endpoint with the just-typed value layered on
top. The server's `afterStateUpdated` hook gets a row-scoped `ctx.row`
with `$get / $set` for same-row reads/writes, plus a top-level `$get /
$set` that accepts dotted paths for cross-row reads.

Example — a row-scoped subtotal computed live from quantity × unit
price:

```ts
NumberField.make('quantity')
  .live({ debounce: 300 })
  .afterStateUpdated((value, ctx) => {
    const qty   = Number(value ?? 0)
    const price = Number(ctx.row?.$get('unitPrice') ?? 0)
    ctx.row?.$set('subtotal', qty * price)
  })
```

**Limitation:** Switch / Slider and other React-controlled primitives
that update via callbacks (not native input events) won't bubble
through the delegated handler, so their inner `live()` won't fire.
Native inputs — text, number, email, textarea, select, range, date,
checkbox, radio — all work.

## Per-row action buttons — `extraItemActions`

`Repeater.extraItemActions([...])` and `Builder.extraItemActions([...])`
register handler-style action buttons that render in each row's header
alongside the built-in clone/delete strip. Useful for "Send test",
"Mark featured", etc.

```ts
Repeater.make('subscribers')
  .schema([TextField.make('email').required()])
  .extraItemActions([
    Action.make('sendTest')
      .label('Send test')
      .icon('send')
      .visible(({ values }) => Boolean(values?.email))
      .handler((ctx) => {
        const email = ctx.row?.values?.email
        // ctx.row = { index, id, values, fieldName, blockType? }
        return { notify: Notification.make(`Test queued for ${email}`).success() }
      }),
  ])
```

The handler context carries:

| Field | Description |
| --- | --- |
| `ctx.record` | The parent record (edit page) — same as page-level handlers see. |
| `ctx.user` | The resolved panel user. |
| `ctx.row.index` | 0-based row position. |
| `ctx.row.id` | Stable row id (the row's `__id`). |
| `ctx.row.values` | The row's submitted fields (Builder rows are unwrapped from `data`). |
| `ctx.row.fieldName` | Parent Repeater/Builder field name. |
| `ctx.row.blockType` | (Builder only) Matched block name. |

Visibility predicates (`.visible() / .hidden() / .disabled()`) receive
`ActionVisibilityContext` with `values` set to the row's submitted
fields, plus the parent `record` and `user`.

**v1 limitations:**

- **Handler-style only.** `.href(…)` / `.method(…)` / modal-form
  actions aren't supported per-row in v1. They render as no-op
  buttons. Use a handler that returns `{ redirect }` for navigation.
- **Top-level fields only.** Nested Repeater/Builder rows hit the
  2-segment `_rowPath` cap. The action will render but dispatch
  fails-quiet.
- **Builder per-block actions** (`Block.extraItemActions(...)`) are
  deferred. Use field-level `extraItemActions` and branch in your
  handler on `ctx.row.blockType`.

## Cross-row uniqueness — `distinct()`

`Field.distinct()` rejects duplicate values across the rows of a
Repeater (or rows of the same block type inside a Builder). The first
occurrence is always allowed; second + subsequent rows fail
validation.

```ts
Repeater.make('inventory')
  .schema([
    TextField.make('sku')
      .required()
      .distinct({ caseInsensitive: true }),
    NumberField.make('stock'),
  ])
```

Options:

| Option | Default | Description |
| --- | --- | --- |
| `caseInsensitive` | `false` | Case-fold strings before comparing. Non-string values are compared as-is. |
| `ignoreNulls` | `true` | Treat `null / undefined / ''` as "not yet set" — two empty rows aren't a conflict. Set `false` to forbid duplicate empties too. |
| `message` | `'Must be unique'` | Override the rejection text. |

Bare `distinct()` is the common case. Pass `false` to clear a
previously-set rule (`field.distinct(opts).distinct(false)`).

**Behavior in Builder.** The check is scoped to rows of the same
block type — two `heading` blocks with the same `text` conflict, but
a `heading.text = "X"` never conflicts with a `paragraph.text = "X"`
(different block schemas, different intent).

**Interaction with `unique()`.** The two are orthogonal: `distinct()`
is in-form cross-row; `unique({ model })` is across-records DB probe.
Pair them when a Repeater value must be unique both within the row
set _and_ against persisted records:

```ts
TextField.make('email')
  .required()
  .distinct({ caseInsensitive: true })
  .validate(unique({ model: Subscriber, caseInsensitive: true }))
```

**Limitations.** Outside a Repeater/Builder, `distinct()` is a no-op
(there's nothing to compare against). Inside a Repeater, the check
ignores nested-Repeater children — the inner array's `distinct()`
runs against its own rows only.

## Row-button customizers

The seven built-in row chrome buttons can be re-skinned without owning
the button markup. `RowButton.make()` is a tiny fluent builder — set
any subset of `label / icon / color / tooltip` and pass it to the
matching slot setter:

```ts
import { Repeater, RowButton } from '@pilotiq/pilotiq'

Repeater.make('lineItems')
  .schema([…])
  .reorderable()
  .cloneable()
  // Every slot accepts a RowButton; absent slots keep their defaults.
  .addAction(RowButton.make().label('Add line item').icon('plus-circle'))
  .deleteAction(RowButton.make().tooltip('Remove this line').color('destructive'))
  .cloneAction(RowButton.make().icon('files'))
  .moveUpAction(RowButton.make().tooltip('Move earlier'))
  .moveDownAction(RowButton.make().tooltip('Move later'))
  .reorderAction(RowButton.make().tooltip('Hold and drag'))
  .collapseAction(RowButton.make().icon('chevrons-up-down'))
```

| Slot | Default icon | What it controls |
|---|---|---|
| `addAction` | `+` | Bottom Add button — also reads the customizer label / icon / tooltip on Builder's picker shortcut. Color is intentionally ignored on Add to keep the outline-button visual. |
| `cloneAction` | copy | Per-row Duplicate button. |
| `deleteAction` | trash | Per-row Remove button (default color: destructive on hover). |
| `moveUpAction` | arrow up | Keyboard-fallback Up arrow. |
| `moveDownAction` | arrow down | Keyboard-fallback Down arrow. |
| `reorderAction` | grip | Drag handle (a `<span>`, not a button — `label` becomes the `aria-label`, `tooltip` the `title`). |
| `collapseAction` | chevron | Collapse / expand chevron. When you set a custom icon it's used in both states (matches Filament's flat surface). |

**Icons** are string-only — resolved through the `registerIcons({ … })`
runtime registry, the same way `Block.icon()` and `Section.icon()`
work. Unknown keys fall back to the slot's default Lucide glyph.

**Color tokens:** `'foreground' | 'destructive' | 'primary' | 'success' |
'warning' | 'info' | 'muted'`. They map to `text-…/hover:text-…`
Tailwind class pairs, mirroring `Action.color()`.

**`addActionLabel(text)` is a shorthand** for
`addAction(RowButton.make().label(text))` — both setters can coexist;
the customizer wins when both are set.

## Compact table layout — `table([{ label, … }, …])`

For uniform rows (think team members, address book entries, line items),
table mode is denser than the default card layout — one `<tr>` per row,
one `<td>` per inner field, with the column headers carrying the labels:

```ts
Repeater.make('teamMembers')
  .table([
    { label: 'Name' },
    { label: 'Email' },
    { label: 'Role',   alignment: 'right' },
    { label: 'Active', alignment: 'center', width: '6rem' },
  ])
  .reorderable()
  .cloneable()
  .schema([
    TextField.make('name').required(),
    TextField.make('email').required(),
    SelectField.make('role').options([…]),
    ToggleField.make('active'),
  ])
```

Columns map 1:1 to `schema()` fields in declaration order — `columns[0]`
is the header for `schema[0]`, and so on. Each column accepts:

| Key | Effect |
|---|---|
| `label` | Header text (required) |
| `alignment` | `'left' \| 'center' \| 'right'` — aligns header + cell |
| `width` | Raw CSS width string (`'30%'`, `'6rem'`, `'200px'`) |
| `required` | Adds a red asterisk to the header (purely visual) |

Inner-field labels render `sr-only` since the column header carries the
labelling. Reorder grip + ↑/↓ buttons, clone, delete, and any
`extraItemActions` land in a trailing actions cell.

Pass an empty array (`.table([])`) to turn off table mode — handy for
toggling via a config value.

**Mutually exclusive with `.simple()` and `.grid()`.** The field setters
arbitrate (whichever was set last wins). `.collapsible()` and
`.accordion()` are silently ignored in table mode — `<tr>` rows have no
chrome to collapse.

## Single-field flat-array repeater — `simple(field)`

When the row is a single field, the `[{ field: value }]` storage shape
adds noise. `Repeater.simple(field)` flattens it to `[value, value, …]`:

```ts
Repeater.make('keywords')
  .simple(
    TextField.make('keyword').placeholder('Enter a keyword'),
  )
  .reorderable()
  .defaultItems(2)
```

The persisted record holds `keywords: ['react', 'typescript', …]` — a
plain string array. The form pipeline (resolve, coerce, validate) keeps
using the wrapped `[{ keyword: v }]` shape internally so per-field
validators (`required`, `unique`, `distinct`, custom validators) work
exactly the same as in a regular Repeater. The flattening happens
once, after coerce, before your `save()` handler runs.

The chrome flattens too:

- **No row header** — single-field rows don't need a label.
- **No clone** — there's no row identity to duplicate; users can just
  pick a value again.
- **No collapse** — pointless for a single input.
- **Reorder + delete still work** — drag handle (when `reorderable()`)
  + trash icon stay on each row.

`min/maxItems`, `defaultItems`, `addActionLabel`, and `extraItemActions`
all carry over.

**Loading edit-mode records.** When the Repeater is `simple()`, the
loaded record value `['a', 'b']` is wrapped on the way into resolution.
Already-wrapped values (e.g. when a coerce or state-update has already
produced `[{name: v}, …]`) pass through — the wrap is idempotent.

**`simple()` replaces any prior `schema()` call.** The single field
passed to `simple()` becomes the entire inner schema.

**Heterogeneous rows belong in `Builder`, not `simple`.** If your row
holds more than one field, use the regular `schema([…])` form;
`simple` is purely for the one-input case.

## Disable options taken in sibling rows — `disableOptionsWhenSelectedInSiblingRepeaterItems()`

The client-side companion to `distinct()` for option-bearing fields.
Greys out option choices that any sibling row has already picked, so
users can't pick the same value twice.

Available on `SelectField`, `RadioField`, `CheckboxListField`, and
`ToggleButtonsField`:

```ts
Repeater.make('picks').schema([
  SelectField.make('colour')
    .options([
      { value: 'red',   label: 'Red'   },
      { value: 'green', label: 'Green' },
      { value: 'blue',  label: 'Blue'  },
    ])
    .disableOptionsWhenSelectedInSiblingRepeaterItems(),
])
```

Calling this method auto-arms two related flags:

- **`distinct()`** — server-side last-line guarantee. The client UI
  prevents the conflict from happening, but a tampered request
  (curl, or a stale tab) is rejected at validation time.
- **`live()`** — picking a value in one row immediately re-resolves
  the form so the disabled state on the OTHER rows updates without
  a page refresh.

**Behavior in Builder.** Same per-block-type scoping as `distinct()` —
a `Select` inside a `hero` block isn't shadowed by a pick in a
`paragraph` block (different schemas, different fields).

**CheckboxList** (multi-select) treats each entry of every sibling's
`string[]` as a taken value. The user can still uncheck their own
row's pick (the disabled flag never blocks releasing a held value),
but other rows can't pick it.

**Static `disabled` per option** is preserved alongside the taken
state — set `{ value, label, disabled: true }` on the static option
list to mark a choice as permanently unavailable, and the runtime
disabling stacks on top.

Pass `false` to clear (`.disableOptionsWhenSelectedInSiblingRepeaterItems(false)`).
This does not also clear `distinct()` / `live()` — call those
explicitly if you need them off too.

## Relationship-backed rows — `relationship(name)`

By default a `Repeater` stores its rows as a JSON array on a column of
the parent record (`order.lineItems = [{ ... }, ...]`). For tightly
coupled, parent-only data that's perfect — one column, one round-trip.
But the moment the rows need to be queried independently, soft-deleted
on their own, referenced by other models, or sorted with cursors, the
JSON shape gets in the way. `relationship(name)` flips a `Repeater` to
back its rows with a real `HasMany` relation: each row becomes a real
child record, persisted via the child model.

```ts
PostResource.form(form) {
  return form.schema([
    TextField.make('title').required(),

    Repeater.make('attachments')
      .relationship('attachments')      // matches Post.relations.attachments
      .schema([
        TextField.make('label').required(),
        TextField.make('url').required(),
      ])
      .reorderable()
      .orderColumn('sort'),             // optional — writes 0-based index per row
  ])
}
```

The parent declares the relation in the rudder ORM convention:

```ts
class Post extends Model {
  static override relations = {
    attachments: { type: 'hasMany' as const, model: () => Attachment, foreignKey: 'postId' },
  }
}
```

That declaration is everything. The pilotiq pipeline does the rest:

- **Load** — on the edit page, rows are fetched from
  `parent.related('attachments')` instead of read off the parent
  record. Each row's primary key is stamped onto `__id` so the
  renderer can round-trip identity through a hidden input. The PK
  and FK columns are stripped from the rendered row so the inner
  schema doesn't accidentally surface them as form values.
- **Save** — submitted rows are diffed against the existing related
  rows by `__id`. New rows (no `__id` matching an existing PK) →
  `Attachment.create({ ...row, postId: parentId })`. Matching rows →
  `Attachment.update(__id, row)`. Existing rows missing from the
  submitted set → `Attachment.delete(pk)`. The FK is **not**
  overwritten on update (the existing row's FK is already correct,
  and exposing it would let a tampered client re-link a child to a
  different parent).
- **Order** — when `orderColumn('sort')` is set, every create / update
  payload stamps the row's 0-based index into that column. Reordering
  via drag-and-drop simply rewrites the column on save.

### Object form

Pass an object instead of a string for explicit overrides — useful when
the parent model doesn't follow the rudder convention or when you want
to retarget the child model:

```ts
Repeater.make('attachments')
  .relationship({
    name:        'attachments',
    model:       Attachment,
    foreignKey:  'postId',
    orderColumn: 'sort',
  })
```

Each field defaults to the value discovered on the parent's `static
relations` map; explicit settings win. The `model` and `foreignKey`
keys are server-only — they never cross the wire.

### Limitations and trade-offs

- **`hasMany` only.** v1 doesn't support `belongsTo`, `hasOne`,
  `belongsToMany`, or polymorphic relations. M2M / pivot is deferred
  at the framework level alongside the `RelationManager`'s same gap.
- **Mutually exclusive with `simple()` and `dehydrated(false)`.**
  Flat `[v, v, ...]` storage can't round-trip through named child
  columns; a `dehydrated(false)` field never persists, so combining
  it with `relationship()` would silently drop every row.
- **No transaction wrapper in v1.** If the parent saves but a child
  create fails partway through the diff, the parent edit is committed
  and the failure surfaces as a 500. A transactional wrapper is a
  follow-up once the ORM lands a `transaction(fn)` primitive.
- **Builder doesn't ship `relationship` yet.** Heterogeneous rows
  need a polymorphic `type` column on the child plus per-block
  dispatch — punted until someone asks.
- **`mutateDataBeforeCreate` doesn't see relation rows.** They've
  been extracted before any user-side mutator runs. Mutate the parent
  data; the child rows go through the inner schema's own mutators on
  the child model side.

## Limitations

- **`itemHidden` doesn't re-evaluate on live updates.** Currently
  evaluated only at full form-render. Reactive hide/show is a future
  revision.
- **No per-row authorization API yet** (`itemCanDelete` etc.). Use
  `extraItemActions` with `.visible()` for row-level branching;
  built-in clone/delete still go through the field-level `cloneable()
  / deletable()` flags.
- **Forms inside a Repeater row** aren't dispatched in v1 (no row
  context on the handler). Keep forms at the page level.

## See also

- [`docs/plans/repeater-field.md`](../plans/repeater-field.md) — design
  doc + step-by-step status.
- Live demo: `playground-pilotiq` → `/new-admin/repeater-demo`.
