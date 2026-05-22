# Reactive Fields

Forms are static by default — the schema resolves once on page load, the form renders, the user fills + submits. Reactive fields make schema resolution dynamic: fields can re-resolve on every keystroke (`live()`), and a field's value can imperatively update sibling fields via `afterStateUpdated`.

## `Field.live()`

`live()` marks a field as a re-resolve trigger:

```ts
TextField.make('title')
  .live()                                          // re-resolve on every change
  .afterStateUpdated((title, ctx) => ctx.$set('slug', slugify(title)))

SelectField.make('country')
  .options(countries)
  .live()

SelectField.make('region')                         // dependent on country
  .options(({ $get }) => {
    const country = $get('country')
    return country ? regionsFor(country) : {}
  })
```

When a `live()` field changes:

1. Client POSTs `{ changed: 'title', values: {...} }` to `Form.stateUrl`.
2. Server runs `applyStateUpdate()` — finds the changed field, runs its `afterStateUpdated` hook (which may `$set` siblings), then re-resolves the form with the updated values.
3. Server returns the new `FormMeta` (with refreshed conditional visibility, options, helper text).
4. Client diffs and re-renders.

Tune the trigger:

```ts
TextField.make('search')
  .live({ debounce: 300 })                         // wait 300ms after last keystroke
  .afterStateUpdated((q, ctx) => ctx.$set('results', searchFor(q)))

TextField.make('rawJson')
  .live({ onBlur: true })                          // only fire on blur, not per keystroke
```

Bare `.live()` fires immediately on every change.

## `afterStateUpdated`

The server-side hook that fires when a `live()` field changes:

```ts
TextField.make('title')
  .live()
  .afterStateUpdated(async (value, ctx) => {
    // value: the new value of THIS field
    // ctx: { $get, $set, values, user, record?, basePath?, row? }

    if (!ctx.$get('slug')) {                       // only auto-fill if blank
      ctx.$set('slug', slugify(value))
    }
  })
```

The `ctx` API:

- **`$get(name)`** — read another field's current value. Works for nested paths (`$get('contacts.0.email')`).
- **`$set(name, value)`** — write another field's value. The new value lands in the next `FormMeta` response.
- **`values`** — snapshot of all form values at this moment.
- **`row`** — when the hook fires inside a `Repeater` / `Builder` row, this is the row context `{ index, id, values, fieldName, blockType? }`. The plain `$get` / `$set` are scoped to the row — `$set('label', 'X')` writes `items.<row>.label`.

Resolve-time `$set` is a no-op closure during schema re-resolution; only the `afterStateUpdated` write survives. This prevents infinite re-resolve loops.

Throws fail-loudly — the server returns 500 and the client falls back to the previous form state.

## Client-only reactivity: `afterStateUpdatedJs`

For trivial transformations (title → slug, sum of two fields), the server round-trip is overkill. `afterStateUpdatedJs` compiles a string body via `new Function` and runs it in the browser:

```ts
TextField.make('title')
  .afterStateUpdatedJs(`$set('slug', $state.title.toLowerCase().replace(/\\s+/g, '-'))`)

NumberField.make('subtotal')
  .afterStateUpdatedJs(`$set('total', $state.subtotal * 1.0875)`)
```

The body has these bindings:

- `$state` — the form's current values
- `$get(name)` / `$set(name, value)` — same shape as the server hook
- `$value` — the changed field's new value (sugar over `$state[$name]`)
- `$name` — the changed field's name

Compiled once per source-string (cached via identity in `react/fieldJsHandler.ts`). Runs synchronously on every change. No `live()` required — the JS fires regardless.

Compose with the server hook:

```ts
TextField.make('title')
  .live()
  .afterStateUpdatedJs(`$set('slug', $value.toLowerCase().replace(/\\s+/g, '-'))`)
  .afterStateUpdated(async (value, ctx) => {
    // Server-side: validate the auto-slug is unique
    const existing = await Article.where('slug', ctx.$get('slug')).count()
    if (existing > 0) ctx.$set('slug', `${ctx.$get('slug')}-${Date.now()}`)
  })
```

JS runs first, server response overlays sibling values when it comes back.

Note: `afterStateUpdatedJs` requires CSP `unsafe-eval`. If your CSP is locked down, stick with the server hook.

## Multi-form pages: pin `formId`

The auto-fall-back covers single-form pages. For pages with multiple forms (a record-page with both a "Settings" form and a "Notifications" form), you MUST pin `formId` explicitly:

```ts
Form.make()
  .formId('settings')                              // stable across re-renders
  .schema([...])

Form.make()
  .formId('notifications')
  .schema([...])
```

Without `formId`, the framework can't tell which form's state-update endpoint to POST to — live() silently fails. The auto-fallback uses the page slug; multi-form pages need distinct names.

The same applies to Repeaters / Builders that live inside live() forms — the form's `formId` is what disambiguates them.

## `$get` inside `SelectField.options(fn)`

Dependent options are the most common reactive pattern:

```ts
SelectField.make('country').options(countries).live()

SelectField.make('region')
  .options(async ({ $get, user }) => {
    const country = $get('country')
    if (!country) return {}
    return await regionsFor(country)
  })
```

The options resolver receives the same `ctx` as `afterStateUpdated`. It runs every re-resolve cycle (so always sees fresh `$get`). Without `live()` on the source, the dependent options resolve ONCE on form load and never update.

## Conditional visibility based on live values

```ts
SelectField.make('billingType')
  .options({ none: 'No billing', card: 'Credit card', invoice: 'Net 30' })
  .live()

TextField.make('cardNumber')
  .visible(({ values }) => values?.billingType === 'card')

TextField.make('purchaseOrder')
  .visible(({ values }) => values?.billingType === 'invoice')
```

Both `visible(({ values }) => …)` rules see fresh `values` on every re-resolve. Without `.live()` on `billingType`, the dependent fields re-evaluate only on submit.

## Reactive fields inside Repeater / Builder

Inside an array-row container, `$get` / `$set` accept dotted paths AND scope to the row by default:

```ts
Repeater.make('items')
  .schema([
    SelectField.make('product').options(products).live(),
    NumberField.make('quantity').default(1).live(),
    NumberField.make('lineTotal')
      .disabled()
      .afterStateUpdatedJs(`
        const product = $get('product')
        const qty = Number($get('quantity'))
        const price = product ? PRICES[product] : 0
        $set('lineTotal', price * qty)
      `),
  ])

// Or cross-row read with dotted path:
NumberField.make('discount')
  .afterStateUpdated((v, ctx) => {
    const subtotal = (ctx.values.items ?? []).reduce((s, r) => s + (r.lineTotal ?? 0), 0)
    ctx.$set('total', subtotal - v)
  })
```

Inside the row, `$get('product')` reads the row's `product`. Outside the Repeater, `$get('items.0.product')` reads the same value via dotted path.

## Common pitfalls

- **`afterStateUpdated` without `.live()`** only fires on submit. The hook still exists but the partial-resolve endpoint never gets called.
- **Multi-form pages without `.formId('id')`** — live() silently no-ops because the framework can't route the partial-resolve POST. See `feedback_pilotiq_live_forms_pin_formid.md`.
- **Infinite loops via cross-`$set`** — if A's `afterStateUpdated` sets B, and B's `afterStateUpdated` sets A, the resolve-time `$set` no-op prevents the loop. But synchronous JS loops in `afterStateUpdatedJs` will hang the browser — write idempotent JS.
- **`$get` returning `undefined`** — fields not yet rendered or `dehydrated(false)` aren't in `values`. Guard with `?? defaultValue`.
- **`debounce` on dependent SelectFields** — the source's debounce delays the partial-resolve POST, which delays the dependent's options refresh. For "type to search" patterns, debounce the source 200-400ms.
- **`afterStateUpdatedJs` CSP** — if your app has a strict CSP without `unsafe-eval`, JS handlers throw at registration. Use the server hook instead.
- **Reading `values.items` outside a row context** — when reading the full Repeater array from a sibling field (e.g. computing `total` from all rows), use `ctx.values` (the form-wide snapshot), not `$get`. `$get('items')` returns the array; `$get('items.0.qty')` returns one row's field; both work.
