# Columns

`Column.make(name)` is the base; specialized subclasses (`BadgeColumn`,
`IconColumn`, `BooleanColumn`, `ImageColumn`) handle the common cell
shapes. Every column reads from the row's record property by default;
`getStateUsing(fn)` and `formatStateUsing(fn)` override.

## Setters

```ts
Column.make('title')
  .label('Article title')
  .sortable()
  .searchable()
  .formatStateUsing((value, record) => `${value} (${record.lang})`)
  .recordUrl(r => `/posts/${r.id}`)
```

## Built-in column types

| Class | Renders |
|---|---|
| `Column` (or `TextColumn`) | Plain text — supports `.dateTime / .since / .money / .numeric / .limit / .lineClamp / .copyable / .color` |
| `BadgeColumn` | Pill — `.colors({ draft: 'warning', published: 'success' })` |
| `IconColumn` | Boolean → icon — `.boolean()` |
| `BooleanColumn` | Sugar over IconColumn |
| `ImageColumn` | Avatar / thumbnail — `.size(48)`, `.circular()` |
| `TextInputColumn` | Inline `<input>` — saves on blur (or after a 500 ms debounce). Supports `.type('number'\|'email'\|...)`, `.placeholder()`, `.step / .min / .max`, `.debounce(ms)`. |
| `ToggleColumn` | Inline switch — saves on every change. Supports `.onColor / .offColor / .onIcon / .offIcon`. |
| `SelectColumn` | Inline `<select>` — saves on every change. Supports `.options({ key: label })`, `.nullable()`, `.selectablePlaceholder(false)`. |

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
