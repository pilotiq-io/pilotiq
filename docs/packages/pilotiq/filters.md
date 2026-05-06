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

## Filter layout

By default, filter widgets live inside a popover above the table — the
toolbar shows a `Filters` button with a count badge. Switch to an inline
strip with `Table.filtersLayout(position)`:

```ts
Table.make()
  .filters([
    SelectFilter.make('status').options(['draft', 'published']),
    DateRangeFilter.make('createdAt'),
  ])
  .filtersLayout('above-content')
```

| Position | Behavior |
|---|---|
| `'modal'` *(default)* | Toolbar `Filters` button → popover. The active-filter pill row renders below the toolbar. |
| `'above-content'` | Inline strip rendered between the toolbar and the table. Always visible. |
| `'above-content-collapsible'` | Inline strip + a toolbar `Filters` toggle. Open / closed state persists per table path in `localStorage`; defaults open when the URL carries any active filter. |
| `'below-content'` | Inline strip rendered after the pagination row. |

Sidebar positions (`BeforeContent` / `AfterContent`) reshape the page
rather than the table chrome and aren't shipped — open an issue if you
need them.

> [!NOTE]
> Inline modes hide the active-filter pill row — every filter widget
> already shows its current value, so the pills would be redundant.
> Each filter still keeps its own per-widget clear affordance (the `×`
> on a date range, the "(any)" reset on a select).
