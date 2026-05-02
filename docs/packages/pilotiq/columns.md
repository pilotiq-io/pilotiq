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
