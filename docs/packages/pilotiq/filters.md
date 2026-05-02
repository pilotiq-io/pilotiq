# Filters

Filters live as children of `Table.filters([...])`. Each filter owns a
URL key; reserved keys are `search / sort / page / perPage`. Default
behavior is "where this column equals the picked value"; override with
`.query(fn)`.

## Built-in filters

```ts
Table.make().filters([
  SelectFilter.make('status').options(['draft', 'published']),
  MultiSelectFilter.make('tags').options(allTags),
  BooleanFilter.make('featured'),
  TernaryFilter.make('archived').nullable(),
  DateRangeFilter.make('createdAt'),
  TrashedFilter.make(),                  // when Resource.softDeletes = true
])
```

| Filter | URL value | Notes |
|---|---|---|
| `SelectFilter` | single value | dropdown |
| `MultiSelectFilter` | comma-separated | checkbox stack |
| `BooleanFilter` | `1` / `0` | two-state |
| `TernaryFilter` | `1` / `0` / `null` | three-state |
| `DateRangeFilter` | `from..to` | two date inputs |
| `TrashedFilter` | active / trashed / all | auto-injected on soft-delete resources |
| `FormFilter` | JSON-encoded | arbitrary inner schema (multi-field popover) |

## Active-filter pills

`Filter.indicator(string | (value, filter) => string)` overrides the
pill text shown in the active-filters bar above the table.
`indicator()` defaults to `"<label>: <displayValue>"`.

```ts
DateRangeFilter.make('createdAt').indicator(
  ({ from, to }) => `Created ${from} → ${to}`
)
```

## Custom query

```ts
SelectFilter.make('priority')
  .options({ low: 'Low', high: 'High' })
  .query((q, value) =>
    value === 'high' ? q.where('priority', '>=', 5) : q.where('priority', '<', 5)
  )
```
