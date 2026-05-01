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
| `.itemLabel(row => string)` | Header text for the collapsed row; falls back to `Item N` |
| `.addActionLabel(text)` | Label for the Add button (default `'Add'`) |

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

## Limitations

- **No row-level visibility / authorization** (`itemVisible`,
  `itemCanDelete`). Track for v1.1 with a real use case.
- **`Builder` (heterogeneous-row Repeater)** is its own plan once
  Repeater proves out the shape.
- **Actions / Forms inside a Repeater row** aren't dispatched in v1
  (no row context on the handler). Keep them at the form level.

## See also

- [`docs/plans/repeater-field.md`](../plans/repeater-field.md) — design
  doc + step-by-step status.
- Live demo: `playground-pilotiq` → `/new-admin/repeater-demo`.
