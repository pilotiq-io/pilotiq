# Columns

`Column.make(name)` is the base; specialized subclasses (`TextColumn`,
`BadgeColumn`, `IconColumn`, `BooleanColumn`, `ImageColumn`) handle the
common cell shapes. Every column reads from the row's record property
by default; `formatStateUsing(fn)` overrides per row server-side.

`Column.make(...)` is an alias for `TextColumn.make(...)` — the bare
factory keeps the most common case (plain text) ergonomic, and you
reach for the typed subclass when the cell needs a different shape.

## Setters

Every column type carries the same chrome surface inherited from
`Column`:

```ts
TextColumn.make('publishedAt')
  .label('Published')
  .sortable()
  .searchable()
  .tooltip('When the article went live')
  .alignment('end')         // 'start' | 'center' | 'end'
  .width('120px')           // CSS width (px / % / 'auto')
  .default('—')             // shown when value is null/undefined/''
  .placeholder('Not yet')   // alias for default()
  .wrap()                   // wrap long text instead of truncating
  .lineClamp(2)             // CSS line-clamp for multi-line truncation
  .weight('semibold')       // 'normal' | 'medium' | 'semibold' | 'bold'
  .color('muted')           // 'default' | 'muted' | 'primary' | …
  .formatStateUsing((value, record) => `${value} (${record.lang})`)
  .recordUrl(r => `/posts/${r.id}`)
```

`formatStateUsing` runs server-side per row inside `loadTableRecords`
and stamps the result on `row._formatted[columnName]` — the renderer
prefers it over the bare value. Use it when the rendering logic isn't
serializable or needs to combine multiple fields.

## Built-in column types

| Class | Renders |
|---|---|
| `Column` (or `TextColumn`) | Plain text — supports `.dateTime / .since / .money / .numeric / .limit / .lineClamp / .color / .weight` |
| `BadgeColumn` | Pill — `.colors({ draft: 'warning', published: 'success' })` |
| `IconColumn` | Value → icon — `.options({ true: { icon, color } })` |
| `BooleanColumn` | Sugar over IconColumn — defaults to check / circle |
| `ImageColumn` | Avatar / thumbnail — `.size(48)`, `.circular()` |
| `TextInputColumn` | Inline `<input>` — saves on blur (or after a 500 ms debounce). Supports `.type('number'\|'email'\|...)`, `.placeholder()`, `.step / .min / .max`, `.debounce(ms)`. |
| `ToggleColumn` | Inline switch — saves on every change. Supports `.onColor / .offColor / .onIcon / .offIcon`. |
| `SelectColumn` | Inline `<select>` — saves on every change. Supports `.options({ key: label })`, `.nullable()`, `.selectablePlaceholder(false)`. |

## TextColumn formatters

Built-in formatters serialize as a `format` spec on the column meta and
run client-side, so they're cheap and re-render without a server hop:

```ts
TextColumn.make('publishedAt').dateTime()             // locale date+time
TextColumn.make('createdAt').since()                   // "5 minutes ago"
TextColumn.make('price').money('USD')                  // "$1,234.50"
TextColumn.make('rating').numeric({ decimals: 1 })     // "4.7"
TextColumn.make('body').limit(80)                      // truncate to N chars + …
```

`dateTime()` accepts a pattern string for future-compat (the wire shape
preserves it), but the v1 client uses `Intl.DateTimeFormat` defaults.
`since()` paints the relative label on first paint only — no live timer.
`money(currency)` and `numeric()` accept an optional `locale` second
argument to override the user's browser default.

When `formatStateUsing` AND a built-in `format` are set, the per-row
result wins.

## BadgeColumn

```ts
BadgeColumn.make('status').colors({
  draft:     'gray',
  published: 'success',
  archived:  'warning',
})
```

Color presets: `gray` · `primary` · `success` · `warning` · `destructive`
· `info`. Unknown values fall back to `gray`. Successive `.colors()`
calls merge instead of replace.

## IconColumn / BooleanColumn

```ts
IconColumn.make('isAdmin').options({
  true:  { icon: 'shield-check', color: 'success' },
  false: { icon: 'user',         color: 'muted'   },
})

// BooleanColumn is sugar — defaults to:
//   true  → check-circle-2 (success)
//   false → circle         (muted)
BooleanColumn.make('featured')
```

Icon names resolve through pilotiq's icon registry — register custom
packs via `registerIcons({ Name: Component })`.

## ImageColumn

```ts
ImageColumn.make('avatar')
  .size(48)        // width = height in px (default 32)
  .circular()      // border-radius: 50%
// or .square()    // default — rounded-md corner radius
```

Pair with `.placeholder('—')` for rows where the URL is null.

## Table chrome

```ts
Table.make()
  .heading('Articles')
  .description('Manage published content, drafts, and archived posts.')
  .striped()
  .emptyState({
    heading:     'No articles yet',
    description: 'Create your first article to get started.',
    icon:        'inbox',
  })
  .columns([ /* … */ ])
```

`emptyState` renders when the table has zero rows AND no filter or
search is active. The icon name resolves through the icon registry.

## Editable cell columns

`TextInputColumn`, `ToggleColumn`, and `SelectColumn` turn the cell into
an inline edit control. Each change PATCHes a single column on a single
record via `POST {base}/{slug}/:id/_cell/:column`; the row never enters
a full edit form.

```ts
Resource.table = (t) => t.columns([
  TextInputColumn.make('title')
    .validate(minLength(3))
    .placeholder('Untitled'),
  SelectColumn.make('status')
    .options({ draft: 'Draft', published: 'Published' })
    .nullable(),
  ToggleColumn.make('featured')
    .onColor('success'),
])
```

**Auth.** Per-row `Resource.canEdit(user, record)` gates every cell —
forbidden rows render the read-only formatter. Pair with
`disabled(record => …)` for finer-grained per-row gating that doesn't
require a separate policy method.

**Validators.** Same surface as `Field.validate(...)`. Reuses the
built-in rules (`required`, `email`, `minLength`, `unique`, …). Errors
land under `{ ok: false, errors: { value: string[] } }` (HTTP 422).

**Optimistic UI.** The local cell updates immediately; on validation or
network failure it rolls back to the persisted value and shows an error
toast.

**Confirm-gating.** Add `.confirm('Are you sure?')` to wrap the PATCH
in a Dialog before firing.

**Boot guard.** Declaring an editable column on a Resource without
`R.model.update(id, data)` throws a clear error at panel boot — every
inline-edit column needs an ORM behind it.

> [!NOTE]
> Bulk inline-edit, async per-row select options, and per-cell ETag
> concurrency control are deferred. Last write wins (Filament parity).

## Footer summaries

```ts
Column.make('amount')
  .money('USD')
  .summarize([Sum.make().label('Total'), Average.make().label('Avg')])
```

`loadTableRecords` computes the aggregate over the rendered rows and
stamps it on `meta.summaries`. Per-page only in v1 — cross-page
aggregation comes later.

## Per-cell links

By default, every data cell wraps its content in an `<a href>` so plain
left-clicks SPA-nav, modified clicks fall through (cmd/ctrl/shift), and
keyboard nav works. Disable per-column with `.recordUrl(false)`.

> [!NOTE]
> Action and bulk-select cells stay unwrapped — the row-link doesn't
> swallow action button clicks.
